import type { DataPoint } from '../api/fred';
import type { RecessionBand } from '../utils/align';
import {
  buildFeaturePanel,
  normalizeWindow,
  windowAtDate,
  type FeaturePanelRow,
  type MacroSeriesInput,
} from './featureBuilder';
import {
  clearForwardOutlookCache,
  computeAllForwardOutlooks,
  outlookToPredictedBand,
} from './forwardOutlook';
import { getRecessionModelMeta, runInference } from './recessionModel';
import {
  applyCalibration,
  CHART_CORR_INDEX,
  emptyForecast,
  FORECAST_MONTHS,
  hazardsToProbability,
  medianOnsetFromHazards,
  probabilityHorizonMonths,
  type ChartForecastId,
  type ForwardOutlook,
  type RecessionForecast,
} from './recessionTypes';

function addMonths(date: Date, months: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(0);
  return d;
}

function valuesToForecast(values: number[], startDate: Date): DataPoint[] {
  return values.map((value, i) => ({
    date: addMonths(startDate, i),
    value,
  }));
}

function buildForecastPathsFromOutlook(
  anchorDate: Date,
  anchorValue: number,
  outlook: ForwardOutlook,
): Pick<
  RecessionForecast,
  'forecastCorrelation' | 'forecastEnvelopeMin' | 'forecastEnvelopeMax'
> {
  const mean = [anchorValue, ...outlook.correlationMean.map((p) => p.value)];
  const lo = [anchorValue, ...outlook.correlationP10.map((p) => p.value)];
  const hi = [anchorValue, ...outlook.correlationP90.map((p) => p.value)];

  while (mean.length <= FORECAST_MONTHS) {
    mean.push(mean[mean.length - 1]);
    lo.push(lo[lo.length - 1]);
    hi.push(hi[hi.length - 1]);
  }

  return {
    forecastCorrelation: valuesToForecast(mean, anchorDate),
    forecastEnvelopeMin: valuesToForecast(lo, anchorDate),
    forecastEnvelopeMax: valuesToForecast(hi, anchorDate),
  };
}

function buildForecastPathsSinglePass(
  anchorDate: Date,
  corrIndex: number,
  futureCorr: Float32Array,
  anchorValue: number,
): Pick<
  RecessionForecast,
  'forecastCorrelation' | 'forecastEnvelopeMin' | 'forecastEnvelopeMax'
> {
  const mean: number[] = [anchorValue];
  const lo: number[] = [anchorValue];
  const hi: number[] = [anchorValue];

  for (let t = 0; t < 36; t++) {
    const v = futureCorr[t * 3 + corrIndex];
    mean.push(v);
    lo.push(v * 0.92);
    hi.push(v * 1.08);
  }

  while (mean.length <= FORECAST_MONTHS) {
    mean.push(mean[mean.length - 1]);
    lo.push(lo[lo.length - 1]);
    hi.push(hi[hi.length - 1]);
  }

  return {
    forecastCorrelation: valuesToForecast(mean, anchorDate),
    forecastEnvelopeMin: valuesToForecast(lo, anchorDate),
    forecastEnvelopeMax: valuesToForecast(hi, anchorDate),
  };
}

export interface RecessionPredictorContext {
  panel: FeaturePanelRow[];
  medianRecessionMonths: number;
}

let forwardOutlooks: Partial<Record<ChartForecastId, ForwardOutlook>> = {};

