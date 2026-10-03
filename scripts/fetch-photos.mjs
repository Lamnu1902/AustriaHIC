#!/usr/bin/env node
// Fetches fresh nature photos (one from Austria, one from elsewhere in Europe)
// and writes site/data/photos.json. Run by GitHub Actions every 6 hours.
//
//   node scripts/fetch-photos.mjs            # normal run
//   UNSPLASH_ACCESS_KEY=xxx node scripts/... # rank by Unsplash likes first
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECENCY_WINDOWS_DAYS, SLOT_HOURS, currentSlot, pickForSlot } from './lib/core.mjs';
import { commonsAustria, commonsEurope } from './lib/commons.mjs';
import { unsplashAustria, unsplashEurope } from './lib/unsplash.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'site/data/photos.json');

const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
const now = Date.now();
const slot = currentSlot(now);
const opts = { key, now, windows: RECENCY_WINDOWS_DAYS };

const providers = {
  austria: [
    ...(key ? [{ name: 'Unsplash', run: () => unsplashAustria(opts) }] : []),
    { name: 'Wikimedia Commons', run: () => commonsAustria(opts) },
  ],
  europe: [
    ...(key ? [{ name: 'Unsplash', run: () => unsplashEurope(opts) }] : []),
    { name: 'Wikimedia Commons', run: () => commonsEurope(opts) },
  ],
};

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return {};
  }
}

async function choose(region, previous) {
  for (const p of providers[region]) {
    try {
      console.log(`[${region}] trying ${p.name}…`);
      const ranked = await p.run();
      console.log(`[${region}] ${p.name}: ${ranked.length} candidates`);
      const pick = pickForSlot(ranked, slot);
      if (pick) {
        console.log(`[${region}] → "${pick.title}" by ${pick.author} (${pick.score_label})`);
        return pick;
      }
    } catch (err) {
      console.warn(`[${region}] ${p.name} failed: ${err.message}`);
    }
  }
  if (previous?.[region]) {
    console.warn(`[${region}] no fresh photo; keeping the previous one`);
    return { ...previous[region], stale: true };
  }
  return null;
}

const previous = await readPrevious();
const austria = await choose('austria', previous);
const europe = await choose('europe', previous);

if (!austria && !europe) {
  console.error('No photos could be fetched and no previous data exists.');
  process.exit(1);
}

const data = {
  generated_at: new Date(now).toISOString(),
  next_update_at: new Date((slot + 1) * SLOT_HOURS * 3_600_000).toISOString(),
  slot,
  ranking: key ? 'unsplash-likes' : 'commons-curation',
  austria,
  europe,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote ${OUT}`);
