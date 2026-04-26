import {
  ArrowLeft,
  ArrowSquareOut,
  ArrowsClockwise,
  Car,
  Database,
  Jeep,
  Path,
  SpinnerGap,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { MVUMRoad, OSMTrack } from '@/hooks/use-dispersed-roads';
import { useOsmWayHistory, type OsmWayHistory } from '@/hooks/use-osm-way-history';

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

// USFS Operational Maintenance Levels (1=basic 4WD/closed → 5=fully paved)
const MAINT_LEVEL_LABEL: Record<string, string> = {
  '1': 'Level 1 — basic custodial care',
  '2': 'Level 2 — high-clearance vehicle',
  '3': 'Level 3 — passenger car (suitable)',
  '4': 'Level 4 — passenger car (moderate)',
  '5': 'Level 5 — passenger car (high-degree comfort)',
};

// --- OSM tag prettification ----------------------------------------------
// OSM keys/values are machine-readable (snake_case lowercase). Translate to
// human-friendly forms for display. Explicit mappings handle abbreviations
// (4wd, mtb, atv, etc.) so the fallback can stay simple.
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
  // Fallback: split on : and _, capitalize first segment, lowercase the rest
  const parts = key.split(/[:_]/);
  if (parts.length === 0) return key;
  const head = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const tail = parts.slice(1).map((p) => p.toLowerCase()).join(' ');
  return tail ? `${head} ${tail}` : head;
}

