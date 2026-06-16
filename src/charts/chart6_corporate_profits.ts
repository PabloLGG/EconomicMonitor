import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import type { RecessionBand } from '../utils/align';
import { FOOTNOTES, HOVER_Y } from './common';
import { plotSinglePanelChart, singleAxisLayout } from './dualPanelChart';

export function renderCorporateProfits(
  el: HTMLElement,
  corpProfits: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const corpScaled = corpProfits.map((p) => ({ date: p.date, value: p.value * 100 }));
  const layout = singleAxisLayout('Profit per unit (% of real GVA)', recessionBands);

  plotSinglePanelChart(
    el,
    [
      {
        x: corpScaled.map((p) => formatDate(p.date)),
        y: corpScaled.map((p) => p.value),
        name: 'Corp. profits / real GVA',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#60a5fa', width: 2 },
        hovertemplate: HOVER_Y.pct2,
      },
    ],
    layout,
  );
}

export const CHART6_META = {
  id: 'chart6',
  title: '6. US Corporate Profits',
  footnote: FOOTNOTES.corpProfits,
};
