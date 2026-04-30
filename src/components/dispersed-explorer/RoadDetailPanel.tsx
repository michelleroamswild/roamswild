import { ReactNode } from 'react';
import {
  ArrowSquareOut,
  Car,
  Database,
  Jeep,
  Path,
} from '@phosphor-icons/react';
import { MVUMRoad, OSMTrack } from '@/hooks/use-dispersed-roads';
import { useOsmWayHistory, type OsmWayHistory } from '@/hooks/use-osm-way-history';
import { Mono, Pill } from '@/components/redesign';
import {
  DetailShell,
  DetailBody,
  DetailActions,
  BackLink,
  DetailHero,
  DetailSection,
  DetailRow,
  DetailTag,
} from './DetailPanelChrome';

type SelectedRoad = MVUMRoad | OSMTrack;

const isMVUM = (road: SelectedRoad): road is MVUMRoad =>
  'highClearanceVehicle' in road;

interface RoadDetailPanelProps {
  road: SelectedRoad;
  fromDatabase: boolean;
  onBack: () => void;
}

const TRACKTYPE_LABEL: Record<string, string> = {
  grade1: 'Grade 1 (Paved)',
  grade2: 'Grade 2 (Gravel)',
  grade3: 'Grade 3 (High clearance)',
  grade4: 'Grade 4 (4WD likely)',
  grade5: 'Grade 5 (4WD required)',
};

const MAINT_LEVEL_LABEL: Record<string, string> = {
  '1': 'Level 1 — basic custodial care',
  '2': 'Level 2 — high-clearance vehicle',
  '3': 'Level 3 — passenger car (suitable)',
  '4': 'Level 4 — passenger car (moderate)',
  '5': 'Level 5 — passenger car (high-degree comfort)',
};

// --- OSM tag prettification (unchanged from the previous panel) ----------
const KEY_LABEL_OVERRIDES: Record<string, string> = {
  '4wd_only': '4WD only',
  motor_vehicle: 'Motor vehicle',
  motorcycle: 'Motorcycle',
  motorroad: 'Motor road',
  mtb: 'MTB',
  'mtb:scale': 'MTB scale',
  'mtb:scale:imba': 'MTB scale (IMBA)',
  atv: 'ATV',
  ohv: 'OHV',
  maxspeed: 'Max speed',
  oneway: 'One-way',
  ref: 'Reference',
  tracktype: 'Track type',
  highway: 'Highway',
  surface: 'Surface',
  smoothness: 'Smoothness',
  width: 'Width',
  bridge: 'Bridge',
  tunnel: 'Tunnel',
  ford: 'Ford',
  seasonal: 'Seasonal',
  operator: 'Operator',
  access: 'Access',
  bicycle: 'Bicycle',
  foot: 'Foot',
  horse: 'Horse',
  hgv: 'HGV (heavy goods)',
  lit: 'Lit',
  noexit: 'Dead end',
  service: 'Service',
  source: 'Source',
};

const VALUE_LABEL_OVERRIDES: Record<string, string> = {
  yes: 'Yes',
  no: 'No',
  designated: 'Designated',
  permissive: 'Permissive',
  destination: 'Destination only',
  private: 'Private',
  customers: 'Customers only',
  agricultural: 'Agricultural',
  forestry: 'Forestry',
  unpaved: 'Unpaved',
  paved: 'Paved',
  asphalt: 'Asphalt',
  concrete: 'Concrete',
  gravel: 'Gravel',
  dirt: 'Dirt',
  ground: 'Ground',
  sand: 'Sand',
  rock: 'Rock',
  grass: 'Grass',
  compacted: 'Compacted',
  fine_gravel: 'Fine gravel',
  pebblestone: 'Pebblestone',
  cobblestone: 'Cobblestone',
  excellent: 'Excellent',
  good: 'Good',
  intermediate: 'Intermediate',
  bad: 'Bad',
  very_bad: 'Very bad',
  horrible: 'Horrible',
  very_horrible: 'Very horrible',
  impassable: 'Impassable',
  track: 'Track',
  unclassified: 'Unclassified',
  residential: 'Residential',
  service: 'Service',
  primary: 'Primary',
  secondary: 'Secondary',
  tertiary: 'Tertiary',
  trunk: 'Trunk',
  motorway: 'Motorway',
  path: 'Path',
  footway: 'Footway',
  cycleway: 'Cycleway',
};

function prettifyKey(key: string): string {
  if (KEY_LABEL_OVERRIDES[key]) return KEY_LABEL_OVERRIDES[key];
  const parts = key.split(/[:_]/);
  if (parts.length === 0) return key;
  const head = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const tail = parts.slice(1).map((p) => p.toLowerCase()).join(' ');
  return tail ? `${head} ${tail}` : head;
}

