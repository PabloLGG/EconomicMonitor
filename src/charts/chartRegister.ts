import type { Shape } from 'plotly.js';
import { attachChartBacktestHover } from '../backtest/chartBacktestHover';
import { registerChartReset } from './chartReset';
import { registerChartExpand } from './chartExpand';

export function registerChartBacktest(
  el: HTMLElement,
  xrefs: Array<NonNullable<Shape['xref']>>,
  getBaseShapes: () => Partial<Shape>[],
  defaultDate: Date,
  onDateChange: (date: Date) => void,
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

  registerChartReset(el, getBaseShapes, {
    resetBacktest: hover.resetBacktest,
    reattach: hover.bind,
  });

  registerChartExpand(el);
}
