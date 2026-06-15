import Plotly from 'plotly.js-dist-min';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { shiftMonthsForward } from '../utils/shift';
import { dualAxisLayout, FOOTNOTES } from './common';

const SHIFT_MONTHS = 12;

export function renderFedFundsJobs(
  el: HTMLElement,
  fedFundsYoy: DataPoint[],
  jobsCreated: DataPoint[],
): void {
  const fedShifted = shiftMonthsForward(fedFundsYoy, SHIFT_MONTHS);

  Plotly.newPlot(
    el,
    [
      {
        x: fedShifted.map((p) => formatDate(p.date)),
        y: fedShifted.map((p) => p.value),
        name: 'Fed Funds YoY change (shifted +12m)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#60a5fa', width: 2 },
        yaxis: 'y',
      },
      {
        x: jobsCreated.map((p) => formatDate(p.date)),
        y: jobsCreated.map((p) => p.value),
        name: 'Jobs Created (000s)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4ade80', width: 1.5 },
        yaxis: 'y2',
      },
    ],
    dualAxisLayout({
      title: 'Fed Funds YoY Change vs Jobs Created',
      subtitle: `Fed Funds YoY % change shifted forward ${SHIFT_MONTHS} months to reflect lagged labor-market response.`,
      yLeftTitle: 'Fed Funds YoY change (%)',
      yRightTitle: 'Jobs Created (000s)',
    }),
    { responsive: true, displayModeBar: false },
  );
}

export const CHART3_META = {
  id: 'chart3',
  title: '3. Federal Funds Rate & Jobs Created',
  subtitle: `Fed Funds YoY change shifted forward ${SHIFT_MONTHS} months.`,
  footnote: FOOTNOTES.fredNber,
};