function prettifyValue(key: string, value: string): string {
  if (key === 'tracktype' && TRACKTYPE_LABEL[value]) return TRACKTYPE_LABEL[value];
  if (VALUE_LABEL_OVERRIDES[value]) return VALUE_LABEL_OVERRIDES[value];
  if (/^https?:\/\//.test(value)) return value;
  if (/^\d/.test(value)) return value;
  if (/[A-Z]/.test(value)) return value;
  const cleaned = value.replace(/_/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export const RoadDetailPanel = ({ road, fromDatabase, onBack }: RoadDetailPanelProps) => {
  const isMvum = isMVUM(road);
  const wayId = !isMvum ? Number(road.id) : null;
  const { history } = useOsmWayHistory(wayId && Number.isFinite(wayId) ? wayId : null);
  const historyBlurb = history ? buildHistoryBlurb(history) : null;
  const sourceEyebrow = isMvum ? 'USFS MVUM road' : 'OSM track';

  const displayName = road.name || (isMvum ? 'Unnamed road' : 'Unnamed track');

  // Pick a midpoint for "Open in Maps" + coordinate display
  const coords = road.geometry?.coordinates ?? [];
  const midIdx = Math.floor(coords.length / 2);
  const midpoint = coords[midIdx] ? { lng: coords[midIdx][0], lat: coords[midIdx][1] } : null;

  // Vehicle-access tags — same accent system as the rest of the redesign.
  const accessTags: { key: string; label: ReactNode; variant: Parameters<typeof DetailTag>[0]['variant'] }[] = [];
  if (isMvum) {
    if (road.passengerVehicle) {
      accessTags.push({ key: 'pass', variant: 'pine', label: <><Car className="w-3 h-3" weight="regular" /> Passenger</> });
    }
    if (road.highClearanceVehicle && !road.passengerVehicle) {
      accessTags.push({ key: 'hc', variant: 'clay', label: <><Jeep className="w-3 h-3" weight="regular" /> High clearance</> });
    }
    if (road.atv) accessTags.push({ key: 'atv', variant: 'ghost', label: 'ATV' });
    if (road.motorcycle) accessTags.push({ key: 'moto', variant: 'ghost', label: 'Motorcycle' });
  } else {
    if (road.fourWdOnly || road.tracktype === 'grade5' || road.tracktype === 'grade4') {
      accessTags.push({ key: '4wd', variant: 'ember', label: <><Jeep className="w-3 h-3" weight="regular" /> 4WD only</> });
    } else if (road.tracktype === 'grade3') {
      accessTags.push({ key: 'hc', variant: 'clay', label: <><Jeep className="w-3 h-3" weight="regular" /> High clearance</> });
    } else if (road.tracktype === 'grade1' || road.isPaved) {
      accessTags.push({ key: 'pass', variant: 'pine', label: <><Car className="w-3 h-3" weight="regular" /> Passenger</> });
    }
  }

  return (
    <DetailShell>
      <DetailBody>
        {/* Top bar — back link + cache indicator if loaded from DB */}
        <div className="px-[18px] py-3 border-b border-line flex items-center justify-between">
          <BackLink onBack={onBack} />
          {fromDatabase && (
            <Mono className="text-ink-3 inline-flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" weight="regular" />
              Cached
            </Mono>
          )}
        </div>

        {/* Hero — colored Path icon, source eyebrow, name */}
        <DetailSection title={sourceEyebrow} first>
          <DetailHero
            Icon={Path}
            iconBg={isMvum ? 'bg-sage/15' : 'bg-water/15'}
            iconText={isMvum ? 'text-sage' : 'text-ink-2'}
            title={displayName}
          />
        </DetailSection>

        {/* Access tags */}
        {accessTags.length > 0 && (
          <DetailSection title="Vehicle access">
            <div className="flex flex-wrap gap-1.5">
              {accessTags.map((t) => (
                <DetailTag key={t.key} variant={t.variant}>
                  {t.label}
                </DetailTag>
              ))}
            </div>
          </DetailSection>
        )}

        {/* Curated detail rows */}
        <DetailSection title="Details">
          {isMvum ? (
            <>
              {road.surfaceType && <DetailRow label="Surface" value={road.surfaceType} />}
              {road.operationalMaintLevel && (
                <DetailRow
                  label="Maintenance"
                  value={MAINT_LEVEL_LABEL[road.operationalMaintLevel] ?? road.operationalMaintLevel}
                />
              )}
              {road.seasonal && <DetailRow label="Seasonal" value={road.seasonal} />}
            </>
          ) : (
            <>
              {road.highway && <DetailRow label="Highway" value={prettifyValue('highway', road.highway)} />}
              {road.tracktype && (
                <>
                  <DetailRow label="Track type" value={TRACKTYPE_LABEL[road.tracktype] ?? road.tracktype} />
                  {historyBlurb && (
                    <p className="text-[12px] text-ink-3 leading-[1.5] mt-1.5 pl-3 border-l-2 border-line">
                      {historyBlurb}
                    </p>
                  )}
                </>
              )}
              {road.surface && <DetailRow label="Surface" value={prettifyValue('surface', road.surface)} />}
              {road.access && <DetailRow label="Access" value={prettifyValue('access', road.access)} />}
            </>
          )}
        </DetailSection>

        {/* Raw OSM tag bag */}
        {!isMvum && road.osmTags && <RoadOsmTagDetails tags={road.osmTags} />}

        {/* OSM source link */}
        {!isMvum && (
          <div className="px-[18px] pb-4 pt-1">
            <a
              href={`https://www.openstreetmap.org/way/${road.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6 hover:text-pine-5 transition-colors"
            >
              <ArrowSquareOut className="w-3 h-3" weight="regular" />
              View way on OpenStreetMap
            </a>
          </div>
        )}
      </DetailBody>

      {/* Sticky action */}
      {midpoint && (
        <DetailActions>
          <Pill
            variant="solid-pine"
            mono={false}
            onClick={() =>
              window.open(
                `https://www.google.com/maps/search/?api=1&query=${midpoint.lat},${midpoint.lng}`,
                '_blank',
              )
            }
            className="!w-full !justify-center"
          >
            <ArrowSquareOut className="w-3.5 h-3.5" weight="regular" />
            Open midpoint in Maps
          </Pill>
        </DetailActions>
      )}
    </DetailShell>
  );
};

// Raw OSM tag bag — surfaces every key we got that isn't already shown in
// the curated section above. Featured tags float to the top, the rest collapse.
const ROAD_TAG_KEYS_TO_HIDE = new Set([
  'highway',
  'tracktype',
  'surface',
  'access',
  'name',
  'ref',
  '4wd_only',
]);

const RoadOsmTagDetails = ({ tags }: { tags: Record<string, string> }) => {
  const entries = Object.entries(tags).filter(([k]) => !ROAD_TAG_KEYS_TO_HIDE.has(k));
  if (entries.length === 0) return null;

  const featured = ['ref', 'smoothness', 'motor_vehicle', 'motorcycle', 'bicycle', 'mtb', 'oneway', 'maxspeed', 'width', 'bridge', 'tunnel', 'ford', 'seasonal', 'operator'];
  const featuredEntries = entries.filter(([k]) => featured.includes(k));
  const otherEntries = entries.filter(([k]) => !featured.includes(k));

  return (
    <DetailSection title="From OSM">
      {featuredEntries.length > 0 && (
        <>
          {featuredEntries.map(([k, v]) => (
            <DetailRow key={k} label={prettifyKey(k)} value={prettifyValue(k, String(v))} />
          ))}
        </>
      )}

      {otherEntries.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-pine-6 hover:text-pine-5 transition-colors list-none">
            All tags ({otherEntries.length})
          </summary>
          <div className="mt-2 space-y-0">
            {otherEntries.map(([k, v]) => (
              <DetailRow key={k} label={prettifyKey(k)} value={prettifyValue(k, String(v))} />
            ))}
          </div>
        </details>
      )}
    </DetailSection>
  );
};

// --- OSM way edit history ------------------------------------------------
const GRADE_ORDER = ['grade1', 'grade2', 'grade3', 'grade4', 'grade5'];
const GRADE_FRIENDLY: Record<string, string> = {
  grade1: 'Grade 1 (Paved)',
  grade2: 'Grade 2 (Gravel)',
  grade3: 'Grade 3 (High clearance)',
  grade4: 'Grade 4 (4WD likely)',
  grade5: 'Grade 5 (4WD required)',
};

function buildHistoryBlurb(history: OsmWayHistory): string | null {
  const valid = history.grades_seen.filter((g) => GRADE_ORDER.includes(g));
  if (valid.length === 0) return null;

  const unique = Array.from(new Set(valid));
  if (unique.length < 2) return null;

  unique.sort((a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b));
  const friendlyList = unique.map((g) => GRADE_FRIENDLY[g] ?? g);
  const friendlyRange =
    friendlyList.length === 2
      ? `${friendlyList[0]} or ${friendlyList[1]}`
      : `${friendlyList.slice(0, -1).join(', ')}, or ${friendlyList[friendlyList.length - 1]}`;

  return `Possible grades: ${friendlyRange}. This way has been re-tagged ${unique.length} different grades across edits — current rating may be more lenient than older mappers found it.`;
}
