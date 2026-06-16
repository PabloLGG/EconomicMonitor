import type { DataPoint } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline } from '../utils/align';
import { rollingCorrelation } from '../utils/correlation';
import { CORRELATION_WINDOW } from '../charts/dualPanelChart';
import { FEATURE_NAMES, INPUT_WINDOW } from './recessionTypes';

export interface MacroSeriesInput {
  gdpYoy: DataPoint[];
  sp500: DataPoint[];
  jobsCreated: DataPoint[];
  yieldCurve: DataPoint[];
}

export interface FeaturePanelRow {
  date: Date;
  values: number[];
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function diffs(series: number[]): number[] {
  return series.map((v, i) => (i === 0 ? 0 : v - series[i - 1]));
}

function secondDiffs(series: number[]): number[] {
  const d1 = diffs(series);
  return d1.map((v, i) => (i === 0 ? 0 : v - d1[i - 1]));
}

function rollingStdDiffs(series: number[], window = 24): number[] {
  const d1 = diffs(series);
  return d1.map((_, i) => {
    const start = Math.max(1, i - window + 1);
    const slice = d1.slice(start, i + 1);
    if (slice.length < 2) return 0;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    return Math.sqrt(variance);
  });
}

export function buildFeaturePanel(input: MacroSeriesInput): FeaturePanelRow[] {
  const timeline1 = mergeMonthlyTimeline(input.sp500, input.gdpYoy);
  const gdp1 = forwardFillToDates(input.gdpYoy, timeline1);
  const corr1 = rollingCorrelation(gdp1, input.sp500, CORRELATION_WINDOW);

  const timeline2 = mergeMonthlyTimeline(input.jobsCreated, input.gdpYoy);
  const gdp2 = forwardFillToDates(input.gdpYoy, timeline2);
  const corr2 = rollingCorrelation(gdp2, input.jobsCreated, CORRELATION_WINDOW);

  const timeline4 = mergeMonthlyTimeline(input.yieldCurve, input.gdpYoy);
  const gdp4 = forwardFillToDates(input.gdpYoy, timeline4);
  const corr4 = rollingCorrelation(input.yieldCurve, gdp4, CORRELATION_WINDOW);

  const ycMap = new Map(input.yieldCurve.map((p) => [monthKey(p.date), p.value]));

  const byMonth = new Map<string, FeaturePanelRow>();
  const addCorr = (corr: DataPoint[], fi: number) => {
    for (const p of corr) {
      const mk = monthKey(p.date);
      if (!byMonth.has(mk)) {
        byMonth.set(mk, { date: p.date, values: new Array(FEATURE_NAMES.length).fill(NaN) });
      }
      byMonth.get(mk)!.values[fi] = p.value;
    }
  };
  addCorr(corr1, 0);
  addCorr(corr2, 1);
  addCorr(corr4, 2);

  const rows = [...byMonth.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const c1 = rows.map((r) => r.values[0]);
  const c2 = rows.map((r) => r.values[1]);
  const c4 = rows.map((r) => r.values[2]);

  const d1_1 = diffs(c1), d2_1 = secondDiffs(c1), v1 = rollingStdDiffs(c1);
  const d1_2 = diffs(c2), d2_2 = secondDiffs(c2), v2 = rollingStdDiffs(c2);
  const d1_4 = diffs(c4), d2_4 = secondDiffs(c4), v4 = rollingStdDiffs(c4);

  for (let i = 0; i < rows.length; i++) {
    rows[i].values[3] = d1_1[i];
    rows[i].values[4] = d1_2[i];
    rows[i].values[5] = d1_4[i];
    rows[i].values[6] = d2_1[i];
    rows[i].values[7] = d2_2[i];
    rows[i].values[8] = d2_4[i];
    rows[i].values[9] = v1[i];
    rows[i].values[10] = v2[i];
    rows[i].values[11] = v4[i];
    rows[i].values[12] = ycMap.get(monthKey(rows[i].date)) ?? NaN;
  }

  return rows.filter((r) => r.values.every((v) => Number.isFinite(v)));
}

function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(0);
  return d;
}

/** Recompute d1/d2/vol/yield_curve on rows that already have corr1/2/4 set. */
export function recomputeDerivedFeatures(rows: FeaturePanelRow[], flatYieldCurve: number): void {
  const c1 = rows.map((r) => r.values[0]);
  const c2 = rows.map((r) => r.values[1]);
  const c4 = rows.map((r) => r.values[2]);
  const d1_1 = diffs(c1), d2_1 = secondDiffs(c1), v1 = rollingStdDiffs(c1);
  const d1_2 = diffs(c2), d2_2 = secondDiffs(c2), v2 = rollingStdDiffs(c2);
  const d1_4 = diffs(c4), d2_4 = secondDiffs(c4), v4 = rollingStdDiffs(c4);

  for (let i = 0; i < rows.length; i++) {
    rows[i].values[3] = d1_1[i];
    rows[i].values[4] = d1_2[i];
    rows[i].values[5] = d1_4[i];
    rows[i].values[6] = d2_1[i];
    rows[i].values[7] = d2_2[i];
    rows[i].values[8] = d2_4[i];
    rows[i].values[9] = v1[i];
    rows[i].values[10] = v2[i];
    rows[i].values[11] = v4[i];
    rows[i].values[12] = flatYieldCurve;
  }
}

export function appendSyntheticCorrRows(
  panel: FeaturePanelRow[],
  futureCorr: Float32Array,
  stepMonths: number,
  flatYieldCurve: number,
): FeaturePanelRow[] {
  const extended = panel.map((r) => ({ date: r.date, values: [...r.values] }));
  let cursor = extended[extended.length - 1].date;

  for (let m = 0; m < stepMonths; m++) {
    cursor = addMonthsUtc(cursor, 1);
    extended.push({
      date: cursor,
      values: [
        futureCorr[m * 3 + 0],
        futureCorr[m * 3 + 1],
        futureCorr[m * 3 + 2],
        0, 0, 0, 0, 0, 0, 0, 0, 0,
        flatYieldCurve,
      ],
    });
  }

  recomputeDerivedFeatures(extended, flatYieldCurve);
  return extended;
}

export function panelWindowEndingAt(
  panel: FeaturePanelRow[],
  endIdx: number,
  inputWindow = INPUT_WINDOW,
): { window: number[][]; anchor: FeaturePanelRow } | null {
  if (endIdx < inputWindow - 1) return null;
  const slice = panel.slice(endIdx - inputWindow + 1, endIdx + 1);
  return {
    window: slice.map((r) => r.values),
    anchor: panel[endIdx],
  };
}

export function windowAtDate(
  panel: FeaturePanelRow[],
  asOfDate: Date,
  inputWindow = INPUT_WINDOW,
): { window: number[][]; anchor: FeaturePanelRow } | null {
  const target = asOfDate.getTime();
  let endIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < panel.length; i++) {
    const dist = Math.abs(panel[i].date.getTime() - target);
    if (dist < bestDist) {
      bestDist = dist;
      endIdx = i;
    }
  }
  if (endIdx < inputWindow - 1) return null;
  const slice = panel.slice(endIdx - inputWindow + 1, endIdx + 1);
  return {
    window: slice.map((r) => r.values),
    anchor: panel[endIdx],
  };
}

export function normalizeWindow(
  window: number[][],
  mean: number[],
  std: number[],
): Float32Array {
  const flat = new Float32Array(INPUT_WINDOW * FEATURE_NAMES.length);
  let k = 0;
  for (let t = 0; t < window.length; t++) {
    for (let f = 0; f < FEATURE_NAMES.length; f++) {
      flat[k++] = (window[t][f] - mean[f]) / Math.max(std[f], 1e-6);
    }
  }
  return flat;
}
