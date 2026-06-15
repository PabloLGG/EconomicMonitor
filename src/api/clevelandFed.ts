export interface NowcastObservation {
  referenceMonth: string;
  value: number;
  asOfDate: string;
}

export interface ClevelandFedResponse {
  observations?: Array<{
    reference_month?: string;
    value?: number;
    as_of_date?: string;
  }>;
}

const CLEVELAND_CPI_URLS = [
  'https://www.clevelandfed.org/api/inflation-nowcasting/v1/cpi',
  'https://www.clevelandfed.org/api/inflation-nowcasting/v1/cpi/yoy',
];

export async function fetchClevelandCpiNowcasts(): Promise<NowcastObservation[]> {
  for (const url of CLEVELAND_CPI_URLS) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'EconomicMonitor/1.0 (GitHub Pages; macro dashboard)',
        },
      });
      if (!response.ok) continue;

      const payload = (await response.json()) as ClevelandFedResponse;
      if (!payload.observations?.length) continue;

      return payload.observations
        .filter(
          (obs): obs is { reference_month: string; value: number; as_of_date: string } =>
            obs.reference_month != null &&
            obs.value != null &&
            obs.as_of_date != null &&
            !Number.isNaN(obs.value),
        )
        .map((obs) => ({
          referenceMonth: obs.reference_month,
          value: obs.value,
          asOfDate: obs.as_of_date,
        }));
    } catch {
      continue;
    }
  }

  return [];
}

/** Final pre-release nowcast per reference month (last observation before CPI release ~15th). */
export function finalPreReleaseNowcasts(
  observations: NowcastObservation[],
): Map<string, number> {
  const byRef = new Map<string, NowcastObservation[]>();

  for (const obs of observations) {
    const list = byRef.get(obs.referenceMonth) ?? [];
    list.push(obs);
    byRef.set(obs.referenceMonth, list);
  }

  const result = new Map<string, number>();

  for (const [refMonth, list] of byRef) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.asOfDate).getTime() - new Date(b.asOfDate).getTime(),
    );
    const [y, m] = refMonth.split('-').map(Number);
    const releaseApprox = new Date(Date.UTC(y, m, 15));
    const preRelease = sorted.filter((o) => new Date(o.asOfDate) < releaseApprox);
    const pick =
      preRelease.length > 0 ? preRelease[preRelease.length - 1] : sorted[sorted.length - 1];
    result.set(refMonth, pick.value);
  }

  return result;
}
