// Wikimedia Commons provider — free, no API key, reliable licensing metadata.
// Ranking: no "likes" exist on Commons, so photos are scored on community
// curation (Quality / Valued / Featured image status), resolution, how
// clearly they depict scenery, and how recently they were captured.
import {
  DAY_MS, USER_AGENT, AUSTRIA_TERMS, EUROPE_BOX, EUROPE_COUNTRIES,
  inAustria, inBox, mentions, stripHtml, clip, parseLooseDate, sleep,
} from './core.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';

// Country-level category trees are huge (Commons truncates deep searches),
// so state-level trees are queried as well.
const AUSTRIA_QUERIES = [
  'deepcat:"Mountains of Austria"',
  'deepcat:"Alps of Austria"',
  'deepcat:"Valleys of Austria"',
  'deepcat:"Lakes of Austria"',
  'deepcat:"Rivers of Austria"',
  'deepcat:"Hohe Tauern"',
  'deepcat:"Mountains of Salzburg (state)"',
  'deepcat:"Mountains of Styria"',
  'deepcat:"Mountains of Carinthia"',
  'deepcat:"Mountains of Vorarlberg"',
  'deepcat:"Mountains of Upper Austria"',
  'Austria landscape',
];

const AUSTRIA_STATES = [
  ['tyrol', 'Tyrol'], ['tirol', 'Tyrol'], ['salzburg', 'Salzburg'], ['carinthia', 'Carinthia'],
  ['kärnten', 'Carinthia'], ['styria', 'Styria'], ['steiermark', 'Styria'], ['vorarlberg', 'Vorarlberg'],
  ['upper austria', 'Upper Austria'], ['oberösterreich', 'Upper Austria'],
  ['lower austria', 'Lower Austria'], ['niederösterreich', 'Lower Austria'],
  ['burgenland', 'Burgenland'], ['vienna', 'Vienna'], ['wien', 'Vienna'],
  ['salzkammergut', 'Salzkammergut'], ['hohe tauern', 'Hohe Tauern'],
];

// Not scenery: buildings, graves, transport, documents, specimens…
const EXCLUDE = /\b(grave|grab|cemetery|friedhof|church|kirche|chapel|kapelle|interior|innenansicht|building|gebäude|street|straße|strasse|road sign|signs?\b|railway|train|bahnhof|station|tram|bus|cars?\b|automobile|museum|exhibition|monument|memorial|denkmal|plaque|statue|sculpture|maps?\b|people|portrait|concert|festival|logo|document|painting|gemälde|drawing|aircraft|airport|stamp|coat of arms|wappen|gbif|specimen|herbarium|insect|beetle|spider|moth|fungi|mushroom|close-up|macro|food|text|poster|sign\b)\b/i;

// German compounds hide words inside longer ones (Feldkapelle, Sägewerk…),
// so these are matched as plain substrings.
const EXCLUDE_SUBSTR = /(bridge|brücke|strasse|straße|friedhof|kapelle|kirche|sägewerk|werke\b|gasthof|gasthaus|hotel|plaza|platz|area cani|dog park|bahn\b|sessellift|bergstation|talstation|skilift|parkplatz|baustelle|construction)/i;

const NATURE = /(mountain|berg|alp|lake|\bsee\b|valley|\btal\b|forest|wald|river|fluss|bach\b|waterfall|wasserfall|glacier|gletscher|meadow|wiese|peak|gipfel|summit|panorama|view|ausblick|landscape|landschaft|autumn|herbst|sunrise|sunset|snow|gorge|klamm|cliff|coast|beach|fjord|\bsea\b|island|nature|hiking|trail|ridge|alm\b|hütte|lagoon|canyon)/gi;

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params })}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } });
    if (res.ok) {
      const data = await res.json();
      if (!data.error) return data;
      if (data.error.code !== 'maxlag') throw new Error(`Commons API: ${data.error.info}`);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error('Commons API unavailable');
}

async function search(query, limit) {
  const data = await api({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(limit),
    gsrsort: 'create_timestamp_desc', // newest uploads first
    gsrsearch: `${query} filetype:bitmap`,
    prop: 'imageinfo',
    iiprop: 'url|size|timestamp|extmetadata|mime',
    iiurlwidth: '1920',
    iiextmetadatafilter:
      'DateTimeOriginal|Artist|LicenseShortName|LicenseUrl|Categories|ObjectName|ImageDescription|GPSLatitude|GPSLongitude',
  });
  return data.query?.pages ?? [];
}

