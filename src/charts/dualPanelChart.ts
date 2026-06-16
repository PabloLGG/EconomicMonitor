import Plotly from 'plotly.js-dist-min';
import type { Data, Layout } from 'plotly.js';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { rollingCorrelation } from '../utils/correlation';
import {
  applyCorrelationSidePanel,
  dualAxisLayout,
  singleAxisLayout,
  type DualAxisLayoutOptions,
} from './common';
import { SIDE_BY_SIDE_CORR } from './subplotLayout';

export const CORRELATION_WINDOW = 36;
export const CORRELATION_SUBTITLE = `${CORRELATION_WINDOW}-month rolling correlation (right panel).`;

export interface DualPanelLayoutOptions extends DualAxisLayoutOptions {}

export function correlatePlottedPair(
  leftSeries: DataPoint[],
  rightSeries: DataPoint[],
): DataPoint[] {
  return rollingCorrelation(leftSeries, rightSeries, CORRELATION_WINDOW);
}

export function buildDualPanelLayout(options: DualPanelLayoutOptions): Partial<Layout> {
  const xrefs: Array<'x' | 'x2'> = ['x', 'x2'];
  const layout = dualAxisLayout({
    ...options,
    recessionXrefs: options.recessionBands || options.predictedBands ? xrefs : undefined,
  });

  applyCorrelationSidePanel(layout, SIDE_BY_SIDE_CORR, {
    windowMonths: CORRELATION_WINDOW,
  });

  return layout;
}

export function correlationTrace(corr: DataPoint[]): Partial<Data> {
  return {
    x: corr.map((p) => formatDate(p.date)),
    y: corr.map((p) => p.value),
    name: `${CORRELATION_WINDOW}m correlation`,
    type: 'scatter',
    mode: 'lines',
    line: { color: '#fbbf24', width: 1.5 },
    xaxis: 'x2',
    yaxis: 'y3',
    showlegend: false,
    hoverinfo: 'skip',
  };
}

export function correlationForecastTrace(forecast: DataPoint[]): Partial<Data> {
  return {
    x: forecast.map((p) => formatDate(p.date)),
    y: forecast.map((p) => p.value),
    name: 'Mean ML forecast',
    type: 'scatter',
    mode: 'lines',
    line: { color: 'rgba(251, 191, 36, 0.85)', width: 1.5, dash: 'dash' },
    xaxis: 'x2',
    yaxis: 'y3',
    showlegend: false,
    hoverinfo: 'skip',
  };
}

export function correlationEnvelopeTrace(
  envelope: DataPoint[],
  variant: 'min' | 'max',
): Partial<Data> {
  return {
    x: envelope.map((p) => formatDate(p.date)),
    y: envelope.map((p) => p.value),
    name: variant === 'min' ? 'Scenario min' : 'Scenario max',
    type: 'scatter',
    mode: 'lines',
    line: { color: 'rgba(251, 191, 36, 0.25)', width: 1, dash: 'dot' },
    xaxis: 'x2',
    yaxis: 'y3',
    showlegend: false,
    hoverinfo: 'skip',
  };
}

export function signalMarkerTrace(
  correlation: DataPoint[],
  signalDates: Date[],
): Partial<Data> {
  const dateSet = new Set(signalDates.map((d) => formatDate(d)));
  const points = correlation.filter((p) => dateSet.has(formatDate(p.date)));

  return {
    x: points.map((p) => formatDate(p.date)),
    y: points.map((p) => p.value),
    name: 'Recession signal',
    type: 'scatter',
    mode: 'markers',
    marker: { color: '#f472b6', size: 7, symbol: 'diamond' },
    xaxis: 'x2',
    yaxis: 'y3',
    showlegend: false,
    hoverinfo: 'skip',
  };
}

export function extendLayoutXRange(
  layout: Partial<Layout>,
  extraDates: Date[],
  baseDates: Date[] = [],
): void {
  const all = [...extraDates, ...baseDates];
  if (all.length === 0) return;
  const min = all.reduce((a, b) => (a < b ? a : b));
  const max = all.reduce((a, b) => (a > b ? a : b));
  const range: [string, string] = [formatDate(min), formatDate(max)];
  if (layout.xaxis) {
    layout.xaxis.autorange = false;
    layout.xaxis.range = range;
  }
  if (layout.xaxis2) {
    layout.xaxis2.autorange = false;
    layout.xaxis2.range = range;
  }
}

export function plotDualPanelChart(
  el: HTMLElement,
  traces: Partial<Data>[],
  layout: Partial<Layout>,
): Promise<void> {
  return Plotly.newPlot(el, traces, layout, {
    responsive: true,
    displayModeBar: false,
  }).then(() => undefined);
}

export function plotSinglePanelChart(
  el: HTMLElement,
  traces: Partial<Data>[],
  layout: Partial<Layout>,
): Promise<void> {
  return Plotly.newPlot(el, traces, layout, {
    responsive: true,
    displayModeBar: false,
  }).then(() => undefined);
}

export { singleAxisLayout };
