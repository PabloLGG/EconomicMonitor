import type { DataPoint } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline } from '../utils/align';
import type { RecessionBand } from '../utils/align';
import type { ChartSignalAnalysis } from '../analysis/recessionSignals';
import {
  buildForecastBandTraces,
  buildMarkerTrace,
  createChartBacktestController,
} from '../backtest/chartBacktestController';
import { createPastFutureTraces, latestSeriesDate } from '../backtest/seriesSplit';
import { applyCorrelationForecastLayout } from './correlationForecastPanel';
import { registerChartBacktest } from './chartRegister';
import { FOOTNOTES, HOVER_Y } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

const YIELD_PAST = 0;
const YIELD_FUTURE = 1;
const GDP_PAST = 2;
const GDP_FUTURE = 3;
const CORR_PAST = 4;
const CORR_FUTURE = 5;
const BAND_LOWER = 6;
const BAND_UPPER = 7;
const MEAN_IDX = 8;

export async function renderYieldGdp(
  el: HTMLElement,
  yieldCurve: DataPoint[],
  gdpYoy: DataPoint[],
  recessionBands: RecessionBand[],
  _medianRecessionMonths: number,
  analysis: ChartSignalAnalysis | undefined,
  onPanelDate: (date: Date | null) => void,
): Promise<void> {
  const timeline = mergeMonthlyTimeline(yieldCurve, gdpYoy);
  const gdpFilled = forwardFillToDates(gdpYoy, timeline);
  const corr = analysis?.correlation ?? correlatePlottedPair(yieldCurve, gdpFilled);
  const defaultDate = latestSeriesDate([...yieldCurve, ...gdpFilled, ...corr]);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Yield spread (pp)',
    yRightTitle: 'Real GDP YoY (%)',
    recessionBands,
  });

  const baseDates = [
    ...yieldCurve.map((p) => p.date),
    ...gdpFilled.map((p) => p.date),
    ...corr.map((p) => p.date),
  ];
  applyCorrelationForecastLayout(layout, baseDates);

  const [yieldPast, yieldFuture] = createPastFutureTraces(yieldCurve, {
    name: '10Y − 3M yield spread (pp)',
    color: '#60a5fa',
    width: 2,
    yaxis: 'y',
    hovertemplate: HOVER_Y.pct2,
  });
  const [gdpPast, gdpFuture] = createPastFutureTraces(gdpFilled, {
    name: 'Real GDP YoY (%)',
    color: '#4ade80',
    width: 1.5,
    yaxis: 'y2',
    hovertemplate: HOVER_Y.pct2,
  });
  const [corrPast, corrFuture] = createPastFutureTraces(corr, {
    name: '36m correlation',
    color: '#fbbf24',
    width: 1.5,
    yaxis: 'y3',
    xaxis: 'x2',
    hovertemplate: HOVER_Y.pct2,
  });

  const markerTrace =
    analysis?.historicalSignals.length
      ? buildMarkerTrace(corr, analysis.historicalSignals)
      : null;

  await plotDualPanelChart(
    el,
    [
      yieldPast,
      yieldFuture,
      gdpPast,
      gdpFuture,
      corrPast,
      corrFuture,
      ...buildForecastBandTraces(),
      ...(markerTrace ? [markerTrace] : []),
    ],
    layout,
  );

  const controller = createChartBacktestController({
    el,
    layout,
    xrefs: ['x', 'x2'],
    recessionBands,
    series: [
      { full: yieldCurve, pastIndex: YIELD_PAST, futureIndex: YIELD_FUTURE },
      { full: gdpFilled, pastIndex: GDP_PAST, futureIndex: GDP_FUTURE },
      { full: corr, pastIndex: CORR_PAST, futureIndex: CORR_FUTURE },
    ],
    forecast: {
      chartId: 'chart4',
      bandLowerIndex: BAND_LOWER,
      bandUpperIndex: BAND_UPPER,
      meanIndex: MEAN_IDX,
      historicalSignals: analysis?.historicalSignals,
    },
    forecastAnchorDate: defaultDate,
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

export const CHART4_META = {
  id: 'chart4',
  title: '4. Yield Curve vs US Economic Growth',
  subtitle: `${CORRELATION_SUBTITLE} Generative ML hazard forecast.`,
  footnote: FOOTNOTES.fredNber,
};
