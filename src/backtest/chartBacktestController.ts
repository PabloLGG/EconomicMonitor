import Plotly from 'plotly.js-dist-min';
import type { Data, Layout, Shape } from 'plotly.js';
import type { DataPoint } from '../api/fred';
import { formatDate } from '../api/fred';
import type { RecessionBand } from '../utils/align';
import type { ChartForecastId } from '../analysis/recessionTypes';
import { predictionCache } from '../analysis/predictionCache';
import { predictedRecessionShapes, recessionShapes } from '../charts/common';
import { signalMarkerTrace } from '../charts/dualPanelChart';
import { pastFutureRestylePayload } from './seriesSplit';
import { HOVER_SKIP } from '../charts/common';

export interface SeriesSlot {
  full: DataPoint[];
  pastIndex: number;
  futureIndex: number;
}

export interface ForecastConfig {
  chartId: ChartForecastId;
  bandLowerIndex: number;
  bandUpperIndex: number;
  meanIndex: number;
  historicalSignals?: Date[];
  markerIndex?: number;
}

export interface ChartBacktestConfig {
  el: HTMLElement;
  layout: Partial<Layout>;
  xrefs: Array<NonNullable<Shape['xref']>>;
  recessionBands: RecessionBand[];
  series: SeriesSlot[];
  forecast?: ForecastConfig;
  forecastAnchorDate?: Date;
}

function bandFillAlpha(uncertaintyWidth: number): number {
  return Math.min(0.4, Math.max(0.12, 0.12 + uncertaintyWidth * 0.28));
}

function forecastDividerShapes(
  date: Date,
  xrefs: Array<NonNullable<Shape['xref']>>,
): Partial<Shape>[] {
  const x = formatDate(date);
  return xrefs.map((xref) => ({
    type: 'line' as const,
    xref,
    yref: 'paper' as const,
    x0: x,
    x1: x,
    y0: 0,
    y1: 1,
    line: { color: 'rgba(148, 163, 184, 0.55)', width: 1, dash: 'dot' },
    layer: 'below' as const,
  }));
}

function emptyBandLowerTrace(): Partial<Data> {
  return {
    x: [],
    y: [],
    type: 'scatter',
    mode: 'lines',
    line: { width: 0 },
    xaxis: 'x2',
    yaxis: 'y3',
    showlegend: false,
    hoverinfo: HOVER_SKIP,
  };
}

function emptyBandUpperTrace(fillAlpha: number): Partial<Data> {
  return {
    x: [],
    y: [],
    type: 'scatter',
    mode: 'lines',
    fill: 'tonexty',
    fillcolor: `rgba(251, 191, 36, ${fillAlpha})`,
    line: { width: 0 },
    xaxis: 'x2',
    yaxis: 'y3',
    showlegend: false,
    hoverinfo: HOVER_SKIP,
  };
}

function emptyMeanTrace(): Partial<Data> {
  return {
    x: [],
    y: [],
    type: 'scatter',
    mode: 'lines',
    line: { color: 'rgba(251, 191, 36, 0.9)', width: 2, dash: 'dash' },
    xaxis: 'x2',
    yaxis: 'y3',
    showlegend: false,
    hoverinfo: HOVER_SKIP,
  };
}

export function buildForecastBandTraces(): Partial<Data>[] {
  return [emptyBandLowerTrace(), emptyBandUpperTrace(0.22), emptyMeanTrace()];
}

export function createChartBacktestController(
  config: ChartBacktestConfig,
): { update: (date: Date) => void; getBaseShapes: () => Partial<Shape>[] } {
  const recessionOnlyShapes = recessionShapes(config.recessionBands, config.xrefs);
  let predictedBand: RecessionBand | null = null;
  let lastBandAlpha = 0.22;

  function getBaseShapes(): Partial<Shape>[] {
    const shapes: Partial<Shape>[] = [...recessionOnlyShapes];
    if (config.forecastAnchorDate) {
      shapes.push(...forecastDividerShapes(config.forecastAnchorDate, config.xrefs));
    }
    if (predictedBand) {
      shapes.push(...predictedRecessionShapes([predictedBand], config.xrefs));
    }
    return shapes;
  }

  return {
    getBaseShapes,
    update(date: Date): void {
      for (const slot of config.series) {
        const { pastX, pastY, futureX, futureY } = pastFutureRestylePayload(slot.full, date);
        void Plotly.restyle(
          config.el,
          {
            x: [pastX, futureX],
            y: [pastY, futureY],
          },
          [slot.pastIndex, slot.futureIndex],
        );
      }

      if (!config.forecast) return;

      const fc = config.forecast;
      void predictionCache.get(fc.chartId, [], date).then((prediction) => {
        predictedBand = prediction?.predictedBand ?? null;
        lastBandAlpha = bandFillAlpha(prediction?.uncertaintyWidth ?? 0);

        const bandMin = prediction?.forecastEnvelopeMin ?? [];
        const bandMax = prediction?.forecastEnvelopeMax ?? [];
        const mean = prediction?.forecastCorrelation ?? [];

        void Plotly.restyle(
          config.el,
          {
            x: [
              bandMin.map((p) => formatDate(p.date)),
              bandMax.map((p) => formatDate(p.date)),
              mean.map((p) => formatDate(p.date)),
            ],
            y: [
              bandMin.map((p) => p.value),
              bandMax.map((p) => p.value),
              mean.map((p) => p.value),
            ],
            fillcolor: [undefined, `rgba(251, 191, 36, ${lastBandAlpha})`, undefined],
          },
          [fc.bandLowerIndex, fc.bandUpperIndex, fc.meanIndex],
        );
      });
    },
  };
}

export function buildMarkerTrace(
  corr: DataPoint[],
  signalDates: Date[],
): Partial<Data> {
  return signalMarkerTrace(corr, signalDates);
}
