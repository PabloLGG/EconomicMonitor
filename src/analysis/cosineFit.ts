import type { DataPoint } from '../api/fred';

export interface CosineFit {
  amplitude: number;
  periodMonths: number;
  phase: number;
  offset: number;
  t0: Date;
  relativeError: number;
}

function monthIndex(d: Date, t0: Date): number {
  return (
    (d.getUTCFullYear() - t0.getUTCFullYear()) * 12 +
    (d.getUTCMonth() - t0.getUTCMonth())
  );
}

function evaluateCosine(t: number, fit: Omit<CosineFit, 't0' | 'relativeError'>): number {
  return (
    fit.amplitude * Math.cos((2 * Math.PI * t) / fit.periodMonths + fit.phase) + fit.offset
  );
}

function fitPhaseAndAmplitude(
  ts: number[],
  ys: number[],
  periodMonths: number,
  offset: number,
): { amplitude: number; phase: number; rss: number } {
  let bestAmp = 0;
  let bestPhase = 0;
  let bestRss = Infinity;

  const phaseSteps = 72;
  for (let pi = 0; pi < phaseSteps; pi++) {
    const phase = (2 * Math.PI * pi) / phaseSteps;
    let sumCos = 0;
    let sumSin = 0;
    let sumCos2 = 0;
    let sumSin2 = 0;
    let sumCosSin = 0;
    let sumYCos = 0;
    let sumYSin = 0;

    for (let i = 0; i < ts.length; i++) {
      const c = Math.cos((2 * Math.PI * ts[i]) / periodMonths + phase);
      const s = Math.sin((2 * Math.PI * ts[i]) / periodMonths + phase);
      const y = ys[i] - offset;
      sumCos += c;
      sumSin += s;
      sumCos2 += c * c;
      sumSin2 += s * s;
      sumCosSin += c * s;
      sumYCos += y * c;
      sumYSin += y * s;
    }

    const det = sumCos2 * sumSin2 - sumCosSin * sumCosSin;
    if (Math.abs(det) < 1e-12) continue;

    const a = (sumYCos * sumSin2 - sumYSin * sumCosSin) / det;
    const b = (sumYSin * sumCos2 - sumYCos * sumCosSin) / det;
    const amp = Math.sqrt(a * a + b * b);
    const fittedPhase = Math.atan2(-b, a);

    let rss = 0;
    for (let i = 0; i < ts.length; i++) {
      const pred =
        amp * Math.cos((2 * Math.PI * ts[i]) / periodMonths + fittedPhase) + offset;
      const err = ys[i] - pred;
      rss += err * err;
    }

    if (rss < bestRss) {
      bestRss = rss;
      bestAmp = amp;
      bestPhase = fittedPhase;
    }
  }

  return { amplitude: bestAmp, phase: bestPhase, rss: bestRss };
}

export function fitCosine(series: DataPoint[]): CosineFit | null {
  if (series.length < 24) return null;

  const t0 = series[0].date;
  const ts = series.map((p) => monthIndex(p.date, t0));
  const ys = series.map((p) => p.value);
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const varY = ys.reduce((a, y) => a + (y - meanY) ** 2, 0) / ys.length;

  let best: CosineFit | null = null;

  for (let periodMonths = 48; periodMonths <= 180; periodMonths += 6) {
    const { amplitude, phase, rss } = fitPhaseAndAmplitude(ts, ys, periodMonths, meanY);
    const relativeError = varY > 0 ? Math.sqrt(rss / (ys.length * varY)) : Infinity;
    const candidate: CosineFit = {
      amplitude,
      periodMonths,
      phase,
      offset: meanY,
      t0,
      relativeError,
    };
    if (!best || relativeError < best.relativeError) {
      best = candidate;
    }
  }

  return best;
}

function addMonthsFromT0(t0: Date, months: number): Date {
  const d = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(0);
  return d;
}

export function extendCosineForecast(
  fit: CosineFit,
  lastHistoricalDate: Date,
  monthsAhead: number,
): DataPoint[] {
  const result: DataPoint[] = [];
  const startIdx = monthIndex(lastHistoricalDate, fit.t0) + 1;

  for (let i = 0; i < monthsAhead; i++) {
    const t = startIdx + i;
    result.push({
      date: addMonthsFromT0(fit.t0, t),
      value: evaluateCosine(t, fit),
    });
  }

  return result;
}

export function evaluateCosineAtDate(fit: CosineFit, date: Date): number {
  const t = monthIndex(date, fit.t0);
  return evaluateCosine(t, fit);
}

export function findNextCosineMinimum(
  fit: CosineFit,
  afterDate: Date,
  monthsAhead: number,
  requireNegative: boolean,
): Date | null {
  const startT = monthIndex(afterDate, fit.t0) + 1;
  let bestT: number | null = null;
  let bestVal = Infinity;

  for (let t = startT; t < startT + monthsAhead; t++) {
    const prev = evaluateCosine(t - 1, fit);
    const curr = evaluateCosine(t, fit);
    const next = evaluateCosine(t + 1, fit);
    if (curr <= prev && curr <= next) {
      if (curr < bestVal && (!requireNegative || curr < 0)) {
        bestVal = curr;
        bestT = t;
      }
    }
  }

  if (bestT === null) return null;
  return addMonthsFromT0(fit.t0, bestT);
}
