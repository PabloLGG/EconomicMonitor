import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import { shiftMonthsForward } from '../utils/shift';
import type { RecessionBand } from '../utils/align';
import { FOOTNOTES, HOVER_Y, THOUSANDS_UNIT } from './common';
import {
  buildDualPanelLayout,
  correlatePlottedPair,
  correlationTrace,
  CORRELATION_SUBTITLE,
  plotDualPanelChart,
} from './dualPanelChart';

const SHIFT_MONTHS = 12;
const JOBS_AXIS: [number, number] = [-1000, 1000];

export function renderFedFundsJobs(
  el: HTMLElement,
  fedFundsChange: DataPoint[],
  jobsCreated: DataPoint[],
  recessionBands: RecessionBand[],
): void {
  const fedShifted = shiftMonthsForward(fedFundsChange, SHIFT_MONTHS);
  const corr = correlatePlottedPair(fedShifted, jobsCreated);

  const layout = buildDualPanelLayout({
    yLeftTitle: 'Fed Funds rate change (pp)',
    yRightTitle: `Jobs Created ${THOUSANDS_UNIT}`,
    yaxis2Range: JOBS_AXIS,
    recessionBands,
  });

  plotDualPanelChart(
    el,
    [
      {
        x: fedShifted.map((p) => formatDate(p.date)),
        y: fedShifted.map((p) => p.value),
        name: `Fed Funds rate change (shifted +${SHIFT_MONTHS}m)`,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#60a5fa', width: 2 },
        yaxis: 'y',
        hovertemplate: HOVER_Y.pct2,
      },
      {
        x: jobsCreated.map((p) => formatDate(p.date)),
        y: jobsCreated.map((p) => p.value),
        name: `Jobs Created ${THOUSANDS_UNIT}`,
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

export const CHART3_META = {
  id: 'chart3',
  title: '3. Federal Funds Rate & Jobs Created',
  subtitle: `${CORRELATION_SUBTITLE} Fed Funds rate change (pp) shifted forward ${SHIFT_MONTHS} months. Jobs axis: ±1,000 ${THOUSANDS_UNIT}.`,
  footnote: FOOTNOTES.fredNber,
};
