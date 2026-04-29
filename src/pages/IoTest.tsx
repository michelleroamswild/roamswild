import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, MarkerClusterer } from '@react-google-maps/api';
import { GoogleMap } from '@/components/GoogleMap';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { ThumbsDown, ThumbsUp, X } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';

// DB row from the unified `spots` table
interface SpotRow {
  id: string;
  name: string;
  description: string | null;
  latitude: number | string;
  longitude: number | string;
  kind: string;
  sub_kind: string | null;
  source: string;
  source_external_id: string | null;
  public_land_unit: string | null;
  public_land_manager: string | null;
  public_land_designation: string | null;
  public_access: string | null;
  land_type: string | null;
  amenities: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
}

// In-page shape — flattens amenities JSONB into convenient typed fields
interface ImportedSpot {
  id: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  kind: string;
  sub_kind: string | null;
  source: string;
  // Flattened amenities (from amenities JSONB)
  water?: string;
  water_potability?: string;
  toilets?: string;
  showers_amenity?: string;
  dump_station?: string;
  electricity?: string;
  wifi?: string;
  big_rig_friendly?: boolean;
  tent_friendly?: boolean;
  pet_friendly?: boolean;
  road_surface?: string;
  surroundings?: string;
  spot_type?: string;
  cell_service?: Record<string, number | boolean>;
  vehicle_required?: string;
  also?: string[];                       // aux categories (combined facilities)
  // Land context
  public_land_unit: string | null;
  public_land_manager: string | null;
  public_land_designation: string | null;
  public_access: string | null;
  land_type: string | null;
  // Misc
  name_original?: string;
  _layer: LayerKey;
  _key: string;
}

function flattenSpotRow(row: SpotRow): Omit<ImportedSpot, '_layer' | '_key'> {
  const a = (row.amenities ?? {}) as Record<string, unknown>;
  const e = (row.extra ?? {}) as Record<string, unknown>;
  const lat = typeof row.latitude === 'number' ? row.latitude : parseFloat(row.latitude);
  const lng = typeof row.longitude === 'number' ? row.longitude : parseFloat(row.longitude);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    lat, lng,
    kind: row.kind,
    sub_kind: row.sub_kind,
    source: row.source,
    water:            (a.water as string) || undefined,
    water_potability: (a.water_potability as string) || undefined,
    toilets:          (a.toilets as string) || undefined,
    showers_amenity:  (a.showers_amenity as string) || undefined,
    dump_station:     (a.dump_station as string) || undefined,
    electricity:      (a.electricity as string) || undefined,
    wifi:             (a.wifi as string) || undefined,
    big_rig_friendly: a.big_rig_friendly === true ? true : undefined,
    tent_friendly:    a.tent_friendly === true ? true : undefined,
    pet_friendly:     a.pet_friendly === true ? true : undefined,
    road_surface:     (a.road_surface as string) || undefined,
    surroundings:     (a.surroundings as string) || undefined,
    spot_type:        (a.spot_type as string) || undefined,
    cell_service:     (a.cell_service as ImportedSpot['cell_service']) || undefined,
    vehicle_required: (a.vehicle_required as string) || undefined,
    also:             Array.isArray(a.also) ? (a.also as string[]) : undefined,
    public_land_unit:        row.public_land_unit,
    public_land_manager:     row.public_land_manager,
    public_land_designation: row.public_land_designation,
    public_access:           row.public_access,
    land_type:               row.land_type,
    name_original:    (e.name_original as string) || undefined,
  };
}

type LayerKey = 'camping' | 'established' | 'stealth' | 'water' | 'showers' | 'laundromats';

interface Layer {
  key: LayerKey;
  label: string;
  kinds: string[];                       // matches against `kind` column
  color: string;
}

const LAYERS: Layer[] = [
  { key: 'camping',     label: 'Dispersed',   kinds: ['dispersed_camping'], color: '#d97706' },
  { key: 'established', label: 'Established', kinds: ['established_campground'], color: '#16a34a' },
  { key: 'stealth',     label: 'Informal',    kinds: ['informal_camping'],  color: '#9ca3af' },
  { key: 'water',       label: 'Water',       kinds: ['water'],             color: '#0ea5e9' },
  { key: 'showers',     label: 'Showers',     kinds: ['shower'],            color: '#14b8a6' },
  { key: 'laundromats', label: 'Laundromats', kinds: ['laundromat'],        color: '#8b5cf6' },
];

