import type { Data } from 'plotly.js';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { splitSeriesAtDate } from '../analysis/recessionForecast';

export const FUTURE_OPACITY = 0.15;

export interface SeriesTraceStyle {
  name: string;
  color: string;
  width?: number;
  yaxis: string;
  xaxis?: string;
  mode?: 'lines' | 'lines+markers';
  marker?: { size: number; color: string };
  hovertemplate?: string;
}

export function splitForDisplay(
  series: DataPoint[],
  date: Date,
): { past: DataPoint[]; future: DataPoint[] } {
  const { past, future } = splitSeriesAtDate(series, date);
  const anchor = past[past.length - 1];
  const futureWithAnchor = anchor && future.length > 0 ? [anchor, ...future] : future;
  return { past, future: futureWithAnchor };
}

export function createPastFutureTraces(
  series: DataPoint[],
  style: SeriesTraceStyle,
): [Partial<Data>, Partial<Data>] {
  const x = series.map((p) => formatDate(p.date));
  const y = series.map((p) => p.value);

  const base: Partial<Data> = {
    type: 'scatter',
    mode: style.mode ?? 'lines',
    showlegend: false,
    xaxis: style.xaxis ?? 'x',
    yaxis: style.yaxis,
  };

  if (style.marker) {
    base.marker = style.marker;
  }

  return [
    {
      ...base,
      x,
      y,
      name: style.name,
      line: { color: style.color, width: style.width ?? 2 },
      hovertemplate: style.hovertemplate,
    },
    {
      ...base,
      x: [],
      y: [],
      name: `${style.name} (known future)`,
      line: { color: style.color, width: style.width ?? 2 },
      opacity: FUTURE_OPACITY,
      hoverinfo: 'skip',
    },
  ];
}

export function pastFutureRestylePayload(
  series: DataPoint[],
  date: Date,
): { pastX: string[]; pastY: number[]; futureX: string[]; futureY: number[] } {
  const { past, future } = splitForDisplay(series, date);
  return {
    pastX: past.map((p) => formatDate(p.date)),
    pastY: past.map((p) => p.value),
    futureX: future.map((p) => formatDate(p.date)),
    futureY: future.map((p) => p.value),
  };
}

export function latestSeriesDate(series: DataPoint[]): Date {
  return series.reduce((latest, p) => (p.date > latest ? p.date : latest), series[0].date);
}
