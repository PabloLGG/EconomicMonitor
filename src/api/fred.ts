export interface DataPoint {
  date: Date;
  value: number;
}

export interface SerializedDataPoint {
  date: string;
  value: number;
}

export interface EconomicDataBundle {
  fetchedAt: string;
  gdpYoy: SerializedDataPoint[];
  sp500: SerializedDataPoint[];
  jobsCreated: SerializedDataPoint[];
  fedFundsChange: SerializedDataPoint[];
  yieldCurve: SerializedDataPoint[];
  joblessClaims: SerializedDataPoint[];
  corpProfits: SerializedDataPoint[];
  cpiYoy: SerializedDataPoint[];
  michExpectations: SerializedDataPoint[];
  usRec: SerializedDataPoint[];
}

export interface FredObservation {
  date: string;
  value: string;
}

export interface FredObservationsResponse {
  observations?: FredObservation[];
  error_code?: number;
  error_message?: string;
}

export interface FetchSeriesOptions {
  seriesId: string;
  observationStart?: string;
  units?: string;
  frequency?: string;
  aggregationMethod?: string;
}

export interface CoreSeriesData {
  gdpYoy: DataPoint[];
  sp500: DataPoint[];
  jobsCreated: DataPoint[];
  fedFundsChange: DataPoint[];
  yieldCurve: DataPoint[];
  joblessClaims: DataPoint[];
  corpProfits: DataPoint[];
  cpiYoy: DataPoint[];
  michExpectations: DataPoint[];
  usRec: DataPoint[];
}

const FRED_API = import.meta.env.DEV
  ? '/api/fred/series/observations'
  : 'https://api.stlouisfed.org/fred/series/observations';

const DATA_URL = `${import.meta.env.BASE_URL}data/economic-data.json`;

const FRED_FETCH_GAP_MS = 250;

let fredQueue: Promise<unknown> = Promise.resolve();

function scheduleFredFetch<T>(task: () => Promise<T>): Promise<T> {
  const run = fredQueue.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, FRED_FETCH_GAP_MS));
    return task();
  });
  fredQueue = run.catch(() => {});
  return run;
}

function parseFredResponse(
  seriesId: string,
  response: Response,
  text: string,
): FredObservationsResponse {
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      `FRED ${seriesId} returned HTML instead of JSON (${response.status}). ` +
        'Confirm VITE_FRED_API_KEY in .env.local and restart npm run dev. ' +
        'If the key is valid, FRED may be rate-limiting — wait a minute and refresh.',
    );
  }

  let data: FredObservationsResponse;
  try {
    data = JSON.parse(text) as FredObservationsResponse;
  } catch {
    throw new Error(
      `FRED ${seriesId} returned a non-JSON response (${response.status}). Try again shortly.`,
    );
  }

  return data;
}

function getApiKey(): string {
  const key = import.meta.env.VITE_FRED_API_KEY?.trim();
  if (!key || key === 'your_key' || key === 'your_key_here') {
    throw new Error(
      'FRED API key is missing or still a placeholder. Copy .env.example to .env.local and set VITE_FRED_API_KEY to your key from https://fred.stlouisfed.org/docs/api/api_key.html',
    );
  }
  return key;
}

function deserialize(points: SerializedDataPoint[]): DataPoint[] {
  return points.map((p) => ({
    date: parseDate(p.date),
    value: p.value,
  }));
}

export async function fetchFredSeries(options: FetchSeriesOptions): Promise<DataPoint[]> {
  return scheduleFredFetch(() => fetchFredSeriesOnce(options));
}

