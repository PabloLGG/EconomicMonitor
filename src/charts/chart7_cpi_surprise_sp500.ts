import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import type { RecessionBand } from '../utils/align';
import { FOOTNOTES, HOVER_Y, indexTicksEvery500, SP500_AXIS_TITLE, SP500_TRACE_NAME } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  correlationTrace,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

export function renderCpiSurpriseSp500(
  el: HTMLElement,
  surprise: DataPoint[],
  sp500: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const corr = correlatePlottedPair(surprise, sp500);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'CPI surprise (pp)',
    yRightTitle: SP500_AXIS_TITLE,
    yaxis2Tickvals: indexTicksEvery500(sp500.map((p) => p.value)),
    recessionBands,
  });

  plotDualPanelChart(
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
        hovertemplate: HOVER_Y.pct2,
      },
      {
        x: sp500.map((p) => formatDate(p.date)),
        y: sp500.map((p) => p.value),
        name: SP500_TRACE_NAME,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4ade80', width: 1.5 },
        yaxis: 'y2',
        hovertemplate: HOVER_Y.points0,
      },
      correlationTrace(corr),
    ],
    layout,
  );
}

export const CHART7_META = {
  id: 'chart7',
  title: '7. CPI Consensus − Reported vs S&P 500',
  subtitle: `${CORRELATION_SUBTITLE} Consensus from Cleveland Fed nowcast when available; otherwise Michigan Survey (MICH).`,
  footnote: FOOTNOTES.cpiSurprise,
};
