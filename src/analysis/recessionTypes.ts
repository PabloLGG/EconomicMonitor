import type { DataPoint } from '../api/fred';
import type { RecessionBand } from '../utils/align';

export const FORECAST_MONTHS = 120;
export const FORWARD_HORIZON_MONTHS = 60;
export const PROBABILITY_HORIZON_MONTHS = 12;
export const HORIZON_PROB_MONTHS = [12, 24, 36, 48, 60] as const;
export type HorizonProbMonths = (typeof HORIZON_PROB_MONTHS)[number];

export const INPUT_WINDOW = 60;
export const FORECAST_HORIZON = 36;
export const HAZARD_HORIZON = 24;
export const ROLLOUT_STEPS = 3;
export const ROLLOUT_STEP_MONTHS = 24;
export const MC_SAMPLES_DEFAULT = 16;

export const FEATURE_NAMES = [
  'corr1',
  'corr2',
  'corr4',
  'd1_corr1',
  'd1_corr2',
  'd1_corr4',
  'd2_corr1',
  'd2_corr2',
  'd2_corr4',
  'vol_corr1',
  'vol_corr2',
  'vol_corr4',
  'yield_curve',
] as const;

export type ChartForecastId = 'chart1' | 'chart2' | 'chart4';

export const CHART_CORR_INDEX: Record<ChartForecastId, number> = {
  chart1: 0,
  chart2: 1,
  chart4: 2,
};

export interface HorizonProbability {
  months: HorizonProbMonths;
  probability: number;
}

export interface RecessionScenario {
  weight: number;
  start: Date;
  peakP: number;
}

export interface FeatureAttribution {
  feature: string;
  contribution: number;
}

export interface NextRecessionEstimate {
  medianStart: Date | null;
  p25: Date | null;
  p75: Date | null;
  peakProbability: number;
}

/** Live forward-looking forecast from latest data. */
export interface ForwardOutlook {
  anchorDate: Date;
  chartId: ChartForecastId;
  horizonProbs: HorizonProbability[];
  nextRecession: NextRecessionEstimate;
  expectedDurationMonths: number;
  confidenceScore: number;
  correlationMean: DataPoint[];
  correlationP10: DataPoint[];
  correlationP90: DataPoint[];
  probabilityCurve: DataPoint[];
  probabilityBandLo: DataPoint[];
  probabilityBandHi: DataPoint[];
  scenarios: RecessionScenario[];
  attribution: FeatureAttribution[];
}

/** Unified forecast output consumed by charts and trailing panel. */
export interface RecessionForecast {
  predictedStart: Date | null;
  predictedBand: RecessionBand | null;
  forecastCorrelation: DataPoint[];
  forecastScenarios: DataPoint[][];
  forecastEnvelopeMin?: DataPoint[];
  forecastEnvelopeMax?: DataPoint[];
  vertexDates: Date[];
  scenarioCount: number;
  vertexSpreadMonths: number | null;
  recessionProbability: number;
  probabilityHorizonMonths: number;
  uncertaintyWidth: number;
  forwardOutlook?: ForwardOutlook;
}

export interface CalibrationCurve {
  x_thresholds: number[];
  y_calibrated: number[];
}

export interface RecessionModelMeta {
  version: string;
  feature_names: string[];
  mean: number[];
  std: number[];
  input_window: number;
  forecast_horizon: number;
  hazard_horizon: number;
  probability_horizon?: number;
  mc_noise_scale?: number;
  calibration: CalibrationCurve;
  calibration_by_horizon?: Partial<Record<string, CalibrationCurve>>;
  attribution?: FeatureAttribution[];
  metrics?: Record<string, number>;
}

export function probabilityHorizonMonths(meta: RecessionModelMeta | null): number {
  return meta?.probability_horizon ?? PROBABILITY_HORIZON_MONTHS;
}

export function calibrationForHorizon(
  meta: RecessionModelMeta,
  months: HorizonProbMonths,
): CalibrationCurve {
  return meta.calibration_by_horizon?.[String(months)] ?? meta.calibration;
}

