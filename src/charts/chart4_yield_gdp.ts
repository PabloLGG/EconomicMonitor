import Plotly from 'plotly.js-dist-min';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline } from '../utils/align';
import type { RecessionBand } from '../utils/align';
import { dualAxisLayout, FOOTNOTES } from './common';

export function renderYieldGdp(
  el: HTMLElement,
  yieldCurve: DataPoint[],
  gdpYoy: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const timeline = mergeMonthlyTimeline(yieldCurve, gdpYoy);
  const gdpFilled = forwardFillToDates(gdpYoy, timeline);

  Plotly.newPlot(
    el,
    [
      {
        x: yieldCurve.map((p) => formatDate(p.date)),
        y: yieldCurve.map((p) => p.value),
        name: '10Y − 3M yield spread (pp)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#60a5fa', width: 2 },
        yaxis: 'y',
      },
      {
        x: gdpFilled.map((p) => formatDate(p.date)),
        y: gdpFilled.map((p) => p.value),
        name: 'Real GDP YoY (%)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4ade80', width: 1.5 },
        yaxis: 'y2',
      },
    ],
    dualAxisLayout({
      title: 'Yield Curve (10Y − 3M) vs Real GDP YoY',
      yLeftTitle: 'Yield spread (pp)',
      yRightTitle: 'Real GDP YoY (%)',
      recessionBands,
    }),
    { responsive: true, displayModeBar: false },
  );
}

export const CHART4_META = {
  id: 'chart4',
  title: '4. Yield Curve vs US Economic Growth',
  footnote: FOOTNOTES.fredNber,
};
