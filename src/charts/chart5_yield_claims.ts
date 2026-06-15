import Plotly from 'plotly.js-dist-min';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { toMonthlyAverage } from '../utils/align';
import { dualAxisLayout, FOOTNOTES } from './common';

export function renderYieldClaims(
  el: HTMLElement,
  yieldCurve: DataPoint[],
  joblessClaims: DataPoint[],
): void {
  const claimsMonthly = toMonthlyAverage(joblessClaims);

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
        x: claimsMonthly.map((p) => formatDate(p.date)),
        y: claimsMonthly.map((p) => p.value),
        name: 'Jobless Claims (000s, monthly avg)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4ade80', width: 1.5 },
        yaxis: 'y2',
      },
    ],
    dualAxisLayout({
      title: 'Yield Curve (10Y − 3M) vs Jobless Claims',
      yLeftTitle: 'Yield spread (pp)',
      yRightTitle: 'Jobless Claims (000s)',
    }),
    { responsive: true, displayModeBar: false },
  );
}

export const CHART5_META = {
  id: 'chart5',
  title: '5. Yield Curve vs Jobless Claims',
  footnote: FOOTNOTES.fredNber,
};