async function fetchFredSeriesOnce(options: FetchSeriesOptions): Promise<DataPoint[]> {
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

  const url = `${FRED_API}?${params.toString()}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(
      `Network error fetching ${options.seriesId}. FRED blocks direct browser requests — restart the dev server (npm run dev) so requests go through the Vite proxy.`,
    );
  }

  const text = await response.text();
  const data = parseFredResponse(options.seriesId, response, text);

  if (data.error_message) {
    throw new Error(`FRED ${options.seriesId}: ${data.error_message}`);
  }

  if (!response.ok) {
    throw new Error(`FRED request failed for ${options.seriesId}: ${response.status} ${response.statusText}`);
  }

  const points: DataPoint[] = [];

  for (const obs of data.observations ?? []) {
    if (obs.value === '.' || obs.value === '') continue;
    const value = parseFloat(obs.value);
    if (Number.isNaN(value)) continue;
    points.push({ date: parseDate(obs.date), value });
  }

  return points;
}

async function fetchSp500Merged(): Promise<DataPoint[]> {
  const { fetchShillerMonthly, mergeSp500History } = await import('../data/sp500Merge');
  const shiller = await fetchShillerMonthly();
  const fredSp500 = await fetchFredSeries({
    seriesId: SERIES.SP500,
    observationStart: START_1985,
    frequency: 'm',
    aggregationMethod: 'avg',
  });
  return mergeSp500History(shiller, fredSp500);
}

async function fetchAllFromFredApi(): Promise<CoreSeriesData> {
  const gdpYoy = await fetchFredSeries({
    seriesId: SERIES.GDP_YOY,
    observationStart: START_1985,
  });
  const sp500 = await fetchSp500Merged();
  const jobsCreated = await fetchFredSeries({
    seriesId: SERIES.PAYEMS,
    observationStart: START_1985,
    units: 'chg',
  });
  const fedFundsChange = await fetchFredSeries({
    seriesId: SERIES.FEDFUNDS,
    observationStart: START_1985,
    units: 'chg',
  });
  const yieldCurve = await fetchFredSeries({
    seriesId: SERIES.T10Y3M,
    observationStart: START_1985,
    frequency: 'm',
    aggregationMethod: 'avg',
  });
  const joblessClaims = await fetchFredSeries({
    seriesId: SERIES.ICSA,
    observationStart: START_1985,
  });
  const corpProfits = await fetchFredSeries({ seriesId: SERIES.CORP_PROFITS });
  const cpiYoy = await fetchFredSeries({
    seriesId: SERIES.CPI,
    observationStart: START_1985,
    units: 'pc1',
  });
  const michExpectations = await fetchFredSeries({
    seriesId: SERIES.MICH,
    observationStart: START_1985,
  });
  const usRec = await fetchFredSeries({
    seriesId: SERIES.USREC,
    observationStart: START_1985,
  });

  return {
    gdpYoy,
    sp500,
    jobsCreated,
    fedFundsChange,
    yieldCurve,
    joblessClaims,
    corpProfits,
    cpiYoy,
    michExpectations,
    usRec,
  };
}

async function fetchAllFromBundle(): Promise<CoreSeriesData> {
  const response = await fetch(DATA_URL);
  const text = await response.text();
  if (!response.ok || text.trim().startsWith('<')) {
    throw new Error(
      `Could not load ${DATA_URL}. Run "npm run fetch-data" before "npm run preview", or deploy via GitHub Actions.`,
    );
  }

  let bundle: EconomicDataBundle & { fedFundsYoy?: SerializedDataPoint[] };
  try {
    bundle = JSON.parse(text) as EconomicDataBundle & { fedFundsYoy?: SerializedDataPoint[] };
  } catch {
    throw new Error(`Could not parse ${DATA_URL} — expected JSON economic data bundle.`);
  }
  return {
    gdpYoy: deserialize(bundle.gdpYoy),
    sp500: deserialize(bundle.sp500),
    jobsCreated: deserialize(bundle.jobsCreated),
    fedFundsChange: deserialize(bundle.fedFundsChange ?? bundle.fedFundsYoy ?? []),
    yieldCurve: deserialize(bundle.yieldCurve),
    joblessClaims: deserialize(bundle.joblessClaims),
    corpProfits: deserialize(bundle.corpProfits),
    cpiYoy: deserialize(bundle.cpiYoy),
    michExpectations: deserialize(bundle.michExpectations),
    usRec: deserialize(bundle.usRec),
  };
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

export async function fetchAllCoreSeries(): Promise<CoreSeriesData> {
  if (import.meta.env.DEV) {
    return fetchAllFromFredApi();
  }
  return fetchAllFromBundle();
}
