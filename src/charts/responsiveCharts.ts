import Plotly from 'plotly.js-dist-min';
import type { Layout } from 'plotly.js';
import { applyCorrelationSidePanel } from './common';
import { chartHeight, getSubplotLayout } from './subplotLayout';
import { layoutToRelayoutSnapshot, syncInitialChartLayout } from './chartReset';

const CORRELATION_WINDOW = 36;

interface ResponsiveChart {
  el: HTMLElement;
  layout: Partial<Layout>;
}

const charts: ResponsiveChart[] = [];
let listenerAttached = false;

export function registerResponsiveChart(el: HTMLElement, layout: Partial<Layout>): void {
  charts.push({ el, layout });
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

function relayoutAll(): void {
  const domains = getSubplotLayout();
  const height = chartHeight();

  for (const { el, layout } of charts) {
    applyCorrelationSidePanel(layout, domains, { windowMonths: CORRELATION_WINDOW });
    layout.height = height;
    syncInitialChartLayout(el, layout);
    void Plotly.relayout(el, layoutToRelayoutSnapshot(layout));
  }
}
