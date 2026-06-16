import type { ModelBreakdown, RecessionBenchmark } from '../analysis/recessionSignals';

const monthYearFmt = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
});

function formatMonthYear(d: Date): string {
  return monthYearFmt.format(d);
}

function formatWindowEnd(d: Date): string {
  return dateFmt.format(d);
}

function predictionLabel(row: ModelBreakdown): string {
  if (row.currentWarning) return 'Now';
  if (row.predictedStart) return formatMonthYear(row.predictedStart);
  return 'No forecast';
}

function rowClass(row: ModelBreakdown): string {
  if (row.currentWarning) return 'benchmark-indicator warning';
  if (row.predictedStart) return 'benchmark-indicator forecast';
  return 'benchmark-indicator clear';
}

function metaText(row: ModelBreakdown): string {
  const parts: string[] = [];
  if (row.scenarioCount > 0) {
    parts.push('generative hazard model');
  }
  if (row.vertexSpreadMonths != null && row.vertexSpreadMonths > 0) {
    parts.push(`±${row.vertexSpreadMonths} mo spread`);
  }
  parts.push(`${Math.round(row.hitRate * 100)}% historical hit`);
  return parts.join(' · ');
}

export function renderRecessionBenchmark(
  el: HTMLElement,
  benchmark: RecessionBenchmark,
): void {
  const chartNum: Record<ModelBreakdown['chartId'], string> = {
    chart1: '1',
    chart2: '2',
    chart4: '4',
  };

  const rows = benchmark.breakdown
    .map(
      (row) => `
        <div class="${rowClass(row)}">
          <span class="benchmark-indicator-num">${chartNum[row.chartId]}.</span>
          <span class="benchmark-indicator-label">${row.label}</span>
          <span class="benchmark-indicator-date">${predictionLabel(row)}</span>
          <span class="benchmark-indicator-meta">${metaText(row)}</span>
          ${
            row.predictedStart && row.predictedEnd
              ? `<span class="benchmark-indicator-window">Window: ${formatWindowEnd(row.predictedStart)} – ${formatWindowEnd(row.predictedEnd)}</span>`
              : ''
          }
        </div>
      `,
    )
    .join('');

  el.innerHTML = `
    <div class="benchmark-card">
      <div class="benchmark-header">
        <h2 class="benchmark-title">Predicted recession timing (by indicator)</h2>
        <p class="benchmark-subtitle">Each model: Temporal VAE + discrete hazard survival head → recession probability and onset</p>
      </div>
      <div class="benchmark-indicators">${rows}</div>
      <p class="benchmark-disclaimer">
        Three independent correlation-based ML hazard forecasts — not a blended average. Probabilities are calibrated on historical NBER recessions. Not an official forecast.
      </p>
    </div>
  `;
}
