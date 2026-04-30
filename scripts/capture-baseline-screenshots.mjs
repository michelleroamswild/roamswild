#!/usr/bin/env node
/**
 * Capture full-page screenshots of every existing route before the redesign
 * lands. Headless — no visible window needed.
 *
 * One-time auth setup:
 *   1. Open RoamsWild in your normal browser, logged in.
 *   2. DevTools (Cmd+Opt+I) → Application → Local Storage → http://localhost:8084
 *   3. Find the entry starting with `sb-ioseedbzvogywztbtgjd-auth-token`
 *   4. Copy its VALUE (long JSON string starting with {"access_token":...})
 *   5. Save it to /tmp/sb-auth.json:
 *        pbpaste > /tmp/sb-auth.json
 *      (Or paste it manually into that file with any text editor.)
 *
 * Then run:
 *   BASE_URL=http://localhost:8084 node scripts/capture-baseline-screenshots.mjs
 *
 * If you skip auth setup, only the public routes get captured.
 *
 * Detail-page IDs (optional):
 *   TRIP_SLUG=...  ROUTE_ID=...  LOC_ID=...  CAMPSITE_ID=...
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SUPABASE_PROJECT_REF = 'ioseedbzvogywztbtgjd';
const AUTH_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const AUTH_FILE = process.env.AUTH_FILE || '/tmp/sb-auth.json';
const OUT = '/tmp/roamswild-baseline';
mkdirSync(OUT, { recursive: true });

const TRIP_SLUG    = process.env.TRIP_SLUG    || '';
const ROUTE_ID     = process.env.ROUTE_ID     || '';
const LOC_ID       = process.env.LOC_ID       || '';
const CAMPSITE_ID  = process.env.CAMPSITE_ID  || '';

const routes = [
  { path: '/landing',         name: '00-landing',         auth: false },
  { path: '/login',           name: '01-login',           auth: false },
  { path: '/signup',          name: '02-signup',          auth: false },
  { path: '/forgot-password', name: '03-forgot-password', auth: false },
  { path: '/style-guide',     name: '04-style-guide',     auth: false },
  { path: '/map-preview',     name: '05-map-preview',     auth: false },
  { path: '/light-preview',   name: '06-light-preview',   auth: false },

  { path: '/',                name: '10-home',            auth: true },
  { path: '/dispersed',       name: '11-dispersed-explorer', auth: true },
  { path: '/saved',           name: '12-saved-locations', auth: true },
  { path: '/trips',           name: '13-trips',           auth: true },
  { path: '/my-trips',        name: '14-my-trips',        auth: true },
  { path: '/create-trip',     name: '15-create-trip',     auth: true },
  { path: '/friends',         name: '16-friends',         auth: true },
  { path: '/campsites',       name: '17-campsites',       auth: true },
  { path: '/iotest',          name: '18-iotest',          auth: true },
  { path: '/admin',           name: '19-admin',           auth: true },

  ...(TRIP_SLUG    ? [{ path: `/trip/${TRIP_SLUG}`,     name: '20-trip-detail',     auth: true }] : []),
  ...(ROUTE_ID     ? [{ path: `/route/${ROUTE_ID}`,     name: '21-route-detail',    auth: true }] : []),
  ...(LOC_ID       ? [{ path: `/location/${LOC_ID}`,    name: '22-location-detail', auth: true }] : []),
  ...(CAMPSITE_ID  ? [{ path: `/campsites/${CAMPSITE_ID}`, name: '23-campsite-detail', auth: true }] : []),
];

// Read auth token (the raw localStorage value — JSON string from Supabase).
let authValue = null;
if (existsSync(AUTH_FILE)) {
  authValue = readFileSync(AUTH_FILE, 'utf8').trim();
  // Validate-ish: must look like JSON containing access_token
  if (!authValue.includes('access_token')) {
    console.warn(`!  ${AUTH_FILE} doesn't look like a Supabase auth token. Auth-required routes will fail.`);
    authValue = null;
  } else {
    console.log(`✓  auth loaded from ${AUTH_FILE}`);
  }
} else {
  console.log(`!  ${AUTH_FILE} missing — auth-required routes will be skipped.`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Inject auth into localStorage on every navigation. Vite serves the SPA from
// BASE so localStorage scope matches automatically once we visit any URL.
if (authValue) {
  await page.goto(BASE);
  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: AUTH_KEY, value: authValue });
  console.log(`✓  auth injected into localStorage (${AUTH_KEY})`);
}

let ok = 0, skip = 0, fail = 0;
for (const { path, name, auth } of routes) {
  if (auth && !authValue) {
    console.log(`  ${name.padEnd(28)} → SKIP (no auth)`);
    skip++;
    continue;
  }
  const url = BASE + path;
  process.stdout.write(`  ${name.padEnd(28)} → `);
  try {
    // Try networkidle first (best for static pages), fall back to
    // domcontentloaded for map-heavy pages where the network never settles.
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 8_000 });
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    }
    // Settle delay — long enough for fonts, hero images, map tiles.
    await page.waitForTimeout(2500);
    const file = resolve(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`✓  ${file}`);
    ok++;
  } catch (e) {
    console.log(`✗  ${e.message.split('\n')[0]}`);
    fail++;
  }
}

await browser.close();
console.log(`\nDone. ${ok} captured, ${skip} skipped, ${fail} failed. Files in ${OUT}.`);
console.log(`Open: open ${OUT}`);
