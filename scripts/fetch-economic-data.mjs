#!/usr/bin/env node
/**
 * Fetches all FRED series server-side (no CORS) and writes public/data/economic-data.json.
 * Used for production builds and optional local refresh.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchShillerMonthly, mergeSp500History } from './sp500-merge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/data/economic-data.json');

function loadEnvLocal() {
  const envPath = join(__dirname, '../.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const API_KEY = process.env.VITE_FRED_API_KEY ?? process.env.FRED_API_KEY;
if (!API_KEY?.trim()) {
  console.error('Missing FRED API key. Set VITE_FRED_API_KEY or FRED_API_KEY.');
  process.exit(1);
}

const START_1985 = '1985-01-01';
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

const REQUESTS = [
  { key: 'gdpYoy', seriesId: 'A191RO1Q156NBEA', observationStart: START_1985 },
  { key: 'jobsCreated', seriesId: 'PAYEMS', observationStart: START_1985, units: 'chg' },
  { key: 'fedFundsChange', seriesId: 'FEDFUNDS', observationStart: START_1985, units: 'chg' },
  {
    key: 'yieldCurve',
    seriesId: 'T10Y3M',
    observationStart: START_1985,
    frequency: 'm',
    aggregationMethod: 'avg',
  },
  { key: 'joblessClaims', seriesId: 'ICSA', observationStart: START_1985 },
  { key: 'corpProfits', seriesId: 'A466RD3Q052SBEA' },
  { key: 'cpiYoy', seriesId: 'CPIAUCSL', observationStart: START_1985, units: 'pc1' },
  { key: 'michExpectations', seriesId: 'MICH', observationStart: START_1985 },
  { key: 'usRec', seriesId: 'USREC', observationStart: START_1985 },
];

async function fetchSeries(opts) {
  const params = new URLSearchParams({
    series_id: opts.seriesId,
    api_key: API_KEY,
    file_type: 'json',
  });
  if (opts.observationStart) params.set('observation_start', opts.observationStart);
  if (opts.units) params.set('units', opts.units);
  if (opts.frequency) params.set('frequency', opts.frequency);
  if (opts.aggregationMethod) params.set('aggregation_method', opts.aggregationMethod);

  const url = `${FRED_BASE}?${params.toString()}`;
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  if (!contentType.includes('json')) {
    throw new Error(
      `FRED ${opts.seriesId}: unexpected response (${response.status}). Try again in a minute — FRED may rate-limit burst requests.`,
    );
  }

  const body = JSON.parse(text);

  if (!response.ok || body.error_message) {
    throw new Error(
      `FRED ${opts.seriesId}: ${body.error_message ?? response.statusText}`,
    );
  }

  return (body.observations ?? [])
    .filter((o) => o.value !== '.' && o.value !== '')
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const result = { fetchedAt: new Date().toISOString() };

for (const req of REQUESTS) {
  process.stdout.write(`Fetching ${req.seriesId}… `);
  result[req.key] = await fetchSeries(req);
  console.log(`${result[req.key].length} points`);
  await sleep(250);
}

process.stdout.write('Fetching SP500 (Shiller + FRED)… ');
const [shiller, fredSp500] = await Promise.all([
  fetchShillerMonthly(),
  fetchSeries({
    seriesId: 'SP500',
    observationStart: START_1985,
    frequency: 'm',
    aggregationMethod: 'avg',
  }),
]);
result.sp500 = mergeSp500History(shiller, fredSp500);
console.log(`${result.sp500.length} points`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`Wrote ${OUT}`);
