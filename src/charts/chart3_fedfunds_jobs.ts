import type { DataPoint } from '../api/fred';
import { shiftMonthsForward } from '../utils/shift';
import type { RecessionBand } from '../utils/align';
import { createChartBacktestController } from '../backtest/chartBacktestController';
import { createPastFutureTraces, latestSeriesDate } from '../backtest/seriesSplit';
import { registerChartBacktest } from './chartRegister';
import { FOOTNOTES, HOVER_Y, THOUSANDS_UNIT } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';
import { SIDE_BY_SIDE_CORR } from './subplotLayout';

const SHIFT_MONTHS = 12;
const JOBS_AXIS: [number, number] = [-1000, 1000];

const FED_PAST = 0;
const FED_FUTURE = 1;
const JOBS_PAST = 2;
const JOBS_FUTURE = 3;
const CORR_PAST = 4;
const CORR_FUTURE = 5;

export async function renderFedFundsJobs(
  el: HTMLElement,
  fedFundsChange: DataPoint[],
  jobsCreated: DataPoint[],
  recessionBands: RecessionBand[],
  onPanelDate: (date: Date | null) => void,
): Promise<void> {
  const fedShifted = shiftMonthsForward(fedFundsChange, SHIFT_MONTHS);
  const corr = correlatePlottedPair(fedShifted, jobsCreated);
  const defaultDate = latestSeriesDate([...fedShifted, ...jobsCreated, ...corr]);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Fed Funds rate change (pp)',
    yRightTitle: `Jobs Created ${THOUSANDS_UNIT}`,
    yaxis2Range: JOBS_AXIS,
    recessionBands,
  });

  const [fedPast, fedFuture] = createPastFutureTraces(fedShifted, {
    name: `Fed Funds rate change (shifted +${SHIFT_MONTHS}m)`,
    color: '#60a5fa',
    width: 2,
    yaxis: 'y',
    hovertemplate: HOVER_Y.pct2,
  });
  const [jobsPast, jobsFuture] = createPastFutureTraces(jobsCreated, {
    name: `Jobs Created ${THOUSANDS_UNIT}`,
    color: '#4ade80',
    width: 1.5,
    yaxis: 'y2',
    hovertemplate: HOVER_Y.int0,
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
    [fedPast, fedFuture, jobsPast, jobsFuture, corrPast, corrFuture],
    layout,
  );

  const controller = createChartBacktestController({
    el,
    layout,
    xrefs: ['x', 'x2'],
    recessionBands,
    series: [
      { full: fedShifted, pastIndex: FED_PAST, futureIndex: FED_FUTURE },
      { full: jobsCreated, pastIndex: JOBS_PAST, futureIndex: JOBS_FUTURE },
      { full: corr, pastIndex: CORR_PAST, futureIndex: CORR_FUTURE },
    ],
  });

  registerChartBacktest(
    el,
    ['x', 'x2'],
    SIDE_BY_SIDE_CORR.y,
    controller.getBaseShapes,
    defaultDate,
    controller.update,
    onPanelDate,
  );
}

export const CHART3_META = {
  id: 'chart3',
  title: '3. Federal Funds Rate & Jobs Created',
  subtitle: `${CORRELATION_SUBTITLE} Fed Funds rate change (pp) shifted forward ${SHIFT_MONTHS} months. Jobs axis: ±1,000 ${THOUSANDS_UNIT}.`,
  footnote: FOOTNOTES.fredNber,
};
