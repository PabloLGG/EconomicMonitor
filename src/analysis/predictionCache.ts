import type { DataPoint } from '../api/fred';
import {
  predictRecessionAsOf,
  type RecessionPredictorContext,
} from './recessionForecast';
import type { ChartForecastId, RecessionForecast } from './recessionTypes';

const MAX_CACHE = 500;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()).padStart(2, '0')}`;
}

export class PredictionCache {
  private readonly cache = new Map<string, RecessionForecast | null>();
  private readonly order: string[] = [];
  private predictor: RecessionPredictorContext | null = null;

  setPredictor(ctx: RecessionPredictorContext): void {
    this.predictor = ctx;
  }

  async get(
    chartId: ChartForecastId,
    _series: DataPoint[],
    asOfDate: Date,
  ): Promise<RecessionForecast | null> {
    const key = `${chartId}|${monthKey(asOfDate)}`;
    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    if (!this.predictor) return null;

    const prediction = await predictRecessionAsOf(this.predictor, asOfDate, chartId);
    this.cache.set(key, prediction);
    this.order.push(key);

    if (this.order.length > MAX_CACHE) {
      const oldest = this.order.shift();
      if (oldest) this.cache.delete(oldest);
    }

    return prediction;
  }

  clear(): void {
    this.cache.clear();
    this.order.length = 0;
    this.predictor = null;
  }
}

export const predictionCache = new PredictionCache();