export function applyCalibrationForHorizon(
  p: number,
  meta: RecessionModelMeta,
  months: HorizonProbMonths,
): number {
  return applyCalibration(p, calibrationForHorizon(meta, months));
}

export function formatRecessionProbability(p: number): string {
  const pct = p * 100;
  if (pct <= 0) return '0%';
  if (pct >= 100) return '100%';
  if (pct < 0.05) return '<0.1%';
  if (pct >= 99.95) return '>99.9%';
  return `${pct.toFixed(1)}%`;
}

export function applyCalibration(p: number, curve: CalibrationCurve): number {
  const { x_thresholds: xs, y_calibrated: ys } = curve;
  const x = Math.max(0, Math.min(1, p));
  if (xs.length === 0) return x;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return x;
}

export function hazardsToProbability(hazards: Float32Array, horizon = HAZARD_HORIZON): number {
  let surv = 1;
  for (let i = 0; i < Math.min(horizon, hazards.length); i++) {
    const h = Math.max(1e-6, Math.min(1 - 1e-6, hazards[i]));
    surv *= 1 - h;
  }
  return 1 - surv;
}

export function hazardsToHorizonProbs(
  hazards: Float32Array,
  meta: RecessionModelMeta,
): HorizonProbability[] {
  return HORIZON_PROB_MONTHS.map((months) => ({
    months,
    probability: applyCalibrationForHorizon(
      hazardsToProbability(hazards, months),
      meta,
      months,
    ),
  }));
}

export function peakHazardMonthIndex(hazards: Float32Array): number {
  if (hazards.length === 0) return 1;
  let peak = hazards[0];
  let month = 1;
  for (let t = 1; t < hazards.length; t++) {
    if (hazards[t] > peak) {
      peak = hazards[t];
      month = t + 1;
    }
  }
  return month;
}

export function medianOnsetFromHazards(hazards: Float32Array, anchor: Date): Date | null {
  let cumulative = 0;
  for (let t = 0; t < hazards.length; t++) {
    const h = Math.max(1e-6, Math.min(1 - 1e-6, hazards[t]));
    cumulative += h * (1 - cumulative);
    if (cumulative >= 0.5) {
      const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
      d.setUTCMonth(d.getUTCMonth() + t + 1);
      d.setUTCDate(0);
      return d;
    }
  }
  const peakMonth = peakHazardMonthIndex(hazards);
  if (peakMonth >= hazards.length) return null;
  const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + peakMonth);
  d.setUTCDate(0);
  return d;
}

export function onsetMonthIndex(hazards: Float32Array): number {
  let cumulative = 0;
  for (let t = 0; t < hazards.length; t++) {
    const h = Math.max(1e-6, Math.min(1 - 1e-6, hazards[t]));
    cumulative += h * (1 - cumulative);
    if (cumulative >= 0.5) return t + 1;
  }
  return peakHazardMonthIndex(hazards);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(0);
  return d;
}

export function forecastHorizonEnd(startDate: Date): Date {
  return addMonths(startDate, FORECAST_MONTHS);
}

export const emptyForecast = (): RecessionForecast => ({
  predictedStart: null,
  predictedBand: null,
  forecastCorrelation: [],
  forecastScenarios: [],
  vertexDates: [],
  scenarioCount: 0,
  vertexSpreadMonths: null,
  recessionProbability: 0,
  probabilityHorizonMonths: PROBABILITY_HORIZON_MONTHS,
  uncertaintyWidth: 0,
});

export const emptyForwardOutlook = (chartId: ChartForecastId, anchor: Date): ForwardOutlook => ({
  anchorDate: anchor,
  chartId,
  horizonProbs: HORIZON_PROB_MONTHS.map((months) => ({ months, probability: 0 })),
  nextRecession: { medianStart: null, p25: null, p75: null, peakProbability: 0 },
  expectedDurationMonths: 0,
  confidenceScore: 0,
  correlationMean: [],
  correlationP10: [],
  correlationP90: [],
  probabilityCurve: [],
  probabilityBandLo: [],
  probabilityBandHi: [],
  scenarios: [],
  attribution: [],
});