export function getForwardOutlook(chartId: ChartForecastId): ForwardOutlook | undefined {
  return forwardOutlooks[chartId];
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()).padStart(2, '0')}`;
}

interface InferenceBundle {
  anchor: FeaturePanelRow;
  hazards: Float32Array;
  futureCorr: Float32Array;
}

const inferenceByMonth = new Map<string, InferenceBundle>();
const inferenceInflight = new Map<string, Promise<InferenceBundle | null>>();

async function getInferenceBundle(
  ctx: RecessionPredictorContext,
  asOfDate: Date,
): Promise<InferenceBundle | null> {
  const key = monthKey(asOfDate);
  const cached = inferenceByMonth.get(key);
  if (cached) return cached;

  const pending = inferenceInflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const modelMeta = getRecessionModelMeta();
    if (!modelMeta) return null;

    const win = windowAtDate(ctx.panel, asOfDate);
    if (!win) return null;

    const normalized = normalizeWindow(win.window, modelMeta.mean, modelMeta.std);
    const { hazards, futureCorr } = await runInference(normalized);
    const bundle: InferenceBundle = { anchor: win.anchor, hazards, futureCorr };
    inferenceByMonth.set(key, bundle);
    return bundle;
  })();

  inferenceInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inferenceInflight.delete(key);
  }
}

function isLatestMonth(ctx: RecessionPredictorContext, asOfDate: Date): boolean {
  const last = ctx.panel[ctx.panel.length - 1];
  if (!last) return false;
  return (
    last.date.getUTCFullYear() === asOfDate.getUTCFullYear() &&
    last.date.getUTCMonth() === asOfDate.getUTCMonth()
  );
}

function buildForecastFromBundle(
  ctx: RecessionPredictorContext,
  chartId: ChartForecastId,
  bundle: InferenceBundle,
  outlook?: ForwardOutlook,
): RecessionForecast {
  const modelMeta = getRecessionModelMeta()!;
  const horizonMonths = probabilityHorizonMonths(modelMeta);
  const rawP = hazardsToProbability(bundle.hazards, horizonMonths);
  const recessionProbability = applyCalibration(rawP, modelMeta.calibration);

  const corrIndex = CHART_CORR_INDEX[chartId];
  const anchorCorr = bundle.anchor.values[corrIndex];

  let predictedStart: Date | null;
  let predictedBand: RecessionBand | null;
  let paths: Pick<
    RecessionForecast,
    'forecastCorrelation' | 'forecastEnvelopeMin' | 'forecastEnvelopeMax'
  >;
  let uncertaintyWidth: number;

  if (outlook) {
    predictedStart = outlook.nextRecession.medianStart;
    predictedBand = outlookToPredictedBand(outlook, ctx.medianRecessionMonths);
    paths = buildForecastPathsFromOutlook(bundle.anchor.date, anchorCorr, outlook);
    uncertaintyWidth = 1 - outlook.confidenceScore;
  } else {
    predictedStart = medianOnsetFromHazards(bundle.hazards, bundle.anchor.date);
    predictedBand = predictedStart
      ? { start: predictedStart, end: addMonths(predictedStart, ctx.medianRecessionMonths) }
      : null;
    paths = buildForecastPathsSinglePass(
      bundle.anchor.date,
      corrIndex,
      bundle.futureCorr,
      anchorCorr,
    );
    const hazardSpread = Math.max(...bundle.hazards) - Math.min(...bundle.hazards);
    uncertaintyWidth = Math.min(1, hazardSpread * 2);
  }

  return {
    predictedStart,
    predictedBand,
    ...paths,
    forecastScenarios: [],
    vertexDates: predictedStart ? [predictedStart] : [],
    scenarioCount: outlook ? Math.max(1, outlook.scenarios.length) : 1,
    vertexSpreadMonths: null,
    recessionProbability,
    probabilityHorizonMonths: horizonMonths,
    uncertaintyWidth,
    forwardOutlook: outlook,
  };
}

export function createRecessionPredictor(input: MacroSeriesInput, medianRecessionMonths: number): RecessionPredictorContext {
  inferenceByMonth.clear();
  inferenceInflight.clear();
  clearForwardOutlookCache();
  forwardOutlooks = {};
  return {
    panel: buildFeaturePanel(input),
    medianRecessionMonths,
  };
}

export async function initializeForwardOutlooks(ctx: RecessionPredictorContext): Promise<void> {
  forwardOutlooks = await computeAllForwardOutlooks(ctx);
}

export async function predictRecessionAsOf(
  ctx: RecessionPredictorContext,
  asOfDate: Date,
  chartId: ChartForecastId,
): Promise<RecessionForecast> {
  if (!getRecessionModelMeta()) return emptyForecast();

  const bundle = await getInferenceBundle(ctx, asOfDate);
  if (!bundle) return emptyForecast();

  const outlook = isLatestMonth(ctx, asOfDate) ? forwardOutlooks[chartId] : undefined;
  return buildForecastFromBundle(ctx, chartId, bundle, outlook);
}

export async function predictRecessionLatest(
  ctx: RecessionPredictorContext,
  chartId: ChartForecastId,
): Promise<RecessionForecast> {
  const last = ctx.panel[ctx.panel.length - 1];
  if (!last) return emptyForecast();
  return predictRecessionAsOf(ctx, last.date, chartId);
}

export function splitSeriesAtDate(
  series: DataPoint[],
  date: Date,
): { past: DataPoint[]; future: DataPoint[] } {
  const targetMs = date.getTime();
  let splitIdx = series.findIndex((p) => p.date.getTime() > targetMs);
  if (splitIdx === -1) splitIdx = series.length;
  const past = series.slice(0, splitIdx);
  return { past, future: series.slice(splitIdx) };
}