function normalise(page) {
  const info = page.imageinfo?.[0];
  if (!info || !/jpeg|png|webp/.test(info.mime || '')) return null;
  const m = info.extmetadata || {};
  const v = (k) => m[k]?.value ?? '';
  const categories = String(v('Categories')).replace(/\|/g, ' · ');
  const title = stripHtml(v('ObjectName')) || page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '');
  const artistHtml = String(v('Artist'));
  const href = artistHtml.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  const taken = parseLooseDate(v('DateTimeOriginal'));
  const thumb = info.thumburl || info.url;
  return {
    id: `commons:${page.pageid}`,
    source: 'wikimedia',
    source_name: 'Wikimedia Commons',
    title: clip(title.replace(/[_]+/g, ' '), 90),
    description: clip(stripHtml(v('ImageDescription')), 220),
    image: thumb,
    image_small: thumb.replace(/\/1920px-/, '/960px-'),
    width: info.width,
    height: info.height,
    color: null,
    page_url: info.descriptionurl,
    author: clip(stripHtml(artistHtml) || 'Unknown', 70),
    author_url: href ? (href.startsWith('//') ? `https:${href}` : href) : info.descriptionurl,
    license: stripHtml(v('LicenseShortName')) || 'See source',
    license_url: v('LicenseUrl') || info.descriptionurl,
    taken_at: taken ? taken.toISOString() : null,
    uploaded_at: info.timestamp,
    lat: parseFloat(v('GPSLatitude')),
    lon: parseFloat(v('GPSLongitude')),
    _text: `${title} ${categories}`.toLowerCase(),
    _categories: categories,
  };
}

function isScenic(p) {
  if (!p) return false;
  const ratio = p.width / p.height;
  if (p.width < 2400 || ratio < 1.25 || ratio > 3.2) return false; // landscape frames only
  if (EXCLUDE.test(p._text) || EXCLUDE_SUBSTR.test(p._text)) return false;
  // Must look like scenery: at least one landscape word in title/categories.
  return new RegExp(NATURE.source, 'i').test(p._text);
}

function score(p, now) {
  const mp = (p.width * p.height) / 1e6;
  const age = (now - Date.parse(p.taken_at)) / DAY_MS;
  const quality = /quality images/i.test(p._categories);
  const featured = /featured pictures/i.test(p._categories);
  const valued = /valued images/i.test(p._categories);
  const natureHits = new Set((p._text.match(NATURE) || []).map((s) => s.toLowerCase())).size;
  let s = Math.min(Math.log2(Math.max(mp, 1)), 5);
  s += quality ? 4 : 0;
  s += featured ? 6 : 0;
  s += valued ? 3 : 0;
  s += Math.min(natureHits, 4) * 0.6;
  s += Math.max(0, (7 - age) / 7) * 1.5;
  const ratio = p.width / p.height;
  s += ratio >= 1.4 && ratio <= 1.9 ? 1 : 0;
  const badges = [featured && 'Featured picture', quality && 'Quality image', valued && 'Valued image'].filter(Boolean);
  return {
    score: Math.round(s * 100) / 100,
    score_label: badges[0] || `${Math.round(mp)} MP original`,
  };
}

function finish(pool, now, windows) {
  for (const days of windows) {
    const recent = pool.filter((p) => {
      if (!p.taken_at) return false;
      const age = (now - Date.parse(p.taken_at)) / DAY_MS;
      return age >= -1 && age <= days;
    });
    if (recent.length) {
      return recent
        .map((p) => ({ ...p, ...score(p, now), window_days: days, pool_size: recent.length }))
        .sort((a, b) => b.score - a.score)
        .map(({ _text, _categories, lat, lon, ...rest }) => rest);
    }
  }
  return [];
}

async function collect(queries, limit, accept, decorate) {
  const byId = new Map();
  for (const q of queries) {
    try {
      for (const page of await search(q.query ?? q, limit)) {
        const p = normalise(page);
        if (!isScenic(p) || byId.has(p.id) || !accept(p, q)) continue;
        byId.set(p.id, decorate(p, q));
      }
    } catch (err) {
      console.warn(`  commons query failed (${q.query ?? q}): ${err.message}`);
    }
    await sleep(250);
  }
  return [...byId.values()];
}

export async function commonsAustria({ now = Date.now(), windows } = {}) {
  const pool = await collect(
    AUSTRIA_QUERIES,
    100,
    // Category trees on Commons leak across borders, so require either an
    // Austrian place name in the title/categories or GPS inside Austria.
    (p) => mentions(p._text, AUSTRIA_TERMS) || inAustria(p.lat, p.lon),
    (p) => {
      const state = AUSTRIA_STATES.find(([t]) => p._text.includes(t));
      return { ...p, location: state ? `${state[1]}, Austria` : 'Austria', country: 'Austria' };
    },
  );
  return finish(pool, now, windows);
}

export async function commonsEurope({ now = Date.now(), windows } = {}) {
  const queries = EUROPE_COUNTRIES.flatMap((c) => [
    { query: `deepcat:"Landscapes of ${c.name}"`, country: c },
    { query: `deepcat:"Mountains of ${c.name}"`, country: c },
  ]);
  const pool = await collect(
    queries,
    50,
    (p) => {
      if (mentions(p._text, AUSTRIA_TERMS) || inAustria(p.lat, p.lon)) return false;
      return Number.isNaN(p.lat) || inBox(p.lat, p.lon, EUROPE_BOX);
    },
    (p, q) => {
      const c = q.country;
      const confirmed = mentions(p._text, c.terms) || inBox(p.lat, p.lon, c.box);
      const name = confirmed ? c.name : 'Europe';
      return { ...p, location: name, country: name };
    },
  );
  return finish(pool, now, windows);
}
