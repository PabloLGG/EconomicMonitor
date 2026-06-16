const SHILLER_URL = 'https://datahub.io/core/s-and-p-500/_r/-/data/data.csv';
const START_1985 = '1985-01-01';

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d ?? 1));
}

export function parseShillerCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',');
  const dateIdx = header.indexOf('Date');
  const spIdx = header.indexOf('SP500');
  if (dateIdx === -1 || spIdx === -1) {
    throw new Error('Shiller CSV missing Date or SP500 columns');
  }

  const points = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const value = parseFloat(cols[spIdx]);
    if (Number.isNaN(value) || value <= 0) continue;
    points.push({ date: cols[dateIdx], value });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeSp500History(shiller, fred) {
  const cutoff = parseDate(START_1985);
  const sortedFred = [...fred].sort((a, b) => a.date.localeCompare(b.date));
  const fredStart = sortedFred[0]?.date;

  const merged = [];

  for (const point of shiller) {
    const d = parseDate(point.date);
    if (d < cutoff) continue;
    if (fredStart && point.date >= fredStart) break;
    merged.push(point);
  }

  for (const point of sortedFred) {
    if (parseDate(point.date) >= cutoff) merged.push(point);
  }

  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchShillerMonthly() {
  const response = await fetch(SHILLER_URL);
  if (!response.ok) {
    throw new Error(`Shiller S&P 500 CSV request failed: ${response.status}`);
  }
  return parseShillerCsv(await response.text());
}
