import Plotly from 'plotly.js-dist-min';
import type { Config, Data, Layout, Shape } from 'plotly.js';
import { plotDragMode } from './common';

const AXIS_KEYS = ['xaxis', 'xaxis2', 'yaxis', 'yaxis2', 'yaxis3'] as const;

type PlotlyGd = HTMLElement & { data: Partial<Data>[] };

const initialLayouts = new WeakMap<HTMLElement, Partial<Layout>>();
const plotConfigs = new WeakMap<HTMLElement, Partial<Config>>();

export function plotConfig(): Partial<Config> {
  return {
    responsive: true,
    displayModeBar: false,
    scrollZoom: !window.matchMedia('(pointer: coarse)').matches,
  };
}

function cloneLayout(layout: Partial<Layout>): Partial<Layout> {
  return structuredClone(layout);
}

/** Store a deep copy of the full layout used at plot time (reset baseline). */
export function storeInitialChartLayout(
  el: HTMLElement,
  layout: Partial<Layout>,
  config: Partial<Config> = plotConfig(),
): void {
  initialLayouts.set(el, cloneLayout(layout));
  plotConfigs.set(el, { ...config });
}

/** Refresh the reset baseline after viewport-driven layout changes. */
export function syncInitialChartLayout(el: HTMLElement, layout: Partial<Layout>): void {
  initialLayouts.set(el, cloneLayout(layout));
}

/** Build relayout patch from our layout object (used on viewport resize). */
export function layoutToRelayoutSnapshot(layout: Partial<Layout>): Partial<Layout> {
  const snap: Partial<Layout> = {};

  for (const key of AXIS_KEYS) {
    const axis = layout[key];
    if (!axis) continue;
    const patch: Record<string, unknown> = {};
    if (axis.domain) patch.domain = [...axis.domain];
    if (axis.range) {
      patch.range = [...axis.range];
      patch.autorange = false;
    } else {
      patch.autorange = true;
    }
    (snap as Record<string, unknown>)[key] = patch;
  }

  if (layout.height != null) snap.height = layout.height;
  return snap;
}

export function registerChartReset(
  chartEl: HTMLElement,
  getBaseShapes: () => Partial<Shape>[],
  callbacks?: { resetBacktest?: () => void; reattach?: () => void },
): void {
  const section = chartEl.closest('.chart-section');
  const button = section?.querySelector<HTMLButtonElement>('.chart-reset-btn');
  if (!button) return;

  button.addEventListener('click', () => {
    const layout = initialLayouts.get(chartEl);
    if (!layout) return;

    callbacks?.resetBacktest?.();

    const gd = chartEl as PlotlyGd;
    const config = plotConfigs.get(chartEl) ?? plotConfig();

    void Plotly.react(gd, gd.data, cloneLayout(layout), config).then(() => {
      callbacks?.reattach?.();
      void Plotly.relayout(chartEl, {
        shapes: getBaseShapes(),
        dragmode: plotDragMode(),
      });
    });
  });
}
