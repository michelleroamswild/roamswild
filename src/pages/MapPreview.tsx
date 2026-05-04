import { useMemo, useState, useCallback } from 'react';
import { Polyline, Polygon } from '@react-google-maps/api';
import { AdvancedMarker } from '@/components/AdvancedMarker';
import { GoogleMap } from '@/components/GoogleMap';
import { useDispersedRoads, MVUMRoad, OSMTrack, PotentialSpot } from '@/hooks/use-dispersed-roads';
import { usePublicLands } from '@/hooks/use-public-lands';
import { useCampsites } from '@/context/CampsitesContext';
import { createSimpleMarkerIcon } from '@/utils/mapMarkers';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import {
  X,
  SpinnerGap,
  MapPin,
  Path,
  Tent,
  Crosshair,
  TreeEvergreen,
  Warning,
  Lightning,
  Copy,
  Check,
} from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

const MOAB = { lat: 38.641439, lng: -109.829551 };
const RADIUS_MILES = 5;

interface CampsiteAnalysis {
  campabilityScore: number;
  summary: string;
  ground: { rating: string; detail: string };
  access: { rating: string; detail: string };
  cover: { rating: string; detail: string };
  hazards: { rating: string; detail: string };
  bestUse: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceNote?: string;
}

const getMVUMColor = (road: MVUMRoad) => {
  if (road.highClearanceVehicle && !road.passengerVehicle) return '#b08856'; // clay
  if (road.atv || road.motorcycle) return '#c89b3c'; // softer amber
  return '#658a4a'; // sage-ish green
};

const getOSMColor = (track: OSMTrack) => {
  if (track.fourWdOnly) return '#b05028'; // ember
  if (track.tracktype === 'grade5' || track.tracktype === 'grade4') return '#b05028';
  if (track.tracktype === 'grade3') return '#b08856';
  if (track.tracktype === 'grade2') return '#b08856';
  if (track.tracktype === 'grade1') return '#3a7aa0'; // water
  if (track.highway === 'track') return '#b08856';
  return '#c89b3c';
};

const toLatLngPath = (coordinates: unknown): google.maps.LatLngLiteral[] => {
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map((coord) => {
      if (Array.isArray(coord) && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
        return { lat: coord[1], lng: coord[0] };
      }
      return null;
    })
    .filter((p): p is google.maps.LatLngLiteral => p !== null);
};

const RATING_TONES: Record<string, string> = {
  good:       'bg-pine-6/12 text-pine-6',
  none:       'bg-pine-6/12 text-pine-6',
  fair:       'bg-clay/15 text-clay',
  minor:      'bg-clay/15 text-clay',
  poor:       'bg-ember/15 text-ember',
  moderate:   'bg-ember/15 text-ember',
  significant:'bg-ember/15 text-ember',
};

const ratingToneFor = (rating: string) => RATING_TONES[rating] || 'bg-cream text-ink-3';

const scoreSolid = (score: number) => {
  if (score >= 70) return 'bg-pine-6 text-cream';
  if (score >= 50) return 'bg-clay text-cream';
  if (score >= 30) return 'bg-ember text-cream';
  return 'bg-ink-3 text-cream';
};

const scoreCardTone = (score: number) => {
  if (score >= 70) return 'border-pine-6/30 bg-pine-6/[0.06]';
  if (score >= 50) return 'border-clay/30 bg-clay/[0.06]';
  if (score >= 30) return 'border-ember/30 bg-ember/[0.06]';
  return 'border-line bg-cream';
};

const getSpotTypeLabel = (type: string) => {
  switch (type) {
    case 'dead-end': return 'Road terminus';
    case 'camp-site': return 'Known campsite';
    case 'intersection': return 'Road junction';
    default: return type;
  }
};

