import Plotly from 'plotly.js-dist-min';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline } from '../utils/align';
import type { RecessionBand } from '../utils/align';
import { dualAxisLayout, FOOTNOTES } from './common';

export function renderGdpSp500(
  el: HTMLElement,
  gdpYoy: DataPoint[],
  sp500: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const timeline = mergeMonthlyTimeline(sp500, gdpYoy);
  const gdpFilled = forwardFillToDates(gdpYoy, timeline);

  Plotly.newPlot(
    el,
    [
      {
        x: gdpFilled.map((p) => formatDate(p.date)),
        y: gdpFilled.map((p) => p.value),
        name: 'Real GDP YoY (%)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#60a5fa', width: 2 },
        yaxis: 'y',
      },
      {
        x: sp500.map((p) => formatDate(p.date)),
        y: sp500.map((p) => p.value),
        name: 'S&P 500',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4ade80', width: 1.5 },
        yaxis: 'y2',
      },
    ],
    dualAxisLayout({
      title: 'Real GDP YoY vs S&P 500',
      yLeftTitle: 'Real GDP YoY (%)',
      yRightTitle: 'S&P 500 (index)',
      recessionBands,
    }),
    { responsive: true, displayModeBar: false },
  );
}

export const CHART1_META = {
  id: 'chart1',
  title: '1. US Economic Growth & S&P 500',
  footnote: FOOTNOTES.fredNber,
};
