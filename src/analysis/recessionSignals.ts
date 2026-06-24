import type { DataPoint } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline, type RecessionBand } from '../utils/align';
import { rollingCorrelation } from '../utils/correlation';
import { CORRELATION_WINDOW } from '../charts/dualPanelChart';
import type { RecessionForecast } from './recessionTypes';
import { isElevatedRecessionProbability } from './recessionTypes';

export interface ChartSignalAnalysis {
  correlation: DataPoint[];
  historicalSignals: Date[];
  predictedBand: RecessionBand | null;
  forecastCorrelation?: DataPoint[];
  forecastScenarios?: DataPoint[][];
  forecastEnvelopeMin?: DataPoint[];
  forecastEnvelopeMax?: DataPoint[];
  currentWarning: boolean;
  hitRate: number;
  reversalScenarioCount?: number;
  inflectionSpreadMonths?: number | null;
}

export interface ModelBreakdown {
  chartId: 'chart1' | 'chart2' | 'chart4';
  label: string;
  currentWarning: boolean;
  hitRate: number;
  predictedStart: Date | null;
  predictedEnd: Date | null;
  monthsUntilStart: number | null;
  scenarioCount: number;
  vertexSpreadMonths: number | null;
}

export interface RecessionBenchmark {
  medianRecessionMonths: number;
  breakdown: ModelBreakdown[];
}

export interface RecessionAnalysis {
  chart1: ChartSignalAnalysis;
  chart2: ChartSignalAnalysis;
  chart4: ChartSignalAnalysis;
  benchmark: RecessionBenchmark;
}

const LEAD_WINDOW_MONTHS = 18;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function monthsBetween(a: Date, b: Date): number {
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function medianRecessionMonths(bands: RecessionBand[]): number {
  const completed = bands.filter((b) => b.end < new Date());
  const lengths = completed.map((b) => Math.max(1, monthsBetween(b.start, b.end)));
  return Math.round(median(lengths)) || 11;
}

function computeHitRate(
  signals: Date[],
  recessionBands: RecessionBand[],
  leadMonths: number,
): number {
  const completed = recessionBands.filter((b) => b.end < new Date());
  if (completed.length === 0) return 0;

  let hits = 0;
  for (const band of completed) {
    const windowStart = addMonths(band.start, -leadMonths);
    const fired = signals.some((s) => s >= windowStart && s < band.start);
    if (fired) hits++;
  }
  return hits / completed.length;
}

function highProbabilitySignals(
  correlation: DataPoint[],
  threshold = 0.35,
): Date[] {
  return correlation
    .filter((_, i, arr) => {
      if (i < 2) return false;
      const slope = arr[i].value - arr[i - 1].value;
      const prev = arr[i - 1].value - arr[i - 2].value;
      return Math.abs(slope) > threshold * 0.15 && slope * prev < 0;
    })
    .map((p) => p.date);
}

function fromForecast(
  correlation: DataPoint[],
  historicalSignals: Date[],
  hitRate: number,
  currentWarning: boolean,
  prediction: RecessionForecast,
): ChartSignalAnalysis {
  return {
    correlation,
    historicalSignals,
    predictedBand: prediction.predictedBand,
    forecastCorrelation: prediction.forecastCorrelation,
    forecastScenarios: prediction.forecastScenarios,
    forecastEnvelopeMin: prediction.forecastEnvelopeMin,
    forecastEnvelopeMax: prediction.forecastEnvelopeMax,
    currentWarning,
    hitRate,
    reversalScenarioCount: prediction.scenarioCount,
    inflectionSpreadMonths: prediction.vertexSpreadMonths,
  };
}

function analyzeChart(
  correlation: DataPoint[],
  recessionBands: RecessionBand[],
  prediction: RecessionForecast,
): ChartSignalAnalysis {
  const historicalSignals = highProbabilitySignals(correlation);
  const hitRate = computeHitRate(historicalSignals, recessionBands, LEAD_WINDOW_MONTHS);
  const currentWarning = isElevatedRecessionProbability(prediction.recessionProbability);
  return fromForecast(correlation, historicalSignals, hitRate, currentWarning, prediction);
}

function buildBenchmark(
  chart1: ChartSignalAnalysis,
  chart2: ChartSignalAnalysis,
  chart4: ChartSignalAnalysis,
  medianRecessionMonths: number,
): RecessionBenchmark {
  const now = new Date();
  const models: Array<{
    chartId: ModelBreakdown['chartId'];
    label: string;
    analysis: ChartSignalAnalysis;
  }> = [
    { chartId: 'chart1', label: 'GDP & S&P 500', analysis: chart1 },
    { chartId: 'chart2', label: 'GDP & jobs', analysis: chart2 },
    { chartId: 'chart4', label: 'Yield & GDP', analysis: chart4 },
  ];

  const breakdown: ModelBreakdown[] = models.map((m) => {
    const predictedStart = m.analysis.currentWarning
      ? now
      : m.analysis.predictedBand?.start ?? null;
    const predictedEnd = predictedStart
      ? addMonths(predictedStart, medianRecessionMonths)
      : null;
    const monthsUntilStart =
      predictedStart != null ? Math.max(0, monthsBetween(now, predictedStart)) : null;

    return {
      chartId: m.chartId,
      label: m.label,
      currentWarning: m.analysis.currentWarning,
      hitRate: m.analysis.hitRate,
      predictedStart,
      predictedEnd,
      monthsUntilStart,
      scenarioCount: m.analysis.reversalScenarioCount ?? 0,
      vertexSpreadMonths: m.analysis.inflectionSpreadMonths ?? null,
    };
  });

  return { medianRecessionMonths, breakdown };
}

export interface RecessionSignalInput {
  gdpYoy: DataPoint[];
  sp500: DataPoint[];
  jobsCreated: DataPoint[];
  yieldCurve: DataPoint[];
  recessionBands: RecessionBand[];
  predictions: {
    chart1: RecessionForecast;
    chart2: RecessionForecast;
    chart4: RecessionForecast;
  };
}

export function analyzeRecessionSignals(input: RecessionSignalInput): RecessionAnalysis {
  const medianMonths = medianRecessionMonths(input.recessionBands);

  const timeline1 = mergeMonthlyTimeline(input.sp500, input.gdpYoy);
  const gdp1 = forwardFillToDates(input.gdpYoy, timeline1);
  const corr1 = rollingCorrelation(gdp1, input.sp500, CORRELATION_WINDOW);

  const timeline2 = mergeMonthlyTimeline(input.jobsCreated, input.gdpYoy);
  const gdp2 = forwardFillToDates(input.gdpYoy, timeline2);
  const corr2 = rollingCorrelation(gdp2, input.jobsCreated, CORRELATION_WINDOW);

  const timeline4 = mergeMonthlyTimeline(input.yieldCurve, input.gdpYoy);
  const gdp4 = forwardFillToDates(input.gdpYoy, timeline4);
  const corr4 = rollingCorrelation(input.yieldCurve, gdp4, CORRELATION_WINDOW);

  const chart1 = analyzeChart(corr1, input.recessionBands, input.predictions.chart1);
  const chart2 = analyzeChart(corr2, input.recessionBands, input.predictions.chart2);
  const chart4 = analyzeChart(corr4, input.recessionBands, input.predictions.chart4);

  const benchmark = buildBenchmark(chart1, chart2, chart4, medianMonths);

  return { chart1, chart2, chart4, benchmark };
}
