import type { DataPoint } from '../api/fred';
import type { RecessionBand } from '../utils/align';
import { createChartBacktestController } from '../backtest/chartBacktestController';
import { createPastFutureTraces, latestSeriesDate } from '../backtest/seriesSplit';
import { registerChartBacktest } from './chartRegister';
import { FOOTNOTES, HOVER_Y } from './common';
import { plotSinglePanelChart, singleAxisLayout } from './dualPanelChart';

const PAST = 0;
const FUTURE = 1;

export async function renderCorporateProfits(
  el: HTMLElement,
  corpProfits: DataPoint[],
  recessionBands: RecessionBand[],
  onPanelDate: (date: Date | null) => void,
): Promise<void> {
  const corpScaled = corpProfits.map((p) => ({ date: p.date, value: p.value * 100 }));
  const defaultDate = latestSeriesDate(corpScaled);
  const layout = singleAxisLayout('Profit per unit (% of real GVA)', recessionBands);

  const [past, future] = createPastFutureTraces(corpScaled, {
    name: 'Corp. profits / real GVA',
    color: '#60a5fa',
    width: 2,
    yaxis: 'y',
    hovertemplate: HOVER_Y.pct2,
  });

  await plotSinglePanelChart(el, [past, future], layout);

  const controller = createChartBacktestController({
    el,
    layout,
    xrefs: ['x'],
    recessionBands,
    series: [{ full: corpScaled, pastIndex: PAST, futureIndex: FUTURE }],
  });

  registerChartBacktest(
    el,
    ['x'],
    controller.getBaseShapes,
    defaultDate,
    controller.update,
    onPanelDate,
  );
}

export const CHART6_META = {
  id: 'chart6',
  title: '6. US Corporate Profits',
  footnote: FOOTNOTES.corpProfits,
};
