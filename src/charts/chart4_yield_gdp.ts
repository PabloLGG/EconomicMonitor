import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { forwardFillToDates, mergeMonthlyTimeline } from '../utils/align';
import type { RecessionBand } from '../utils/align';
import { FOOTNOTES, HOVER_Y } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  correlationTrace,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

export function renderYieldGdp(
  el: HTMLElement,
  yieldCurve: DataPoint[],
  gdpYoy: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const timeline = mergeMonthlyTimeline(yieldCurve, gdpYoy);
  const gdpFilled = forwardFillToDates(gdpYoy, timeline);
  const corr = correlatePlottedPair(yieldCurve, gdpFilled);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Yield spread (pp)',
    yRightTitle: 'Real GDP YoY (%)',
    recessionBands,
  });

  plotDualPanelChart(
    el,
    [
      {
        x: yieldCurve.map((p) => formatDate(p.date)),
        y: yieldCurve.map((p) => p.value),
        name: '10Y − 3M yield spread (pp)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#60a5fa', width: 2 },
        yaxis: 'y',
        hovertemplate: HOVER_Y.pct2,
      },
      {
        x: gdpFilled.map((p) => formatDate(p.date)),
        y: gdpFilled.map((p) => p.value),
        name: 'Real GDP YoY (%)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4ade80', width: 1.5 },
        yaxis: 'y2',
        hovertemplate: HOVER_Y.pct2,
      },
      correlationTrace(corr),
    ],
    layout,
  );
}

export const CHART4_META = {
  id: 'chart4',
  title: '4. Yield Curve vs US Economic Growth',
  subtitle: CORRELATION_SUBTITLE,
  footnote: FOOTNOTES.fredNber,
};
