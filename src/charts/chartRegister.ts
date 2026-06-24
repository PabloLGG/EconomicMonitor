import type { Shape } from 'plotly.js';
import Plotly from 'plotly.js-dist-min';
import { attachChartBacktestHover } from '../backtest/chartBacktestHover';
import { registerChartReset } from './chartReset';
import { registerChartExpand } from './chartExpand';
import { setResponsiveChartShapes } from './responsiveCharts';

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

  setResponsiveChartShapes(el, getBaseShapes);

  registerChartReset(el, getBaseShapes, {
    resetBacktest: hover.resetBacktest,
    reattach: hover.bind,
  });

  registerChartExpand(el);

  void Plotly.relayout(el, { shapes: getBaseShapes() }).then(() => Plotly.Plots.resize(el));
}