const layerForKind = (kind: string): LayerKey | null => {
  for (const l of LAYERS) {
    if (l.kinds.includes(kind)) return l.key;
  }
  return null;
};

// Combined facilities: a row's amenities.also array names extra layers it should
// also appear in (e.g. a shower row with also=['laundromat']).
const allLayersFor = (spot: ImportedSpot): LayerKey[] => {
  const auxKinds: string[] = [];
  for (const a of (spot.also || [])) {
    // Map aux category names to kinds: laundromat → laundromat, showers → shower
    if (a === 'showers') auxKinds.push('shower');
    else if (a === 'laundromat') auxKinds.push('laundromat');
    else auxKinds.push(a);
  }
  const layers = new Set<LayerKey>();
  const primary = layerForKind(spot.kind);
  if (primary) layers.add(primary);
  for (const k of auxKinds) {
    const lk = layerForKind(k);
    if (lk) layers.add(lk);
  }
  return [...layers];
};

const reviewKey = (lat: number, lng: number) =>
  `${lat.toFixed(5)},${lng.toFixed(5)}`;

const displayName = (s: ImportedSpot) => s.name || 'Unnamed';

const US_CENTER = { lat: 39.5, lng: -98.5 };
const US_ZOOM = 4;

const ACCESS_LABEL: Record<string, string> = {
  OA: 'Open Access', RA: 'Restricted Access', UK: 'Access Unknown', XA: 'Closed Access',
};

const AGENCY_COLOR: Record<string, string> = {
  BLM: '#d97706', USFS: '#16a34a', NPS: '#7c2d12', SLB: '#2563eb',
};

const FLAGS_STORAGE_KEY = 'iotest-review-flags-v1';
const APPROVED_STORAGE_KEY = 'iotest-review-approved-v1';
const REMOVED_STORAGE_KEY = 'iotest-review-removed-v1';

