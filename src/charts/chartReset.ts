import Plotly from 'plotly.js-dist-min';
import type { Layout } from 'plotly.js';

const AXIS_KEYS = ['xaxis', 'xaxis2', 'yaxis', 'yaxis2', 'yaxis3'] as const;

export function layoutToRelayoutSnapshot(layout: Partial<Layout>): Partial<Layout> {
  const snap: Partial<Layout> = {};

  for (const key of AXIS_KEYS) {
    const axis = layout[key];
    if (!axis) continue;
    if (axis.range) {
      snap[key] = { range: [...axis.range] as [number, number], autorange: false };
    } else {
      snap[key] = { autorange: true };
    }
    if (axis.domain) {
      snap[key] = { ...snap[key], domain: [...axis.domain] as [number, number] };
    }
  }

  if (layout.height != null) snap.height = layout.height;
  return snap;
}

export function registerChartReset(
  chartEl: HTMLElement,
  layout: Partial<Layout>,
  onReset?: () => void,
): void {
  const section = chartEl.closest('.chart-section');
  const button = section?.querySelector<HTMLButtonElement>('.chart-reset-btn');
  if (!button) return;

  button.addEventListener('click', () => {
    void Plotly.relayout(chartEl, layoutToRelayoutSnapshot(layout)).then(() => {
      onReset?.();
    });
  });
}
