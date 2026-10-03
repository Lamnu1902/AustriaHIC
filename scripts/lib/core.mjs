// Shared helpers: regions, date parsing, text cleanup, ranking & rotation.
// No Node-specific imports, so this file also runs in a browser for testing.

export const DAY_MS = 86_400_000;
export const SLOT_HOURS = 6;
export const RECENCY_WINDOWS_DAYS = [7, 14, 30]; // widen only if nothing recent enough

export const APP_NAME = 'alpenglow';
export const USER_AGENT =
  'AlpenglowPhotoBot/1.0 (https://github.com/; daily nature photo site; contact via repo issues)';

// ---------------------------------------------------------------- regions

// Rough boxes [latMin, latMax, lonMin, lonMax] that trace Austria's outline
// while avoiding most of Bavaria, Switzerland, Italy and Slovenia.
const AUSTRIA_BOXES = [
  [46.85, 47.50, 9.55, 10.45],  // Vorarlberg
  [46.70, 47.48, 10.45, 12.95], // Tyrol
  [46.40, 47.95, 12.95, 13.80], // Salzburg / Carinthia west
  [46.40, 48.75, 13.80, 15.00], // Upper Austria / Styria / Carinthia east
  [46.60, 49.00, 15.00, 16.90], // Lower Austria / Vienna / Styria east
  [47.00, 48.00, 16.90, 17.15], // Burgenland east edge
];

export const AUSTRIA_TERMS = [
  'austria', 'österreich', 'osterreich', 'tyrol', 'tirol', 'salzburg', 'carinthia',
  'kärnten', 'karnten', 'styria', 'steiermark', 'vorarlberg', 'oberösterreich',
  'niederösterreich', 'burgenland', 'vienna', 'wien', 'hohe tauern', 'dachstein',
  'salzkammergut', 'wachau', 'zillertal', 'ötztal', 'stubai', 'großglockner',
  'grossglockner', 'hallstatt', 'wolfgangsee', 'attersee', 'traunsee', 'achensee',
];

export const EUROPE_BOX = [34, 72, -25, 45];

// Countries used for the "elsewhere in Europe" photo. `terms` help confirm the
// label; `box` is a loose bounding box used when the photo has GPS data.
export const EUROPE_COUNTRIES = [
  { name: 'Switzerland', terms: ['switzerland', 'schweiz', 'suisse', 'svizzera'], box: [45.8, 47.8, 5.9, 10.5], unsplash: 'switzerland nature' },
  { name: 'Italy', terms: ['italy', 'italia', 'dolomit', 'tuscany', 'toscana'], box: [36.6, 47.1, 6.6, 18.5], unsplash: 'dolomites' },
  { name: 'France', terms: ['france', 'french alps', 'provence', 'bretagne'], box: [42.3, 51.1, -4.8, 8.2], unsplash: 'france landscape' },
  { name: 'Germany', terms: ['germany', 'deutschland', 'bavaria', 'bayern'], box: [47.3, 55.1, 5.9, 15.0], unsplash: 'bavaria nature' },
  { name: 'Slovenia', terms: ['slovenia', 'slovenija', 'julian alps', 'triglav', 'bled'], box: [45.4, 46.9, 13.4, 16.6], unsplash: 'slovenia nature' },
  { name: 'Norway', terms: ['norway', 'norge', 'fjord', 'lofoten'], box: [57.9, 71.2, 4.5, 31.1], unsplash: 'norway fjord' },
  { name: 'Iceland', terms: ['iceland', 'ísland'], box: [63.2, 66.6, -24.6, -13.4], unsplash: 'iceland landscape' },
  { name: 'Scotland', terms: ['scotland', 'highlands', 'skye'], box: [54.6, 60.9, -8.7, -0.7], unsplash: 'scotland highlands' },
  { name: 'Spain', terms: ['spain', 'españa', 'pyrenees', 'pirineo'], box: [36.0, 43.8, -9.4, 3.4], unsplash: 'spain nature' },
  { name: 'Portugal', terms: ['portugal', 'madeira', 'azores', 'açores'], box: [32.6, 42.2, -31.3, -6.2], unsplash: 'portugal coast' },
  { name: 'Croatia', terms: ['croatia', 'hrvatska', 'plitvice'], box: [42.4, 46.6, 13.5, 19.5], unsplash: 'croatia nature' },
  { name: 'Faroe Islands', terms: ['faroe', 'føroyar'], box: [61.3, 62.5, -7.8, -6.2], unsplash: 'faroe islands' },
];

export function inBox(lat, lon, [a, b, c, d]) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= a && lat <= b && lon >= c && lon <= d;
}
export const inAustria = (lat, lon) => AUSTRIA_BOXES.some((bx) => inBox(lat, lon, bx));
export const mentions = (text, terms) => terms.some((t) => text.includes(t));

// ---------------------------------------------------------------- text

export function stripHtml(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clip(text = '', n = 180) {
  const t = String(text).trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

export function sentenceCase(text = '') {
  const t = String(text).trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

// Parses the many shapes of EXIF/Commons dates: "2026-09-12 10:49:00",
// "2026:09:12 10:49:00", "Taken on 5 September 2026", "3 April 2025, 10:29".
export function parseLooseDate(raw) {
  if (!raw) return null;
  const s = stripHtml(raw);
  let m = s.match(/(\d{4})[-:/](\d{1,2})[-:/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0)));
    return isNaN(d) ? null : d;
  }
  m = s.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m && MONTHS.includes(m[2])) {
    return new Date(Date.UTC(+m[3], MONTHS.indexOf(m[2]), +m[1], 12));
  }
  return null;
}

// ---------------------------------------------------------------- ranking

export function currentSlot(now = Date.now()) {
  return Math.floor(now / (SLOT_HOURS * 3_600_000));
}

// Keep at most one photo per photographer near the top so the rotation
// doesn't show four frames from the same hike.
export function diversify(ranked, max = 6) {
  const seen = new Set();
  const out = [];
  for (const p of ranked) {
    const key = (p.author || '').toLowerCase();
    if (key && seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

// Each 6-hour slot shows the next photo from the top few, so the page changes
// every run even when the candidate pool barely moves.
export function pickForSlot(ranked, slot, poolSize = 4) {
  const pool = diversify(ranked, 6);
  if (!pool.length) return null;
  const top = pool.slice(0, Math.min(poolSize, pool.length));
  const chosen = top[slot % top.length];
  return {
    ...chosen,
    rank: pool.indexOf(chosen) + 1,
    alternates: pool.filter((p) => p !== chosen).slice(0, 4).map((p) => ({
      title: p.title,
      location: p.location,
      image_small: p.image_small,
      image: p.image,
      page_url: p.page_url,
      author: p.author,
      author_url: p.author_url,
      taken_at: p.taken_at,
      score_label: p.score_label,
      license: p.license,
      license_url: p.license_url,
      source: p.source,
      source_name: p.source_name,
      color: p.color,
      width: p.width,
      height: p.height,
      description: p.description,
    })),
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
