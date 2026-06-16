import type { DataPoint } from '../api/fred';
import { predictionCache } from '../analysis/predictionCache';
import { PROBABILITY_HORIZON_MONTHS } from '../analysis/recessionTypes';
import type { RecessionBand } from '../utils/align';
import {
  formatMonthYear,
  formatRecessionProbability,
  formatShortDate,
  type DynamicPredictionRow,
} from './predictionRows';

export interface TrailingPanelContext {
  recessionBands: RecessionBand[];
  corr1: DataPoint[];
  corr2: DataPoint[];
  corr4: DataPoint[];
  defaultPredictions: DynamicPredictionRow[];
  todayDate: Date;
  todayProbability: number;
}

const CHART_IDS = ['chart1', 'chart2', 'chart4'] as const;
const CHART_NUM: Record<(typeof CHART_IDS)[number], string> = {
  chart1: '1',
  chart2: '2',
  chart4: '4',
};

export function createTrailingPanel(
  el: HTMLElement,
  context: TrailingPanelContext,
): { update: (date: Date | null) => void } {
  const corrMap = {
    chart1: context.corr1,
    chart2: context.corr2,
    chart4: context.corr4,
  };

  el.innerHTML = `
    <div class="trailing-panel-inner">
      <p class="trailing-horizon-banner">
        All recession probabilities use a <strong>${PROBABILITY_HORIZON_MONTHS}-month</strong>
        forecast window — the chance a recession begins within the next year from each date.
      </p>
      <section class="trailing-section trailing-today">
        <h3 class="trailing-heading">Today</h3>
        <p class="trailing-today-probability"></p>
        <p class="trailing-today-caption"></p>
      </section>
      <section class="trailing-section">
        <h3 class="trailing-heading">Selected date</h3>
        <p class="trailing-date"></p>
      </section>
      <section class="trailing-section">
        <h3 class="trailing-heading">Recession predictions</h3>
        <div class="trailing-predictions"></div>
      </section>
    </div>
  `;

  const todayProbabilityEl = el.querySelector<HTMLElement>('.trailing-today-probability')!;
  const todayCaptionEl = el.querySelector<HTMLElement>('.trailing-today-caption')!;
  const dateEl = el.querySelector<HTMLElement>('.trailing-date')!;
  const predictionsEl = el.querySelector<HTMLElement>('.trailing-predictions')!;

  todayProbabilityEl.textContent = formatRecessionProbability(context.todayProbability);
  todayCaptionEl.textContent = `As of ${formatMonthYear(context.todayDate)}`;

  const predRows = CHART_IDS.map((chartId) => {
    const row = document.createElement('div');
    row.className = 'trailing-prediction';
    row.innerHTML = `
      <span class="trailing-pred-num">${CHART_NUM[chartId]}.</span>
      <div class="trailing-pred-body">
        <span class="trailing-pred-label"></span>
        <span class="trailing-pred-probability"></span>
        <span class="trailing-pred-date"></span>
        <span class="trailing-pred-meta"></span>
        <span class="trailing-pred-window"></span>
        <span class="trailing-pred-actual"></span>
      </div>
    `;
    predictionsEl.appendChild(row);
    return {
      chartId,
      label: row.querySelector<HTMLElement>('.trailing-pred-label')!,
      probability: row.querySelector<HTMLElement>('.trailing-pred-probability')!,
      date: row.querySelector<HTMLElement>('.trailing-pred-date')!,
      meta: row.querySelector<HTMLElement>('.trailing-pred-meta')!,
      window: row.querySelector<HTMLElement>('.trailing-pred-window')!,
      actual: row.querySelector<HTMLElement>('.trailing-pred-actual')!,
    };
  });

  let lastMonthKey = '';

  async function dynamicRows(date: Date | null): Promise<DynamicPredictionRow[]> {
    if (!date) return context.defaultPredictions;

    const rows = await Promise.all(
      CHART_IDS.map(async (chartId) => {
        const def = context.defaultPredictions.find((r) => r.chartId === chartId);
        const prediction = await predictionCache.get(chartId, corrMap[chartId], date);
        return {
          chartId,
          label: def?.label ?? chartId,
          prediction,
        };
      }),
    );
    return rows;
  }

  function nextRecessionAfter(date: Date): RecessionBand | null {
    return context.recessionBands.find((b) => b.start > date) ?? null;
  }

  async function renderRows(date: Date | null): Promise<void> {
    const rows = await dynamicRows(date);
    for (let i = 0; i < predRows.length; i++) {
      const row = predRows[i];
      const data = rows[i];
      const pred = data.prediction;

      row.label.textContent = data.label;

      if (pred) {
        row.probability.textContent = `Recession probability: ${formatRecessionProbability(pred.recessionProbability)}`;
      } else {
        row.probability.textContent = '';
      }

      row.date.textContent = pred?.predictedStart
        ? formatMonthYear(pred.predictedStart)
        : 'No forecast';

      if (pred && pred.scenarioCount > 0) {
        row.meta.textContent = 'Generative hazard model';
      } else {
        row.meta.textContent = '';
      }

      if (pred?.predictedBand) {
        row.window.textContent = `Window: ${formatShortDate(pred.predictedBand.start)} – ${formatShortDate(pred.predictedBand.end)}`;
      } else {
        row.window.textContent = '';
      }

      const actual = date && date < new Date() ? nextRecessionAfter(date) : null;
      row.actual.textContent = actual
        ? `Actual NBER: ${formatShortDate(actual.start)}`
        : '';
    }
  }

  function update(date: Date | null): void {
    const monthKey = date
      ? `${date.getUTCFullYear()}-${date.getUTCMonth()}`
      : 'default';
    if (monthKey === lastMonthKey) return;
    lastMonthKey = monthKey;

    dateEl.textContent = date ? formatMonthYear(date) : 'Hover a chart';
    void renderRows(date);
  }

  update(null);
  return { update };
}
