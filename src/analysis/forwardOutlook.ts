import type { DataPoint } from '../api/fred';
import type { RecessionBand } from '../utils/align';
import {
  appendSyntheticCorrRows,
  normalizeWindow,
  panelWindowEndingAt,
} from './featureBuilder';
import type { RecessionPredictorContext } from './recessionForecast';
import { getRecessionModelMeta, runInference } from './recessionModel';
import {
  applyCalibrationForHorizon,
  CHART_CORR_INDEX,
  emptyForwardOutlook,
  FORWARD_HORIZON_MONTHS,
  hazardsToHorizonProbs,
  hazardsToProbability,
  MC_SAMPLES_DEFAULT,
  onsetMonthIndex,
  peakHazardMonthIndex,
  ROLLOUT_STEP_MONTHS,
  ROLLOUT_STEPS,
  type ChartForecastId,
  type ForwardOutlook,
  type RecessionScenario,
} from './recessionTypes';

function addMonths(date: Date, months: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(0);
  return d;
}

function gaussianRandom(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function perturbWindow(normalized: Float32Array, scale: number): Float32Array {
  const out = new Float32Array(normalized.length);
  for (let i = 0; i < normalized.length; i++) {
    out[i] = normalized[i] + gaussianRandom() * scale;
  }
  return out;
}

interface RolloutSample {
  hazards: Float32Array;
  corrByChart: [number[], number[], number[]];
  onsetMonth: number;
  peakHazard: number;
}

async function rollForwardSample(
  ctx: RecessionPredictorContext,
  endIdx: number,
  noiseScale: number,
): Promise<RolloutSample | null> {
  const modelMeta = getRecessionModelMeta();
  if (!modelMeta) return null;

  const anchor = ctx.panel[endIdx];
  const flatYield = anchor.values[12];
  let panel = ctx.panel.slice(0, endIdx + 1).map((r) => ({
    date: r.date,
    values: [...r.values],
  }));

  const stitchedHazards: number[] = [];
  const corrByChart: [number[], number[], number[]] = [[], [], []];

  for (let step = 0; step < ROLLOUT_STEPS; step++) {
    const end = panel.length - 1;
    const win = panelWindowEndingAt(panel, end);
    if (!win) return null;

    let normalized = normalizeWindow(win.window, modelMeta.mean, modelMeta.std);
    if (noiseScale > 0) {
      normalized = perturbWindow(normalized, noiseScale);
    }

    const { hazards, futureCorr } = await runInference(normalized);
    for (let m = 0; m < ROLLOUT_STEP_MONTHS; m++) {
      stitchedHazards.push(hazards[m]);
      corrByChart[0].push(futureCorr[m * 3 + 0]);
      corrByChart[1].push(futureCorr[m * 3 + 1]);
      corrByChart[2].push(futureCorr[m * 3 + 2]);
    }

    panel = appendSyntheticCorrRows(panel, futureCorr, ROLLOUT_STEP_MONTHS, flatYield);
  }

  const hazardsArr = new Float32Array(stitchedHazards.slice(0, FORWARD_HORIZON_MONTHS));
  for (let c = 0; c < 3; c++) {
    corrByChart[c] = corrByChart[c].slice(0, FORWARD_HORIZON_MONTHS);
  }

  return {
    hazards: hazardsArr,
    corrByChart,
    onsetMonth: onsetMonthIndex(hazardsArr),
    peakHazard: Math.max(...hazardsArr),
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function quantileDate(sortedMs: number[], q: number): Date | null {
  if (sortedMs.length === 0) return null;
  const idx = Math.round((sortedMs.length - 1) * q);
  return new Date(sortedMs[idx]);
}

function aggregateScenarios(anchor: Date, samples: RolloutSample[]): RecessionScenario[] {
  const buckets = new Map<number, { count: number; peak: number }>();
  for (const s of samples) {
    if (s.onsetMonth > FORWARD_HORIZON_MONTHS) continue;
    const b = buckets.get(s.onsetMonth) ?? { count: 0, peak: 0 };
    b.count += 1;
    b.peak = Math.max(b.peak, s.peakHazard);
    buckets.set(s.onsetMonth, b);
  }

  const entries = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count);
  const top = entries.slice(0, 3);
  const total = top.reduce((a, [, v]) => a + v.count, 0) || 1;

  return top.map(([month, v]) => ({
    weight: v.count / total,
    start: addMonths(anchor, month),
    peakP: v.peak,
  }));
}

function percentileBand(values: number[], p: number): number {
  return quantile([...values].sort((a, b) => a - b), p);
}

function valuesToSeries(values: number[], startDate: Date): DataPoint[] {
  return values.map((value, i) => ({ date: addMonths(startDate, i + 1), value }));
}

function meanCurve(samples: RolloutSample[], chartIndex: number): number[] {
  const n = FORWARD_HORIZON_MONTHS;
  const out = new Array(n).fill(0);
  for (const s of samples) {
    const c = s.corrByChart[chartIndex];
    for (let i = 0; i < n; i++) out[i] += c[i] ?? c[c.length - 1];
  }
  return out.map((v) => v / samples.length);
}

function bandCurve(samples: RolloutSample[], chartIndex: number, p: number): number[] {
  const n = FORWARD_HORIZON_MONTHS;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const vals = samples.map((s) => s.corrByChart[chartIndex][i]);
    out.push(percentileBand(vals, p));
  }
  return out;
}

function buildForwardProbabilityCurve(
  anchor: Date,
  samples: RolloutSample[],
  meta: NonNullable<ReturnType<typeof getRecessionModelMeta>>,
): { mean: DataPoint[]; lo: DataPoint[]; hi: DataPoint[] } {
  const mean: number[] = [];
  const lo: number[] = [];
  const hi: number[] = [];

  for (let t = 0; t < FORWARD_HORIZON_MONTHS; t++) {
    const slice = samples.map((s) => {
      const h = s.hazards.slice(0, t + 1);
      return applyCalibrationForHorizon(hazardsToProbability(h, t + 1), meta, 12);
    });
    mean.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    lo.push(percentileBand(slice, 0.1));
    hi.push(percentileBand(slice, 0.9));
  }

  return {
    mean: valuesToSeries(mean, anchor),
    lo: valuesToSeries(lo, anchor),
    hi: valuesToSeries(hi, anchor),
  };
}

let cachedOutlook: Partial<Record<ChartForecastId, ForwardOutlook>> = {};
let cachedSamples: RolloutSample[] | null = null;

export function clearForwardOutlookCache(): void {
  cachedOutlook = {};
  cachedSamples = null;
}

async function ensureRolloutSamples(
  ctx: RecessionPredictorContext,
  nSamples = MC_SAMPLES_DEFAULT,
): Promise<RolloutSample[]> {
  if (cachedSamples) return cachedSamples;

  const modelMeta = getRecessionModelMeta();
  const endIdx = ctx.panel.length - 1;
  if (!modelMeta || endIdx < 59) return [];

  const noiseScale = modelMeta.mc_noise_scale ?? 0.08;
  const samples: RolloutSample[] = [];
  for (let i = 0; i < nSamples; i++) {
    const scale = i === 0 ? 0 : noiseScale;
    const sample = await rollForwardSample(ctx, endIdx, scale);
    if (sample) samples.push(sample);
  }
  cachedSamples = samples;
  return samples;
}

function buildOutlookFromSamples(
  ctx: RecessionPredictorContext,
  chartId: ChartForecastId,
  samples: RolloutSample[],
): ForwardOutlook {
  const modelMeta = getRecessionModelMeta()!;
  const anchor = ctx.panel[ctx.panel.length - 1];

  if (samples.length === 0) {
    return emptyForwardOutlook(chartId, anchor.date);
  }

  const meanHazards = new Float32Array(FORWARD_HORIZON_MONTHS);
  for (let t = 0; t < FORWARD_HORIZON_MONTHS; t++) {
    meanHazards[t] = samples.reduce((a, s) => a + s.hazards[t], 0) / samples.length;
  }

  const horizonProbs = hazardsToHorizonProbs(meanHazards, modelMeta);
  const onsetMonths = samples.map((s) => s.onsetMonth).sort((a, b) => a - b);
  const onsetDates = onsetMonths
    .filter((m) => m <= FORWARD_HORIZON_MONTHS)
    .map((m) => addMonths(anchor.date, m).getTime())
    .sort((a, b) => a - b);

  const peakMonth = peakHazardMonthIndex(meanHazards);
  const medianStart =
    quantileDate(onsetDates, 0.5) ?? addMonths(anchor.date, peakMonth);
  const spread =
    onsetMonths.length > 1
      ? onsetMonths[onsetMonths.length - 1] - onsetMonths[0]
      : FORWARD_HORIZON_MONTHS;
  const confidenceScore = Math.max(0, Math.min(1, 1 - spread / FORWARD_HORIZON_MONTHS));

  const chartIndex = CHART_CORR_INDEX[chartId];
  const probCurve = buildForwardProbabilityCurve(anchor.date, samples, modelMeta);

  return {
    anchorDate: anchor.date,
    chartId,
    horizonProbs,
    nextRecession: {
      medianStart,
      p25: quantileDate(onsetDates, 0.25) ?? addMonths(anchor.date, peakMonth),
      p75: quantileDate(onsetDates, 0.75) ?? addMonths(anchor.date, peakMonth),
      peakProbability: Math.max(...samples.map((s) => s.peakHazard)),
    },
    expectedDurationMonths: ctx.medianRecessionMonths,
    confidenceScore,
    correlationMean: valuesToSeries(meanCurve(samples, chartIndex), anchor.date),
    correlationP10: valuesToSeries(bandCurve(samples, chartIndex, 0.1), anchor.date),
    correlationP90: valuesToSeries(bandCurve(samples, chartIndex, 0.9), anchor.date),
    probabilityCurve: probCurve.mean,
    probabilityBandLo: probCurve.lo,
    probabilityBandHi: probCurve.hi,
    scenarios: aggregateScenarios(anchor.date, samples),
    attribution: modelMeta.attribution ?? [],
  };
}

export async function computeForwardOutlook(
  ctx: RecessionPredictorContext,
  chartId: ChartForecastId,
  nSamples = MC_SAMPLES_DEFAULT,
): Promise<ForwardOutlook> {
  const cached = cachedOutlook[chartId];
  if (cached) return cached;

  const samples = await ensureRolloutSamples(ctx, nSamples);
  const outlook = buildOutlookFromSamples(ctx, chartId, samples);
  cachedOutlook[chartId] = outlook;
  return outlook;
}

export async function computeAllForwardOutlooks(
  ctx: RecessionPredictorContext,
  nSamples = MC_SAMPLES_DEFAULT,
): Promise<Record<ChartForecastId, ForwardOutlook>> {
  const samples = await ensureRolloutSamples(ctx, nSamples);
  const charts: ChartForecastId[] = ['chart1', 'chart2', 'chart4'];
  const result = {} as Record<ChartForecastId, ForwardOutlook>;
  for (const chartId of charts) {
    result[chartId] = buildOutlookFromSamples(ctx, chartId, samples);
    cachedOutlook[chartId] = result[chartId];
  }
  return result;
}

export function outlookToPredictedBand(
  outlook: ForwardOutlook,
  medianRecessionMonths: number,
): RecessionBand | null {
  const start = outlook.nextRecession.medianStart;
  if (!start) return null;
  return { start, end: addMonths(start, medianRecessionMonths) };
}
