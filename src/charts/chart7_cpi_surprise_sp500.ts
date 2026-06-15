import Plotly from 'plotly.js-dist-min';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { dualAxisLayout, FOOTNOTES } from './common';

export function renderCpiSurpriseSp500(
  el: HTMLElement,
  surprise: DataPoint[],
  sp500: DataPoint[],
): void {
  Plotly.newPlot(
    el,
    [
      {
        x: surprise.map((p) => formatDate(p.date)),
        y: surprise.map((p) => p.value),
        name: 'CPI surprise (reported − consensus, pp)',
        type: 'scatter',
        mode: 'lines+markers',
        marker: { size: 4, color: '#60a5fa' },
        line: { color: '#60a5fa', width: 1.5 },
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
      title: 'CPI Surprise vs S&P 500',
      subtitle:
        'Surprise = reported CPI YoY minus consensus (Cleveland Fed nowcast when available, else Michigan Survey expectations).',
      yLeftTitle: 'CPI surprise (pp)',
      yRightTitle: 'S&P 500 (index)',
    }),
    { responsive: true, displayModeBar: false },
  );
}

export const CHART7_META = {
  id: 'chart7',
  title: '7. CPI Consensus − Reported vs S&P 500',
  subtitle:
    'Consensus from Cleveland Fed CPI nowcast when available; otherwise Michigan Survey inflation expectations (MICH).',
  footnote: FOOTNOTES.cpiSurprise,
};
