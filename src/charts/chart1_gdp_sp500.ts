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
import { FOOTNOTES, HOVER_Y, SP500_AXIS_TITLE, SP500_TRACE_NAME } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

const SIGNAL_FOOTNOTE =
  ' Hover a chart to step through history on that chart. Values appear in the chart tooltip.';

const GDP_PAST = 0;
const GDP_FUTURE = 1;
const SP_PAST = 2;
const SP_FUTURE = 3;
const CORR_PAST = 4;
const CORR_FUTURE = 5;
const BAND_LOWER = 6;
const BAND_UPPER = 7;
const MEAN_IDX = 8;
const MARKER_IDX = 9;

export async function renderGdpSp500(
  el: HTMLElement,
  gdpYoy: DataPoint[],
  sp500: DataPoint[],
  recessionBands: RecessionBand[],
  _medianRecessionMonths: number,
  analysis: ChartSignalAnalysis | undefined,
  onPanelDate: (date: Date | null) => void,
): Promise<void> {
  const timeline = mergeMonthlyTimeline(sp500, gdpYoy);
  const gdpFilled = forwardFillToDates(gdpYoy, timeline);
  const corr = analysis?.correlation ?? correlatePlottedPair(gdpFilled, sp500);
  const defaultDate = latestSeriesDate([...gdpFilled, ...sp500, ...corr]);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Real GDP YoY (%)',
    yRightTitle: SP500_AXIS_TITLE,
    recessionBands,
  });

  const baseDates = [
    ...gdpFilled.map((p) => p.date),
    ...sp500.map((p) => p.date),
    ...corr.map((p) => p.date),
  ];
  applyCorrelationForecastLayout(layout, baseDates);

  const [gdpPast, gdpFuture] = createPastFutureTraces(gdpFilled, {
    name: 'Real GDP YoY (%)',
    color: '#60a5fa',
    width: 2,
    yaxis: 'y',
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

  const markerTrace =
    analysis?.historicalSignals.length
      ? buildMarkerTrace(corr, analysis.historicalSignals)
      : null;

  await plotDualPanelChart(
    el,
    [
      gdpPast,
      gdpFuture,
      spPast,
      spFuture,
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
      { full: gdpFilled, pastIndex: GDP_PAST, futureIndex: GDP_FUTURE },
      { full: sp500, pastIndex: SP_PAST, futureIndex: SP_FUTURE },
      { full: corr, pastIndex: CORR_PAST, futureIndex: CORR_FUTURE },
    ],
    forecast: {
      chartId: 'chart1',
      bandLowerIndex: BAND_LOWER,
      bandUpperIndex: BAND_UPPER,
      meanIndex: MEAN_IDX,
      historicalSignals: analysis?.historicalSignals,
      markerIndex: markerTrace ? MARKER_IDX : undefined,
    },
    forecastAnchorDate: defaultDate,
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

export const CHART1_META = {
  id: 'chart1',
  title: '1. US Economic Growth & S&P 500',
  subtitle: `${CORRELATION_SUBTITLE} Generative ML hazard forecast.`,
  footnote: FOOTNOTES.sp500 + SIGNAL_FOOTNOTE,
};
