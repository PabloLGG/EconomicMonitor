import Plotly from 'plotly.js-dist-min';
import type { Data, Layout } from 'plotly.js';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { rollingCorrelation } from '../utils/correlation';
import {
  applyCorrelationSidePanel,
  dualAxisLayout,
  HOVER_Y,
  singleAxisLayout,
  type DualAxisLayoutOptions,
} from './common';
import { SIDE_BY_SIDE_CORR } from './subplotLayout';
import { attachHoverLine, attachSyncedSubplotHover } from './syncedHover';

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
  const layout = dualAxisLayout({
    ...options,
    recessionXrefs: options.recessionBands ? ['x', 'x2'] : undefined,
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
    hovertemplate: HOVER_Y.pct2,
  };
}

export function plotDualPanelChart(
  el: HTMLElement,
  traces: Partial<Data>[],
  layout: Partial<Layout>,
): void {
  void Plotly.newPlot(el, traces, layout, {
    responsive: true,
    displayModeBar: false,
  }).then(() => {
    attachSyncedSubplotHover(el, layout.shapes ?? [], SIDE_BY_SIDE_CORR.y);
  });
}

export function plotSinglePanelChart(
  el: HTMLElement,
  traces: Partial<Data>[],
  layout: Partial<Layout>,
): void {
  void Plotly.newPlot(el, traces, layout, {
    responsive: true,
    displayModeBar: false,
  }).then(() => {
    attachHoverLine(el, layout.shapes ?? []);
  });
}

export { singleAxisLayout };
