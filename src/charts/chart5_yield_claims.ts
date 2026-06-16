import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { toMonthlyAverage } from '../utils/align';
import type { RecessionBand } from '../utils/align';
import { FOOTNOTES, HOVER_Y, THOUSANDS_UNIT } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  correlationTrace,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

const CLAIMS_AXIS: [number, number] = [0, 1000];

export function renderYieldClaims(
  el: HTMLElement,
  yieldCurve: DataPoint[],
  joblessClaims: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const claimsMonthly = toMonthlyAverage(joblessClaims).map((p) => ({
    ...p,
    value: p.value / 1000,
  }));
  const corr = correlatePlottedPair(yieldCurve, claimsMonthly);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Yield spread (pp)',
    yRightTitle: `Jobless Claims ${THOUSANDS_UNIT}`,
    yaxis2Range: CLAIMS_AXIS,
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
        x: claimsMonthly.map((p) => formatDate(p.date)),
        y: claimsMonthly.map((p) => p.value),
        name: `Jobless Claims ${THOUSANDS_UNIT} (monthly avg)`,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4ade80', width: 1.5 },
        yaxis: 'y2',
        hovertemplate: HOVER_Y.int0,
      },
      correlationTrace(corr),
    ],
    layout,
  );
}

export const CHART5_META = {
  id: 'chart5',
  title: '5. Yield Curve vs Jobless Claims',
  subtitle: `${CORRELATION_SUBTITLE} Jobless claims axis: 0–1,000 ${THOUSANDS_UNIT}.`,
  footnote: FOOTNOTES.fredNber,
};
