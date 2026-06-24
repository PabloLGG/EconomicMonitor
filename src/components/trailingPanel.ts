import type { DataPoint } from '../api/fred';
import { predictionCache } from '../analysis/predictionCache';
import { formatRecessionProbability } from '../analysis/recessionTypes';
import { isCoarsePointer } from '../charts/subplotLayout';
import { formatMonthYear } from './predictionRows';

export interface TrailingPanelContext {
  corr1: DataPoint[];
  todayDate: Date;
  todayProbability: number;
  todayPredictedStart: Date | null;
}

function formatPredictedStart(start: Date | null | undefined): string {
  return start ? formatMonthYear(start) : '—';
}

function labelHtml(full: string, short: string): string {
  return `<span class="trailing-label-full">${full}</span><span class="trailing-label-short">${short}</span>`;
}

function syncPanelOffset(el: HTMLElement): void {
  const height = el.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--trailing-panel-offset', `${height}px`);
}

export function createTrailingPanel(
  el: HTMLElement,
  context: TrailingPanelContext,
): { update: (date: Date | null) => void } {
  const idleHint = isCoarsePointer() ? 'Touch a chart' : 'Hover a chart';

  el.innerHTML = `
    <div class="trailing-panel-inner">
      <div class="trailing-panel-body">
        <section class="trailing-half trailing-today">
          <p class="trailing-line-date">
            <span class="trailing-label">${labelHtml('Today:', 'Today:')}</span>
            <span class="trailing-date-value trailing-today-date"></span>
          </p>
          <div class="trailing-prediction-rows">
            <p class="trailing-pred-row">
              <span class="trailing-label">${labelHtml('Probability of recession:', 'Recession prob:')}</span>
              <span class="trailing-stat trailing-probability trailing-today-probability"></span>
            </p>
            <p class="trailing-pred-row">
              <span class="trailing-label">${labelHtml('Expected Recession Date:', 'Expected date:')}</span>
              <span class="trailing-stat trailing-predicted-date trailing-today-predicted"></span>
            </p>
          </div>
        </section>
        <div class="trailing-divider" aria-hidden="true"></div>
        <section class="trailing-half trailing-hover">
          <p class="trailing-line-date">
            <span class="trailing-label">${labelHtml('Selected Date:', 'Selected:')}</span>
            <span class="trailing-date-value trailing-hover-date">${idleHint}</span>
          </p>
          <div class="trailing-prediction-rows">
            <p class="trailing-pred-row">
              <span class="trailing-label">${labelHtml('Probability of recession:', 'Recession prob:')}</span>
              <span class="trailing-stat trailing-probability trailing-hover-probability">—</span>
            </p>
            <p class="trailing-pred-row">
              <span class="trailing-label">${labelHtml('Expected Recession Date:', 'Expected date:')}</span>
              <span class="trailing-stat trailing-predicted-date trailing-hover-predicted">—</span>
            </p>
          </div>
        </section>
      </div>
    </div>
  `;

  const todayDateEl = el.querySelector<HTMLElement>('.trailing-today-date')!;
  const todayProbabilityEl = el.querySelector<HTMLElement>('.trailing-today-probability')!;
  const todayPredictedEl = el.querySelector<HTMLElement>('.trailing-today-predicted')!;
  const hoverDateEl = el.querySelector<HTMLElement>('.trailing-hover-date')!;
  const hoverProbabilityEl = el.querySelector<HTMLElement>('.trailing-hover-probability')!;
  const hoverPredictedEl = el.querySelector<HTMLElement>('.trailing-hover-predicted')!;

  todayDateEl.textContent = formatMonthYear(context.todayDate);
  todayProbabilityEl.textContent = formatRecessionProbability(context.todayProbability);
  todayPredictedEl.textContent = formatPredictedStart(context.todayPredictedStart);

  const resizeObserver = new ResizeObserver(() => syncPanelOffset(el));
  resizeObserver.observe(el);
  syncPanelOffset(el);

  let lastMonthKey = '';

  async function renderHover(date: Date | null): Promise<void> {
    if (!date) {
      hoverDateEl.textContent = idleHint;
      hoverDateEl.classList.add('trailing-date-idle');
      hoverProbabilityEl.textContent = '—';
      hoverPredictedEl.textContent = '—';
      return;
    }

    hoverDateEl.textContent = formatMonthYear(date);
    hoverDateEl.classList.remove('trailing-date-idle');
    const prediction = await predictionCache.get('chart1', context.corr1, date);
    hoverProbabilityEl.textContent = prediction
      ? formatRecessionProbability(prediction.recessionProbability)
      : '—';
    hoverPredictedEl.textContent = formatPredictedStart(prediction?.predictedStart);
  }

  function update(date: Date | null): void {
    const monthKey = date
      ? `${date.getUTCFullYear()}-${date.getUTCMonth()}`
      : 'default';
    if (monthKey === lastMonthKey) return;
    lastMonthKey = monthKey;
    void renderHover(date);
  }

  update(null);
  return { update };
}
