import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';

export interface RecessionBand {
  start: Date;
  end: Date;
}

export function parseRecessionBands(usRec: DataPoint[]): RecessionBand[] {
  const bands: RecessionBand[] = [];
  let start: Date | null = null;

  for (const point of usRec) {
    if (point.value === 1 && start === null) {
      start = point.date;
    } else if (point.value === 0 && start !== null) {
      bands.push({ start, end: point.date });
      start = null;
    }
  }

  if (start !== null) {
    bands.push({ start, end: new Date() });
  }

  return bands;
}

export function filterFromDate(points: DataPoint[], from: string): DataPoint[] {
  const cutoff = new Date(from + 'T00:00:00Z');
  return points.filter((p) => p.date >= cutoff);
}

/** Forward-fill quarterly (or sparse) series onto monthly dates from another series. */
export function forwardFillToDates(
  sparse: DataPoint[],
  targetDates: Date[],
): DataPoint[] {
  if (sparse.length === 0) return [];

  const sorted = [...sparse].sort((a, b) => a.date.getTime() - b.date.getTime());
  const result: DataPoint[] = [];
  let idx = 0;
  let current = sorted[0];

  for (const date of targetDates) {
    while (idx + 1 < sorted.length && sorted[idx + 1].date <= date) {
      idx++;
      current = sorted[idx];
    }
    if (date >= current.date) {
      result.push({ date, value: current.value });
    }
  }

  return result;
}

/** Resample daily/weekly series to monthly averages. */
export function toMonthlyAverage(points: DataPoint[]): DataPoint[] {
  const buckets = new Map<string, { sum: number; count: number; date: Date }>();

  for (const p of points) {
    const key = `${p.date.getUTCFullYear()}-${String(p.date.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthEnd = new Date(Date.UTC(p.date.getUTCFullYear(), p.date.getUTCMonth() + 1, 0));
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += p.value;
      existing.count += 1;
    } else {
      buckets.set(key, { sum: p.value, count: 1, date: monthEnd });
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { sum, count, date }]) => ({ date, value: sum / count }));
}

/** Use last observation per calendar month (for month-end S&P). */
export function toMonthEnd(points: DataPoint[]): DataPoint[] {
  const buckets = new Map<string, DataPoint>();

  for (const p of points) {
    const key = `${p.date.getUTCFullYear()}-${String(p.date.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthEnd = new Date(Date.UTC(p.date.getUTCFullYear(), p.date.getUTCMonth() + 1, 0));
    const existing = buckets.get(key);
    if (!existing || p.date >= existing.date) {
      buckets.set(key, { date: monthEnd, value: p.value });
    }
  }

  return [...buckets.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function mergeMonthlyTimeline(...series: DataPoint[][]): Date[] {
  const keys = new Set<string>();
  for (const s of series) {
    for (const p of s) {
      keys.add(formatDate(p.date));
    }
  }
  return [...keys]
    .sort()
    .map((k) => {
      const [y, m, d] = k.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    });
}

export function alignSeriesToDates(
  series: DataPoint[],
  dates: Date[],
): (number | null)[] {
  const map = new Map(series.map((p) => [formatDate(p.date), p.value]));
  return dates.map((d) => map.get(formatDate(d)) ?? null);
}

export function lastFiveYearsCutoff(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 5);
  return d;
}

export function filterAfter(points: DataPoint[], cutoff: Date): DataPoint[] {
  return points.filter((p) => p.date >= cutoff);
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Sorted month-end dates covering all points in the given series. */
export function buildMonthTimeline(...series: DataPoint[][]): Date[] {
  const keys = new Set<string>();
  for (const s of series) {
    for (const p of s) {
      keys.add(monthKey(p.date));
    }
  }
  return [...keys]
    .sort()
    .map((key) => {
      const [y, m] = key.split('-').map(Number);
      return new Date(Date.UTC(y, m, 0));
    });
}

export function alignSeriesByMonth(
  series: DataPoint[],
  dates: Date[],
): (number | null)[] {
  const map = new Map<string, number>();
  for (const p of series) {
    map.set(monthKey(p.date), p.value);
  }
  return dates.map((d) => map.get(monthKey(d)) ?? null);
}
