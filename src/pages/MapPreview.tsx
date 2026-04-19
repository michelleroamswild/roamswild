import { useMemo, useState, useCallback } from 'react';
import { Polyline, Marker, Polygon } from '@react-google-maps/api';
import { GoogleMap } from '@/components/GoogleMap';
import { useDispersedRoads, MVUMRoad, OSMTrack, PotentialSpot } from '@/hooks/use-dispersed-roads';
import { usePublicLands } from '@/hooks/use-public-lands';
import { useCampsites } from '@/context/CampsitesContext';
import { createSimpleMarkerIcon } from '@/utils/mapMarkers';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { X, SpinnerGap, MapPin, Path, Tent, Crosshair, TreeEvergreen, Warning, Lightning, Copy, Check } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

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
  if (road.highClearanceVehicle && !road.passengerVehicle) return '#f97316';
  if (road.atv || road.motorcycle) return '#eab308';
  return '#22c55e';
};

const getOSMColor = (track: OSMTrack) => {
  if (track.fourWdOnly) return '#ef4444';
  if (track.tracktype === 'grade5' || track.tracktype === 'grade4') return '#ef4444';
  if (track.tracktype === 'grade3') return '#f97316';
  if (track.tracktype === 'grade2') return '#f97316';
  if (track.tracktype === 'grade1') return '#3b82f6';
  if (track.highway === 'track') return '#f97316';
  return '#eab308';
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

const getRatingColor = (rating: string) => {
  switch (rating) {
    case 'good': case 'none': return 'text-green-600 bg-green-50';
    case 'fair': case 'minor': return 'text-amber-600 bg-amber-50';
    case 'poor': case 'moderate': case 'significant': return 'text-red-600 bg-red-50';
    default: return 'text-muted-foreground bg-muted';
  }
};

const getScoreColor = (score: number) => {
  if (score >= 70) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  if (score >= 30) return 'bg-orange-500';
  return 'bg-red-500';
};

const getSpotTypeLabel = (type: string) => {
  switch (type) {
    case 'dead-end': return 'Road Terminus';
    case 'camp-site': return 'Known Campsite';
    case 'intersection': return 'Road Junction';
    default: return type;
  }
};

const MapPreview = () => {
  const { isLoaded } = useGoogleMaps();
  const { mvumRoads, osmTracks, potentialSpots, establishedCampgrounds, loading } = useDispersedRoads(
    MOAB.lat,
    MOAB.lng,
    RADIUS_MILES
  );
  const { publicLands } = usePublicLands(MOAB.lat, MOAB.lng, RADIUS_MILES);
  const { campsites } = useCampsites();

  const [selectedSpot, setSelectedSpot] = useState<PotentialSpot | null>(null);
  const [analysis, setAnalysis] = useState<CampsiteAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [copiedCoords, setCopiedCoords] = useState(false);

  const displayableTracks = useMemo(() => osmTracks.filter((t) => !t.isPaved), [osmTracks]);

  if (!isLoaded) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <SpinnerGap className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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

  return (
    <div className="w-screen h-screen relative">
      {loading && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-background/90 border border-border rounded-lg px-3 py-2 shadow-md">
          <SpinnerGap className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Loading spots...</span>
        </div>
      )}
      <GoogleMap
        center={MOAB}
        zoom={14}
        className="w-full h-full"
        options={{
          mapTypeId: 'hybrid',
          mapTypeControl: true,
          mapTypeControlOptions: {
            position: typeof google !== 'undefined' ? google.maps.ControlPosition?.TOP_RIGHT : undefined,
          },
        }}
      >
        <Marker position={MOAB} title="Moab, UT" />

        {publicLands.map((land) => {
          if (!land.polygon || !land.renderOnMap) return null;
          const isBLM = land.managingAgency === 'BLM';
          const isNPS = land.managingAgency === 'NPS';
          const isState = land.managingAgency === 'STATE';
          const isStateTrust = ['SDOL', 'SFW', 'SPR', 'SDNR'].includes(land.managingAgency);
          const isLandTrust = land.managingAgency === 'NGO';
          const fillColor = isBLM ? '#d97706' : isNPS ? '#7c3aed' : isState ? '#3b82f6' : isStateTrust ? '#06b6d4' : isLandTrust ? '#ec4899' : '#10b981';
          const strokeColor = isBLM ? '#b45309' : isNPS ? '#6d28d9' : isState ? '#2563eb' : isStateTrust ? '#0891b2' : isLandTrust ? '#db2777' : '#059669';
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
            let fillColor = '#e83a3a';
            if (spot.type === 'camp-site') fillColor = '#3d7a40';
            else if (spot.score >= 35) fillColor = '#eab308';
            else if (spot.score >= 25) fillColor = '#f97316';
            return (
              <Marker
                key={`spot-${spot.id}`}
                position={{ lat: spot.lat, lng: spot.lng }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor: isSelected ? '#ffffff' : fillColor,
                  fillOpacity: 1,
                  strokeColor: isSelected ? fillColor : '#ffffff',
                  strokeWeight: isSelected ? 3 : 1,
                  scale: isSelected ? 10 : 7,
                }}
                zIndex={isSelected ? 900 : 400}
                onClick={() => handleSpotClick(spot)}
              />
            );
          })}

        {establishedCampgrounds
          .filter((cg) => isFinite(cg.lat) && isFinite(cg.lng))
          .map((cg) => (
            <Marker
              key={cg.id}
              position={{ lat: cg.lat, lng: cg.lng }}
              title={cg.name}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: '#3b82f6',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 1,
                scale: 8,
              }}
              zIndex={500}
            />
          ))}

        {campsites
          .filter((cs) => isFinite(cs.lat) && isFinite(cs.lng))
          .map((cs) => (
            <Marker
              key={`my-${cs.id}`}
              position={{ lat: cs.lat, lng: cs.lng }}
              title={cs.name}
              icon={createSimpleMarkerIcon('camp', { isActive: false, size: 8 })}
              zIndex={600}
            />
          ))}
      </GoogleMap>

      {/* Spot Detail Card Overlay */}
      {selectedSpot && (
        <div className="absolute top-4 right-4 w-96 max-h-[calc(100vh-2rem)] overflow-y-auto bg-background border border-border rounded-xl shadow-2xl z-50">
          {/* Header */}
          <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-start justify-between rounded-t-xl">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary shrink-0" weight="fill" />
                <h3 className="font-bold text-sm truncate">{selectedSpot.name}</h3>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {getSpotTypeLabel(selectedSpot.type)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Score: {selectedSpot.score}/50
                </span>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Spot Info */}
          <div className="px-4 py-3 space-y-3 border-b">
            {/* Coordinates */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">
                {selectedSpot.lat.toFixed(5)}, {selectedSpot.lng.toFixed(5)}
              </span>
              <button
                onClick={handleCopyCoords}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedCoords ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedCoords ? 'Copied' : 'Copy'}
              </button>
            </div>

            {/* Reasons */}
            {selectedSpot.reasons.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Why it's promising</div>
                <div className="flex flex-wrap gap-1">
                  {selectedSpot.reasons.map((reason, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Source & Access */}
            <div className="flex flex-wrap gap-1.5">
              {selectedSpot.source && (
                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                  {selectedSpot.source.toUpperCase()}
                </span>
              )}
              {selectedSpot.isOnPublicLand && (
                <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 font-medium">
                  Public Land
                </span>
              )}
              {selectedSpot.roadName && (
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {selectedSpot.roadName}
                </span>
              )}
            </div>
          </div>

          {/* AI Analysis Section */}
          <div className="px-4 py-3">
            {!analysis && !analyzing && !analyzeError && (
              <Button
                onClick={handleAnalyze}
                className="w-full"
                variant="default"
              >
                <Lightning className="w-4 h-4 mr-2" weight="fill" />
                Analyze This Spot
              </Button>
            )}

            {analyzing && (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <SpinnerGap className="w-6 h-6 animate-spin mb-2" />
                <span className="text-sm font-medium">Analyzing satellite imagery...</span>
                <span className="text-xs mt-1">Evaluating terrain, ground, and access</span>
              </div>
            )}

            {analyzeError && (
              <div className="space-y-2">
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {analyzeError}
                </div>
                <Button onClick={handleAnalyze} variant="outline" size="sm" className="w-full">
                  Retry
                </Button>
              </div>
            )}

            {analysis && (
              <div className="space-y-3">
                {/* Score Card */}
                <div className={`p-4 rounded-xl border-2 ${
                  analysis.campabilityScore >= 70 ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50' :
                  analysis.campabilityScore >= 50 ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50' :
                  analysis.campabilityScore >= 30 ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50' :
                  'border-red-300 bg-gradient-to-br from-red-50 to-orange-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0 ${getScoreColor(analysis.campabilityScore)}`}>
                      {analysis.campabilityScore}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">
                        {analysis.campabilityScore >= 70 ? 'Great Campsite' :
                         analysis.campabilityScore >= 50 ? 'Decent Spot' :
                         analysis.campabilityScore >= 30 ? 'Marginal' : 'Not Recommended'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        AI Assessment • {analysis.confidence} confidence
                      </p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed mt-3">{analysis.summary}</p>
                </div>

                {/* Factor Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Ground', icon: <Crosshair className="w-3.5 h-3.5" />, data: analysis.ground },
                    { label: 'Access', icon: <Path className="w-3.5 h-3.5" />, data: analysis.access },
                    { label: 'Cover', icon: <TreeEvergreen className="w-3.5 h-3.5" />, data: analysis.cover },
                    { label: 'Hazards', icon: <Warning className="w-3.5 h-3.5" />, data: analysis.hazards },
                  ].map(({ label, icon, data }) => (
                    <div key={label} className={`p-2.5 rounded-lg ${getRatingColor(data.rating)}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        {icon}
                        <span className="text-xs font-semibold">{label}</span>
                      </div>
                      <p className="text-xs leading-snug">{data.detail}</p>
                    </div>
                  ))}
                </div>

                {/* Best Use */}
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg">
                  <Tent className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-sm font-medium">{analysis.bestUse}</p>
                </div>

                {/* Re-analyze */}
                <Button onClick={() => {
                  setAnalysis(null);
                  setAnalyzeError(null);
                  // Re-run with force to bypass cache
                  if (!selectedSpot) return;
                  setAnalyzing(true);
                  supabase.functions.invoke('analyze-campsite', {
                    body: { lat: selectedSpot.lat, lng: selectedSpot.lng, name: selectedSpot.name, type: selectedSpot.type, score: selectedSpot.score, reasons: selectedSpot.reasons, source: selectedSpot.source, roadName: selectedSpot.roadName, isOnPublicLand: selectedSpot.isOnPublicLand, force: true },
                  }).then(({ data, error }) => {
                    if (error) setAnalyzeError(error.message);
                    else setAnalysis(data.analysis);
                  }).catch((err: unknown) => setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed'))
                    .finally(() => setAnalyzing(false));
                }} variant="ghost" size="sm" className="w-full text-xs">
                  Re-analyze
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPreview;
