import type { DataPoint } from '../api/fred';
import { toMonthlyAverage } from '../utils/align';
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

const CLAIMS_AXIS: [number, number] = [0, 1000];

const YIELD_PAST = 0;
const YIELD_FUTURE = 1;
const CLAIMS_PAST = 2;
const CLAIMS_FUTURE = 3;
const CORR_PAST = 4;
const CORR_FUTURE = 5;

export async function renderYieldClaims(
  el: HTMLElement,
  yieldCurve: DataPoint[],
  joblessClaims: DataPoint[],
  recessionBands: RecessionBand[],
  onPanelDate: (date: Date | null) => void,
): Promise<void> {
  const claimsMonthly = toMonthlyAverage(joblessClaims).map((p) => ({
    ...p,
    value: p.value / 1000,
  }));
  const corr = correlatePlottedPair(yieldCurve, claimsMonthly);
  const defaultDate = latestSeriesDate([...yieldCurve, ...claimsMonthly, ...corr]);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Yield spread (pp)',
    yRightTitle: `Jobless Claims ${THOUSANDS_UNIT}`,
    yaxis2Range: CLAIMS_AXIS,
    recessionBands,
  });

  const [yieldPast, yieldFuture] = createPastFutureTraces(yieldCurve, {
    name: '10Y − 3M yield spread (pp)',
    color: '#60a5fa',
    width: 2,
    yaxis: 'y',
    hovertemplate: HOVER_Y.pct2,
  });
  const [claimsPast, claimsFuture] = createPastFutureTraces(claimsMonthly, {
    name: `Jobless Claims ${THOUSANDS_UNIT} (monthly avg)`,
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
    [yieldPast, yieldFuture, claimsPast, claimsFuture, corrPast, corrFuture],
    layout,
  );

  const controller = createChartBacktestController({
    el,
    layout,
    xrefs: ['x', 'x2'],
    recessionBands,
    series: [
      { full: yieldCurve, pastIndex: YIELD_PAST, futureIndex: YIELD_FUTURE },
      { full: claimsMonthly, pastIndex: CLAIMS_PAST, futureIndex: CLAIMS_FUTURE },
      { full: corr, pastIndex: CORR_PAST, futureIndex: CORR_FUTURE },
    ],
  });

  registerChartBacktest(
    el,
    ['x', 'x2'],
    controller.getBaseShapes,
    defaultDate,
    controller.update,
    layout,
    onPanelDate,
  );
}

export const CHART5_META = {
  id: 'chart5',
  title: '5. Yield Curve vs Jobless Claims',
  subtitle: `${CORRELATION_SUBTITLE} Jobless claims axis: 0–1,000 ${THOUSANDS_UNIT}.`,
  footnote: FOOTNOTES.fredNber,
};
