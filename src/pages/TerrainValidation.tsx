/**
 * Terrain Validation Page
 *
 * Developer tool for visual debugging and validation of the
 * photo-moment terrain analysis engine.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Sun,
  Camera,
  Eye,
  EyeSlash,
  MapPin,
  Crosshair,
  ArrowRight,
  Check,
  X,
  Warning,
  Mountains,
  Compass,
  Clock,
  ArrowsClockwise,
  Cube,
  Path,
} from '@phosphor-icons/react';
import { GoogleMap } from '@react-google-maps/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Header } from '@/components/Header';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import {
  TerrainAnalysisResult,
  Subject,
  StandingLocation,
  SunPosition,
  LayerVisibility,
  ValidationStatus,
} from '@/types/terrainValidation';
import { useTerrainAnalysis } from '@/hooks/use-terrain-analysis';

// Map container style
const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

// Default center (Yosemite)
const defaultCenter = { lat: 37.7249, lng: -119.6346 };

// Layer toggle configuration
const LAYER_CONFIG = [
  { key: 'subjects', label: 'Subject polygons', icon: Mountains },
  { key: 'standing', label: 'Standing locations', icon: MapPin },
  { key: 'sunVector', label: 'Sun vector', icon: Sun },
  { key: 'cameraVector', label: 'Camera bearing', icon: Camera },
  { key: 'normals', label: 'Surface normals', icon: Cube },
  { key: 'viewshedRays', label: 'Line of sight', icon: Eye },
  { key: 'rejectedCandidates', label: 'Rejected spots', icon: X },
] as const;

export default function TerrainValidation() {
  const { isLoaded } = useGoogleMaps();

  // Location state
  const [searchQuery, setSearchQuery] = useState('');
  const [lat, setLat] = useState<number | null>(37.7249);
  const [lon, setLon] = useState<number | null>(-119.6346);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [event, setEvent] = useState<'sunrise' | 'sunset'>('sunset');

  // Analysis hook
  const {
    analyze,
    isLoading,
    error,
    result,
    usingMock,
  } = useTerrainAnalysis();

  // Selection state
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [currentMinutes, setCurrentMinutes] = useState(0);

  // Layer visibility
  const [layers, setLayers] = useState<LayerVisibility>({
    demShade: false,
    subjects: true,
    standing: true,
    sunVector: true,
    cameraVector: true,
    normals: false,
    viewshedRays: false,
    rejectedCandidates: false,
  });

  // Map reference and overlays
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapOverlays, setMapOverlays] = useState<(google.maps.Polygon | google.maps.Marker)[]>([]);

  // Get selected subject and standing
  const selectedSubject = useMemo(() => {
    if (!result || selectedSubjectId === null) return null;
    return result.subjects.find((s) => s.subject_id === selectedSubjectId) || null;
  }, [result, selectedSubjectId]);

  const selectedStanding = useMemo(() => {
    if (!result || selectedSubjectId === null) return null;
    return result.standing_locations.find((s) => s.subject_id === selectedSubjectId) || null;
  }, [result, selectedSubjectId]);

  // Get sun at current time (find closest)
  const currentSun = useMemo(() => {
    if (!result || result.sun_track.length === 0) return null;
    return result.sun_track.reduce((closest, s) =>
      Math.abs(s.minutes_from_start - currentMinutes) < Math.abs(closest.minutes_from_start - currentMinutes) ? s : closest
    );
  }, [result, currentMinutes]);

  // Get incidence at current time (find closest)
  const currentIncidence = useMemo(() => {
    if (!selectedSubject || selectedSubject.incidence_series.length === 0) return null;
    return selectedSubject.incidence_series.reduce((closest, i) =>
      Math.abs(i.minutes - currentMinutes) < Math.abs(closest.minutes - currentMinutes) ? i : closest
    );
  }, [selectedSubject, currentMinutes]);

  // Handle place selection
  const handlePlaceSelect = useCallback((place: { name: string; lat: number; lng: number }) => {
    setLat(place.lat);
    setLon(place.lng);
    setSearchQuery(place.name);
  }, []);

  // Run analysis
  const runAnalysis = useCallback(async () => {
    if (!lat || !lon) return;

    setSelectedSubjectId(null);

    try {
      const analysisResult = await analyze({
        lat,
        lon,
        date,
        event,
        radius_km: 2.0,
      });

      // Set initial timeline position
      if (analysisResult.sun_track.length > 0) {
        const midIndex = Math.floor(analysisResult.sun_track.length / 2);
        setCurrentMinutes(analysisResult.sun_track[midIndex].minutes_from_start);
      }

      // Select first subject
      if (analysisResult.subjects.length > 0) {
        setSelectedSubjectId(analysisResult.subjects[0].subject_id);
      }

      // Center map
      if (map) {
        map.panTo({ lat, lng: lon });
        map.setZoom(15);
      }
    } catch (err) {
      // Error is already handled by the hook
      console.error('Analysis failed:', err);
    }
  }, [lat, lon, date, event, map, analyze]);

  // Toggle layer
  const toggleLayer = (key: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Format time from minutes
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours || 12;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
  };

  // Get validation status color
  const getStatusColor = (status: ValidationStatus) => {
    switch (status) {
      case 'pass':
        return 'text-green-600';
      case 'warn':
        return 'text-yellow-600';
      case 'fail':
        return 'text-red-600';
    }
  };

  // Render map overlays - cleanup and recreate when dependencies change
  const updateMapOverlays = useCallback(() => {
    if (!map) return;

    // Clear existing overlays
    mapOverlays.forEach((overlay) => {
      if (overlay instanceof google.maps.Polygon) {
        overlay.setMap(null);
      } else if (overlay instanceof google.maps.Marker) {
        overlay.setMap(null);
      }
    });

    if (!result) {
      setMapOverlays([]);
      return;
    }

    const newOverlays: (google.maps.Polygon | google.maps.Marker)[] = [];

    // Subject polygons
    if (layers.subjects) {
      result.subjects.forEach((subject) => {
        const isSelected = subject.subject_id === selectedSubjectId;
        const polygon = new google.maps.Polygon({
          paths: subject.polygon.map(([lat, lon]) => ({ lat, lng: lon })),
          strokeColor: isSelected ? '#f59e0b' : '#8b5cf6',
          strokeWeight: isSelected ? 3 : 2,
          fillColor: isSelected ? '#f59e0b' : '#8b5cf6',
          fillOpacity: isSelected ? 0.4 : 0.25,
          map,
        });

        polygon.addListener('click', () => {
          setSelectedSubjectId(subject.subject_id);
        });

        newOverlays.push(polygon);

        // Add centroid marker for subject
        const centroidMarker = new google.maps.Marker({
          position: { lat: subject.centroid.lat, lng: subject.centroid.lon },
          map,
          icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: isSelected ? '#f59e0b' : '#8b5cf6',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 1,
            rotation: subject.properties.face_direction_deg,
          },
          title: `Subject #${subject.subject_id} - Face: ${subject.properties.face_direction_deg.toFixed(0)}°`,
        });

        newOverlays.push(centroidMarker);
      });
    }

    // Standing locations
    if (layers.standing) {
      result.standing_locations.forEach((standing) => {
        const marker = new google.maps.Marker({
          position: { lat: standing.location.lat, lng: standing.location.lon },
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#10b981',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
          title: `Standing #${standing.standing_id} for Subject #${standing.subject_id}`,
        });

        newOverlays.push(marker);
      });
    }

    setMapOverlays(newOverlays);
  }, [result, map, layers, selectedSubjectId, mapOverlays]);

  // Effect to update overlays when dependencies change
  React.useEffect(() => {
    updateMapOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, map, layers.subjects, layers.standing, selectedSubjectId]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Panel - Search & Controls */}
        <div className="w-80 border-r bg-muted/30 flex flex-col overflow-hidden">
          <div className="p-4 border-b space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                <Crosshair className="w-4 h-4" />
                TERRAIN VALIDATOR
              </div>
              {usingMock && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-mono rounded">
                  MOCK
                </span>
              )}
            </div>

            {/* Place Search */}
            <div>
              <label className="text-xs font-mono text-muted-foreground">LOCATION</label>
              <PlaceSearch
                onPlaceSelect={handlePlaceSelect}
                placeholder="Search place..."
              />
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-mono text-muted-foreground">LAT</label>
                <Input
                  type="number"
                  step="0.00001"
                  value={lat ?? ''}
                  onChange={(e) => setLat(parseFloat(e.target.value) || null)}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground">LON</label>
                <Input
                  type="number"
                  step="0.00001"
                  value={lon ?? ''}
                  onChange={(e) => setLon(parseFloat(e.target.value) || null)}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {/* Date & Event */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-mono text-muted-foreground">DATE</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground">EVENT</label>
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value as 'sunrise' | 'sunset')}
                  className="w-full h-10 px-3 border rounded-md font-mono text-sm bg-background"
                >
                  <option value="sunset">Sunset</option>
                  <option value="sunrise">Sunrise</option>
                </select>
              </div>
            </div>

            {/* Run Button */}
            <Button
              onClick={runAnalysis}
              disabled={!lat || !lon || isLoading}
              className="w-full font-mono"
            >
              {isLoading ? (
                <>
                  <ArrowsClockwise className="w-4 h-4 mr-2 animate-spin" />
                  RUNNING...
                </>
              ) : (
                <>
                  <Crosshair className="w-4 h-4 mr-2" />
                  RUN ANALYSIS
                </>
              )}
            </Button>

            {error && (
              <div className="p-2 bg-red-100 text-red-700 rounded text-sm font-mono">
                {error}
              </div>
            )}
          </div>

          {/* Layer Toggles */}
          <div className="p-4 border-b">
            <div className="text-xs font-mono text-muted-foreground mb-2">LAYERS</div>
            <div className="space-y-1">
              {LAYER_CONFIG.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => toggleLayer(key as keyof LayerVisibility)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm font-mono transition-colors ${
                    layers[key as keyof LayerVisibility]
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {layers[key as keyof LayerVisibility] ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeSlash className="w-4 h-4" />
                  )}
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          {result && (
            <div className="p-4 border-b">
              <div className="text-xs font-mono text-muted-foreground mb-2">
                <Clock className="w-3 h-3 inline mr-1" />
                TIMELINE
              </div>

              <input
                type="range"
                min={result.sun_track[0]?.minutes_from_start ?? 0}
                max={result.sun_track[result.sun_track.length - 1]?.minutes_from_start ?? 100}
                value={currentMinutes}
                onChange={(e) => setCurrentMinutes(parseInt(e.target.value))}
                className="w-full"
              />

              <div className="flex justify-between text-xs font-mono text-muted-foreground mt-1">
                <span>{formatTime(result.sun_track[0]?.minutes_from_start ?? 0)}</span>
                <span className="text-primary">
                  {formatTime(currentMinutes)}
                </span>
                <span>
                  {formatTime(result.sun_track[result.sun_track.length - 1]?.minutes_from_start ?? 0)}
                </span>
              </div>

              {currentSun && (
                <div className="mt-2 p-2 bg-muted rounded text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">sun_az:</span>
                    <span>{currentSun.azimuth_deg.toFixed(1)}°</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">sun_alt:</span>
                    <span>{currentSun.altitude_deg.toFixed(2)}°</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subject List */}
          {result && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-xs font-mono text-muted-foreground mb-2">
                SUBJECTS ({result.subjects.length})
              </div>
              <div className="space-y-2">
                {result.subjects.map((subject) => (
                  <button
                    key={subject.subject_id}
                    onClick={() => setSelectedSubjectId(subject.subject_id)}
                    className={`w-full p-2 rounded border text-left transition-colors ${
                      selectedSubjectId === subject.subject_id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">Subject #{subject.subject_id}</span>
                      {subject.glow_window ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <X className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">
                      slope: {subject.properties.slope_deg.toFixed(1)}° | face: {subject.properties.face_direction_deg.toFixed(0)}°
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center - Map */}
        <div className="flex-1 relative">
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={lat && lon ? { lat, lng: lon } : defaultCenter}
              zoom={14}
              onLoad={setMap}
              options={{
                mapTypeId: 'terrain',
                mapTypeControl: true,
                streetViewControl: false,
                fullscreenControl: false,
              }}
            >
              {/* Overlays managed via useEffect */}
            </GoogleMap>
          ) : (
            <div className="flex items-center justify-center h-full bg-muted">
              <ArrowsClockwise className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Map Legend */}
          <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur p-3 rounded-lg shadow-lg">
            <div className="text-xs font-mono space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded-sm bg-violet-500/50 border border-violet-500" />
                <span>Subject polygon (steep terrain)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-violet-500" />
                <span>Subject centroid (arrow = face dir)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span>Standing location (photographer)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded-sm bg-amber-500/50 border border-amber-500" />
                <span>Selected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Inspector */}
        <div className="w-96 border-l bg-muted/30 overflow-y-auto">
          {selectedSubject ? (
            <div className="p-4 space-y-4">
              {/* Subject Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-mono font-bold">SUBJECT #{selectedSubject.subject_id}</h3>
                {selectedSubject.glow_window ? (
                  <span className="flex items-center gap-1 text-green-600 text-sm">
                    <Check className="w-4 h-4" /> VALID
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 text-sm">
                    <X className="w-4 h-4" /> NO GLOW
                  </span>
                )}
              </div>

              {/* Location Section */}
              <InspectorSection title="LOCATION">
                <InspectorRow label="lat" value={selectedSubject.centroid.lat.toFixed(5)} />
                <InspectorRow label="lon" value={selectedSubject.centroid.lon.toFixed(5)} />
                <InspectorRow label="elev" value={`${selectedSubject.properties.elevation_m.toFixed(1)}m`} />
              </InspectorSection>

              {/* Geometry Section */}
              <InspectorSection title="GEOMETRY">
                <InspectorRow label="slope" value={`${selectedSubject.properties.slope_deg.toFixed(1)}°`} />
                <InspectorRow label="aspect" value={`${selectedSubject.properties.aspect_deg.toFixed(1)}°`} />
                <InspectorRow label="face_dir" value={`${selectedSubject.properties.face_direction_deg.toFixed(1)}°`} />
                <InspectorRow label="area" value={`${selectedSubject.properties.area_m2.toFixed(0)} m²`} />
              </InspectorSection>

              {/* Normal Vector Section */}
              <InspectorSection title="NORMAL VECTOR">
                <InspectorRow label="Nx" value={selectedSubject.properties.normal[0].toFixed(3)} />
                <InspectorRow label="Ny" value={selectedSubject.properties.normal[1].toFixed(3)} />
                <InspectorRow label="Nz" value={selectedSubject.properties.normal[2].toFixed(3)} />
                <InspectorRow
                  label="|N|"
                  value={Math.sqrt(
                    selectedSubject.properties.normal[0] ** 2 +
                    selectedSubject.properties.normal[1] ** 2 +
                    selectedSubject.properties.normal[2] ** 2
                  ).toFixed(4)}
                  status={
                    Math.abs(
                      Math.sqrt(
                        selectedSubject.properties.normal[0] ** 2 +
                        selectedSubject.properties.normal[1] ** 2 +
                        selectedSubject.properties.normal[2] ** 2
                      ) - 1
                    ) < 0.01
                      ? 'pass'
                      : 'fail'
                  }
                />
              </InspectorSection>

              {/* Sun at Current Time */}
              {currentSun && (
                <InspectorSection title={`SUN @ t=${currentMinutes}min`}>
                  <InspectorRow label="azimuth" value={`${currentSun.azimuth_deg.toFixed(1)}°`} />
                  <InspectorRow label="altitude" value={`${currentSun.altitude_deg.toFixed(2)}°`} />
                  <InspectorRow label="Sx" value={currentSun.vector[0].toFixed(3)} />
                  <InspectorRow label="Sy" value={currentSun.vector[1].toFixed(3)} />
                  <InspectorRow label="Sz" value={currentSun.vector[2].toFixed(3)} />
                </InspectorSection>
              )}

              {/* Incidence at Current Time */}
              {currentIncidence && (
                <InspectorSection title="INCIDENCE">
                  <InspectorRow label="incidence" value={currentIncidence.incidence.toFixed(3)} />
                  <InspectorRow label="glow_score" value={currentIncidence.glow_score.toFixed(3)} />
                  <InspectorRow
                    label="in_range"
                    value={currentIncidence.incidence >= 0.05 && currentIncidence.incidence <= 0.4 ? 'YES' : 'NO'}
                    status={currentIncidence.incidence >= 0.05 && currentIncidence.incidence <= 0.4 ? 'pass' : 'warn'}
                  />
                </InspectorSection>
              )}

              {/* Glow Window */}
              {selectedSubject.glow_window && (
                <InspectorSection title="GLOW WINDOW">
                  <InspectorRow label="start" value={`t=${selectedSubject.glow_window.start_minutes}min`} />
                  <InspectorRow label="end" value={`t=${selectedSubject.glow_window.end_minutes}min`} />
                  <InspectorRow label="peak" value={`t=${selectedSubject.glow_window.peak_minutes}min`} />
                  <InspectorRow label="duration" value={`${selectedSubject.glow_window.duration_minutes}min`} />
                  <InspectorRow label="peak_score" value={selectedSubject.glow_window.peak_glow_score.toFixed(3)} />
                </InspectorSection>
              )}

              {/* Shadow Check */}
              <InspectorSection title="SHADOW CHECK">
                <InspectorRow
                  label="sun_visible"
                  value={selectedSubject.shadow_check.sun_visible ? 'YES' : 'NO'}
                  status={selectedSubject.shadow_check.sun_visible ? 'pass' : 'fail'}
                />
                {selectedSubject.shadow_check.samples.map((s, i) => (
                  <InspectorRow
                    key={i}
                    label={`@ ${s.distance_m}m`}
                    value={`ray=${s.ray_z.toFixed(0)} terr=${s.terrain_z.toFixed(0)}`}
                    status={s.blocked ? 'fail' : 'pass'}
                  />
                ))}
              </InspectorSection>

              {/* Validation */}
              <InspectorSection title="VALIDATION">
                <ValidationRow
                  label="normal_unit"
                  check={Math.abs(selectedSubject.validation.normal_unit_length - 1) < 0.01}
                  detail={selectedSubject.validation.normal_unit_length.toFixed(4)}
                />
                <ValidationRow
                  label="aspect_match"
                  check={selectedSubject.validation.aspect_normal_match_deg < 5}
                  detail={`${selectedSubject.validation.aspect_normal_match_deg.toFixed(1)}° diff`}
                />
                <ValidationRow
                  label="glow_found"
                  check={selectedSubject.validation.glow_in_range}
                />
                <ValidationRow
                  label="sun_visible"
                  check={selectedSubject.validation.sun_visible_at_peak}
                />
              </InspectorSection>

              {/* Standing Location */}
              {selectedStanding && (
                <>
                  <div className="border-t pt-4 mt-4">
                    <h3 className="font-mono font-bold mb-4">STANDING LOCATION</h3>
                  </div>

                  <InspectorSection title="POSITION">
                    <InspectorRow label="lat" value={selectedStanding.location.lat.toFixed(5)} />
                    <InspectorRow label="lon" value={selectedStanding.location.lon.toFixed(5)} />
                    <InspectorRow label="elev" value={`${selectedStanding.properties.elevation_m.toFixed(1)}m`} />
                    <InspectorRow label="slope" value={`${selectedStanding.properties.slope_deg.toFixed(1)}°`} />
                    <InspectorRow
                      label="standable"
                      value={selectedStanding.properties.slope_deg <= 15 ? 'YES' : 'NO'}
                      status={selectedStanding.properties.slope_deg <= 15 ? 'pass' : 'fail'}
                    />
                  </InspectorSection>

                  <InspectorSection title="CAMERA">
                    <InspectorRow label="bearing" value={`${selectedStanding.properties.camera_bearing_deg.toFixed(1)}°`} />
                    <InspectorRow label="distance" value={`${selectedStanding.properties.distance_to_subject_m}m`} />
                    <InspectorRow label="elev_diff" value={`${selectedStanding.properties.elevation_diff_m.toFixed(1)}m`} />
                  </InspectorSection>

                  <InspectorSection title="LINE OF SIGHT">
                    <InspectorRow
                      label="clear"
                      value={selectedStanding.line_of_sight.clear ? 'YES' : 'BLOCKED'}
                      status={selectedStanding.line_of_sight.clear ? 'pass' : 'fail'}
                    />
                    {selectedStanding.line_of_sight.samples.map((s, i) => (
                      <InspectorRow
                        key={i}
                        label={`t=${s.t.toFixed(2)}`}
                        value={`ray=${s.ray_z.toFixed(1)} terr=${s.terrain_z.toFixed(1)}`}
                        status={s.blocked ? 'fail' : 'pass'}
                      />
                    ))}
                  </InspectorSection>

                  <InspectorSection title="CANDIDATE SEARCH">
                    <InspectorRow label="checked" value={selectedStanding.candidate_search.candidates_checked.toString()} />
                    {selectedStanding.candidate_search.rejected.map((rej, i) => (
                      <InspectorRow
                        key={i}
                        label={`@ ${rej.distance_m}m`}
                        value={rej.reason.replace(/_/g, ' ')}
                        status="fail"
                      />
                    ))}
                    <InspectorRow
                      label="selected"
                      value={`@ ${selectedStanding.candidate_search.selected_at_distance_m}m`}
                      status="pass"
                    />
                  </InspectorSection>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Mountains className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="font-mono text-sm">
                  {result ? 'Click a subject to inspect' : 'Run analysis to begin'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Inspector Section Component
function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-mono text-muted-foreground mb-1">{title}</div>
      <div className="bg-background border rounded p-2 space-y-1">{children}</div>
    </div>
  );
}

// Inspector Row Component
function InspectorRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string | number;
  status?: ValidationStatus;
}) {
  const statusColors = {
    pass: 'text-green-600',
    warn: 'text-yellow-600',
    fail: 'text-red-600',
  };

  return (
    <div className="flex justify-between text-xs font-mono">
      <span className="text-muted-foreground">{label}:</span>
      <span className={status ? statusColors[status] : ''}>{value}</span>
    </div>
  );
}

// Validation Row Component
function ValidationRow({
  label,
  check,
  detail,
}: {
  label: string;
  check: boolean;
  detail?: string;
}) {
  return (
    <div className="flex justify-between text-xs font-mono">
      <span className="flex items-center gap-1">
        {check ? (
          <Check className="w-3 h-3 text-green-600" />
        ) : (
          <X className="w-3 h-3 text-red-600" />
        )}
        {label}
      </span>
      {detail && <span className="text-muted-foreground">{detail}</span>}
    </div>
  );
}
