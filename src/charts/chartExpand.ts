import Plotly from 'plotly.js-dist-min';
import { relayoutChartElement } from './responsiveCharts';

let activeOverlay: HTMLElement | null = null;
let activeChartEl: HTMLElement | null = null;
let activePlaceholder: Comment | null = null;
let activeSection: HTMLElement | null = null;

function closeExpandOverlay(): void {
  if (!activeOverlay || !activeChartEl || !activePlaceholder || !activeSection) return;

  const chartEl = activeChartEl;
  const placeholder = activePlaceholder;

  activeSection.insertBefore(chartEl, placeholder.nextSibling);
  placeholder.remove();

  chartEl.classList.remove('chart-container--expanded');
  document.body.classList.remove('chart-expand-open');
  activeOverlay.remove();

  activeOverlay = null;
  activeChartEl = null;
  activePlaceholder = null;
  activeSection = null;

  void relayoutChartElement(chartEl, false).then(() => Plotly.Plots.resize(chartEl));
}

function openExpandOverlay(chartEl: HTMLElement): void {
  if (activeChartEl === chartEl) return;
  if (activeOverlay) closeExpandOverlay();

  const section = chartEl.closest('.chart-section');
  if (!section) return;

  const title = section.querySelector('h2')?.textContent ?? 'Chart';

  const overlay = document.createElement('div');
  overlay.className = 'chart-expand-overlay';
  overlay.innerHTML = `
    <div class="chart-expand-dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="chart-expand-toolbar">
        <h3 class="chart-expand-title">${title}</h3>
        <button type="button" class="chart-expand-close" aria-label="Close expanded chart">Close</button>
      </div>
      <div class="chart-expand-body"></div>
      <p class="chart-expand-hint">Drag horizontally or press and hold to explore dates</p>
    </div>
  `;

  const body = overlay.querySelector<HTMLElement>('.chart-expand-body')!;
  const placeholder = document.createComment('chart-placeholder');
  chartEl.parentElement?.insertBefore(placeholder, chartEl);

  body.appendChild(chartEl);
  chartEl.classList.add('chart-container--expanded');
  document.body.appendChild(overlay);
  document.body.classList.add('chart-expand-open');

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeExpandOverlay();
  };
  document.addEventListener('keydown', onKeyDown, { once: true });

  overlay.querySelector('.chart-expand-close')!.addEventListener('click', closeExpandOverlay);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeExpandOverlay();
  });

  activeOverlay = overlay;
  activeChartEl = chartEl;
  activePlaceholder = placeholder;
  activeSection = section as HTMLElement;

  void relayoutChartElement(chartEl, true).then(() => Plotly.Plots.resize(chartEl));
}

export function registerChartExpand(chartEl: HTMLElement): void {
  const section = chartEl.closest('.chart-section');
  const button = section?.querySelector<HTMLButtonElement>('.chart-expand-btn');
  if (!button) return;

  button.addEventListener('click', () => openExpandOverlay(chartEl));
}

export function isChartExpanded(chartEl: HTMLElement): boolean {
  return chartEl.classList.contains('chart-container--expanded');
}

export function closeActiveChartExpand(): void {
  closeExpandOverlay();
}
