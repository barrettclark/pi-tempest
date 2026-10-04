// Timeout keeps a hung request from stalling the refresh loop.
const FETCH_TIMEOUT_MS = 8000;

export async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
