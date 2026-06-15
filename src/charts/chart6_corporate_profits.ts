import Plotly from 'plotly.js-dist-min';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { filterAfter, lastFiveYearsCutoff } from '../utils/align';
import type { RecessionBand } from '../utils/align';
import { singleAxisLayout, FOOTNOTES } from './common';

export function renderCorporateProfits(
  el: HTMLElement,
  corpProfits: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const cutoff = lastFiveYearsCutoff();
  const recent = filterAfter(corpProfits, cutoff);

  const layout = singleAxisLayout(
    'Corporate Profits After Tax per Unit of Real GVA',
    'Profit per unit (% of real GVA)',
    recessionBands,
  );

  layout.xaxis2 = {
    domain: [0.62, 0.98],
    anchor: 'y2',
    type: 'date',
    showgrid: false,
    tickfont: { size: 9, color: '#8b9cb3' },
  };
  layout.yaxis2 = {
    domain: [0.08, 0.42],
    anchor: 'x2',
    title: { text: 'Last 5 years', font: { size: 9, color: '#a78bfa' } },
    tickfont: { size: 9, color: '#a78bfa' },
    gridcolor: '#2d3a4f',
  };

  Plotly.newPlot(
    el,
    [
      {
        x: corpProfits.map((p) => formatDate(p.date)),
        y: corpProfits.map((p) => p.value * 100),
        name: 'Corp. profits / real GVA',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#60a5fa', width: 2 },
        yaxis: 'y',
      },
      {
        x: recent.map((p) => formatDate(p.date)),
        y: recent.map((p) => p.value * 100),
        name: 'Last 5 years',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#a78bfa', width: 2 },
        xaxis: 'x2',
        yaxis: 'y2',
        showlegend: false,
      },
    ],
    layout,
    { responsive: true, displayModeBar: false },
  );
}

export const CHART6_META = {
  id: 'chart6',
  title: '6. US Corporate Profits',
  subtitle: 'Inset: last 5 years (lower right).',
  footnote: FOOTNOTES.corpProfits,
};
