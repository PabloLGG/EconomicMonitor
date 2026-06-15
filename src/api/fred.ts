export interface DataPoint {
  date: Date;
  value: number;
}

export interface FredObservation {
  date: string;
  value: string;
}

export interface FredObservationsResponse {
  observations: FredObservation[];
}

export interface FetchSeriesOptions {
  seriesId: string;
  observationStart?: string;
  units?: string;
  frequency?: string;
  aggregationMethod?: string;
}

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

function getApiKey(): string {
  const key = import.meta.env.VITE_FRED_API_KEY;
  if (!key) {
    throw new Error(
      'FRED API key is missing. Set VITE_FRED_API_KEY in .env.local or GitHub Actions secrets.',
    );
  }
  return key;
}

export async function fetchFredSeries(options: FetchSeriesOptions): Promise<DataPoint[]> {
  const params = new URLSearchParams({
    series_id: options.seriesId,
    api_key: getApiKey(),
    file_type: 'json',
  });

  if (options.observationStart) {
    params.set('observation_start', options.observationStart);
  }
  if (options.units) {
    params.set('units', options.units);
  }
  if (options.frequency) {
    params.set('frequency', options.frequency);
  }
  if (options.aggregationMethod) {
    params.set('aggregation_method', options.aggregationMethod);
  }

  const url = `${FRED_BASE}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`FRED request failed for ${options.seriesId}: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FredObservationsResponse;
  const points: DataPoint[] = [];

  for (const obs of data.observations) {
    if (obs.value === '.' || obs.value === '') continue;
    const value = parseFloat(obs.value);
    if (Number.isNaN(value)) continue;
    points.push({ date: parseDate(obs.date), value });
  }

  return points;
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d ?? 1));
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const SERIES = {
  GDP_YOY: 'A191RO1Q156NBEA',
  SP500: 'SP500',
  PAYEMS: 'PAYEMS',
  FEDFUNDS: 'FEDFUNDS',
  T10Y3M: 'T10Y3M',
  ICSA: 'ICSA',
  CORP_PROFITS: 'A466RD3Q052SBEA',
  CPI: 'CPIAUCSL',
  MICH: 'MICH',
  USREC: 'USREC',
} as const;

export const START_1985 = '1985-01-01';

export async function fetchAllCoreSeries(): Promise<{
  gdpYoy: DataPoint[];
  sp500: DataPoint[];
  jobsCreated: DataPoint[];
  fedFundsYoy: DataPoint[];
  yieldCurve: DataPoint[];
  joblessClaims: DataPoint[];
  corpProfits: DataPoint[];
  cpiYoy: DataPoint[];
  michExpectations: DataPoint[];
  usRec: DataPoint[];
}> {
  const [
    gdpYoy,
    sp500,
    jobsCreated,
    fedFundsYoy,
    yieldCurve,
    joblessClaims,
    corpProfits,
    cpiYoy,
    michExpectations,
    usRec,
  ] = await Promise.all([
    fetchFredSeries({ seriesId: SERIES.GDP_YOY, observationStart: START_1985 }),
    fetchFredSeries({
      seriesId: SERIES.SP500,
      observationStart: START_1985,
      frequency: 'm',
      aggregationMethod: 'avg',
    }),
    fetchFredSeries({
      seriesId: SERIES.PAYEMS,
      observationStart: START_1985,
      units: 'chg',
    }),
    fetchFredSeries({
      seriesId: SERIES.FEDFUNDS,
      observationStart: START_1985,
      units: 'pc1',
    }),
    fetchFredSeries({
      seriesId: SERIES.T10Y3M,
      observationStart: START_1985,
      frequency: 'm',
      aggregationMethod: 'avg',
    }),
    fetchFredSeries({ seriesId: SERIES.ICSA, observationStart: START_1985 }),
    fetchFredSeries({ seriesId: SERIES.CORP_PROFITS }),
    fetchFredSeries({
      seriesId: SERIES.CPI,
      observationStart: START_1985,
      units: 'pc1',
    }),
    fetchFredSeries({ seriesId: SERIES.MICH, observationStart: START_1985 }),
    fetchFredSeries({ seriesId: SERIES.USREC, observationStart: START_1985 }),
  ]);

  return {
    gdpYoy,
    sp500,
    jobsCreated,
    fedFundsYoy,
    yieldCurve,
    joblessClaims,
    corpProfits,
    cpiYoy,
    michExpectations,
    usRec,
  };
}
