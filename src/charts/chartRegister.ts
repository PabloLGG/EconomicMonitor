import type { Shape } from 'plotly.js';
import { attachChartBacktestHover } from '../backtest/chartBacktestHover';

export function registerChartBacktest(
  el: HTMLElement,
  xrefs: Array<NonNullable<Shape['xref']>>,
  yDomain: [number, number],
  getBaseShapes: () => Partial<Shape>[],
  defaultDate: Date,
  onDateChange: (date: Date) => void,
  onPanelDate?: (date: Date | null) => void,
): void {
  attachChartBacktestHover({
    el,
    xrefs,
    yDomain,
    getBaseShapes,
    defaultDate,
    onDateChange,
    onPanelDate,
  });
}
