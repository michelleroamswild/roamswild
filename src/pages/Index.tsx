import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Tent,
  Mountains,
  Compass,
  Shuffle,
  SunHorizon,
  MagnifyingGlass,
  SpinnerGap,
  Plus,
  Star,
  CaretRight,
  Users,
  Path,
  MapTrifold as MapIcon,
  Sun,
  Wind,
  Copy,
  Check,
  MapPin,
  Sparkle,
  ArrowUpRight,
  Heart,
  CheckCircle,
} from '@phosphor-icons/react';
import { Header } from '@/components/Header';
import { SurpriseMeDialog } from '@/components/SurpriseMeDialog';
import { BestHikesTodayDialog } from '@/components/BestHikesTodayDialog';
import { SunsetConditionsDialog } from '@/components/SunsetConditionsDialog';
import { LocationSelector, type SelectedLocation } from '@/components/LocationSelector';
import { GoogleMap } from '@/components/GoogleMap';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { Marker } from '@react-google-maps/api';
import { useTrip } from '@/context/TripContext';
import { useAuth } from '@/context/AuthContext';
import { useSavedLocations } from '@/context/SavedLocationsContext';
import { toast } from 'sonner';
import { getUserLocation, type UserLocation } from '@/utils/getUserLocation';
import { getTripUrl } from '@/utils/slugify';
import { usePhotoWeather } from '@/hooks/use-photo-weather';
import { getSunTimes, formatTime, azimuthToCompass } from '@/utils/sunCalc';
import { Mono, Pill, Tag, TopoBg } from '@/components/redesign';
import { supabase } from '@/integrations/supabase/client';
import { useSurpriseMe } from '@/hooks/use-surprise-me';
import type { BiomeType } from '@/types/surpriseMe';
import { cn } from '@/lib/utils';

// Strip accidental suffix doubles that turn up in upstream region names.
// Catches both "X National Forest National Forest" AND the plural variant
// "X National Forests National Forest" (which is what surfaced for Francis
// Marion and Sumter — a real two-forest unit).
function cleanRegionName(name: string): string {
  const suffixes = ['National Forest', 'National Park', 'Wilderness', 'State Park', 'Recreation Area'];
  let out = name;
  for (const suffix of suffixes) {
    // Identical double: "National Forest National Forest"
    out = out.replace(`${suffix} ${suffix}`, suffix);
    // Plural-into-singular double: "National Forests National Forest"
    out = out.replace(`${suffix}s ${suffix}`, `${suffix}s`);
  }
  return out;
}

