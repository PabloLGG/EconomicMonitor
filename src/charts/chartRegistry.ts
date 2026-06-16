import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';

export interface SeriesRegistration {
  name: string;
  color: string;
  points: DataPoint[];
  formatValue?: (value: number) => string;
}

export interface ChartDataRegistration {
  chartId: string;
  label: string;
  series: SeriesRegistration[];
}

const registry: ChartDataRegistration[] = [];

export function registerChartData(reg: ChartDataRegistration): void {
  registry.push(reg);
}

export function clearChartRegistry(): void {
  registry.length = 0;
}

export interface SeriesValueAtDate {
  name: string;
  color: string;
  value: number | null;
  formatted: string;
}

export interface ChartValuesAtDate {
  chartId: string;
  label: string;
  series: SeriesValueAtDate[];
}

function nearestPoint(points: DataPoint[], date: Date): DataPoint | null {
  if (points.length === 0) return null;
  const targetMs = date.getTime();
  let best = points[0];
  let bestDist = Math.abs(best.date.getTime() - targetMs);
  for (const p of points) {
    const dist = Math.abs(p.date.getTime() - targetMs);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

export function getValuesAtDate(date: Date): ChartValuesAtDate[] {
  return registry.map((chart) => ({
    chartId: chart.chartId,
    label: chart.label,
    series: chart.series.map((s) => {
      const pt = nearestPoint(s.points, date);
      const value = pt?.value ?? null;
      const formatted =
        value == null
          ? '—'
          : s.formatValue
            ? s.formatValue(value)
            : Number.isInteger(value)
              ? value.toLocaleString()
              : value.toFixed(2);
      return {
        name: s.name,
        color: s.color,
        value,
        formatted,
      };
    }),
  }));
}

export function defaultFormatDate(date: Date): string {
  return formatDate(date);
}
