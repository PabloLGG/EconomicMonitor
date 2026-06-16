import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline } from '../utils/align';
import type { RecessionBand } from '../utils/align';
import { FOOTNOTES, HOVER_Y, indexTicksEvery500, SP500_AXIS_TITLE, SP500_TRACE_NAME } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  correlationTrace,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

export function renderGdpSp500(
  el: HTMLElement,
  gdpYoy: DataPoint[],
  sp500: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const timeline = mergeMonthlyTimeline(sp500, gdpYoy);
  const gdpFilled = forwardFillToDates(gdpYoy, timeline);
  const corr = correlatePlottedPair(gdpFilled, sp500);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Real GDP YoY (%)',
    yRightTitle: SP500_AXIS_TITLE,
    yaxis2Tickvals: indexTicksEvery500(sp500.map((p) => p.value)),
    recessionBands,
  });

  plotDualPanelChart(
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

export const CHART1_META = {
  id: 'chart1',
  title: '1. US Economic Growth & S&P 500',
  subtitle: CORRELATION_SUBTITLE,
  footnote: FOOTNOTES.sp500,
};