// Region names sometimes arrive in SCREAMING CAPS ("GRAND CANYON-PARASHANT NM BLM").
// Convert to Title Case but keep agency / state / direction acronyms in caps.
const REGION_NAME_ACRONYMS = new Set([
  // agencies
  'BLM', 'USFS', 'NPS', 'NF', 'NRA', 'NM', 'USFWS', 'NWR', 'WSA', 'WMA',
  'RV', 'OHV', 'ATV',
  // state postal codes commonly seen in region names
  'AK', 'AZ', 'CA', 'CO', 'ID', 'MT', 'ND', 'NE', 'NV', 'NM', 'OR', 'SD', 'TX', 'UT', 'WA', 'WY',
  // compass abbreviations
  'N', 'S', 'E', 'W', 'NW', 'NE', 'SW', 'SE',
  // miscellaneous
  'US', 'USA', 'UT', 'CG', 'WMA',
]);
function prettyRegionName(name: string): string {
  // Split while preserving whitespace, hyphens, and slashes as their own tokens.
  return name
    .split(/(\s+|[-/])/)
    .map((part) => {
      if (!part || /^\s+$/.test(part) || part === '-' || part === '/') return part;
      const upper = part.toUpperCase();
      if (REGION_NAME_ACRONYMS.has(upper)) return upper;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Authenticated home — Pine Grove v3 layout. Hero (search + conditions) →
// featured region → near-you spots on dark band → your trips.

interface FeaturedSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  manager: string;
  /** Reverse-geocoded "City, ST" label. Filled in async after the spot loads. */
  place?: string | null;
}

const FEATURED_SPOT_KEY = 'home-featured-spot-v1';

// Band 3 "Near you" cards — real spots from the spots table, optionally
// paired with a NAIP aerial chip from spot_images.
interface NearbySpot {
  id: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  kind: string;
  source: string;
  manager: string | null;
  /** Miles from origin, only present in 'near' mode. */
  distanceMiles?: number;
  /** Public NAIP aerial URL when the spot has one indexed. */
  naipUrl: string | null;
}

type NearbyBucket = 'near' | 'random';

// Haversine in miles — good enough for sorting "closest first" client-side.
function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Slimmed-down view of the Surprise Me response we keep for the
 * "Featured this week" card. We persist enough to render the card from
 * cache + navigate to /location/<id> with the same banner state the
 * SurpriseMeDialog pushes there. */
interface FeaturedRegion {
  id: string;
  name: string;
  tagline: string | null;
  explanation: string;
  primaryBiome: BiomeType;
  distanceMiles: number;
  driveTimeHours: number | null;
  center: { lat: number; lng: number };
  /** Region bounding box from Surprise Me — used to count spots inside the region. */
  bounds: { north: number; south: number; east: number; west: number };
  highlightCount: number;          // trails + camps + POIs combined
  recommendedVehicle: string | null;
  topCaution: string | null;
  /**
   * Counts of spots from the supabase spots table whose lat/lng fall inside
   * `bounds`, grouped by kind. `undefined` until the count query completes.
   */
  spotBreakdown?: {
    dispersed: number;
    informal: number;
    established: number;
    total: number;
  };
  /**
   * Hero image for the region (Wikipedia → Commons → RIDB → Static Map).
   *  - undefined → not yet looked up
   *  - string    → resolved image URL
   *  - null      → looked up, no usable image (only possible if Static Maps
   *                key is missing — otherwise it's the guaranteed fallback)
   */
  imageUrl?: string | null;
  /**
   * Wikipedia lead-paragraph extract for the region. Same lookup pass as
   * imageUrl. When present, takes priority over the surprise-me explanation
   * because it's real editorial copy. Tri-state same as imageUrl.
   */
  extract?: string | null;
  /**
   * Reverse-geocoded "City, ST" label for the region center. Tri-state same
   * as imageUrl: undefined = not yet looked up, string = resolved, null = no usable result.
   */
  place?: string | null;
  /** Verbatim payload bits LocationDetail's SurpriseMeBanner expects. */
  cautions: string[];
  anchor?: {
    road: { name: string | null; ref: string | null; surface: string; highway: string };
    center: { lat: number; lng: number };
    lengthMiles: number;
  };
  /**
   * Flat list of named highlights for display, drawn from
   * `response.highlights` (topTrails / campsites / pointsOfInterest / photoSpots)
   * AND `response.anchorHighlights`. Anchor highlights without a name are
   * excluded; remaining entries are deduped by lowercase name.
   */
  highlights?: Array<{
    name: string;
    type: 'trail' | 'camp' | 'poi' | 'photo' | 'viewpoint' | 'water';
  }>;
  /** Original anchor highlights — kept verbatim for /location passthrough. */
  anchorHighlights?: Array<{
    type: 'viewpoint' | 'trail' | 'water' | 'camp';
    name: string | null;
    lat: number;
    lon: number;
    distanceMiles: number;
  }>;
  /**
   * AI-generated description from the enrich-region edge function.
   * Tri-state: undefined = not yet looked up, string = resolved, null = the
   * model declined (obscure region).
   */
  aiDescription?: string | null;
  /**
   * AI-generated highlights with short blurbs. Empty array means the model
   * declined; undefined means not yet looked up.
   */
  aiHighlights?: Array<{ name: string; blurb: string }>;
}

interface RegionEnrichment {
  imageUrl: string | null;
  extract: string | null;
}

/**
 * Look up a region's hero image and editorial description in one pass.
 * Image source stack (no single source covers everything):
 *   1. Wikipedia article match (famous parks / named regions)
 *   2. Wikimedia Commons GEOSEARCH at the region center (CC-licensed
 *      photos near the coords — often NPS / USFS / BLM photographers)
 *   3. Recreation.gov RIDB (rec areas + facilities at those coords)
 *   4. Google Static Maps satellite — guaranteed-something fallback
 *
 * Extract: only Wikipedia provides one. When Wikipedia hits, we keep its
 * `extract` (the lead-paragraph summary), regardless of which image source
 * eventually wins. Component falls back to the surprise-me `explanation`
 * when no extract is available.
 */
async function fetchRegionEnrichment(name: string, lat: number, lng: number): Promise<RegionEnrichment> {
  const wiki = await fetchWikipediaSummary(name, { lat, lng });
  const imageUrl =
    wiki.image ??
    (await fetchCommonsImageNearby(lat, lng)) ??
    (await fetchRecreationGovImage(lat, lng)) ??
    fetchStaticMapImage(lat, lng);
  return { imageUrl, extract: wiki.extract };
}

/**
 * Search Wikimedia Commons for media taken near the given coordinates and
 * return the URL of the first usable image.
 *  - geosearch returns up to 10 file titles within 10 km
 *  - imageinfo resolves them to URLs (we ask for an 800px thumb when the
 *    original is bigger, otherwise the full original is returned)
 *  - skips obvious non-photo file types (svg, gif, webm, ogv, pdf)
 */
async function fetchCommonsImageNearby(lat: number, lng: number): Promise<string | null> {
  try {
    const geoRes = await fetch(
      'https://commons.wikimedia.org/w/api.php?' +
        new URLSearchParams({
          action: 'query',
          list: 'geosearch',
          gscoord: `${lat}|${lng}`,
          gsradius: '10000', // 10 km is the API max
          gsnamespace: '6',  // File: namespace
          gslimit: '10',
          format: 'json',
          origin: '*',
        }).toString(),
    );
    if (!geoRes.ok) return null;
    const geoData = await geoRes.json();
    const candidates: Array<{ title: string }> = geoData.query?.geosearch || [];
    if (candidates.length === 0) return null;

    // Filter to actual ground-level photographs:
    //  - require .jpg/.jpeg extension (PNGs at this scale are usually diagrams,
    //    distribution maps, charts, signs, etc.)
    //  - exclude titles that strongly imply non-photo or wrong-subject content
    const NON_PHOTO_WORDS =
      /\b(map|diagram|chart|distribution|illustration|graph|plot|sign|seal|logo|cover|poster|infographic|banner|drawing|coat[\s_-]?of[\s_-]?arms|portrait|flag)\b/i;
    // Files taken from orbit / aircraft are geo-tagged at the lat/lng the
    // camera was pointing at, so geosearch surfaces them as "nearby" even
    // though they show a continent, not the forest. Hard-exclude these.
    const ORBITAL_OR_AERIAL =
      /\b(iss\d+|astronaut|space[\s_-]?station|view[\s_-]?of[\s_-]?earth|from[\s_-]?orbit|landsat|sentinel|modis|nasa-|aerial[\s_-]?(view|photo)|satellite[\s_-]?image|earth[\s_-]?observation)\b/i;
    const titles = candidates
      .map((c) => c.title)
      .filter((t) => /\.jpe?g$/i.test(t) && !NON_PHOTO_WORDS.test(t) && !ORBITAL_OR_AERIAL.test(t))
      .slice(0, 5)
      .join('|');
    if (!titles) return null;

    const infoRes = await fetch(
      'https://commons.wikimedia.org/w/api.php?' +
        new URLSearchParams({
          action: 'query',
          titles,
          prop: 'imageinfo',
          iiprop: 'url',
          iiurlwidth: '1200',
          format: 'json',
          origin: '*',
        }).toString(),
    );
    if (!infoRes.ok) return null;
    const infoData = await infoRes.json();
    const pages = infoData.query?.pages;
    if (!pages) return null;
    for (const page of Object.values(pages) as Array<{ imageinfo?: Array<{ url?: string; thumburl?: string }> }>) {
      const info = page.imageinfo?.[0];
      const url = info?.thumburl ?? info?.url;
      if (url) return url;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Final fallback — a Google Static Maps satellite image at the region center.
 * Not a "photo" but always renders something visual instead of a gradient.
 */
function fetchStaticMapImage(lat: number, lng: number): string | null {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: '10',
    size: '800x600',
    scale: '2',
    maptype: 'hybrid',
    key,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/**
 * Look up the Wikipedia page summary for a region.
 * Returns both the lead image and the extract (~1-3 sentence editorial
 * summary). Either field can be null if the page doesn't have it.
 *  1. Direct title match against /api/rest_v1/page/summary/{name}.
 *  2. opensearch fallback for a fuzzy title match.
 */
/** Haversine distance in km between two lat/lng points. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const MAX_WIKI_DISTANCE_KM = 200; // Article's coords must be within 200 km of the region center.

/**
 * Pull the core place name out of a SurpriseMe region label, e.g.
 *   "NW Oregon Marys Peak BLM" → "Marys Peak"
 *   "Sawtooth NRA"             → "Sawtooth"
 *   "Eastern Sierra Wilderness" → "Sierra"
 *
 * Strips agency tokens (BLM, USFS, NPS, NF, NRA, NM, NWR, WSA, WMA),
 * generic land-class suffixes (National Forest / Park / Monument, State Park,
 * Wilderness, Recreation Area, Conservation Area), and leading directional
 * + state-name modifiers. Returns the trimmed core, or the original name
 * if everything was stripped.
 */
function coreRegionName(name: string): string {
  let core = name;
  // Drop agency acronyms anywhere in the string.
  core = core.replace(/\b(BLM|USFS|NPS|NF|NRA|NM|USFWS|NWR|WSA|WMA)\b/gi, ' ');
  // Drop common land-class phrases.
  core = core.replace(
    /\b(national\s+(?:forest|park|monument|recreation\s+area|conservation\s+area|wildlife\s+refuge)|state\s+(?:park|forest|wildlife\s+area)|wilderness(?:\s+area)?|recreation\s+area|conservation\s+area|public\s+land)\b/gi,
    ' ',
  );
  // Drop leading directional / regional modifiers.
  core = core.replace(
    /^\s*(?:north|south|east|west|northern|southern|eastern|western|central|n|s|e|w|nw|ne|sw|se)\s+/i,
    '',
  );
  // Drop a leading US-state name (only the western states our DB tends to surface).
  core = core.replace(
    /^\s*(?:oregon|washington|california|nevada|utah|idaho|montana|wyoming|colorado|arizona|new mexico|alaska|texas|kansas|nebraska)\s+/i,
    '',
  );
  core = core.replace(/\s+/g, ' ').trim();
  return core || name;
}

// Geosearch sometimes returns urban POIs that happen to sit near a region's
// coords (shopping centers, hospitals, schools, hotels, etc). Reject anything
// whose title or extract reads like a business / building / built environment.
const URBAN_OR_BUILT =
  /\b(mixed[\s-]?use|shopping[\s-]?(center|centre|mall)|retail|office[\s-]?(space|park|building|complex|tower)|residential[\s-]?(community|complex|development|tower)|condominium|apartment|hotel|motel|casino|terminal|stadium|arena|hospital|medical[\s-]?center|clinic|elementary[\s-]?school|middle[\s-]?school|high[\s-]?school|college|university|campus|church|temple|synagogue|mosque|cemetery|courthouse|city[\s-]?hall|town[\s-]?hall|prison|jail|nightclub|warehouse|refinery|power[\s-]?plant|substation|highway[\s-]?interchange|housing[\s-]?(development|tract)|subdivision|gated[\s-]?community|business[\s-]?park|industrial[\s-]?park|owned[\s-]?by|developer|incorporated|inc\.|llc\.?|corporation|historic[\s-]home|historic[\s-]house|weatherboard(ed)?|frame[\s-]house|farmhouse|plantation[\s-]house|listed[\s-]on[\s-]the[\s-]national[\s-]register|national[\s-]register[\s-]of[\s-]historic[\s-]places)\b/i;

// Titles that are clearly built-environment / civic — used for cheap
// pre-filtering before we even fetch the article summary. Tighter than the
// extract regex because titles are short and shouldn't match descriptive prose.
// Includes "House" because historic-home Wikipedia articles ("Hendrix House",
// "Smith House") are geosearch landmines on rural-region coords.
const URBAN_OR_BUILT_TITLE =
  /\b(mall|plaza|hospital|elementary|middle\s+school|high\s+school|hotel|motel|casino|stadium|arena|nightclub|cemetery|courthouse|warehouse|substation|interchange|housing|subdivision|house|residence|mansion|farmhouse|plantation|estate|chapel|meeting\s+house)\b/i;

async function fetchWikipediaSummary(
  name: string,
  near?: { lat: number; lng: number },
): Promise<{ image: string | null; extract: string | null }> {
  const summaryFor = async (title: string): Promise<{ image: string | null; extract: string | null }> => {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      );
      if (!res.ok) return { image: null, extract: null };
      const data = await res.json();
      if (data.type === 'disambiguation') return { image: null, extract: null };
      // Require the article to be about an actual place. Wikipedia attaches
      // `coordinates` only to geographic articles, so its absence rules out
      // people / brands / fictional things matched by opensearch fuzzy lookup.
      const coords = data.coordinates;
      if (!coords || typeof coords.lat !== 'number' || typeof coords.lon !== 'number') {
        return { image: null, extract: null };
      }
      // Geographic sanity check — reject articles whose coords are far from
      // the SurpriseMe region. Catches name collisions across continents
      // (e.g. "Wells BLM" matching Wells, Somerset; "Lincoln" matching the
      // English city; "Newcastle" matching Newcastle upon Tyne).
      if (near && distanceKm({ lat: coords.lat, lng: coords.lon }, near) > MAX_WIKI_DISTANCE_KM) {
        return { image: null, extract: null };
      }
      const extractRaw = typeof data.extract === 'string' ? data.extract : null;
      // Reject articles that read like a business / building / civic facility.
      // Catches "Tivoli Village is a mixed-use development...", "owned by ...",
      // "elementary school", etc. that geosearch surfaces near urban regions.
      const titleStr = typeof data.title === 'string' ? data.title : title;
      if (URBAN_OR_BUILT_TITLE.test(titleStr)) {
        return { image: null, extract: null };
      }
      if (extractRaw && URBAN_OR_BUILT.test(extractRaw)) {
        return { image: null, extract: null };
      }
      const original = data.originalimage?.source;
      const thumb = data.thumbnail?.source;
      const image =
        typeof original === 'string' ? original : typeof thumb === 'string' ? thumb : null;
      return { image, extract: extractRaw };
    } catch {
      return { image: null, extract: null };
    }
  };

  // 1. Direct title with the verbatim region name. Hits big famous places
  //    where the SurpriseMe name already matches the article title
  //    ("Sawtooth National Recreation Area", "Olympic National Park").
  const direct = await summaryFor(name);
  if (direct.image || direct.extract) return direct;

  // 2. Direct title with the cleaned core name — strips directional / state /
  //    agency junk, often surfacing the right article ("NW Oregon Marys Peak
  //    BLM" → "Marys Peak").
  const core = coreRegionName(name);
  if (core && core.toLowerCase() !== name.toLowerCase()) {
    const cleaned = await summaryFor(core);
    if (cleaned.image || cleaned.extract) return cleaned;
  }

  // 3. Wikipedia geosearch — find articles near the region's coords. Far more
  //    reliable than opensearch for ambiguous names ("Wells", "Cody", "Lincoln"),
  //    since we're searching by location instead of fuzzy title matching.
  if (near) {
    try {
      const res = await fetch(
        'https://en.wikipedia.org/w/api.php?' +
          new URLSearchParams({
            action: 'query',
            list: 'geosearch',
            gscoord: `${near.lat}|${near.lng}`,
            gsradius: '10000', // 10 km is the API max
            gslimit: '5',
            format: 'json',
            origin: '*',
          }).toString(),
      );
      if (!res.ok) return { image: null, extract: null };
      const data = await res.json();
      const candidates: Array<{ title: string }> = data.query?.geosearch || [];
      // Cheap pre-filter — drop obviously-built-environment titles before we
      // pay the per-article summary fetch.
      const filtered = candidates.filter((c) => !URBAN_OR_BUILT_TITLE.test(c.title));
      for (const c of filtered) {
        const summary = await summaryFor(c.title);
        if (summary.image || summary.extract) return summary;
      }
    } catch {
      // fall through
    }
  }

  return { image: null, extract: null };
}

// Bump the version any time the lookup chain or slim shape changes so older
// sessions don't keep showing a stale (or stale-null-image) cached entry.
const FEATURED_REGION_KEY = 'home-featured-region-v11';

// Biome → gradient palette so the card backdrop hints at the terrain
// without needing a real photo.
const BIOME_GRADIENTS: Record<BiomeType, string> = {
  desert:    'from-[#c08a5a] via-[#8a5a3a] to-[#3d2a1d]',
  alpine:    'from-[#7d8a83] via-[#4f5b54] to-[#2c3530]',
  forest:    'from-[#6b8456] via-[#445c3a] to-[#243018]',
  coastal:   'from-[#8aa3a8] via-[#5b7780] to-[#2d3f47]',
  grassland: 'from-[#c5b88a] via-[#8a7e54] to-[#3f3a22]',
};

const BIOME_LABELS: Record<BiomeType, string> = {
  desert: 'Desert', alpine: 'Alpine', forest: 'Forest',
  coastal: 'Coastal', grassland: 'Grassland',
};

// Distance-bucket presets for the region shuffle pills. Only rendered when
// the user's current location is known so the buckets actually mean something.
type DistanceBucket = 'close' | 'farther' | 'big';
const DISTANCE_BUCKETS: Record<DistanceBucket, { min: number; max: number; label: string }> = {
  close:   { min: 0,   max: 120,  label: 'Close to me' },
  farther: { min: 120, max: 400,  label: 'A little farther' },
  big:     { min: 400, max: 1500, label: 'Big adventure' },
};

/**
 * Look up a hero image from Recreation.gov via the existing /api/ridb proxy.
 * Tries `recareas` first (broad — Sawtooth NRA, Canyonlands, etc.), then
 * `facilities` (campgrounds, day-use areas) as a fallback. Returns the URL
 * of the first MEDIA item flagged as an Image, or null.
 *
 * The RIDB list endpoint sometimes returns MEDIA inline; sometimes a follow-up
 * to `/{id}/media` is required. We try both.
 */
async function fetchRecreationGovImage(lat: number, lng: number): Promise<string | null> {
  const tryEndpoint = async (endpoint: 'recareas' | 'facilities'): Promise<string | null> => {
    try {
      const listRes = await fetch(
        `/api/ridb/${endpoint}?latitude=${lat}&longitude=${lng}&radius=25&limit=10`,
      );
      if (!listRes.ok) return null;
      const listData = await listRes.json();
      type RIDBItem = {
        RecAreaID?: number;
        FacilityID?: string | number;
        MEDIA?: Array<{ URL?: string; MediaType?: string }>;
      };
      const items: RIDBItem[] = listData.RECDATA || [];
      if (items.length === 0) return null;

      // Some responses include MEDIA inline.
      for (const item of items) {
        const inline = item.MEDIA?.find((m) => m.MediaType === 'Image' && m.URL);
        if (inline?.URL) return inline.URL;
      }

      // Otherwise fetch /{id}/media for the first item.
      const first = items[0];
      const id = first.RecAreaID ?? first.FacilityID;
      if (id == null) return null;
      const mediaRes = await fetch(`/api/ridb/${endpoint}/${id}/media`);
      if (!mediaRes.ok) return null;
      const mediaData = await mediaRes.json();
      const mediaItems: Array<{ URL?: string; MediaType?: string }> =
        mediaData.RECDATA || [];
      const img = mediaItems.find((m) => m.MediaType === 'Image' && m.URL);
      return img?.URL ?? null;
    } catch {
      return null;
    }
  };

  return (await tryEndpoint('recareas')) ?? (await tryEndpoint('facilities'));
}

// Phosphor MapPin (fill) rendered as a data URI marker. Clay fill with a
// cream outline so it stays readable against varied satellite imagery.
const FEATURED_PIN_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
    <path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,112a24,24,0,1,1,24-24A24,24,0,0,1,128,128Z"
      fill="#A86A3C" stroke="#FAF6EA" stroke-width="12" stroke-linejoin="round"/>
  </svg>`,
)}`;

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { savedTrips, loadSavedTrip } = useTrip();
  const { addLocation, removeLocation, locations: savedLocations } = useSavedLocations();

  const [surpriseMeOpen, setSurpriseMeOpen] = useState(false);
  const [bestHikesOpen, setBestHikesOpen] = useState(false);
  const [sunsetOpen, setSunsetOpen] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [campsLocationOpen, setCampsLocationOpen] = useState(false);
  const [campsManualLocation, setCampsManualLocation] = useState<SelectedLocation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Conditions widget location — geolocation result, populated async after mount.
  // Declared up here because the featured-region effect also reads it to scope
  // distance-bucket queries to the user's actual location.
  const [conditionsLocation, setConditionsLocation] = useState<UserLocation | null>(null);
  useEffect(() => {
    getUserLocation().then(setConditionsLocation).catch(() => {});
  }, []);

  // Featured spot tile — random known/community dispersed site shown in the
  // hero. Cached in sessionStorage so the pick is stable across re-renders
  // (and pageviews within a session) but rotates between sessions.
  const [featuredSpot, setFeaturedSpot] = useState<FeaturedSpot | null>(null);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [copiedRegionCoords, setCopiedRegionCoords] = useState(false);
  const { isLoaded: googleMapsLoaded } = useGoogleMaps();

  // Reverse-geocode the spot once Maps is loaded. Updates the cached spot in
  // sessionStorage so the place label rides along on subsequent renders.
  useEffect(() => {
    if (!featuredSpot || featuredSpot.place !== undefined) return;
    if (!googleMapsLoaded || !window.google?.maps?.Geocoder) return;

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat: featuredSpot.lat, lng: featuredSpot.lng } },
      (results, status) => {
        if (status !== 'OK' || !results) return;
        let city: string | null = null;
        let state: string | null = null;
        for (const r of results) {
          for (const c of r.address_components) {
            if (c.types.includes('locality') && !city) city = c.long_name;
            if (c.types.includes('administrative_area_level_1') && !state) state = c.short_name;
          }
          if (city && state) break;
        }
        const place = city && state ? `${city}, ${state}` : state ?? null;
        const next = { ...featuredSpot, place };
        setFeaturedSpot(next);
        sessionStorage.setItem(FEATURED_SPOT_KEY, JSON.stringify(next));
      },
    );
  }, [featuredSpot, googleMapsLoaded]);

  useEffect(() => {
    const cached = sessionStorage.getItem(FEATURED_SPOT_KEY);
    if (cached) {
      try {
        setFeaturedSpot(JSON.parse(cached));
        return;
      } catch {
        // fall through to refetch
      }
    }

    let cancelled = false;
    (async () => {
      // Pull a batch of community-source dispersed spots, then pick one client-side.
      // Filtering for non-null name + manager keeps the random pick presentable.
      const { data, error } = await supabase
        .from('spots')
        .select('id, name, latitude, longitude, public_land_manager')
        .eq('kind', 'dispersed_camping')
        .eq('source', 'community')
        .not('name', 'is', null)
        .not('public_land_manager', 'is', null)
        .limit(100);
      if (cancelled || error || !data || data.length === 0) return;
      const pick = data[Math.floor(Math.random() * data.length)];
      const spot: FeaturedSpot = {
        id: pick.id,
        name: pick.name,
        lat: typeof pick.latitude === 'number' ? pick.latitude : parseFloat(pick.latitude as string),
        lng: typeof pick.longitude === 'number' ? pick.longitude : parseFloat(pick.longitude as string),
        manager: pick.public_land_manager,
      };
      sessionStorage.setItem(FEATURED_SPOT_KEY, JSON.stringify(spot));
      setFeaturedSpot(spot);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyFeaturedCoords = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!featuredSpot) return;
    navigator.clipboard.writeText(`${featuredSpot.lat.toFixed(5)}, ${featuredSpot.lng.toFixed(5)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  // Featured region (Band 2) — pulled from the Surprise Me edge function.
  // Cached in sessionStorage so it stays stable mid-session, rotates between sessions.
  const [featuredRegion, setFeaturedRegion] = useState<FeaturedRegion | null>(null);
  const [regionBucket, setRegionBucket] = useState<DistanceBucket | null>(null);
  // Subscribe to the hook's progressive `result` state — anchor highlights
  // arrive via a background enrichment pass that completes AFTER getSurprise()
  // resolves, so we have to watch this rather than just using the awaited value.
  const { getSurprise, result: surpriseResult } = useSurpriseMe();

  // Per-bucket cache key — switching buckets shouldn't rehydrate the previous bucket's region.
  const regionCacheKey = (bucket: DistanceBucket | null) =>
    bucket ? `${FEATURED_REGION_KEY}:${bucket}` : FEATURED_REGION_KEY;

  useEffect(() => {
    const cacheKey = regionCacheKey(regionBucket);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        setFeaturedRegion(JSON.parse(cached));
        return;
      } catch {
        // fall through
      }
    }

    // For the default "anywhere" view, fall back to US-center fetch even if
    // we don't have the user's location. For specific buckets, we need the
    // user's lat/lng to compute distance, so wait until it's resolved.
    if (regionBucket && !conditionsLocation) return;

    let cancelled = false;
    setFeaturedRegion(null);
    (async () => {
      try {
        const origin = conditionsLocation
          ? { lat: conditionsLocation.lat, lng: conditionsLocation.lng }
          : { lat: 39.83, lng: -98.58 }; // US center for "anywhere" mode
        const bucket = regionBucket ? DISTANCE_BUCKETS[regionBucket] : null;
        const opts = bucket
          ? { minDistanceMiles: bucket.min, maxDistanceMiles: bucket.max }
          : { maxDistanceMiles: 2000 };
        const response = await getSurprise(origin.lat, origin.lng, opts);
        if (cancelled) return;
        if (!response.success) {
          console.warn('[Featured region] surprise-me returned error:', response.error, response.message);
          return;
        }
        console.log('[Featured region] response received:', response);
        const r = response.region;
        const h = response.highlights;
        const slim: FeaturedRegion = {
          id: r.id,
          name: r.name,
          tagline: r.tagline ?? null,
          explanation: response.explanation,
          primaryBiome: r.primaryBiome,
          distanceMiles: r.distanceMiles,
          driveTimeHours: r.driveTimeHours ?? null,
          center: r.center,
          bounds: r.bounds,
          // Highlights may not exist on every response shape; default each bucket to 0.
          highlightCount:
            (h?.topTrails?.length ?? 0) +
            (h?.campsites?.length ?? 0) +
            (h?.pointsOfInterest?.length ?? 0),
          recommendedVehicle: response.access?.recommendedVehicle ?? null,
          topCaution: response.cautions?.[0] ?? null,
          cautions: response.cautions ?? [],
          anchor: response.anchor
            ? {
                road: response.anchor.road,
                center: response.anchor.center,
                lengthMiles: response.anchor.lengthMiles,
              }
            : undefined,
          // Build the display highlights from every available source. Anchor
          // highlights are often unnamed (just OSM points); region highlights
          // (topTrails / campsites / POIs / photo spots) almost always have
          // names. Combine, drop unnamed, dedupe by lowercase name.
          highlights: (() => {
            type Item = NonNullable<FeaturedRegion['highlights']>[number];
            const items: Item[] = [];
            for (const t of h?.topTrails ?? []) if (t.name) items.push({ name: t.name, type: 'trail' });
            for (const c of h?.campsites ?? []) if (c.name) items.push({ name: c.name, type: 'camp' });
            for (const p of h?.pointsOfInterest ?? []) if (p.name) items.push({ name: p.name, type: 'poi' });
            for (const p of h?.photoSpots ?? []) if (p.name) items.push({ name: p.name, type: 'photo' });
            for (const a of response.anchorHighlights ?? []) {
              if (a.name) items.push({ name: a.name, type: a.type });
            }
            const seen = new Set<string>();
            return items.filter((x) => {
              const k = x.name.toLowerCase();
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          })(),
          anchorHighlights: response.anchorHighlights?.map((x) => ({
            type: x.type,
            name: x.name,
            lat: x.lat,
            lon: x.lon,
            distanceMiles: x.distanceMiles,
          })),
        };
        console.log('[Featured region] setting state:', slim);
        sessionStorage.setItem(cacheKey, JSON.stringify(slim));
        setFeaturedRegion(slim);
      } catch (err) {
        console.error('[Featured region] failed to build slim:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionBucket, conditionsLocation]);

  // Enrichment pass — fetch hero image + Wikipedia extract for the region in
  // a single sweep through Wikipedia, Commons, RIDB, and Static Maps fallback.
  // Skips entirely if both fields have been resolved already this session.
  useEffect(() => {
    if (!featuredRegion) return;
    if (featuredRegion.imageUrl !== undefined && featuredRegion.extract !== undefined) return;

    let cancelled = false;
    (async () => {
      const enrichment = await fetchRegionEnrichment(
        cleanRegionName(featuredRegion.name),
        featuredRegion.center.lat,
        featuredRegion.center.lng,
      );
      if (cancelled) return;
      const next = {
        ...featuredRegion,
        imageUrl: enrichment.imageUrl,
        extract: enrichment.extract,
      };
      sessionStorage.setItem(regionCacheKey(regionBucket), JSON.stringify(next));
      setFeaturedRegion(next);
      console.log(
        '[Featured region] enrichment:',
        enrichment.imageUrl ? 'image-hit' : 'image-miss',
        enrichment.extract ? 'extract-hit' : 'extract-miss',
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [featuredRegion]);

  // AI enrichment — calls the enrich-region edge function for a Claude-generated
  // description + named highlights. Server-side cache means most calls return
  // instantly from the region_ai_enrichments table; only the first user to see
  // a given region pays the model latency.
  useEffect(() => {
    if (!featuredRegion) return;
    if (featuredRegion.aiDescription !== undefined && featuredRegion.aiHighlights !== undefined) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          description: string | null;
          highlights: Array<{ name: string; blurb: string }>;
          cached?: boolean;
        }>('enrich-region', { body: { regionId: featuredRegion.id } });
        if (cancelled) return;
        if (error || !data) {
          console.warn('[Featured region] AI enrichment failed:', error);
          // Mark as resolved-with-nothing so we don't retry every render.
          const next = { ...featuredRegion, aiDescription: null, aiHighlights: [] };
          sessionStorage.setItem(regionCacheKey(regionBucket), JSON.stringify(next));
          setFeaturedRegion(next);
          return;
        }
        const next = {
          ...featuredRegion,
          aiDescription: data.description,
          aiHighlights: data.highlights ?? [],
        };
        sessionStorage.setItem(regionCacheKey(regionBucket), JSON.stringify(next));
        setFeaturedRegion(next);
        console.log(
          '[Featured region] AI:',
          data.cached ? 'cache-hit' : 'cache-miss',
          data.description ? 'desc-hit' : 'desc-miss',
          `${data.highlights?.length ?? 0} highlights`,
        );
      } catch (err) {
        console.error('[Featured region] AI enrichment threw:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [featuredRegion, regionBucket]);

  // Spot-kind breakdown — count rows in `spots` whose lat/lng falls inside
  // the region's bounding box, grouped by camping kind. We run three small
  // count queries in parallel (Postgres returns just the row count via
  // `head: true`, so no payload is fetched). Cached on the region object.
  useEffect(() => {
    if (!featuredRegion) return;
    if (featuredRegion.spotBreakdown !== undefined) return;
    if (!featuredRegion.bounds) return;

    let cancelled = false;
    (async () => {
      const { north, south, east, west } = featuredRegion.bounds;
      const countFor = async (kind: string): Promise<number> => {
        const { count } = await supabase
          .from('spots')
          .select('id', { count: 'exact', head: true })
          .eq('kind', kind)
          .gte('latitude', south)
          .lte('latitude', north)
          .gte('longitude', west)
          .lte('longitude', east);
        return count ?? 0;
      };
      const [dispersed, informal, established] = await Promise.all([
        countFor('dispersed_camping'),
        countFor('informal_camping'),
        countFor('established_campground'),
      ]);
      if (cancelled) return;
      const breakdown = {
        dispersed,
        informal,
        established,
        total: dispersed + informal + established,
      };
      const next = { ...featuredRegion, spotBreakdown: breakdown };
      sessionStorage.setItem(regionCacheKey(regionBucket), JSON.stringify(next));
      setFeaturedRegion(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [featuredRegion, regionBucket]);

  // Anchor highlights arrive ~hundreds of ms after the initial getSurprise
  // resolves (background enrichment in the hook). Merge them into the cached
  // region the moment they show up, but only when they belong to the SAME
  // region we're currently displaying (the user could have switched buckets).
  useEffect(() => {
    if (!featuredRegion) return;
    if (!surpriseResult || !surpriseResult.anchorHighlights) return;
    if (surpriseResult.region.id !== featuredRegion.id) return;

    const named = surpriseResult.anchorHighlights.filter((a) => !!a.name);
    if (named.length === 0) return;

    const existing = featuredRegion.highlights ?? [];
    const seen = new Set(existing.map((x) => x.name.toLowerCase()));
    const additions = named
      .filter((a) => a.name && !seen.has(a.name.toLowerCase()))
      .map((a) => ({ name: a.name as string, type: a.type }));
    if (additions.length === 0) return;

    const next = {
      ...featuredRegion,
      highlights: [...existing, ...additions],
      anchorHighlights: surpriseResult.anchorHighlights.map((x) => ({
        type: x.type,
        name: x.name,
        lat: x.lat,
        lon: x.lon,
        distanceMiles: x.distanceMiles,
      })),
    };
    sessionStorage.setItem(regionCacheKey(regionBucket), JSON.stringify(next));
    setFeaturedRegion(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surpriseResult, featuredRegion?.id]);

  // Reverse-geocode the region center to a "City, ST" label, same shape as
  // the featured-spot effect above. Persisted on the region object so it
  // hydrates from sessionStorage on subsequent renders.
  useEffect(() => {
    if (!featuredRegion || featuredRegion.place !== undefined) return;
    if (!googleMapsLoaded || !window.google?.maps?.Geocoder) return;

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat: featuredRegion.center.lat, lng: featuredRegion.center.lng } },
      (results, status) => {
        let place: string | null = null;
        if (status === 'OK' && results) {
          let city: string | null = null;
          let state: string | null = null;
          for (const r of results) {
            for (const c of r.address_components) {
              if (c.types.includes('locality') && !city) city = c.long_name;
              if (c.types.includes('administrative_area_level_1') && !state) state = c.short_name;
            }
            if (city && state) break;
          }
          place = city && state ? `${city}, ${state}` : state ?? null;
        }
        const next = { ...featuredRegion, place };
        setFeaturedRegion(next);
        sessionStorage.setItem(regionCacheKey(regionBucket), JSON.stringify(next));
      },
    );
  }, [featuredRegion, googleMapsLoaded, regionBucket]);

  // Band 3 — real spots near the user (or randomized when no location). One
  // batch query joins spot_images for the NAIP chip so we don't fan out a
  // hook-per-card. Defaults to 'near' once we have conditionsLocation; if it
  // never resolves (geo blocked) we silently use 'random' and hide the toggle.
  const [nearbySpots, setNearbySpots] = useState<NearbySpot[] | null>(null);
  const [nearbyBucket, setNearbyBucket] = useState<NearbyBucket>('near');
  useEffect(() => {
    let cancelled = false;
    const effectiveBucket: NearbyBucket =
      nearbyBucket === 'near' && !conditionsLocation ? 'random' : nearbyBucket;

    (async () => {
      // Tighten the SELECT to spots near the user (when 'near' + we have coords).
      // Without PostGIS bbox filters we'd be paginating the whole table — this
      // pulls a ~150-mile bounding window so the client-side haversine sort
      // operates on a reasonable subset.
      let query = supabase
        .from('spots')
        .select(
          'id, name, description, latitude, longitude, kind, source, public_land_manager, ' +
            'spot_images!left(storage_url, source)',
        )
        .in('kind', ['dispersed_camping', 'informal_camping'])
        .not('name', 'is', null);

      if (effectiveBucket === 'near' && conditionsLocation) {
        const latPad = 2.2;          // ~150 miles N/S
        const lngPad = 2.6;          // ~150 miles E/W at mid-latitudes
        query = query
          .gte('latitude', conditionsLocation.lat - latPad)
          .lte('latitude', conditionsLocation.lat + latPad)
          .gte('longitude', conditionsLocation.lng - lngPad)
          .lte('longitude', conditionsLocation.lng + lngPad)
          .limit(80);
      } else {
        // Random mode: pull a wider pool, pick 4 client-side.
        query = query.limit(200);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (error || !data) {
        console.warn('[Near you] spots fetch failed:', error);
        setNearbySpots([]);
        return;
      }

      type Row = {
        id: string;
        name: string;
        description: string | null;
        latitude: number | string;
        longitude: number | string;
        kind: string;
        source: string;
        public_land_manager: string | null;
        spot_images?: Array<{ storage_url: string; source: string | null }>;
      };
      const rows = data as unknown as Row[];

      const mapped: NearbySpot[] = rows.map((r) => {
        const lat = typeof r.latitude === 'string' ? parseFloat(r.latitude) : r.latitude;
        const lng = typeof r.longitude === 'string' ? parseFloat(r.longitude) : r.longitude;
        const naip = r.spot_images?.find((i) => i.source === 'naip')?.storage_url ?? null;
        const base: NearbySpot = {
          id: r.id,
          name: r.name,
          description: r.description,
          lat,
          lng,
          kind: r.kind,
          source: r.source,
          manager: r.public_land_manager,
          naipUrl: naip,
        };
        if (effectiveBucket === 'near' && conditionsLocation) {
          base.distanceMiles = distanceMiles(
            { lat: conditionsLocation.lat, lng: conditionsLocation.lng },
            { lat, lng },
          );
        }
        return base;
      });

      const finalList: NearbySpot[] =
        effectiveBucket === 'near' && conditionsLocation
          ? // Closest-first, but spots with NAIP imagery win their distance tier
            // so we surface compelling cards when coverage exists nearby.
            (() => {
              const withImage = mapped
                .filter((m) => m.naipUrl)
                .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
              const without = mapped
                .filter((m) => !m.naipUrl)
                .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
              return [...withImage, ...without].slice(0, 4);
            })()
          : (() => {
              // Pick 4 random — preferring rows that have a NAIP image since
              // they make the cards far more compelling.
              const withImage = mapped.filter((m) => m.naipUrl);
              const without = mapped.filter((m) => !m.naipUrl);
              const shuffled = [...withImage, ...without];
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }
              return shuffled.slice(0, 4);
            })();

      setNearbySpots(finalList);

    })();

    return () => {
      cancelled = true;
    };
  }, [nearbyBucket, conditionsLocation]);

  const openFeaturedRegion = () => {
    if (!featuredRegion) return;
    navigate(`/location/${featuredRegion.id}`, {
      state: {
        placeId: `surprise-${featuredRegion.id}`,
        name: featuredRegion.name,
        address: featuredRegion.tagline || `${featuredRegion.primaryBiome} region`,
        lat: featuredRegion.anchor?.center.lat ?? featuredRegion.center.lat,
        lng: featuredRegion.anchor?.center.lng ?? featuredRegion.center.lng,
        surpriseMe: {
          regionId: featuredRegion.id,
          explanation: featuredRegion.explanation,
          distanceMiles: featuredRegion.distanceMiles,
          driveTimeHours: featuredRegion.driveTimeHours ?? undefined,
          biome: featuredRegion.primaryBiome,
          cautions: featuredRegion.cautions,
          anchor: featuredRegion.anchor,
          highlights: featuredRegion.anchorHighlights,
        },
      },
    });
  };

  // Conditions widget weather pull — runs against `conditionsLocation` (declared
  // above so the featured-region effect can also read it).
  const { forecast, loading: weatherLoading } = usePhotoWeather(
    conditionsLocation?.lat ?? 0,
    conditionsLocation?.lng ?? 0,
    0
  );

  const metrics = forecast?.current?.metrics;
  const tempF = metrics?.temperature !== undefined
    ? Math.round(metrics.temperature * 9 / 5 + 32)
    : null;
  const humidity = metrics?.humidity !== undefined ? Math.round(metrics.humidity) : null;
  const windMph = metrics?.windSpeed !== undefined
    ? Math.round(metrics.windSpeed * 2.237)
    : null;
  const windGustMph = metrics?.windGust !== undefined && metrics?.windSpeed !== undefined && metrics.windGust > metrics.windSpeed + 0.5
    ? Math.round(metrics.windGust * 2.237)
    : null;
  const windDir = metrics?.windDirection !== undefined
    ? azimuthToCompass(metrics.windDirection)
    : null;

  const sunTimes = conditionsLocation
    ? getSunTimes(conditionsLocation.lat, conditionsLocation.lng)
    : null;
  let nextSunEvent: { type: 'sunrise' | 'sunset'; time: Date; civil: Date } | null = null;
  if (sunTimes && conditionsLocation) {
    const now = new Date();
    if (now < sunTimes.sunrise) {
      nextSunEvent = { type: 'sunrise', time: sunTimes.sunrise, civil: sunTimes.civilDawn };
    } else if (now < sunTimes.sunset) {
      nextSunEvent = { type: 'sunset', time: sunTimes.sunset, civil: sunTimes.civilDusk };
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tom = getSunTimes(conditionsLocation.lat, conditionsLocation.lng, tomorrow);
      nextSunEvent = { type: 'sunrise', time: tom.sunrise, civil: tom.civilDawn };
    }
  }

  // Strip state/country tail, keep just the city — fits the small-cap header.
  const placeLabel = conditionsLocation?.name?.split(',')[0]?.trim() || null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/dispersed?name=${encodeURIComponent(searchQuery)}`);
  };

  const handleFindCampsNearMe = async () => {
    setIsGettingLocation(true);
    try {
      const loc = await getUserLocation({ enableHighAccuracy: true, maximumAgeMs: 60000 });
      setIsGettingLocation(false);
      const name = loc.name ?? 'My Location';
      navigate(`/dispersed?lat=${loc.lat}&lng=${loc.lng}&name=${encodeURIComponent(name)}`);
    } catch {
      setIsGettingLocation(false);
      setCampsLocationOpen(true);
    }
  };

  const handleCampsManualLocation = () => {
    if (!campsManualLocation) return;
    setCampsLocationOpen(false);
    navigate(`/dispersed?lat=${campsManualLocation.lat}&lng=${campsManualLocation.lng}&name=${encodeURIComponent(campsManualLocation.name)}`);
  };

  const handleTripClick = (tripId: string, tripName: string) => {
    loadSavedTrip(tripId);
    navigate(getTripUrl(tripName));
  };

  // Homepage trip rail: one draft (newest) up front, then upcoming (soonest
  // first). Drafts are easy to abandon, so surfacing one as a "pick this back
  // up" prompt is more valuable than burying them. Cap at 3 total to fit the
  // 3-column grid.
  const sortedTrips = (() => {
    const drafts = savedTrips.filter((t) => !t.config.startDate);
    const upcoming = savedTrips
      .filter((t) => t.config.startDate)
      .sort(
        (a, b) =>
          new Date(a.config.startDate!).getTime() - new Date(b.config.startDate!).getTime(),
      );
    const oneDraft = drafts.slice(0, 1);
    const upcomingFill = upcoming.slice(0, 3 - oneDraft.length);
    return [...oneDraft, ...upcomingFill];
  })();

  return (
    <div className="bg-cream dark:bg-paper text-ink font-sans min-h-screen">
      <Header />

      {/* === BAND 1 — cream hero, split layout. Pulled up under the floating
           header so the cream + topo extend behind the nav (no seam).
           In dark mode flips to paper (the darkest base) so the inner cards
           at paper-2 read as lifted. === */}
      <section className="relative overflow-hidden bg-cream dark:bg-paper -mt-16 md:-mt-20">
        <TopoBg color="hsl(var(--paper-2))" opacity={0.55} scale={700} />

        <div className="relative max-w-[1440px] mx-auto px-6 md:px-14 pt-28 md:pt-40 pb-20 md:pb-28 grid md:grid-cols-[1fr_460px] gap-10 lg:gap-16 items-start">
          {/* LEFT — title + search */}
          <div>
            <div className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-pine-6 bg-pine-6/10 mb-9">
              <span className="w-1.5 h-1.5 rounded-full bg-pine-6 ml-1" />
              <Mono className="text-pine-6">Off-grid camping, on one map</Mono>
            </div>

            <h1 className="font-sans font-bold tracking-[-0.045em] leading-[0.94] text-[64px] md:text-[88px] lg:text-[112px] m-0 text-ink">
              Find a quiet
              <br />
              place to <span className="text-pine-6">roam.</span>
            </h1>

            <p className="text-lg md:text-[19px] leading-[1.55] text-ink-3 max-w-[540px] mt-7">
              Off-grid camping on public land — community spots, dispersed sites, and established
              campgrounds, on one honest map.
            </p>

            {/* Search input */}
            <form
              onSubmit={handleSearch}
              className="mt-10 max-w-[680px] flex items-center gap-3 bg-white dark:bg-paper-2 border border-line dark:border-line-2 rounded-[18px] pl-5 pr-2.5 py-2.5 shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)] focus-within:border-pine-6 transition-colors"
            >
              <MagnifyingGlass size={20} weight="regular" className="text-ink-2 shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search a region — Moab, Olympic Peninsula, Joshua Tree…"
                className="flex-1 border-none outline-none text-base font-sans bg-transparent placeholder:text-ink-3 py-3"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-[14px] border border-pine-6 bg-pine-6 text-cream dark:text-ink-pine text-sm font-semibold hover:bg-pine-5 transition-colors"
              >
                Search
                <ArrowRight size={14} weight="bold" />
              </button>
            </form>

            {/* Quick category pills — light solid surface (matches design's
                ghost variant but opaque so they read on the topo). */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Pill variant="ghost" sm mono={false} className="!bg-white dark:!bg-paper-2 hover:!bg-white dark:hover:!bg-paper-2 !border-line dark:!border-line-2 hover:!border-ink-3" onClick={handleFindCampsNearMe}>
                {isGettingLocation ? <SpinnerGap size={14} className="animate-spin" /> : <Tent size={14} weight="regular" />}
                Camps near me
              </Pill>
              <Pill variant="ghost" sm mono={false} className="!bg-white dark:!bg-paper-2 hover:!bg-white dark:hover:!bg-paper-2 !border-line dark:!border-line-2 hover:!border-ink-3" onClick={() => setBestHikesOpen(true)}>
                <Mountains size={14} weight="regular" />
                Best hikes today
              </Pill>
              <Pill variant="ghost" sm mono={false} className="!bg-white dark:!bg-paper-2 hover:!bg-white dark:hover:!bg-paper-2 !border-line dark:!border-line-2 hover:!border-ink-3" onClick={() => setSurpriseMeOpen(true)}>
                <Shuffle size={14} weight="bold" />
                Surprise me
              </Pill>
              <Pill variant="ghost" sm mono={false} className="!bg-white dark:!bg-paper-2 hover:!bg-white dark:hover:!bg-paper-2 !border-line dark:!border-line-2 hover:!border-ink-3" onClick={() => setSunsetOpen(true)}>
                <SunHorizon size={14} weight="regular" />
                Sunset tonight
              </Pill>
            </div>
          </div>

          {/* RIGHT — featured spot tile (live map) + conditions card */}
          <div className="flex flex-col gap-5">
            {featuredSpot ? (
              <Link
                to={`/dispersed?lat=${featuredSpot.lat}&lng=${featuredSpot.lng}&name=${encodeURIComponent(featuredSpot.name)}`}
                className="group rounded-[18px] overflow-hidden border border-line dark:border-line-2 aspect-[4/3] shadow-[0_18px_40px_rgba(29,34,24,.10)] relative block"
              >
                <GoogleMap
                  center={{ lat: featuredSpot.lat, lng: featuredSpot.lng }}
                  zoom={15}
                  className="w-full h-full"
                  options={{
                    mapTypeId: 'hybrid',
                    // Lock the tile — no controls, no gestures. The whole tile is a
                    // link that opens the spot in /dispersed, so the inline map is
                    // a preview only.
                    gestureHandling: 'none',
                    zoomControl: false,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    rotateControl: false,
                    scaleControl: false,
                    keyboardShortcuts: false,
                    clickableIcons: false,
                  }}
                >
                  <Marker
                    position={{ lat: featuredSpot.lat, lng: featuredSpot.lng }}
                    icon={
                      // typeof google !== 'undefined' is too loose — the namespace
                      // can exist before constructors are ready. Gate on the actual
                      // google.maps.Size constructor + the loaded flag from our provider.
                      googleMapsLoaded && typeof google !== 'undefined' && typeof google.maps?.Size === 'function'
                        ? {
                            url: FEATURED_PIN_SVG,
                            scaledSize: new google.maps.Size(28, 28),
                            anchor: new google.maps.Point(14, 28),
                          }
                        : undefined
                    }
                  />
                </GoogleMap>

                {/* Top-left: featured chip with spot name + place sub-chip below.
                    Light surfaces with dark text read better against busy satellite
                    imagery than dark overlays. bg-white + text-ink-pine stay constant
                    across light/dark modes so the chips look the same on either theme. */}
                <div className="absolute left-3 top-3 max-w-[calc(100%-24px)] flex flex-col items-start gap-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm shadow-[0_2px_6px_rgba(0,0,0,0.18)] max-w-full">
                    <Star className="w-3 h-3 text-clay flex-shrink-0" weight="fill" />
                    <Mono className="text-ink-pine truncate" size={10}>
                      Featured · {featuredSpot.name}
                    </Mono>
                  </div>
                  {featuredSpot.place && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm shadow-[0_2px_6px_rgba(0,0,0,0.18)] max-w-full">
                      <MapPin className="w-3 h-3 text-ink-pine/70 flex-shrink-0" weight="regular" />
                      <Mono className="text-ink-pine/85 truncate" size={10}>
                        {featuredSpot.place}
                      </Mono>
                    </div>
                  )}
                </div>

                {/* Bottom-left: copyable coords pill. The copy button stops propagation
                    so clicking copy doesn't trigger the tile's outer link. */}
                <div className="absolute left-3 bottom-2.5 max-w-[calc(100%-24px)]">
                  <button
                    type="button"
                    onClick={handleCopyFeaturedCoords}
                    title="Copy coordinates"
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/95 backdrop-blur-sm text-ink-pine shadow-[0_2px_6px_rgba(0,0,0,0.18)] hover:bg-white transition-colors"
                  >
                    {copiedCoords ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-pine-6" weight="fill" />
                        <Mono size={10}>Copied</Mono>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" weight="regular" />
                        <Mono size={10}>{featuredSpot.lat.toFixed(4)}, {featuredSpot.lng.toFixed(4)}</Mono>
                      </>
                    )}
                  </button>
                </div>
              </Link>
            ) : (
              <div className="rounded-[18px] overflow-hidden border border-line dark:border-line-2 aspect-[4/3] shadow-[0_18px_40px_rgba(29,34,24,.10)] bg-gradient-to-br from-[#c08a5a] via-[#8a5a3a] to-[#3d2a1d] relative">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 14px, rgba(0,0,0,.06) 14px 28px)',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <SpinnerGap size={20} className="text-white/60 animate-spin" />
                </div>
              </div>
            )}

            <div className="border border-pine-7 dark:border-line-2 rounded-[18px] bg-pine-7 px-6 py-5 shadow-[0_8px_22px_rgba(29,34,24,.10)]">
              <div className="flex justify-between items-baseline mb-4">
                <Mono className="text-cream/70">RIGHT NOW · NEAR YOU</Mono>
                <span className="text-[12px] text-cream/60">
                  {placeLabel ?? (conditionsLocation ? '—' : 'Locating…')}
                </span>
              </div>
              {weatherLoading && !forecast ? (
                <div className="flex items-center gap-2 text-cream/60 py-3">
                  <SpinnerGap size={16} className="animate-spin" />
                  <span className="text-[13px]">Pulling current conditions…</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {/* Temp */}
                  <div>
                    <div className="flex items-center gap-1.5 text-cream/60 mb-1.5">
                      <Sun size={16} weight="regular" />
                      <Mono size={11}>Temp</Mono>
                    </div>
                    <div className="font-sans font-semibold text-[26px] tracking-[-0.02em] text-cream">
                      {tempF !== null ? `${tempF}°` : '—'}
                    </div>
                    <div className="text-[12px] text-cream/60 mt-0.5">
                      {humidity !== null ? `${humidity}% rh` : ' '}
                    </div>
                  </div>
                  {/* Wind */}
                  <div>
                    <div className="flex items-center gap-1.5 text-cream/60 mb-1.5">
                      <Wind size={16} weight="regular" />
                      <Mono size={11}>Wind</Mono>
                    </div>
                    <div className="font-sans font-semibold text-[26px] tracking-[-0.02em] text-cream">
                      {windMph !== null ? `${windMph} mph` : '—'}
                    </div>
                    <div className="text-[12px] text-cream/60 mt-0.5">
                      {windGustMph !== null
                        ? `gusts ${windGustMph}${windDir ? ` · ${windDir}` : ''}`
                        : windDir ?? ' '}
                    </div>
                  </div>
                  {/* Sun */}
                  <div>
                    <div className="flex items-center gap-1.5 text-cream/60 mb-1.5">
                      <SunHorizon size={16} weight="regular" />
                      <Mono size={11}>{nextSunEvent?.type === 'sunrise' ? 'Sunrise' : 'Sunset'}</Mono>
                    </div>
                    <div className="font-sans font-semibold text-[26px] tracking-[-0.02em] text-cream">
                      {nextSunEvent ? formatTime(nextSunEvent.time).replace(/\s?(AM|PM)/i, '') : '—'}
                    </div>
                    <div className="text-[12px] text-cream/60 mt-0.5">
                      {nextSunEvent
                        ? `civil ${formatTime(nextSunEvent.civil).replace(/\s?(AM|PM)/i, '')}`
                        : ' '}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === BAND 2 — paper, featured region (pulled from Surprise Me) === */}
      <section className="bg-paper">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-24">
          <div className="flex flex-wrap gap-4 items-end justify-between mb-10">
            <div className="flex-1 min-w-0 max-w-[900px]">
              <Mono className="text-pine-6">FEATURED · THIS WEEK</Mono>
              <h2 className="font-sans font-bold text-3xl md:text-5xl tracking-[-0.03em] mt-2.5">
                {featuredRegion
                  ? `This week, ${prettyRegionName(cleanRegionName(featuredRegion.name))}.`
                  : 'A region worth roaming.'}
              </h2>
            </div>
            <div className="flex flex-col items-end gap-3">
              {/* Distance-bucket shuffle — only renders when we know the user's
                  current location. Each pill re-fires getSurprise with a different
                  min/max distance window. "All" clears the bucket back to anywhere. */}
              {conditionsLocation && (
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={() => setRegionBucket(null)}
                    className={cn(
                      'inline-flex items-center px-3 py-1.5 rounded-full text-[12px] font-sans font-semibold tracking-[-0.005em] transition-colors',
                      regionBucket === null
                        ? 'bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2'
                        : 'text-ink hover:bg-ink/5',
                    )}
                  >
                    All
                  </button>
                  {(Object.keys(DISTANCE_BUCKETS) as DistanceBucket[]).map((b) => (
                    <button
                      key={b}
                      onClick={() => setRegionBucket(b)}
                      className={cn(
                        'inline-flex items-center px-3 py-1.5 rounded-full text-[12px] font-sans font-semibold tracking-[-0.005em] transition-colors',
                        regionBucket === b
                          ? 'bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2'
                          : 'text-ink hover:bg-ink/5',
                      )}
                    >
                      {DISTANCE_BUCKETS[b].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-[1.4fr_1fr] gap-0 border border-line dark:border-line-2 rounded-[18px] overflow-hidden bg-white dark:bg-paper-2">
            <div className={cn(
              'relative min-h-[380px] bg-gradient-to-br',
              featuredRegion ? BIOME_GRADIENTS[featuredRegion.primaryBiome] : 'from-[#a89779] via-[#7d6e54] to-[#4d4636]',
            )}>
              {/* Wikipedia / RIDB hero image when we found one. Sits on top of
                  the biome gradient (which still shows during fetch + as a fallback).
                  If the URL 404s at runtime, clear it from state + cache so the
                  gradient takes over instead of showing a broken-image icon. */}
              {featuredRegion?.imageUrl && (
                <img
                  src={featuredRegion.imageUrl}
                  alt={featuredRegion.name}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={() => {
                    setFeaturedRegion((prev) => {
                      if (!prev) return prev;
                      const next = { ...prev, imageUrl: null };
                      sessionStorage.setItem(regionCacheKey(regionBucket), JSON.stringify(next));
                      return next;
                    });
                  }}
                />
              )}
              {/* Subtle dark gradient at the bottom so the mono coords + top
                  badge keep contrast against varied photo content. */}
              {featuredRegion?.imageUrl && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25 pointer-events-none" />
              )}
              {/* Diagonal hatch texture — only when there's no image. */}
              {!featuredRegion?.imageUrl && (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 14px, rgba(0,0,0,.06) 14px 28px)',
                  }}
                />
              )}
              {featuredRegion ? (
                <>
                  <div className="absolute left-4 top-4">
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase font-semibold px-2.5 py-1 rounded-full bg-pine-6 text-cream dark:text-ink-pine">
                      {BIOME_LABELS[featuredRegion.primaryBiome]}
                    </span>
                  </div>
                  {featuredRegion.place && (
                    <div className="absolute right-4 top-4">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.14em] uppercase font-semibold px-2.5 py-1 rounded-full bg-cream/90 text-ink backdrop-blur-sm">
                        <MapPin size={11} weight="fill" />
                        {featuredRegion.place}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const coords = `${featuredRegion.center.lat.toFixed(5)}, ${featuredRegion.center.lng.toFixed(5)}`;
                    return (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigator.clipboard.writeText(coords);
                          setCopiedRegionCoords(true);
                          setTimeout(() => setCopiedRegionCoords(false), 2000);
                        }}
                        title="Copy coordinates — paste into Google Maps to open"
                        className="absolute left-4 bottom-3 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.10em] text-white/85 hover:text-white transition-colors"
                      >
                        {copiedRegionCoords ? (
                          <CheckCircle size={13} weight="fill" className="text-pine-6" />
                        ) : (
                          <Copy size={11} weight="regular" />
                        )}
                        {coords}
                      </button>
                    );
                  })()}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <SpinnerGap size={24} className="text-white/60 animate-spin" />
                </div>
              )}
            </div>

            <div className="px-8 py-9 flex flex-col">
              {featuredRegion ? (
                <>
                  <div className="font-sans font-bold text-[28px] tracking-[-0.02em]">
                    {prettyRegionName(cleanRegionName(featuredRegion.name))}
                  </div>
                  {/* Description priority: AI description → tagline → Wikipedia extract
                      → surprise-me explanation. Clamp to 3 lines so long extracts don't
                      blow out the card. */}
                  <div className="text-[14px] text-ink-3 mt-2 leading-[1.55] line-clamp-3">
                    {featuredRegion.aiDescription ??
                      featuredRegion.tagline ??
                      featuredRegion.extract ??
                      cleanRegionName(featuredRegion.explanation)}
                  </div>
                  {/* Highlights — prefer AI-generated (named feature + 1-line blurb);
                      fall back to anchor / region highlight names with no blurb.
                      Each highlight is a mini-card linking out to a Google Maps
                      search for that named feature, paired with the region name
                      so common names (e.g. "North Lake") resolve correctly. */}
                  {(() => {
                    const ai = featuredRegion.aiHighlights ?? [];
                    const fallback = (featuredRegion.highlights ?? []).map((h) => ({
                      name: h.name,
                      blurb: '',
                    }));
                    const items = ai.length > 0 ? ai : fallback;
                    const top = items.slice(0, 4);
                    const regionContext = prettyRegionName(cleanRegionName(featuredRegion.name));
                    const mapsUrl = (name: string) =>
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${regionContext}`)}`;
                    return (
                      <div className="mt-8">
                        <div className="flex items-center gap-1.5">
                          <Mono>Highlights</Mono>
                          {ai.length > 0 && (
                            <Sparkle
                              size={11}
                              weight="fill"
                              className="text-clay"
                              aria-label="AI-generated"
                            />
                          )}
                        </div>
                        <div className="mt-2.5">
                          {top.length > 0 ? (
                            <div className="flex flex-col gap-1.5">
                              {top.map((h) => (
                                <a
                                  key={h.name}
                                  href={mapsUrl(h.name)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="group/hl flex items-start gap-2 rounded-[10px] border border-line dark:border-line-2 px-3 py-2.5 hover:border-pine-6 hover:bg-pine-6/5 transition-colors"
                                >
                                  <div className="flex-1 min-w-0 font-sans text-[13px] tracking-[-0.005em] leading-[1.35] truncate">
                                    <span className="font-semibold text-ink">{h.name}</span>
                                    {h.blurb && (
                                      <span className="text-ink-3 font-normal"> — {h.blurb}</span>
                                    )}
                                  </div>
                                  <ArrowUpRight
                                    size={12}
                                    weight="bold"
                                    className="text-ink-3 group-hover/hl:text-pine-6 mt-0.5 flex-shrink-0 transition-colors"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-ink-3 font-normal text-[15px]">
                              Open country — no named features mapped yet.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Spot-kind breakdown — pulled from the spots table inside
                      this region's bounds. Hidden until counts resolve. */}
                  {featuredRegion.spotBreakdown && featuredRegion.spotBreakdown.total > 0 && (
                    <div className="mt-6">
                      <Mono>Spots in region</Mono>
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
                        {featuredRegion.spotBreakdown.dispersed > 0 && (
                          <div className="font-sans font-semibold text-[18px] tracking-[-0.01em]">
                            {featuredRegion.spotBreakdown.dispersed}
                            <span className="text-ink-3 font-normal text-[13px]"> dispersed</span>
                          </div>
                        )}
                        {featuredRegion.spotBreakdown.informal > 0 && (
                          <div className="font-sans font-semibold text-[18px] tracking-[-0.01em]">
                            {featuredRegion.spotBreakdown.informal}
                            <span className="text-ink-3 font-normal text-[13px]"> informal</span>
                          </div>
                        )}
                        {featuredRegion.spotBreakdown.established > 0 && (
                          <div className="font-sans font-semibold text-[18px] tracking-[-0.01em]">
                            {featuredRegion.spotBreakdown.established}
                            <span className="text-ink-3 font-normal text-[13px]"> established</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="mt-7 flex flex-wrap gap-1.5">
                    <Tag>{BIOME_LABELS[featuredRegion.primaryBiome]}</Tag>
                    {featuredRegion.recommendedVehicle && (
                      <Tag>{featuredRegion.recommendedVehicle}</Tag>
                    )}
                    {featuredRegion.topCaution && <Tag>{featuredRegion.topCaution}</Tag>}
                  </div>
                  <div className="flex-1" />
                  {(() => {
                    const savedPlaceId = `region:${featuredRegion.id}`;
                    const savedRow = savedLocations.find((l) => l.placeId === savedPlaceId);
                    const handleToggleSave = async () => {
                      if (!user) {
                        toast.error('Sign in to save regions');
                        return;
                      }
                      const prettyName = prettyRegionName(cleanRegionName(featuredRegion.name));
                      if (savedRow) {
                        await removeLocation(savedRow.id);
                        toast.success(`Removed ${prettyName} from favorites`);
                      } else {
                        const ok = await addLocation({
                          placeId: savedPlaceId,
                          name: prettyName,
                          address:
                            featuredRegion.place ??
                            BIOME_LABELS[featuredRegion.primaryBiome] ??
                            'Region',
                          type: 'region',
                          lat: featuredRegion.center.lat,
                          lng: featuredRegion.center.lng,
                        });
                        if (ok) toast.success(`Saved ${prettyName} to favorites`);
                      }
                    };
                    return (
                      <div className="mt-8 flex gap-2.5">
                        <Pill variant="accent" mono={false} onClick={openFeaturedRegion}>
                          <MapIcon size={14} weight="regular" />
                          Open region
                        </Pill>
                        {savedRow ? (
                          <Pill variant="solid-pine" mono={false} onClick={handleToggleSave}>
                            <CheckCircle size={14} weight="fill" />
                            Saved
                          </Pill>
                        ) : (
                          <Pill
                            variant="ghost"
                            mono={false}
                            onClick={handleToggleSave}
                            className="!border-pine-6 !text-pine-6 hover:!bg-pine-6/10"
                          >
                            <Heart size={14} weight="regular" />
                            Save region
                          </Pill>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-ink-3">
                  <SpinnerGap size={20} className="animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === BAND 3 — dark pine, near-you spots === */}
      <section data-dark-band className="bg-ink-pine text-cream">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-24">
          <div className="flex flex-wrap gap-4 items-end justify-between mb-10">
            <div>
              <Mono className="text-ink-ondark">
                {nearbyBucket === 'near' && conditionsLocation
                  ? `NEAR YOU · ${conditionsLocation.lat.toFixed(2)}${conditionsLocation.lat >= 0 ? 'N' : 'S'} · ${Math.abs(conditionsLocation.lng).toFixed(2)}${conditionsLocation.lng >= 0 ? 'E' : 'W'}`
                  : 'EXPLORING · ANYWHERE'}
              </Mono>
              <h2 className="font-sans font-bold text-3xl md:text-5xl tracking-[-0.03em] mt-2.5 max-w-[600px] text-cream">
                {nearbyBucket === 'near' && conditionsLocation
                  ? 'Quiet places, within reach.'
                  : 'A handful of places to roam.'}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Mode pills — only show "Near me" when geolocation succeeded.
                  Active = solid cream; inactive = ghost on the dark band. */}
              {conditionsLocation && (
                <button
                  onClick={() => setNearbyBucket('near')}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-sans font-semibold tracking-[-0.005em] transition-colors',
                    nearbyBucket === 'near'
                      ? 'bg-cream text-ink hover:bg-cream/90'
                      : 'text-cream hover:bg-cream/10 border border-cream/25',
                  )}
                >
                  <MapPin size={12} weight={nearbyBucket === 'near' ? 'fill' : 'regular'} />
                  Near me
                </button>
              )}
              <button
                onClick={() => {
                  // Clicking Randomize again should re-roll, not no-op.
                  if (nearbyBucket === 'random') {
                    setNearbySpots(null);
                  }
                  setNearbyBucket('random');
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-sans font-semibold tracking-[-0.005em] transition-colors',
                  nearbyBucket === 'random'
                    ? 'bg-cream text-ink hover:bg-cream/90'
                    : 'text-cream hover:bg-cream/10 border border-cream/25',
                )}
              >
                <Shuffle size={12} weight="bold" />
                Randomize
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {nearbySpots === null
              ? // Skeletons during fetch
                Array.from({ length: 4 }).map((_, i) => (
                  <article
                    key={`skel-${i}`}
                    className="border border-cream/15 rounded-[14px] overflow-hidden bg-cream/[0.04] animate-pulse"
                  >
                    <div className="h-[160px] bg-cream/[0.05]" />
                    <div className="px-5 pt-4 pb-5">
                      <div className="h-3.5 w-3/4 rounded bg-cream/[0.08]" />
                      <div className="h-3 w-1/2 rounded bg-cream/[0.06] mt-2" />
                    </div>
                  </article>
                ))
              : nearbySpots.length === 0
              ? (
                  <div className="col-span-full text-center py-12 text-cream/70">
                    <Mono className="text-ink-ondark">No spots in this area yet.</Mono>
                  </div>
                )
              : nearbySpots.map((s) => {
                  const kindLabel = s.source === 'community' ? 'KNOWN' : 'DERIVED';
                  const kindDot = s.source === 'community' ? 'bg-pin-safe' : 'bg-pin-moderate';
                  const meta = [
                    s.distanceMiles != null ? `${s.distanceMiles.toFixed(1)} mi` : null,
                    s.manager,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <Link
                      key={s.id}
                      to={`/dispersed?spotId=${s.id}`}
                      className="group block border border-cream/15 rounded-[14px] overflow-hidden bg-cream/[0.04] transition-all hover:-translate-y-0.5 hover:border-cream/30"
                    >
                      {/* Locked hybrid-satellite preview at zoom 17. Non-interactive
                          (gestureHandling=none, all controls off) so the whole card
                          stays the link target. Falls back to a gradient until the
                          Google Maps API is loaded so we never show a half-rendered map. */}
                      <div className="relative h-[160px] bg-gradient-to-br from-[#a89779] via-[#7d6e54] to-[#4d4636]">
                        {googleMapsLoaded && (
                          <GoogleMap
                            center={{ lat: s.lat, lng: s.lng }}
                            zoom={17}
                            className="w-full h-full"
                            options={{
                              mapTypeId: 'hybrid',
                              gestureHandling: 'none',
                              zoomControl: false,
                              mapTypeControl: false,
                              streetViewControl: false,
                              fullscreenControl: false,
                              rotateControl: false,
                              scaleControl: false,
                              keyboardShortcuts: false,
                              clickableIcons: false,
                              disableDefaultUI: true,
                            }}
                          >
                            <Marker
                              position={{ lat: s.lat, lng: s.lng }}
                              icon={
                                typeof google !== 'undefined' && typeof google.maps?.Size === 'function'
                                  ? {
                                      url: FEATURED_PIN_SVG,
                                      scaledSize: new google.maps.Size(24, 24),
                                      anchor: new google.maps.Point(12, 24),
                                    }
                                  : undefined
                              }
                            />
                          </GoogleMap>
                        )}
                        <div className="absolute left-3 top-3 z-10">
                          <span
                            className={`font-mono text-[10px] tracking-[0.14em] uppercase font-semibold px-2.5 py-1 rounded-full text-cream ${kindDot}`}
                          >
                            {kindLabel}
                          </span>
                        </div>
                      </div>
                      <div className="px-5 pt-4 pb-5">
                        <div className="font-semibold text-[15px] tracking-[-0.01em] text-cream truncate">
                          {s.name}
                        </div>
                        {meta && <Mono className="text-ink-ondark">{meta}</Mono>}
                        {s.description && (
                          <p className="text-[12px] text-cream/70 mt-2 leading-[1.45] line-clamp-2">
                            {s.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
          </div>

          <div className="mt-12 flex justify-center">
            <Pill variant="cream" onDark onClick={() => navigate('/dispersed')}>
              <MapIcon size={14} />
              See all spots in view
              <ArrowRight size={13} weight="bold" />
            </Pill>
          </div>
        </div>
      </section>

      {/* === BAND 4 — paper-2, your trips === */}
      <section className="bg-paper-2">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-24">
          <div className="flex flex-wrap gap-4 items-baseline justify-between mb-10">
            <div>
              <Mono>{savedTrips.length} SAVED · {sortedTrips.filter((t) => t.config.startDate).length} UPCOMING</Mono>
              <h2 className="font-sans font-bold text-3xl md:text-5xl tracking-[-0.03em] mt-2.5">Your trips.</h2>
            </div>
            <div className="flex gap-2.5">
              <Pill variant="ghost" mono={false} onClick={() => navigate('/create-trip')}>
                <Plus size={13} weight="bold" />
                New trip
              </Pill>
              <Pill variant="accent" mono={false} onClick={() => navigate('/my-trips')}>
                View all
                <ArrowRight size={13} weight="bold" />
              </Pill>
            </div>
          </div>

          {savedTrips.length === 0 ? (
            <div className="border border-line bg-cream rounded-[18px] px-8 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6 mb-4">
                <Path size={20} weight="regular" />
              </div>
              <div className="font-sans font-semibold text-xl tracking-[-0.01em] text-ink">
                No trips yet
              </div>
              <div className="text-[14px] text-ink-3 mt-2 max-w-[420px] mx-auto">
                Create custom road-trip itineraries with campsites, hikes, and scenic stops.
              </div>
              <div className="mt-5">
                <Pill variant="solid-pine" mono={false} onClick={() => navigate('/create-trip')}>
                  <Plus size={13} weight="bold" />
                  Plan your first trip
                </Pill>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sortedTrips.map((trip) => {
                const daysUntil = trip.config.startDate
                  ? Math.ceil(
                      (new Date(trip.config.startDate).getTime() - new Date().setHours(0, 0, 0, 0)) /
                        (1000 * 60 * 60 * 24)
                    )
                  : null;
                const totalHikingMiles = trip.days.reduce((total, day) => {
                  return (
                    total +
                    day.stops
                      .filter((stop) => stop.type === 'hike')
                      .reduce((sum, hike) => sum + parseFloat(hike.distance?.replace(/[^0-9.]/g, '') || '0'), 0)
                  );
                }, 0);
                const hikeCount = trip.days.reduce(
                  (count, day) => count + day.stops.filter((stop) => stop.type === 'hike').length,
                  0
                );
                const startName = trip.config.baseLocation?.name.split(',')[0] || trip.config.startLocation?.name.split(',')[0] || null;
                const stops = trip.config.destinations?.length || 0;
                const tagText = daysUntil != null && daysUntil >= 0
                  ? daysUntil === 0
                    ? 'TODAY'
                    : daysUntil === 1
                      ? 'TOMORROW'
                      : `IN ${daysUntil} DAYS`
                  : 'DRAFT';
                // Same accent palette as MyTrips/TripRow — sage for solo,
                // water for shared, clay for collaborating-as-owner. Surfaces
                // collaboration state at a glance without a tag.
                const accentClass = (trip.collaboratorCount ?? 0) > 0 ? 'bg-clay' : 'bg-sage';
                return (
                  <article
                    key={trip.id}
                    onClick={() => handleTripClick(trip.id, trip.config.name)}
                    className="border border-line dark:border-line-2 rounded-[14px] overflow-hidden bg-white dark:bg-paper-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(29,34,24,.10),0_3px_8px_rgba(29,34,24,.04)]"
                  >
                    {/* Thin accent strip at the top — mirrors the left-stripe
                        identity used in TripRow on /my-trips, rotated for the
                        compact card layout. */}
                    <div className={`h-1.5 ${accentClass}`} />
                    <div className="p-5">
                      <Tag>{tagText}</Tag>
                      <div className="font-sans font-semibold text-[17px] tracking-[-0.01em] mt-2 line-clamp-2">
                        {trip.config.name || 'Untitled trip'}
                      </div>
                      {startName && (
                        <div className="text-[13px] text-ink-3 mt-1.5 line-clamp-1">
                          {startName} → {stops} {stops === 1 ? 'stop' : 'stops'}
                          {trip.config.returnToStart ? ' · round trip' : ''}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-3 font-mono">
                        <span>{trip.days.length} {trip.days.length === 1 ? 'day' : 'days'}</span>
                        {hikeCount > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {hikeCount} {hikeCount === 1 ? 'hike' : 'hikes'}
                            </span>
                          </>
                        )}
                        {(trip.collaboratorCount ?? 0) > 0 && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} weight="regular" />
                              {trip.collaboratorCount}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Footer — flips to paper-2 in dark so it tiers off the previous band */}
      <footer className="bg-cream dark:bg-paper-2 border-t border-line dark:border-line-2 px-6 md:px-14 py-10 flex flex-wrap items-center justify-between gap-4">
        <Mono className="text-ink-3">ROAMSWILD · OFF-GRID CAMPING · 2026</Mono>
        <div className="flex flex-wrap gap-6 text-[13px] text-ink-3">
          <Link to="/about" className="hover:text-ink transition-colors">Field notes</Link>
          <Link to="/how-we-map" className="hover:text-ink transition-colors">How we map</Link>
          <Link to="/submit-spot" className="hover:text-ink transition-colors">Submit a spot</Link>
          <Link to="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
        </div>
      </footer>

      {/* Dialogs */}
      <SurpriseMeDialog open={surpriseMeOpen} onOpenChange={setSurpriseMeOpen} />
      <BestHikesTodayDialog open={bestHikesOpen} onOpenChange={setBestHikesOpen} />
      <SunsetConditionsDialog open={sunsetOpen} onOpenChange={setSunsetOpen} />

      {/* Manual location selector for "Camps near me" when geolocation fails */}
      <Dialog open={campsLocationOpen} onOpenChange={setCampsLocationOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Where are you searching?</DialogTitle>
            <DialogDescription>
              We couldn&apos;t pick up your location. Pick a region to search around.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <LocationSelector value={campsManualLocation} onChange={setCampsManualLocation} />
            <button
              onClick={handleCampsManualLocation}
              disabled={!campsManualLocation}
              className="mt-4 w-full px-5 py-3 rounded-[14px] border border-pine-6 bg-pine-6 text-cream dark:text-ink-pine text-sm font-semibold hover:bg-pine-5 transition-colors disabled:opacity-50"
            >
              Find camps near here
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
