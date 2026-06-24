import Plotly from 'plotly.js-dist-min';
import type { Layout } from 'plotly.js';
import { applyCorrelationSidePanel } from './common';
import { isChartExpanded } from './chartExpand';
import { chartExpandedHeight, chartHeight, getSubplotLayout } from './subplotLayout';
import { layoutToRelayoutSnapshot, syncInitialChartLayout } from './chartReset';

const CORRELATION_WINDOW = 36;

interface ResponsiveChart {
  el: HTMLElement;
  layout: Partial<Layout>;
  dualPanel: boolean;
}

const charts: ResponsiveChart[] = [];
let listenerAttached = false;

export function registerResponsiveChart(
  el: HTMLElement,
  layout: Partial<Layout>,
  dualPanel = true,
): void {
  charts.push({ el, layout, dualPanel });
  if (!listenerAttached) {
    listenerAttached = true;
    window.addEventListener('resize', scheduleRelayout);
  }
}

function scheduleRelayout(): void {
  window.clearTimeout(scheduleRelayout.timer);
  scheduleRelayout.timer = window.setTimeout(relayoutAll, 150);
}
scheduleRelayout.timer = 0;

function heightForChart(el: HTMLElement): number {
  return isChartExpanded(el) ? chartExpandedHeight() : chartHeight();
}

function applyLayoutForChart(entry: ResponsiveChart, height: number): void {
  const domains = getSubplotLayout();
  if (entry.dualPanel) {
    applyCorrelationSidePanel(entry.layout, domains, { windowMonths: CORRELATION_WINDOW });
  }
  entry.layout.height = height;
  syncInitialChartLayout(entry.el, entry.layout);
}

export async function relayoutChartElement(
  el: HTMLElement,
  expanded: boolean,
): Promise<void> {
  const entry = charts.find((c) => c.el === el);
  if (!entry) return;

  const height = expanded ? chartExpandedHeight() : chartHeight();
  applyLayoutForChart(entry, height);
  await Plotly.relayout(el, layoutToRelayoutSnapshot(entry.layout));
  Plotly.Plots.resize(el);
}

function relayoutAll(): void {
  for (const entry of charts) {
    const height = heightForChart(entry.el);
    applyLayoutForChart(entry, height);
    void Plotly.relayout(entry.el, layoutToRelayoutSnapshot(entry.layout)).then(() =>
      Plotly.Plots.resize(entry.el),
    );
  }
}
