// Unsplash provider — used when the UNSPLASH_ACCESS_KEY secret is set.
// Ranking: number of likes (plus a small boost if Unsplash editors promoted
// the photo). Unsplash only exposes upload time, so "recent" = uploaded
// within the window.
import { DAY_MS, APP_NAME, AUSTRIA_TERMS, EUROPE_COUNTRIES, clip, sentenceCase, sleep } from './core.mjs';

const API = 'https://api.unsplash.com';

const AUSTRIA_QUERIES = ['austria nature', 'austria mountains', 'austrian alps', 'austria lake', 'tyrol mountains', 'salzburg landscape'];

const utm = (url) => `${url}${url.includes('?') ? '&' : '?'}utm_source=${APP_NAME}&utm_medium=referral`;

async function search(query, key, pages = 2) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      query, page: String(page), per_page: '30', order_by: 'latest',
      orientation: 'landscape', content_filter: 'high',
    });
    const res = await fetch(`${API}/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
    });
    if (res.status === 401 || res.status === 403) throw new Error(`Unsplash auth/rate-limit error (${res.status})`);
    if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`);
    const data = await res.json();
    out.push(...(data.results || []));
    if (page >= (data.total_pages || 0)) break;
    await sleep(200);
  }
  return out;
}

function normalise(ph, location, country) {
  const title = ph.description || ph.alt_description || `${country} landscape`;
  return {
    id: `unsplash:${ph.id}`,
    source: 'unsplash',
    source_name: 'Unsplash',
    title: clip(sentenceCase(title), 90),
    description: clip(sentenceCase(ph.alt_description || ''), 220),
    image: `${ph.urls.raw}&w=2400&q=80&fm=jpg&fit=max`,
    image_small: `${ph.urls.raw}&w=900&q=75&fm=jpg&fit=max`,
    width: ph.width,
    height: ph.height,
    color: ph.color || null,
    page_url: utm(ph.links.html),
    author: ph.user?.name || 'Unsplash photographer',
    author_url: utm(ph.user?.links?.html || 'https://unsplash.com'),
    license: 'Unsplash License',
    license_url: utm('https://unsplash.com/license'),
    taken_at: null, // not exposed by search; upload date is used instead
    uploaded_at: ph.created_at,
    likes: ph.likes || 0,
    promoted: Boolean(ph.promoted_at),
    location,
    country,
    _text: `${ph.description || ''} ${ph.alt_description || ''} ${(ph.tags || []).map((t) => t.title).join(' ')}`.toLowerCase(),
  };
}

function finish(pool, now, windows) {
  for (const days of windows) {
    const recent = pool.filter((p) => (now - Date.parse(p.uploaded_at)) / DAY_MS <= days);
    if (recent.length) {
      return recent
        .map((p) => ({
          ...p,
          score: p.likes + (p.promoted ? 10 : 0),
          score_label: `${p.likes} like${p.likes === 1 ? '' : 's'}${p.promoted ? ' · Editor pick' : ''}`,
          window_days: days,
          pool_size: recent.length,
        }))
        .sort((a, b) => b.score - a.score || Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at))
        .map(({ _text, ...rest }) => rest);
    }
  }
  return [];
}

export async function unsplashAustria({ key, now = Date.now(), windows }) {
  const byId = new Map();
  for (const q of AUSTRIA_QUERIES) {
    for (const ph of await search(q, key)) {
      if (!byId.has(ph.id)) byId.set(ph.id, normalise(ph, 'Austria', 'Austria'));
    }
  }
  return finish([...byId.values()], now, windows);
}

export async function unsplashEurope({ key, now = Date.now(), windows }) {
  const byId = new Map();
  for (const c of EUROPE_COUNTRIES) {
    for (const ph of await search(c.unsplash, key, 1)) {
      const p = normalise(ph, c.name, c.name);
      if (byId.has(p.id) || AUSTRIA_TERMS.some((t) => p._text.includes(t))) continue;
      byId.set(p.id, p);
    }
  }
  return finish([...byId.values()], now, windows);
}
