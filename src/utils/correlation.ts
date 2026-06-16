import { alignSeriesByMonth, buildMonthTimeline } from './align';
import type { DataPoint } from '../api/fred';

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return num / den;
}

export function rollingCorrelation(
  seriesA: DataPoint[],
  seriesB: DataPoint[],
  windowMonths: number,
): DataPoint[] {
  const timeline = buildMonthTimeline(seriesA, seriesB);
  const aVals = alignSeriesByMonth(seriesA, timeline);
  const bVals = alignSeriesByMonth(seriesB, timeline);
  const result: DataPoint[] = [];

  for (let i = windowMonths - 1; i < timeline.length; i++) {
    const xs: number[] = [];
    const ys: number[] = [];

    for (let j = i - windowMonths + 1; j <= i; j++) {
      const a = aVals[j];
      const b = bVals[j];
      if (a != null && b != null) {
        xs.push(a);
        ys.push(b);
      }
    }

    if (xs.length >= windowMonths - 2) {
      const r = pearson(xs, ys);
      if (r != null) {
        result.push({ date: timeline[i], value: r });
      }
    }
  }

  return result;
}
