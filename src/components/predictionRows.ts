import type { ModelBreakdown } from '../analysis/recessionSignals';
import type { RecessionForecast } from '../analysis/recessionTypes';
import { formatRecessionProbability, PROBABILITY_HORIZON_MONTHS } from '../analysis/recessionTypes';
import type { RecessionBand } from '../utils/align';

const monthYearFmt = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});

const shortFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
});

export interface DynamicPredictionRow {
  chartId: 'chart1' | 'chart2' | 'chart4';
  label: string;
  prediction: RecessionForecast | null;
}

export function formatMonthYear(d: Date): string {
  return monthYearFmt.format(d);
}

export { formatRecessionProbability };

export function formatShortDate(d: Date): string {
  return shortFmt.format(d);
}

function predictionDateLabel(prediction: RecessionForecast | null): string {
  if (!prediction?.predictedStart) return 'No forecast';
  return formatMonthYear(prediction.predictedStart);
}

function nextRecessionAfter(bands: RecessionBand[], date: Date): RecessionBand | null {
  return bands.find((b) => b.start > date) ?? null;
}

export function renderPredictionRowsHtml(
  rows: DynamicPredictionRow[],
  recessionBands: RecessionBand[],
  asOfDate: Date | null,
): string {
  const chartNum: Record<DynamicPredictionRow['chartId'], string> = {
    chart1: '1',
    chart2: '2',
    chart4: '4',
  };

  return rows
    .map((row) => {
      const actual =
        asOfDate && asOfDate < new Date()
          ? nextRecessionAfter(recessionBands, asOfDate)
          : null;
      const meta =
        row.prediction && row.prediction.scenarioCount > 0
          ? `ML hazard model · P=${formatRecessionProbability(row.prediction.recessionProbability ?? 0)}`
          : '';

      return `
        <div class="trailing-prediction">
          <span class="trailing-pred-num">${chartNum[row.chartId]}.</span>
          <div class="trailing-pred-body">
            <span class="trailing-pred-label">${row.label}</span>
            <span class="trailing-pred-date">${predictionDateLabel(row.prediction)}</span>
            ${meta ? `<span class="trailing-pred-meta">${meta}</span>` : ''}
            ${
              row.prediction?.predictedBand
                ? `<span class="trailing-pred-window">Window: ${formatShortDate(row.prediction.predictedBand.start)} – ${formatShortDate(row.prediction.predictedBand.end)}</span>`
                : ''
            }
            ${
              actual
                ? `<span class="trailing-pred-actual">Actual NBER: ${formatShortDate(actual.start)}</span>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

export function breakdownToRows(breakdown: ModelBreakdown[]): DynamicPredictionRow[] {
  return breakdown.map((b) => ({
    chartId: b.chartId,
    label: b.label,
    prediction: b.predictedStart
      ? {
          predictedStart: b.predictedStart,
          predictedBand:
            b.predictedStart && b.predictedEnd
              ? { start: b.predictedStart, end: b.predictedEnd }
              : null,
          forecastCorrelation: [],
          forecastScenarios: [],
          vertexDates: [],
          scenarioCount: b.scenarioCount,
          vertexSpreadMonths: b.vertexSpreadMonths,
          recessionProbability: b.currentWarning ? 0.5 : 0,
          probabilityHorizonMonths: PROBABILITY_HORIZON_MONTHS,
          uncertaintyWidth: 0,
        }
      : null,
  }));
}
