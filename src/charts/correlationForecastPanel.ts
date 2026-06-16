import type { Layout } from 'plotly.js';
import { forecastHorizonEnd } from '../analysis/recessionTypes';
import { extendLayoutXRange } from './dualPanelChart';

export function applyCorrelationForecastLayout(
  layout: Partial<Layout>,
  baseDates: Date[],
): void {
  const lastBase = baseDates.reduce((a, b) => (a > b ? a : b), baseDates[0]);
  if (lastBase) {
    extendLayoutXRange(layout, [forecastHorizonEnd(lastBase)], baseDates);
  }
}