const MapPreview = () => {
  const { isLoaded } = useGoogleMaps();
  const { mvumRoads, osmTracks, potentialSpots, establishedCampgrounds, loading } = useDispersedRoads(
    MOAB.lat,
    MOAB.lng,
    RADIUS_MILES,
  );
  const { publicLands } = usePublicLands(MOAB.lat, MOAB.lng, RADIUS_MILES);
  const { campsites } = useCampsites();

  const [selectedSpot, setSelectedSpot] = useState<PotentialSpot | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  // Helper: build a circle pin DOM element for AdvancedMarkerElement.content.
  const buildCircle = (fillColor: string, scale: number, strokeColor = '#ffffff', strokeWidth = 1): HTMLElement => {
    const div = document.createElement('div');
    const d = scale * 2;
    div.style.width = `${d}px`;
    div.style.height = `${d}px`;
    div.style.borderRadius = '50%';
    div.style.backgroundColor = fillColor;
    div.style.border = `${strokeWidth}px solid ${strokeColor}`;
    div.style.cursor = 'pointer';
    return div;
  };
  const moabContent = useMemo(() => buildCircle('#EA4335', 8, '#B31412', 2), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [analysis, setAnalysis] = useState<CampsiteAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [copiedCoords, setCopiedCoords] = useState(false);

  const displayableTracks = useMemo(() => osmTracks.filter((t) => !t.isPaved), [osmTracks]);

  const handleSpotClick = useCallback((spot: PotentialSpot) => {
    setSelectedSpot(spot);
    setAnalysis(null);
    setAnalyzeError(null);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedSpot(null);
    setAnalysis(null);
    setAnalyzeError(null);
  }, []);

  const handleCopyCoords = useCallback(() => {
    if (!selectedSpot) return;
    navigator.clipboard.writeText(`${selectedSpot.lat.toFixed(5)}, ${selectedSpot.lng.toFixed(5)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  }, [selectedSpot]);

  const handleAnalyze = useCallback(async () => {
    if (!selectedSpot) return;

    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-campsite', {
        body: {
          lat: selectedSpot.lat,
          lng: selectedSpot.lng,
          name: selectedSpot.name,
          type: selectedSpot.type,
          score: selectedSpot.score,
          reasons: selectedSpot.reasons,
          source: selectedSpot.source,
          roadName: selectedSpot.roadName,
          isOnPublicLand: selectedSpot.isOnPublicLand,
        },
      });
      if (error) throw error;
      setAnalysis(data.analysis);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setAnalyzeError(message);
    } finally {
      setAnalyzing(false);
    }
  }, [selectedSpot]);

  if (!isLoaded) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-cream font-sans">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
          <SpinnerGap className="w-5 h-5 animate-spin text-pine-6" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen relative bg-paper text-ink font-sans">
      {loading && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-md border border-line rounded-full px-3.5 py-2 shadow-[0_8px_22px_rgba(29,34,24,.10)]">
          <SpinnerGap className="w-3.5 h-3.5 animate-spin text-pine-6" />
          <Mono className="text-pine-6">Loading spots…</Mono>
        </div>
      )}

      <GoogleMap
        center={MOAB}
        zoom={14}
        className="w-full h-full"
        onLoad={setMapInstance}
        options={{
          mapTypeId: 'hybrid',
          mapTypeControl: true,
          mapTypeControlOptions: {
            position: typeof google !== 'undefined' ? google.maps.ControlPosition?.TOP_RIGHT : undefined,
          },
        }}
      >
        <AdvancedMarker map={mapInstance} position={MOAB} title="Moab, UT" content={moabContent} />

        {publicLands.map((land) => {
          if (!land.polygon || !land.renderOnMap) return null;
          const isBLM = land.managingAgency === 'BLM';
          const isNPS = land.managingAgency === 'NPS';
          const isState = land.managingAgency === 'STATE';
          const isStateTrust = ['SDOL', 'SFW', 'SPR', 'SDNR'].includes(land.managingAgency);
          const isLandTrust = land.managingAgency === 'NGO';
          const fillColor = isBLM
            ? '#d97706'
            : isNPS
              ? '#7c3aed'
              : isState
                ? '#3b82f6'
                : isStateTrust
                  ? '#06b6d4'
                  : isLandTrust
                    ? '#ec4899'
                    : '#10b981';
          const strokeColor = isBLM
            ? '#b45309'
            : isNPS
              ? '#6d28d9'
              : isState
                ? '#2563eb'
                : isStateTrust
                  ? '#0891b2'
                  : isLandTrust
                    ? '#db2777'
                    : '#059669';
          return (
            <Polygon
              key={land.id}
              paths={land.polygon}
              options={{
                fillColor,
                fillOpacity: 0.25,
                strokeColor,
                strokeOpacity: 0.7,
                strokeWeight: 2,
                clickable: false,
                zIndex: 1,
              }}
            />
          );
        })}

        {mvumRoads.map((road) => {
          const path = toLatLngPath(road.geometry?.coordinates);
          if (path.length < 2) return null;
          return (
            <Polyline
              key={`mvum-${road.id}`}
              path={path}
              options={{
                strokeColor: getMVUMColor(road),
                strokeOpacity: 0.7,
                strokeWeight: 2,
                clickable: false,
                zIndex: 10,
              }}
            />
          );
        })}

        {displayableTracks.map((track, index) => {
          const path = toLatLngPath(track.geometry?.coordinates);
          if (path.length < 2) return null;
          return (
            <Polyline
              key={`osm-${track.id}-${index}`}
              path={path}
              options={{
                strokeColor: getOSMColor(track),
                strokeOpacity: 0.7,
                strokeWeight: 2,
                clickable: false,
                zIndex: 10,
              }}
            />
          );
        })}

        {potentialSpots
          .filter((s) => isFinite(s.lat) && isFinite(s.lng))
          .map((spot) => {
            const isSelected = selectedSpot?.id === spot.id;
            let fillColor = '#b05028'; // ember
            if (spot.type === 'camp-site') fillColor = '#3a4a2a'; // pine
            else if (spot.score >= 35) fillColor = '#c89b3c';
            else if (spot.score >= 25) fillColor = '#b08856';
            return (
              <AdvancedMarker
                key={`spot-${spot.id}`}
                map={mapInstance}
                position={{ lat: spot.lat, lng: spot.lng }}
                content={buildCircle(
                  isSelected ? '#ffffff' : fillColor,
                  isSelected ? 10 : 7,
                  isSelected ? fillColor : '#ffffff',
                  isSelected ? 3 : 1,
                )}
                zIndex={isSelected ? 900 : 400}
                onClick={() => handleSpotClick(spot)}
              />
            );
          })}

        {establishedCampgrounds
          .filter((cg) => isFinite(cg.lat) && isFinite(cg.lng))
          .map((cg) => (
            <AdvancedMarker
              key={cg.id}
              map={mapInstance}
              position={{ lat: cg.lat, lng: cg.lng }}
              title={cg.name}
              content={buildCircle('#3a7aa0', 8)}
              zIndex={500}
            />
          ))}

        {campsites
          .filter((cs) => isFinite(cs.lat) && isFinite(cs.lng))
          .map((cs) => (
            <AdvancedMarker
              key={`my-${cs.id}`}
              map={mapInstance}
              position={{ lat: cs.lat, lng: cs.lng }}
              title={cs.name}
              content={createSimpleMarkerIcon('camp', { isActive: false, size: 8 })}
              zIndex={600}
            />
          ))}
      </GoogleMap>

      {/* Spot detail card overlay */}
      {selectedSpot && (
        <div className="absolute top-4 right-4 w-96 max-h-[calc(100vh-2rem)] overflow-y-auto bg-white border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16)] z-50">
          {/* Header */}
          <div className="sticky top-0 bg-cream border-b border-line px-4 py-3 flex items-start justify-between rounded-t-[18px] gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-pine-6 shrink-0" weight="fill" />
                <h3 className="text-[14px] font-sans font-bold tracking-[-0.01em] text-ink truncate">
                  {selectedSpot.name}
                </h3>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cream border border-line text-ink-3 text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                  {getSpotTypeLabel(selectedSpot.type)}
                </span>
                <Mono className="text-ink-3">Score {selectedSpot.score}/50</Mono>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" weight="regular" />
            </button>
          </div>

          {/* Spot info */}
          <div className="px-4 py-3 space-y-3 border-b border-line">
            <div className="flex items-center justify-between">
              <Mono className="text-ink-3">
                {selectedSpot.lat.toFixed(5)}, {selectedSpot.lng.toFixed(5)}
              </Mono>
              <button
                onClick={handleCopyCoords}
                className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-ink-3 hover:text-ink transition-colors"
              >
                {copiedCoords ? <Check className="w-3 h-3 text-pine-6" weight="bold" /> : <Copy className="w-3 h-3" weight="regular" />}
                {copiedCoords ? 'Copied' : 'Copy'}
              </button>
            </div>

            {selectedSpot.reasons.length > 0 && (
              <div>
                <Mono className="text-ink-2 mb-1.5 block">Why it's promising</Mono>
                <div className="flex flex-wrap gap-1">
                  {selectedSpot.reasons.map((reason, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-pine-6/10 text-pine-6 text-[10px] font-mono uppercase tracking-[0.10em] font-semibold"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {selectedSpot.source && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-water/15 text-water text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                  {selectedSpot.source}
                </span>
              )}
              {selectedSpot.isOnPublicLand && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sage/15 text-sage text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                  Public land
                </span>
              )}
              {selectedSpot.roadName && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cream border border-line text-ink-3 text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                  {selectedSpot.roadName}
                </span>
              )}
            </div>
          </div>

          {/* AI Analysis Section */}
          <div className="px-4 py-3">
            {!analysis && !analyzing && !analyzeError && (
              <Pill variant="solid-pine" mono={false} onClick={handleAnalyze} className="!w-full !justify-center">
                <Lightning className="w-3.5 h-3.5" weight="regular" />
                Analyze this spot
              </Pill>
            )}

            {analyzing && (
              <div className="flex flex-col items-center py-6 gap-2">
                <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
                <Mono className="text-pine-6">Analyzing satellite imagery…</Mono>
                <Mono className="text-ink-3">Evaluating terrain, ground, and access</Mono>
              </div>
            )}

            {analyzeError && (
              <div className="space-y-2">
                <div className="px-3 py-2.5 rounded-[12px] border border-ember/30 bg-ember/[0.06]">
                  <p className="text-[13px] text-ember leading-[1.5]">{analyzeError}</p>
                </div>
                <Pill variant="ghost" mono={false} onClick={handleAnalyze} className="!w-full !justify-center">
                  Retry
                </Pill>
              </div>
            )}

            {analysis && (
              <div className="space-y-3">
                {/* Score card */}
                <div className={cn('p-4 rounded-[14px] border', scoreCardTone(analysis.campabilityScore))}>
                  <div className="flex items-center gap-3">
                    <div className={cn('w-14 h-14 rounded-[12px] flex items-center justify-center font-sans font-bold text-[20px] tracking-[-0.01em] shrink-0', scoreSolid(analysis.campabilityScore))}>
                      {analysis.campabilityScore}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-sans font-bold tracking-[-0.005em] text-ink">
                        {analysis.campabilityScore >= 70
                          ? 'Great campsite'
                          : analysis.campabilityScore >= 50
                            ? 'Decent spot'
                            : analysis.campabilityScore >= 30
                              ? 'Marginal'
                              : 'Not recommended'}
                      </p>
                      <Mono className="text-ink-3 mt-0.5 block">
                        AI assessment · {analysis.confidence} confidence
                      </Mono>
                    </div>
                  </div>
                  <p className="text-[13px] text-ink leading-[1.55] mt-3">{analysis.summary}</p>
                </div>

                {/* Factor grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Ground', icon: <Crosshair className="w-3 h-3" weight="regular" />, data: analysis.ground },
                    { label: 'Access', icon: <Path className="w-3 h-3" weight="regular" />, data: analysis.access },
                    { label: 'Cover', icon: <TreeEvergreen className="w-3 h-3" weight="regular" />, data: analysis.cover },
                    { label: 'Hazards', icon: <Warning className="w-3 h-3" weight="regular" />, data: analysis.hazards },
                  ].map(({ label, icon, data }) => (
                    <div key={label} className={cn('p-2.5 rounded-[10px]', ratingToneFor(data.rating))}>
                      <div className="flex items-center gap-1.5 mb-1">
                        {icon}
                        <span className="text-[11px] font-mono uppercase tracking-[0.10em] font-semibold">{label}</span>
                      </div>
                      <p className="text-[12px] leading-[1.45]">{data.detail}</p>
                    </div>
                  ))}
                </div>

                {/* Best use */}
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] border border-pine-6/30 bg-pine-6/[0.06]">
                  <Tent className="w-4 h-4 text-pine-6 shrink-0" weight="regular" />
                  <p className="text-[13px] text-ink font-sans font-semibold tracking-[-0.005em]">{analysis.bestUse}</p>
                </div>

                {/* Re-analyze */}
                <Pill
                  variant="ghost"
                  sm
                  mono={false}
                  onClick={() => {
                    setAnalysis(null);
                    setAnalyzeError(null);
                    if (!selectedSpot) return;
                    setAnalyzing(true);
                    supabase.functions
                      .invoke('analyze-campsite', {
                        body: {
                          lat: selectedSpot.lat,
                          lng: selectedSpot.lng,
                          name: selectedSpot.name,
                          type: selectedSpot.type,
                          score: selectedSpot.score,
                          reasons: selectedSpot.reasons,
                          source: selectedSpot.source,
                          roadName: selectedSpot.roadName,
                          isOnPublicLand: selectedSpot.isOnPublicLand,
                          force: true,
                        },
                      })
                      .then(({ data, error }) => {
                        if (error) setAnalyzeError(error.message);
                        else setAnalysis(data.analysis);
                      })
                      .catch((err: unknown) => setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed'))
                      .finally(() => setAnalyzing(false));
                  }}
                  className="!w-full !justify-center"
                >
                  Re-analyze
                </Pill>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPreview;
