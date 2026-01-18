/**
 * Photo Scout - Photographer Validation Cockpit
 *
 * Answers-first interface for photographers:
 * - 5-second decisions: YES/MAYBE/NO for each shot opportunity
 * - Photographer-friendly language (not terrain math)
 * - Quick facts: where to stand, when to shoot, which way to face
 * - Technical details available on demand
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GoogleMap } from "@react-google-maps/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Camera,
  MapPin,
  Clock,
  Compass,
  Sun,
  Eye,
  Warning,
  CheckCircle,
  XCircle,
  CaretDown,
  Mountains,
  Crosshair,
} from "@phosphor-icons/react";
import { useGoogleMaps } from "@/components/GoogleMapsProvider";
import { useTerrainAnalysis } from "@/hooks/use-terrain-analysis";
import type { TerrainAnalysisResult, Subject, StandingLocation, SunPosition } from "@/types/terrainValidation";

// Convert degrees to compass direction
function degreesToCompass(deg: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return directions[index];
}

// Convert compass direction to full name
function compassToFull(dir: string): string {
  const fullNames: Record<string, string> = {
    N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast",
    E: "east", ESE: "east-southeast", SE: "southeast", SSE: "south-southeast",
    S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest",
    W: "west", WNW: "west-northwest", NW: "northwest", NNW: "north-northwest",
  };
  return fullNames[dir] || dir.toLowerCase();
}

// Convert minutes from event to actual time
function minutesToTime(baseTime: string, minutes: number): string {
  const base = new Date(baseTime);
  base.setMinutes(base.getMinutes() + minutes);
  return base.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// Get light quality description
function getLightQuality(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 0.9) return { label: "Exceptional", color: "text-green-700", bgColor: "bg-green-100" };
  if (score >= 0.7) return { label: "Great", color: "text-green-600", bgColor: "bg-green-50" };
  if (score >= 0.5) return { label: "Good", color: "text-yellow-700", bgColor: "bg-yellow-50" };
  if (score >= 0.3) return { label: "Fair", color: "text-orange-600", bgColor: "bg-orange-50" };
  return { label: "Poor", color: "text-red-600", bgColor: "bg-red-50" };
}

// Get verdict for a shot opportunity
function getShotVerdict(subject: Subject, standing: StandingLocation | null): {
  verdict: "yes" | "maybe" | "no";
  confidence: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;

  // Has good glow window
  if (subject.glow_window && subject.glow_window.peak_glow_score >= 0.7) {
    score += 40;
    reasons.push("Great light quality on rock face");
  } else if (subject.glow_window && subject.glow_window.peak_glow_score >= 0.4) {
    score += 20;
    reasons.push("Acceptable light quality");
  } else {
    reasons.push("Weak lighting conditions");
  }

  // Sun visible at peak
  if (subject.shadow_check.sun_visible) {
    score += 30;
    reasons.push("Direct sunlight reaches the rock");
  } else {
    reasons.push("Rock face may be in shadow");
  }

  // Has standing location
  if (standing) {
    score += 20;
    reasons.push("Clear shooting position found");
  } else {
    score -= 10;
    reasons.push("No clear shooting position nearby");
  }

  // Line of sight clear
  if (standing?.line_of_sight.clear) {
    score += 10;
    reasons.push("Unobstructed view to subject");
  }

  if (score >= 70) return { verdict: "yes", confidence: score, reasons };
  if (score >= 40) return { verdict: "maybe", confidence: score, reasons };
  return { verdict: "no", confidence: Math.max(0, score), reasons };
}

// Map container style
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Shot opportunity card
function ShotCard({
  subject,
  standing,
  sunTrack,
  isSelected,
  onSelect,
  index,
}: {
  subject: Subject;
  standing: StandingLocation | null;
  sunTrack: SunPosition[];
  isSelected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const verdict = getShotVerdict(subject, standing);
  const baseTime = sunTrack[0]?.time_iso || new Date().toISOString();

  const peakTime = subject.glow_window
    ? minutesToTime(baseTime, subject.glow_window.peak_minutes)
    : "Unknown";

  const windowStart = subject.glow_window
    ? minutesToTime(baseTime, subject.glow_window.start_minutes)
    : null;

  const windowEnd = subject.glow_window
    ? minutesToTime(baseTime, subject.glow_window.end_minutes)
    : null;

  const facingDirection = degreesToCompass(subject.properties.aspect_deg);
  const facingFull = compassToFull(facingDirection);
  const lightQuality = subject.glow_window
    ? getLightQuality(subject.glow_window.peak_glow_score)
    : { label: "Unknown", color: "text-gray-500", bgColor: "bg-gray-100" };

  return (
    <Card
      className={`cursor-pointer transition-all ${
        isSelected ? "ring-2 ring-blue-500 shadow-md" : "hover:shadow-md"
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        {/* Verdict Header - THE BIG ANSWER */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {verdict.verdict === "yes" && (
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" weight="fill" />
              </div>
            )}
            {verdict.verdict === "maybe" && (
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <Warning className="w-6 h-6 text-yellow-600" weight="fill" />
              </div>
            )}
            {verdict.verdict === "no" && (
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-500" weight="fill" />
              </div>
            )}
            <div>
              <div className="font-bold text-lg">
                {verdict.verdict === "yes" && "Good Shot"}
                {verdict.verdict === "maybe" && "Maybe"}
                {verdict.verdict === "no" && "Skip This"}
              </div>
              <div className="text-sm text-gray-500">
                Rock face #{index + 1} • {facingFull}-facing
              </div>
            </div>
          </div>
        </div>

        {/* Quick Facts - THE 5-SECOND INFO */}
        <div className="space-y-2 text-sm">
          {/* When to shoot */}
          <div className="flex items-center gap-3 p-2 bg-gray-50 rounded">
            <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <span className="font-semibold">{peakTime}</span>
              <span className="text-gray-500"> best light</span>
              {windowStart && windowEnd && (
                <span className="text-gray-400 text-xs ml-2">
                  ({windowStart} - {windowEnd})
                </span>
              )}
            </div>
          </div>

          {/* Light quality */}
          <div className="flex items-center gap-3 p-2 bg-gray-50 rounded">
            <Sun className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${lightQuality.bgColor} ${lightQuality.color}`}>
                {lightQuality.label}
              </span>
              <span className="text-gray-500">light quality</span>
              {!subject.shadow_check.sun_visible && (
                <span className="text-red-500 text-xs">(may be shadowed)</span>
              )}
            </div>
          </div>

          {/* Where to stand */}
          {standing ? (
            <div className="flex items-center gap-3 p-2 bg-blue-50 rounded">
              <Camera className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div>
                <span className="text-blue-700">
                  Stand {Math.round(standing.properties.distance_to_subject_m)}m{" "}
                  {compassToFull(degreesToCompass((standing.properties.camera_bearing_deg + 180) % 360))}
                </span>
                <span className="text-gray-500">, aim </span>
                <span className="text-blue-700">{degreesToCompass(standing.properties.camera_bearing_deg)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-2 bg-gray-50 rounded text-gray-500">
              <Camera className="w-5 h-5 flex-shrink-0" />
              <span>No clear shooting position found</span>
            </div>
          )}
        </div>

        {/* Technical Details (collapsed) */}
        <Collapsible className="mt-3">
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <CaretDown className="w-3 h-3" />
            Technical details
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono text-gray-600">
            <div className="grid grid-cols-2 gap-1">
              <div>Elevation: {Math.round(subject.properties.elevation_m)}m</div>
              <div>Slope: {subject.properties.slope_deg.toFixed(1)}°</div>
              <div>Aspect: {subject.properties.aspect_deg.toFixed(1)}°</div>
              <div>Area: {Math.round(subject.properties.area_m2)}m²</div>
            </div>
            {standing && (
              <div className="mt-1 pt-1 border-t border-gray-200">
                <div>Bearing: {standing.properties.camera_bearing_deg.toFixed(1)}°</div>
                <div>Elev diff: {standing.properties.elevation_diff_m.toFixed(1)}m</div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export default function PhotoScout() {
  const { isLoaded } = useGoogleMaps();

  const [lat, setLat] = useState("39.0708");
  const [lon, setLon] = useState("-106.9890");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [event, setEvent] = useState<"sunrise" | "sunset">("sunrise");
  const [radius, setRadius] = useState("2.0");

  const { analyze, result, isLoading, error } = useTerrainAnalysis();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);

  const handleAnalyze = useCallback(() => {
    analyze({
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      date,
      event,
      radius_km: parseFloat(radius),
    });
  }, [analyze, lat, lon, date, event, radius]);

  // Auto-select first good subject
  useEffect(() => {
    if (result?.subjects.length) {
      const firstGood = result.subjects.find((s) => {
        const standing = result.standing_locations.find((sl) => sl.subject_id === s.subject_id);
        return getShotVerdict(s, standing || null).verdict === "yes";
      });
      setSelectedSubjectId(firstGood?.subject_id || result.subjects[0]?.subject_id || null);
    } else {
      setSelectedSubjectId(null);
    }
  }, [result]);

  const selectedSubject = useMemo(
    () => result?.subjects.find((s) => s.subject_id === selectedSubjectId) || null,
    [result, selectedSubjectId]
  );

  const selectedStanding = useMemo(
    () => result?.standing_locations.find((sl) => sl.subject_id === selectedSubjectId) || null,
    [result, selectedSubjectId]
  );

  // Verdict counts
  const verdictCounts = useMemo(() => {
    if (!result) return { yes: 0, maybe: 0, no: 0 };
    return result.subjects.reduce(
      (acc, s) => {
        const standing = result.standing_locations.find((sl) => sl.subject_id === s.subject_id);
        acc[getShotVerdict(s, standing || null).verdict]++;
        return acc;
      },
      { yes: 0, maybe: 0, no: 0 }
    );
  }, [result]);

  // Draw map overlays
  useEffect(() => {
    if (!map || !result) return;

    // Clear existing overlays
    overlaysRef.current.forEach((o) => {
      if (o instanceof google.maps.Polygon) o.setMap(null);
      if (o instanceof google.maps.Marker) o.setMap(null);
      if (o instanceof google.maps.Polyline) o.setMap(null);
    });
    overlaysRef.current = [];

    // Draw subject polygons
    result.subjects.forEach((subject) => {
      const standing = result.standing_locations.find((sl) => sl.subject_id === subject.subject_id);
      const verdict = getShotVerdict(subject, standing || null);
      const isSelected = subject.subject_id === selectedSubjectId;

      const color = verdict.verdict === "yes" ? "#16a34a" : verdict.verdict === "maybe" ? "#ca8a04" : "#dc2626";

      const polygon = new google.maps.Polygon({
        paths: subject.polygon.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: color,
        strokeWeight: isSelected ? 3 : 1,
        fillColor: color,
        fillOpacity: isSelected ? 0.4 : 0.15,
        map,
        clickable: true,
      });

      polygon.addListener("click", () => setSelectedSubjectId(subject.subject_id));
      overlaysRef.current.push(polygon);

      // Rock face marker for selected
      if (isSelected) {
        const marker = new google.maps.Marker({
          position: { lat: subject.centroid.lat, lng: subject.centroid.lon },
          map,
          icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
          title: "Rock face",
        });
        overlaysRef.current.push(marker);
      }
    });

    // Draw shooting position for selected subject
    if (selectedStanding && selectedSubject) {
      // Camera marker
      const cameraMarker = new google.maps.Marker({
        position: { lat: selectedStanding.location.lat, lng: selectedStanding.location.lon },
        map,
        icon: {
          url: "data:image/svg+xml," + encodeURIComponent(`
            <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="14" fill="#2563eb" stroke="white" stroke-width="3"/>
              <path d="M10 12h12a1 1 0 011 1v8a1 1 0 01-1 1H10a1 1 0 01-1-1v-8a1 1 0 011-1z" fill="white"/>
              <path d="M13 10h6l1 2H12l1-2z" fill="white"/>
              <circle cx="16" cy="16" r="3" fill="#2563eb"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(32, 32),
          anchor: new google.maps.Point(16, 16),
        },
        title: "Your shooting position",
      });
      overlaysRef.current.push(cameraMarker);

      // Sight line
      const sightLine = new google.maps.Polyline({
        path: [
          { lat: selectedStanding.location.lat, lng: selectedStanding.location.lon },
          { lat: selectedSubject.centroid.lat, lng: selectedSubject.centroid.lon },
        ],
        strokeColor: "#2563eb",
        strokeWeight: 2,
        strokeOpacity: 0.8,
        geodesic: true,
        icons: [
          {
            icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 },
            offset: "100%",
          },
        ],
        map,
      });
      overlaysRef.current.push(sightLine);
    }

    // Fit bounds
    if (result.meta.dem_bounds) {
      const bounds = new google.maps.LatLngBounds(
        { lat: result.meta.dem_bounds.south, lng: result.meta.dem_bounds.west },
        { lat: result.meta.dem_bounds.north, lng: result.meta.dem_bounds.east }
      );
      map.fitBounds(bounds);
    }
  }, [map, result, selectedSubjectId, selectedStanding, selectedSubject]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      overlaysRef.current.forEach((o) => {
        if (o instanceof google.maps.Polygon) o.setMap(null);
        if (o instanceof google.maps.Marker) o.setMap(null);
        if (o instanceof google.maps.Polyline) o.setMap(null);
      });
    };
  }, []);

  if (!isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading maps...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Camera className="w-6 h-6 text-blue-600" weight="fill" />
            Photo Scout
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-gray-600">Location</Label>
              <Input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-24 h-8 text-sm"
                placeholder="Lat"
              />
              <Input
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="w-28 h-8 text-sm"
                placeholder="Lon"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-gray-600">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-36 h-8 text-sm"
              />
            </div>
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value as "sunrise" | "sunset")}
              className="h-8 px-3 border rounded text-sm"
            >
              <option value="sunrise">Sunrise</option>
              <option value="sunset">Sunset</option>
            </select>
            <Button onClick={handleAnalyze} disabled={isLoading} size="sm">
              {isLoading ? "Scanning..." : "Scout Location"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Shot Opportunities */}
        <div className="w-[420px] border-r bg-white flex flex-col">
          {/* Summary Header */}
          {result && (
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-lg">Shot Opportunities</span>
                <span className="text-sm text-gray-500">
                  {result.subjects.length} rock face{result.subjects.length !== 1 ? "s" : ""} found
                </span>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full">
                  <CheckCircle className="w-4 h-4 text-green-600" weight="fill" />
                  <span className="text-sm font-medium text-green-700">{verdictCounts.yes} good</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 rounded-full">
                  <Warning className="w-4 h-4 text-yellow-600" weight="fill" />
                  <span className="text-sm font-medium text-yellow-700">{verdictCounts.maybe} maybe</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-full">
                  <XCircle className="w-4 h-4 text-red-500" weight="fill" />
                  <span className="text-sm font-medium text-red-600">{verdictCounts.no} skip</span>
                </div>
              </div>
              {result.meta.dem_source && (
                <div className="mt-3 text-xs text-gray-400">
                  DEM: {result.meta.dem_source}
                  {result.meta.dem_resolution_m && ` • ${result.meta.dem_resolution_m}m resolution`}
                </div>
              )}
            </div>
          )}

          {/* Shot Cards */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-lg">
                {error}
              </div>
            )}

            {!result && !isLoading && !error && (
              <div className="text-center text-gray-500 py-12">
                <Mountains className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Enter a location and click</p>
                <p className="font-medium">"Scout Location"</p>
                <p className="mt-2 text-sm">to find photo opportunities</p>
              </div>
            )}

            {isLoading && (
              <div className="text-center text-gray-500 py-12">
                <Crosshair className="w-12 h-12 mx-auto mb-4 text-gray-300 animate-pulse" />
                <p>Scanning terrain...</p>
                <p className="text-sm mt-1">Finding dramatic rock faces</p>
              </div>
            )}

            {result?.subjects.map((subject, index) => {
              const standing = result.standing_locations.find((sl) => sl.subject_id === subject.subject_id) || null;
              return (
                <ShotCard
                  key={subject.subject_id}
                  subject={subject}
                  standing={standing}
                  sunTrack={result.sun_track}
                  isSelected={selectedSubjectId === subject.subject_id}
                  onSelect={() => setSelectedSubjectId(subject.subject_id)}
                  index={index}
                />
              );
            })}

            {result && result.subjects.length === 0 && (
              <div className="text-center text-gray-500 py-12">
                <Mountains className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No dramatic rock faces found</p>
                <p className="text-sm mt-2">Try a location with steeper terrain</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Map */}
        <div className="flex-1 relative">
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={{ lat: parseFloat(lat) || 39.0708, lng: parseFloat(lon) || -106.989 }}
            zoom={14}
            onLoad={setMap}
            options={{
              mapTypeId: "terrain",
              mapTypeControl: true,
              mapTypeControlOptions: {
                position: google.maps.ControlPosition.TOP_RIGHT,
              },
            }}
          />

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 text-sm">
            <div className="font-semibold mb-2">Legend</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-600" />
                <span>Good shot opportunity</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-600" />
                <span>Maybe worth trying</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-600" />
                <span>Skip this one</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-600" />
                <span>Your shooting position</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
