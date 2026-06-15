import type { DataPoint } from '../api/fred';
import { finalPreReleaseNowcasts, type NowcastObservation } from '../api/clevelandFed';
import { monthKey } from '../utils/align';

/** Build CPI YoY surprise = reported − consensus (percentage points). */
export function buildCpiSurpriseSeries(
  cpiYoy: DataPoint[],
  michExpectations: DataPoint[],
  nowcasts: NowcastObservation[],
): DataPoint[] {
  const nowcastByMonth = finalPreReleaseNowcasts(nowcasts);
  const michByMonth = new Map(michExpectations.map((p) => [monthKey(p.date), p.value]));

  const surprise: DataPoint[] = [];

  for (const actual of cpiYoy) {
    const key = monthKey(actual.date);
    const consensus =
      nowcastByMonth.get(key) ??
      michByMonth.get(key);
    if (consensus == null) continue;
    surprise.push({
      date: actual.date,
      value: actual.value - consensus,
    });
  }

  return surprise;
}
