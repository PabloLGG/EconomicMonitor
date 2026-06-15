import type { DataPoint } from '../api/fred';

export function shiftMonthsForward(points: DataPoint[], months: number): DataPoint[] {
  return points.map((p) => {
    const d = new Date(p.date);
    d.setUTCMonth(d.getUTCMonth() + months);
    return { date: d, value: p.value };
  });
}
