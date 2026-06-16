import type { DataPoint } from '../api/fred';
import { parseDate, START_1985 } from '../api/fred';

const SHILLER_URL = import.meta.env.DEV
  ? '/api/shiller'
  : 'https://datahub.io/core/s-and-p-500/_r/-/data/data.csv';

export async function fetchShillerMonthly(): Promise<DataPoint[]> {
  const response = await fetch(SHILLER_URL);
  if (!response.ok) {
    throw new Error(`Shiller S&P 500 CSV request failed: ${response.status}`);
  }

  const text = await response.text();
  if (text.trim().startsWith('<')) {
    throw new Error(`Shiller S&P 500 CSV request failed: ${response.status}`);
  }

  return parseShillerCsv(text);
}

export function parseShillerCsv(csv: string): DataPoint[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',');
  const dateIdx = header.indexOf('Date');
  const spIdx = header.indexOf('SP500');
  if (dateIdx === -1 || spIdx === -1) {
    throw new Error('Shiller CSV missing Date or SP500 columns');
  }

  const points: DataPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const value = parseFloat(cols[spIdx]);
    if (Number.isNaN(value) || value <= 0) continue;
    points.push({ date: parseDate(cols[dateIdx]), value });
  }

  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function mergeSp500History(shiller: DataPoint[], fred: DataPoint[]): DataPoint[] {
  const cutoff = parseDate(START_1985);
  const sortedFred = [...fred].sort((a, b) => a.date.getTime() - b.date.getTime());
  const fredStart = sortedFred[0]?.date;

  const merged: DataPoint[] = [];

  for (const point of shiller) {
    if (point.date < cutoff) continue;
    if (fredStart && point.date >= fredStart) break;
    merged.push(point);
  }

  for (const point of sortedFred) {
    if (point.date >= cutoff) merged.push(point);
  }

  return merged.sort((a, b) => a.date.getTime() - b.date.getTime());
}
