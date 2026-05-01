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
  Check,
  X,
  Mountains,
  Clock,
  ArrowsClockwise,
  Cube,
} from '@phosphor-icons/react';
import { GoogleMap } from '@react-google-maps/api';
import { Input } from '@/components/ui/input';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Header } from '@/components/Header';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';
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

  // Get validation status color (Pine + Paper tokens)
  const getStatusColor = (status: ValidationStatus) => {
    switch (status) {
      case 'pass':
        return 'text-pine-6';
      case 'warn':
        return 'text-clay';
      case 'fail':
        return 'text-ember';
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
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Header />

      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Panel - Search & Controls */}
        <div className="w-80 border-r border-line bg-cream flex flex-col overflow-hidden">
          <div className="p-4 border-b border-line space-y-4">
            <div className="flex items-center justify-between">
              <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                <Crosshair className="w-3 h-3" weight="regular" />
                Terrain validator
              </Mono>
              {usingMock && (
                <span className="px-2 py-0.5 rounded-full bg-clay/15 text-clay text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                  Mock
                </span>
              )}
            </div>

            {/* Place Search */}
            <div className="space-y-1.5">
              <Mono className="text-ink-2 block">Location</Mono>
              <PlaceSearch onPlaceSelect={handlePlaceSelect} placeholder="Search place…" />
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Mono className="text-ink-2 block">Lat</Mono>
                <Input
                  type="number"
                  step="0.00001"
                  value={lat ?? ''}
                  onChange={(e) => setLat(parseFloat(e.target.value) || null)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Mono className="text-ink-2 block">Lon</Mono>
                <Input
                  type="number"
                  step="0.00001"
                  value={lon ?? ''}
                  onChange={(e) => setLon(parseFloat(e.target.value) || null)}
                  className="font-mono"
                />
              </div>
            </div>

            {/* Date & Event */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Mono className="text-ink-2 block">Date</Mono>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Mono className="text-ink-2 block">Event</Mono>
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value as 'sunrise' | 'sunset')}
                  className="w-full h-10 px-3 rounded-[12px] border border-line bg-white text-ink text-[14px] outline-none focus:border-pine-6 transition-colors"
                >
                  <option value="sunset">Sunset</option>
                  <option value="sunrise">Sunrise</option>
                </select>
              </div>
            </div>

            {/* Run Button */}
            <Pill
              variant="solid-pine"
              mono={false}
              onClick={runAnalysis}
              className={cn('!w-full !justify-center', (!lat || !lon || isLoading) && 'opacity-50 pointer-events-none')}
            >
              {isLoading ? (
                <>
                  <ArrowsClockwise className="w-3.5 h-3.5 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Crosshair className="w-3.5 h-3.5" weight="regular" />
                  Run analysis
                </>
              )}
            </Pill>

            {error && (
              <div className="px-3 py-2.5 rounded-[12px] border border-ember/30 bg-ember/[0.06]">
                <p className="text-[13px] text-ember leading-[1.5]">{error}</p>
              </div>
            )}
          </div>

          {/* Layer Toggles */}
          <div className="p-4 border-b border-line">
            <Mono className="text-ink-2 mb-2 block">Layers</Mono>
            <div className="space-y-1">
              {LAYER_CONFIG.map(({ key, label, icon: Icon }) => {
                const on = layers[key as keyof LayerVisibility];
                return (
                  <button
                    key={key}
                    onClick={() => toggleLayer(key as keyof LayerVisibility)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[12px] font-sans transition-colors',
                      on
                        ? 'bg-pine-6/12 text-pine-6 font-semibold'
                        : 'text-ink-3 hover:bg-paper-2',
                    )}
                  >
                    {on ? <Eye className="w-3.5 h-3.5" weight="regular" /> : <EyeSlash className="w-3.5 h-3.5" weight="regular" />}
                    <Icon className="w-3.5 h-3.5" weight="regular" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timeline */}
          {result && (
            <div className="p-4 border-b border-line">
              <Mono className="text-ink-2 inline-flex items-center gap-1 mb-2">
                <Clock className="w-3 h-3" weight="regular" />
                Timeline
              </Mono>

              <input
                type="range"
                min={result.sun_track[0]?.minutes_from_start ?? 0}
                max={result.sun_track[result.sun_track.length - 1]?.minutes_from_start ?? 100}
                value={currentMinutes}
                onChange={(e) => setCurrentMinutes(parseInt(e.target.value))}
                className="w-full accent-pine-6 cursor-grab active:cursor-grabbing"
              />

              <div className="flex justify-between mt-1">
                <Mono className="text-ink-3">{formatTime(result.sun_track[0]?.minutes_from_start ?? 0)}</Mono>
                <Mono className="text-pine-6">{formatTime(currentMinutes)}</Mono>
                <Mono className="text-ink-3">
                  {formatTime(result.sun_track[result.sun_track.length - 1]?.minutes_from_start ?? 0)}
                </Mono>
              </div>

              {currentSun && (
                <div className="mt-2.5 px-3 py-2 rounded-[10px] bg-white border border-line space-y-1">
                  <div className="flex justify-between">
                    <Mono className="text-ink-3">sun_az</Mono>
                    <span className="font-mono text-[12px] text-ink">{currentSun.azimuth_deg.toFixed(1)}°</span>
                  </div>
                  <div className="flex justify-between">
                    <Mono className="text-ink-3">sun_alt</Mono>
                    <span className="font-mono text-[12px] text-ink">{currentSun.altitude_deg.toFixed(2)}°</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subject List */}
          {result && (
            <div className="flex-1 overflow-y-auto p-4">
              <Mono className="text-ink-2 mb-2 block">Subjects ({result.subjects.length})</Mono>
              <div className="space-y-1.5">
                {result.subjects.map((subject) => (
                  <button
                    key={subject.subject_id}
                    onClick={() => setSelectedSubjectId(subject.subject_id)}
                    className={cn(
                      'w-full p-2.5 rounded-[10px] border text-left transition-colors bg-white',
                      selectedSubjectId === subject.subject_id
                        ? 'border-pine-6 bg-pine-6/[0.06]'
                        : 'border-line hover:border-ink-3/50',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-sans font-semibold tracking-[-0.005em] text-[13px] text-ink">
                        Subject #{subject.subject_id}
                      </span>
                      {subject.glow_window ? (
                        <Check className="w-4 h-4 text-pine-6" weight="bold" />
                      ) : (
                        <X className="w-4 h-4 text-ember" weight="bold" />
                      )}
                    </div>
                    <Mono className="text-ink-3 mt-1 block">
                      slope: {subject.properties.slope_deg.toFixed(1)}° | face:{' '}
                      {subject.properties.face_direction_deg.toFixed(0)}°
                    </Mono>
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
            <div className="flex items-center justify-center h-full bg-cream">
              <ArrowsClockwise className="w-6 h-6 animate-spin text-pine-6" />
            </div>
          )}

          {/* Map Legend */}
          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md border border-line p-3.5 rounded-[14px] shadow-[0_8px_22px_rgba(29,34,24,.10)]">
            <Mono className="text-ink-2 mb-2 block">Legend</Mono>
            <div className="space-y-1.5 text-[12px] text-ink-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded-sm bg-clay/40 border border-clay" />
                <span>Subject polygon (steep terrain)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-clay" />
                <span>Subject centroid (arrow = face dir)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-pine-6" />
                <span>Standing location (photographer)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded-sm bg-ember/40 border border-ember" />
                <span>Selected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Inspector */}
        <div className="w-96 border-l border-line bg-cream overflow-y-auto">
          {selectedSubject ? (
            <div className="p-4 space-y-4">
              {/* Subject Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-sans font-bold tracking-[-0.01em] text-ink text-[16px]">
                  Subject #{selectedSubject.subject_id}
                </h3>
                {selectedSubject.glow_window ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pine-6/12 text-pine-6 text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                    <Check className="w-3 h-3" weight="bold" /> Valid
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ember/15 text-ember text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                    <X className="w-3 h-3" weight="bold" /> No glow
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
                  <div className="border-t border-line pt-4 mt-4">
                    <h3 className="font-sans font-bold tracking-[-0.01em] text-ink text-[16px] mb-4">
                      Standing location
                    </h3>
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
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/15 text-sage mb-2.5">
                  <Mountains className="w-5 h-5" weight="regular" />
                </div>
                <Mono className="text-pine-6 block">
                  {result ? 'Click a subject to inspect' : 'Run analysis to begin'}
                </Mono>
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
      <Mono className="text-ink-2 mb-1 block">{title}</Mono>
      <div className="bg-white border border-line rounded-[10px] px-3 py-2 space-y-1">{children}</div>
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
    pass: 'text-pine-6',
    warn: 'text-clay',
    fail: 'text-ember',
  };

  return (
    <div className="flex justify-between text-[11px] font-mono">
      <span className="text-ink-3">{label}:</span>
      <span className={cn('font-semibold', status ? statusColors[status] : 'text-ink')}>{value}</span>
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
    <div className="flex justify-between text-[11px] font-mono">
      <span className="inline-flex items-center gap-1">
        {check ? (
          <Check className="w-3 h-3 text-pine-6" weight="bold" />
        ) : (
          <X className="w-3 h-3 text-ember" weight="bold" />
        )}
        <span className="text-ink">{label}</span>
      </span>
      {detail && <span className="text-ink-3">{detail}</span>}
    </div>
  );
}