export default function IoTest() {
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const [layerData, setLayerData] = useState<Record<LayerKey, ImportedSpot[]>>({
    camping: [], established: [], stealth: [], water: [], showers: [], laundromats: [],
  });
  // Start with all layers OFF so the map loads instantly. User toggles
  // what they want to see in the header — keeps 24k markers from rendering
  // up front and locking up the page.
  const [enabled, setEnabled] = useState<Record<LayerKey, boolean>>({
    camping: false, established: false, stealth: false, water: false, showers: false, laundromats: false,
  });
  const [reviewKeys, setReviewKeys] = useState<Set<string>>(new Set());
  const [reviewMode, setReviewMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Flagged (thumbs-down) and approved (thumbs-up) entries — persisted to
  // localStorage. Approving removes the entry from the visible list so the
  // user can work through their review systematically.
  const loadSet = (storageKey: string) => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  };
  const [flagged, setFlagged] = useState<Set<string>>(() => loadSet(FLAGS_STORAGE_KEY));
  const [approved, setApproved] = useState<Set<string>>(() => loadSet(APPROVED_STORAGE_KEY));
  const [removed, setRemoved] = useState<Set<string>>(() => loadSet(REMOVED_STORAGE_KEY));
  const persistSet = (storageKey: string, next: Set<string>) => {
    try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
  };
  // Each vote is mutually exclusive — toggling one clears the others.
  const setExclusive = (key: string, target: 'approved' | 'flagged' | 'removed' | null) => {
    const next = {
      approved: new Set(approved),
      flagged: new Set(flagged),
      removed: new Set(removed),
    };
    next.approved.delete(key);
    next.flagged.delete(key);
    next.removed.delete(key);
    if (target) next[target].add(key);
    setApproved(next.approved); persistSet(APPROVED_STORAGE_KEY, next.approved);
    setFlagged(next.flagged); persistSet(FLAGS_STORAGE_KEY, next.flagged);
    setRemoved(next.removed); persistSet(REMOVED_STORAGE_KEY, next.removed);
  };
  const toggleApproved = (key: string) => setExclusive(key, approved.has(key) ? null : 'approved');
  const toggleFlag = (key: string) => setExclusive(key, flagged.has(key) ? null : 'flagged');
  const toggleRemoved = (key: string) => setExclusive(key, removed.has(key) ? null : 'removed');

  const [showApproved, setShowApproved] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [satellite, setSatellite] = useState(true);

  // Load review list (entries flagged by Stage 22 weird-entry scan)
  useEffect(() => {
    fetch('/test-data/review-list.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { lat: number; lng: number }[]) => {
        setReviewKeys(new Set(list.map((e) => reviewKey(e.lat, e.lng))));
      })
      .catch(() => setReviewKeys(new Set()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const PAGE_SIZE = 1000;
      const all: SpotRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: dbError } = await supabase
          .from('spots')
          .select('id,name,description,latitude,longitude,kind,sub_kind,source,source_external_id,public_land_unit,public_land_manager,public_land_designation,public_access,land_type,amenities,extra')
          .range(from, from + PAGE_SIZE - 1);
        if (cancelled) return;
        if (dbError) { setError(dbError.message); return; }
        const page = (data || []) as SpotRow[];
        all.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      const grouped: Record<LayerKey, ImportedSpot[]> = {
        camping: [], established: [], stealth: [], water: [], showers: [], laundromats: [],
      };
      for (const row of all) {
        const flat = flattenSpotRow(row);
        const primaryLayer = layerForKind(flat.kind);
        if (!primaryLayer) continue;
        const spot: ImportedSpot = {
          ...flat,
          _layer: primaryLayer,
          _key: reviewKey(flat.lat, flat.lng),
        };
        const layers = allLayersFor(spot);
        for (const lk of layers) grouped[lk].push(spot);
      }
      setLayerData(grouped);
    })();
    return () => { cancelled = true; };
  }, []);

  const buildIcon = useMemo(() => (color: string): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale: 6,
    fillColor: color,
    fillOpacity: 0.9,
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
  }), []);

  const iconForSpot = (s: ImportedSpot, layer: Layer): google.maps.Symbol => {
    if (layer.key === 'camping') {
      const c = AGENCY_COLOR[s.public_land_manager || ''] || '#6b7280';
      return buildIcon(c);
    }
    return buildIcon(layer.color);
  };

  const filteredLayerData: Record<LayerKey, ImportedSpot[]> = useMemo(() => {
    const filterByReview = (spots: ImportedSpot[]) =>
      !reviewMode ? spots : spots.filter((s) => reviewKeys.has(s._key));
    const filterByApproved = (spots: ImportedSpot[]) =>
      showApproved ? spots : spots.filter((s) => !approved.has(s._key));
    const filterByRemoved = (spots: ImportedSpot[]) =>
      showRemoved ? spots : spots.filter((s) => !removed.has(s._key));
    const out: Record<LayerKey, ImportedSpot[]> = {
      camping: [], established: [], stealth: [], water: [], showers: [], laundromats: [],
    };
    for (const k of Object.keys(layerData) as LayerKey[]) {
      out[k] = filterByRemoved(filterByApproved(filterByReview(layerData[k])));
    }
    return out;
  }, [layerData, reviewMode, reviewKeys, approved, showApproved, removed, showRemoved]);

  // Flat list of currently-visible spots, sorted alphabetically by name
  const visibleSpots: ImportedSpot[] = useMemo(() => {
    const out: ImportedSpot[] = [];
    for (const k of Object.keys(filteredLayerData) as LayerKey[]) {
      if (enabled[k]) out.push(...filteredLayerData[k]);
    }
    out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return out;
  }, [filteredLayerData, enabled]);

  const totalLoaded = visibleSpots.length;
  const selectedSpot = useMemo(
    () => (selectedKey ? visibleSpots.find((s) => s._key === selectedKey) || null : null),
    [selectedKey, visibleSpots],
  );

  // When a marker is clicked, scroll the list to its item
  const handleSelectFromMap = (spot: ImportedSpot) => {
    setSelectedKey(spot._key);
    const node = itemRefs.current[spot._key];
    if (node && listScrollRef.current) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  // When a list row is clicked, pan/zoom the map to that spot
  const handleSelectFromList = (spot: ImportedSpot) => {
    setSelectedKey(spot._key);
    if (mapInstance) {
      mapInstance.panTo({ lat: spot.lat, lng: spot.lng });
      if ((mapInstance.getZoom() || 0) < 11) mapInstance.setZoom(11);
    }
  };

  const exportSet = (set: Set<string>, filename: string) => {
    const blob = new Blob([JSON.stringify([...set], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportFlags = () => exportSet(flagged, 'review-flagged.json');
  const exportRemoved = () => exportSet(removed, 'review-removed.json');

  // Wipe all review state (after applying it). Asks first because it's
  // destructive — the user can always Restore from a backup file.
  const clearAllMarks = () => {
    if (!confirm(`Clear all review marks? This will remove ${approved.size} 👍, ${flagged.size} 👎, and ${removed.size} ✕ entries from local storage. Click "Backup" first if you want to keep them.`)) {
      return;
    }
    setApproved(new Set()); persistSet(APPROVED_STORAGE_KEY, new Set());
    setFlagged(new Set()); persistSet(FLAGS_STORAGE_KEY, new Set());
    setRemoved(new Set()); persistSet(REMOVED_STORAGE_KEY, new Set());
  };

  // Backup all three sets in one file so user can restore if localStorage clears
  const backupAll = () => {
    const payload = {
      approved: [...approved],
      flagged: [...flagged],
      removed: [...removed],
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iotest-review-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const restoreFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data.approved)) {
          const next = new Set<string>(data.approved);
          setApproved(next); persistSet(APPROVED_STORAGE_KEY, next);
        }
        if (Array.isArray(data.flagged)) {
          const next = new Set<string>(data.flagged);
          setFlagged(next); persistSet(FLAGS_STORAGE_KEY, next);
        }
        if (Array.isArray(data.removed)) {
          const next = new Set<string>(data.removed);
          setRemoved(next); persistSet(REMOVED_STORAGE_KEY, next);
        }
        alert(`Restored: 👍 ${data.approved?.length || 0} · 👎 ${data.flagged?.length || 0} · ✕ ${data.removed?.length || 0}`);
      } catch (e) {
        alert(`Restore failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <div className="shrink-0 border-b border-border bg-background px-4 py-2 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold">IO Test — community_spots</h1>
          <p className="text-xs text-muted-foreground">
            {error ? `Error: ${error}` : (
              reviewMode
                ? `Review: ${totalLoaded} remaining · 👍 ${approved.size} · 👎 ${flagged.size} · ✕ ${removed.size}`
                : `${totalLoaded} rows from cloud Supabase`
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <button
            onClick={() => setReviewMode((v) => !v)}
            className={`px-2 py-1 rounded border font-medium transition-colors ${
              reviewMode ? 'border-orange-400 bg-orange-100 text-orange-800' : 'border-border bg-muted/40'
            }`}
            title="Show only entries flagged as possibly weird by the Stage 22 scan"
          >
            {reviewMode ? `Review ON (${reviewKeys.size})` : `Review OFF (${reviewKeys.size})`}
          </button>
          <button
            onClick={() => setSatellite((v) => !v)}
            className={`px-2 py-1 rounded border font-medium ${
              satellite ? 'border-blue-400 bg-blue-100 text-blue-800' : 'border-border bg-muted/40'
            }`}
            title="Toggle satellite map"
          >
            {satellite ? 'Satellite' : 'Map'}
          </button>
          <button
            onClick={backupAll}
            className="px-2 py-1 rounded border border-border bg-muted/40 font-medium"
            title="Backup all review state to a file"
          >
            Backup
          </button>
          <label
            className="px-2 py-1 rounded border border-border bg-muted/40 font-medium cursor-pointer"
            title="Restore review state from a backup file"
          >
            Restore
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) restoreFromFile(f);
                e.target.value = '';
              }}
            />
          </label>
          {(approved.size + flagged.size + removed.size) > 0 && (
            <button
              onClick={clearAllMarks}
              className="px-2 py-1 rounded border border-border bg-muted/40 font-medium"
              title="Clear all 👍/👎/✕ marks from local storage"
            >
              Clear marks
            </button>
          )}
          {approved.size > 0 && (
            <button
              onClick={() => setShowApproved((v) => !v)}
              className={`px-2 py-1 rounded border font-medium ${
                showApproved ? 'border-green-400 bg-green-100 text-green-800' : 'border-border bg-muted/40'
              }`}
              title="Toggle visibility of approved entries"
            >
              {showApproved ? `Showing 👍 ${approved.size}` : `👍 ${approved.size} hidden`}
            </button>
          )}
          {removed.size > 0 && (
            <button
              onClick={() => setShowRemoved((v) => !v)}
              className={`px-2 py-1 rounded border font-medium ${
                showRemoved ? 'border-gray-500 bg-gray-200 text-gray-900' : 'border-border bg-muted/40'
              }`}
              title="Toggle visibility of removed entries"
            >
              {showRemoved ? `Showing ✕ ${removed.size}` : `✕ ${removed.size} hidden`}
            </button>
          )}
          {flagged.size > 0 && (
            <button
              onClick={exportFlags}
              className="px-2 py-1 rounded border border-red-400 bg-red-50 text-red-800 font-medium"
              title="Download the flagged-list JSON"
            >
              Export 👎 {flagged.size}
            </button>
          )}
          {removed.size > 0 && (
            <button
              onClick={exportRemoved}
              className="px-2 py-1 rounded border border-gray-500 bg-gray-100 text-gray-900 font-medium"
              title="Download the removed-list JSON (use this to delete from DB later)"
            >
              Export ✕ {removed.size}
            </button>
          )}
          {LAYERS.map((layer) => {
            const count = filteredLayerData[layer.key].length;
            const on = enabled[layer.key];
            return (
              <button
                key={layer.key}
                onClick={() => setEnabled((p) => ({ ...p, [layer.key]: !p[layer.key] }))}
                className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-colors ${
                  on ? 'border-border bg-muted/40' : 'border-transparent bg-transparent opacity-50'
                }`}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: layer.color }} />
                <span className="font-medium">{layer.label}</span>
                <span className="text-muted-foreground">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Map (flex-1) */}
        <div className="flex-1 min-w-0 relative">
          <GoogleMap
            center={US_CENTER}
            zoom={US_ZOOM}
            onLoad={setMapInstance}
            options={{ mapTypeId: satellite ? 'hybrid' : 'roadmap' }}
          >
            {mapsLoaded && LAYERS.map((layer) => (
              enabled[layer.key] && filteredLayerData[layer.key].length > 0 ? (
                <MarkerClusterer
                  key={layer.key}
                  options={{ gridSize: 60, maxZoom: 12, minimumClusterSize: 4 }}
                >
                  {(clusterer) => (
                    <>
                      {filteredLayerData[layer.key].map((s) => (
                        <Marker
                          key={`${layer.key}-${s._key}`}
                          position={{ lat: s.lat, lng: s.lng }}
                          icon={iconForSpot(s, layer)}
                          clusterer={clusterer}
                          onClick={() => handleSelectFromMap(s)}
                        />
                      ))}
                    </>
                  )}
                </MarkerClusterer>
              ) : null
            ))}
          </GoogleMap>
        </div>

        {/* Side panel: full list of visible spots */}
        <div className="w-[560px] max-w-[45vw] shrink-0 border-l border-border bg-background flex flex-col">
          <div className="shrink-0 border-b border-border px-4 py-2 text-sm text-muted-foreground">
            {totalLoaded} entries · click a row to focus on map
          </div>
          <div ref={listScrollRef} className="flex-1 overflow-y-auto">
            {visibleSpots.map((s) => {
              const isSelected = s._key === selectedKey;
              const isFlagged = flagged.has(s._key);
              const isApproved = approved.has(s._key);
              const isRemoved = removed.has(s._key);
              return (
                <div
                  key={s._key}
                  ref={(el) => { itemRefs.current[s._key] = el; }}
                  onClick={() => handleSelectFromList(s)}
                  className={`px-4 py-3 border-b border-border cursor-pointer transition-colors ${
                    isSelected ? 'bg-orange-50 dark:bg-orange-950/20' : 'hover:bg-muted/40'
                  } ${isFlagged ? 'opacity-60' : ''} ${isApproved ? 'opacity-50' : ''} ${
                    isRemoved ? 'opacity-40 line-through' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-base leading-snug break-words">
                        {displayName(s)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
                        {s.kind.replace(/_/g, ' ')}
                        {s.sub_kind && ` · ${s.sub_kind.replace(/_/g, ' ')}`}
                        {s.public_land_manager && ` · ${s.public_land_manager}`}
                        {s.source !== 'community' && ` · ${s.source}`}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleApproved(s._key); }}
                        className={`p-1.5 rounded transition-colors ${
                          isApproved
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'text-muted-foreground hover:text-green-700 hover:bg-green-50'
                        }`}
                        title={isApproved ? 'Unapprove' : 'Mark good — removes from list'}
                        aria-label="Toggle approve"
                      >
                        <ThumbsUp className="w-5 h-5" weight={isApproved ? 'fill' : 'regular'} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFlag(s._key); }}
                        className={`p-1.5 rounded transition-colors ${
                          isFlagged
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'text-muted-foreground hover:text-red-700 hover:bg-red-50'
                        }`}
                        title={isFlagged ? 'Unflag' : 'Flag for re-review'}
                        aria-label="Toggle flag"
                      >
                        <ThumbsDown className="w-5 h-5" weight={isFlagged ? 'fill' : 'regular'} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleRemoved(s._key); }}
                        className={`p-1.5 rounded transition-colors ${
                          isRemoved
                            ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                            : 'text-muted-foreground hover:text-gray-900 hover:bg-gray-100'
                        }`}
                        title={isRemoved ? 'Undo remove' : 'Mark for deletion from DB'}
                        aria-label="Toggle remove"
                      >
                        <X className="w-5 h-5" weight={isRemoved ? 'bold' : 'regular'} />
                      </button>
                    </div>
                  </div>
                  {/* Unified amenity badges — render whatever's set */}
                  <AmenityRow spot={s} />

                  {s.description && (
                    <div className="mt-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Summary</p>
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {s.description}
                      </p>
                    </div>
                  )}
                  {isSelected && (s.name_original && s.name_original !== s.name) && (
                    <p className="text-xs text-muted-foreground/70 mt-2 italic">
                      orig name: {s.name_original}
                    </p>
                  )}
                </div>
              );
            })}
            {visibleSpots.length === 0 && (
              <div className="text-sm text-muted-foreground text-center mt-8 px-4 space-y-2">
                <p>No entries to show.</p>
                <p className="text-xs">
                  Toggle a layer in the header (Dispersed / Informal / Water / Showers / Laundromats) to start. Or turn on Review / Misclass mode for a smaller subset.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Renders amenity badges in the unified shape used by both community_spots
// and (eventually) potential_spots. Skips fields that are null.
function AmenityRow({ spot }: { spot: ImportedSpot }) {
  const items: { label: string; value: boolean | string | null | undefined }[] = [
    { label: 'Water',       value: spot.water },
    { label: 'Potability',  value: spot.water_potability },
    { label: 'Toilets',     value: spot.toilets },
    { label: 'Showers',     value: spot.showers_amenity },
    { label: 'Dump',        value: spot.dump_station },
    { label: 'Power',       value: spot.electricity },
    { label: 'WiFi',        value: spot.wifi },
    { label: 'Big rigs',    value: spot.big_rig_friendly },
    { label: 'Tents',       value: spot.tent_friendly },
    { label: 'Pets',        value: spot.pet_friendly },
    { label: 'Road',        value: spot.road_surface },
    { label: 'Terrain',     value: spot.surroundings },
    { label: 'Vehicle',     value: spot.vehicle_required ? formatVehicle(spot.vehicle_required) : null },
  ];
  const visible = items.filter((i) => {
    if (i.value == null || i.value === '' || i.value === 'Unknown') return false;
    if (i.value === false) return false;
    if (typeof i.value === 'string' && i.value.trim().toLowerCase() === 'no') return false;
    return true;
  });
  const cellTag = formatCell(spot.cell_service);
  if (visible.length === 0 && !cellTag) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {visible.map((i) => (
        <AmenityBadge key={i.label} label={i.label} value={i.value} />
      ))}
      {cellTag && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cellTag.cls}`}>
          {cellTag.text}
        </span>
      )}
    </div>
  );
}

function formatVehicle(v: string): string {
  if (v === 'passenger') return 'any vehicle';
  if (v === 'high_clearance') return 'high clearance';
  if (v === '4wd') return '4WD';
  return v;
}

function formatCell(c: ImportedSpot['cell_service']): { text: string; cls: string } | null {
  if (!c) return null;
  if (c.none) return { text: 'No cell', cls: 'bg-gray-100 text-gray-500' };
  const parts: string[] = [];
  for (const [provider, bars] of Object.entries(c)) {
    if (provider === 'none') continue;
    const label = provider === 'verizon' ? 'VZW' : provider === 'att' ? 'AT&T' : provider === 'tmobile' ? 'TMO' : provider.toUpperCase();
    parts.push(typeof bars === 'number' ? `${label} ${bars}` : label);
  }
  if (parts.length === 0) return null;
  return { text: `Cell: ${parts.join(', ')}`, cls: 'bg-purple-100 text-purple-800' };
}

function AmenityBadge({ label, value }: { label: string; value: boolean | string | null | undefined }) {
  if (value == null) return null;
  let display: string;
  let cls: string;
  if (value === true) { display = label; cls = 'bg-green-100 text-green-800'; }
  else if (value === false) { display = `No ${label.toLowerCase()}`; cls = 'bg-gray-100 text-gray-500'; }
  else { display = `${label}: ${value}`; cls = 'bg-blue-100 text-blue-800'; }
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{display}</span>;
}
