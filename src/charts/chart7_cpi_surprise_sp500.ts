import type { DataPoint } from '../api/fred';
import type { RecessionBand } from '../utils/align';
import { createChartBacktestController } from '../backtest/chartBacktestController';
import { createPastFutureTraces, latestSeriesDate } from '../backtest/seriesSplit';
import { registerChartBacktest } from './chartRegister';
import { FOOTNOTES, HOVER_Y, SP500_AXIS_TITLE, SP500_TRACE_NAME } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

const SURPRISE_PAST = 0;
const SURPRISE_FUTURE = 1;
const SP_PAST = 2;
const SP_FUTURE = 3;
const CORR_PAST = 4;
const CORR_FUTURE = 5;

export async function renderCpiSurpriseSp500(
  el: HTMLElement,
  surprise: DataPoint[],
  sp500: DataPoint[],
  recessionBands: RecessionBand[],
  onPanelDate: (date: Date | null) => void,
): Promise<void> {
  const corr = correlatePlottedPair(surprise, sp500);
  const defaultDate = latestSeriesDate([...surprise, ...sp500, ...corr]);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'CPI surprise (pp)',
    yRightTitle: SP500_AXIS_TITLE,
    recessionBands,
  });

  const [surprisePast, surpriseFuture] = createPastFutureTraces(surprise, {
    name: 'CPI surprise (reported − consensus, pp)',
    color: '#60a5fa',
    width: 1.5,
    yaxis: 'y',
    mode: 'lines+markers',
    marker: { size: 4, color: '#60a5fa' },
    hovertemplate: HOVER_Y.pct2,
  });
  const [spPast, spFuture] = createPastFutureTraces(sp500, {
    name: SP500_TRACE_NAME,
    color: '#4ade80',
    width: 1.5,
    yaxis: 'y2',
    hovertemplate: HOVER_Y.points0,
  });
  const [corrPast, corrFuture] = createPastFutureTraces(corr, {
    name: '36m correlation',
    color: '#fbbf24',
    width: 1.5,
    yaxis: 'y3',
    xaxis: 'x2',
    hovertemplate: HOVER_Y.pct2,
  });

  await plotDualPanelChart(
    el,
    [surprisePast, surpriseFuture, spPast, spFuture, corrPast, corrFuture],
    layout,
  );

  const controller = createChartBacktestController({
    el,
    layout,
    xrefs: ['x', 'x2'],
    recessionBands,
    series: [
      { full: surprise, pastIndex: SURPRISE_PAST, futureIndex: SURPRISE_FUTURE },
      { full: sp500, pastIndex: SP_PAST, futureIndex: SP_FUTURE },
      { full: corr, pastIndex: CORR_PAST, futureIndex: CORR_FUTURE },
    ],
  });

  registerChartBacktest(
    el,
    ['x', 'x2'],
    controller.getBaseShapes,
    defaultDate,
    controller.update,
    onPanelDate,
  );
}

export const CHART7_META = {
  id: 'chart7',
  title: '7. CPI Consensus − Reported vs S&P 500',
  subtitle: `${CORRELATION_SUBTITLE} Consensus from Cleveland Fed nowcast when available; otherwise Michigan Survey (MICH).`,
  footnote: FOOTNOTES.cpiSurprise,
};