function prettifyValue(key: string, value: string): string {
  if (key === 'tracktype' && TRACKTYPE_LABEL[value]) return TRACKTYPE_LABEL[value];
  if (VALUE_LABEL_OVERRIDES[value]) return VALUE_LABEL_OVERRIDES[value];
  // Numbers, URLs, mixed-case strings — leave alone
  if (/^https?:\/\//.test(value)) return value;
  if (/^\d/.test(value)) return value;
  if (/[A-Z]/.test(value)) return value;
  // All-lowercase single word — capitalize. Multi-word — replace _ with space
  // and capitalize first letter only.
  const cleaned = value.replace(/_/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export const RoadDetailPanel = ({ road, fromDatabase, onBack }: RoadDetailPanelProps) => {
  const isMvum = isMVUM(road);
  const wayId = !isMvum ? Number(road.id) : null;
  const { history } = useOsmWayHistory(wayId && Number.isFinite(wayId) ? wayId : null);
  const historyBlurb = history ? buildHistoryBlurb(history) : null;
  const sourceLabel = isMvum ? 'USFS MVUM' : 'OSM Track';
  const sourceClass = isMvum
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';

  const displayName = road.name || (isMvum ? 'Unnamed road' : 'Unnamed track');

  // Pick a midpoint for "Open in Maps" + coordinate display
  const coords = road.geometry?.coordinates ?? [];
  const midIdx = Math.floor(coords.length / 2);
  const midpoint = coords[midIdx] ? { lng: coords[midIdx][0], lat: coords[midIdx][1] } : null;

  // Vehicle-access pills
  const accessPills: { key: string; label: React.ReactNode; className: string }[] = [];
  if (isMvum) {
    if (road.passengerVehicle) {
      accessPills.push({
        key: 'pass',
        label: <><Car className="w-3 h-3" /> Passenger</>,
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      });
    }
    if (road.highClearanceVehicle && !road.passengerVehicle) {
      accessPills.push({
        key: 'hc',
        label: <><Jeep className="w-3 h-3" /> High clearance</>,
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      });
    }
    if (road.atv) {
      accessPills.push({ key: 'atv', label: 'ATV', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' });
    }
    if (road.motorcycle) {
      accessPills.push({ key: 'moto', label: 'Motorcycle', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' });
    }
  } else {
    if (road.fourWdOnly || road.tracktype === 'grade5' || road.tracktype === 'grade4') {
      accessPills.push({
        key: '4wd',
        label: <><Jeep className="w-3 h-3" /> 4WD only</>,
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      });
    } else if (road.tracktype === 'grade3') {
      accessPills.push({
        key: 'hc',
        label: <><Jeep className="w-3 h-3" /> High clearance</>,
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      });
    } else if (road.tracktype === 'grade1' || road.isPaved) {
      accessPills.push({
        key: 'pass',
        label: <><Car className="w-3 h-3" /> Passenger</>,
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      });
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to results
        </button>

        {/* Hero */}
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            isMvum ? 'bg-green-500/10 text-green-700 dark:text-green-300' : 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
          }`}>
            <Path className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold leading-tight text-foreground">{displayName}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${sourceClass}`}>
                {sourceLabel}
              </span>
              {fromDatabase && (
                <span title="Loaded from database cache" className="inline-flex items-center text-muted-foreground">
                  <Database className="w-3.5 h-3.5" weight="fill" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Access pills */}
        {accessPills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {accessPills.map((p) => (
              <span
                key={p.key}
                className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${p.className}`}
              >
                {p.label}
              </span>
            ))}
          </div>
        )}

        {/* Curated details */}
        <div className="space-y-1.5 text-sm">
          {isMvum ? (
            <>
              {road.surfaceType && (
                <DetailRow label="Surface" value={road.surfaceType} />
              )}
              {road.operationalMaintLevel && (
                <DetailRow
                  label="Maintenance level"
                  value={MAINT_LEVEL_LABEL[road.operationalMaintLevel] ?? road.operationalMaintLevel}
                />
              )}
              {road.seasonal && <DetailRow label="Seasonal" value={road.seasonal} />}
            </>
          ) : (
            <>
              {road.highway && (
                <DetailRow label="Highway" value={prettifyValue('highway', road.highway)} />
              )}
              {road.tracktype && (
                <div className="space-y-1">
                  <DetailRow
                    label="Track type"
                    value={TRACKTYPE_LABEL[road.tracktype] ?? road.tracktype}
                  />
                  {historyBlurb && (
                    <p className="text-xs text-muted-foreground leading-snug">
                      {historyBlurb}
                    </p>
                  )}
                </div>
              )}
              {road.surface && (
                <DetailRow label="Surface" value={prettifyValue('surface', road.surface)} />
              )}
              {road.access && (
                <DetailRow label="Access" value={prettifyValue('access', road.access)} />
              )}
            </>
          )}
        </div>

        {/* Raw OSM tags (long tail — smoothness, motor_vehicle, ref, operator, etc.) */}
        {!isMvum && road.osmTags && (
          <RoadOsmTagDetails tags={road.osmTags} />
        )}

        {/* OSM source link */}
        {!isMvum && (
          <a
            href={`https://www.openstreetmap.org/way/${road.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ArrowSquareOut className="w-3 h-3" />
            View way on OpenStreetMap
          </a>
        )}
      </div>

      {/* Fixed bottom action */}
      {midpoint && (
        <div className="shrink-0 border-t border-border bg-background p-3 sm:p-4 md:p-6">
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() =>
              window.open(
                `https://www.google.com/maps/search/?api=1&query=${midpoint.lat},${midpoint.lng}`,
                '_blank'
              )
            }
          >
            <ArrowSquareOut className="w-4 h-4 mr-1.5" />
            Open midpoint in Maps
          </Button>
        </div>
      )}
    </div>
  );
};

interface DetailRowProps {
  label: string;
  value: string;
}

const DetailRow = ({ label, value }: DetailRowProps) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-foreground text-right break-words">{value}</span>
  </div>
);

// Raw OSM tag bag — surfaces every key we got that isn't already shown in
// the curated section above. Designed verbose; refine after observing data.
const ROAD_TAG_KEYS_TO_HIDE = new Set([
  'highway',
  'tracktype',
  'surface',
  'access',
  'name',
  'ref',
  '4wd_only',
]);

interface RoadOsmTagDetailsProps {
  tags: Record<string, string>;
}

const RoadOsmTagDetails = ({ tags }: RoadOsmTagDetailsProps) => {
  const entries = Object.entries(tags).filter(([k]) => !ROAD_TAG_KEYS_TO_HIDE.has(k));
  if (entries.length === 0) return null;

  // Group commonly useful tags up top
  const featured = ['ref', 'smoothness', 'motor_vehicle', 'motorcycle', 'bicycle', 'mtb', 'oneway', 'maxspeed', 'width', 'bridge', 'tunnel', 'ford', 'seasonal', 'operator'];
  const featuredEntries = entries.filter(([k]) => featured.includes(k));
  const otherEntries = entries.filter(([k]) => !featured.includes(k));

  return (
    <div className="pt-3 border-t border-border space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From OSM</p>

      {featuredEntries.length > 0 && (
        <div className="space-y-1.5 text-sm">
          {featuredEntries.map(([k, v]) => (
            <DetailRow key={k} label={prettifyKey(k)} value={prettifyValue(k, String(v))} />
          ))}
        </div>
      )}

      {otherEntries.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            All tags ({otherEntries.length})
          </summary>
          <div className="mt-2 space-y-1">
            {otherEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{prettifyKey(k)}</span>
                <span className="text-foreground text-right break-words">
                  {prettifyValue(k, String(v))}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};


// --- OSM way edit history -------------------------------------------------
// Builds a one-line context blurb to render below the Track type row when
// a way has been tagged at multiple grades over time (e.g. Rusty Nail
// recently softened from grade 5 → grade 3). Returns null when the
// tracktype has never changed (or never been set), so the UI stays clean
// for the boring majority of tracks.
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
