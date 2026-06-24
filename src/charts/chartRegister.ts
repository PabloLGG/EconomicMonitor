import type { Layout, Shape } from 'plotly.js';
import { attachChartBacktestHover } from '../backtest/chartBacktestHover';
import { registerChartReset } from './chartReset';

export function registerChartBacktest(
  el: HTMLElement,
  xrefs: Array<NonNullable<Shape['xref']>>,
  getBaseShapes: () => Partial<Shape>[],
  defaultDate: Date,
  onDateChange: (date: Date) => void,
  layout: Partial<Layout>,
  onPanelDate?: (date: Date | null) => void,
): void {
  const hover = attachChartBacktestHover({
    el,
    xrefs,
    getBaseShapes,
    defaultDate,
    onDateChange,
    onPanelDate,
  });

  registerChartReset(el, layout, hover.reset);
}
