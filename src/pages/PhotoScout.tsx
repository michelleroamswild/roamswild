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

// Timeline event for light progression
interface TimelineEvent {
  time: string;
  minutes: number;
  label: string;
  type: "soft" | "glow" | "peak" | "rim" | "fade";
  intensity: number; // 0-1 for visual indicator
}

// Generate light timeline from incidence series and sun track
function generateLightTimeline(
  subject: Subject,
  sunTrack: SunPosition[],
  baseTime: string,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const series = subject.incidence_series;
  const glowWindow = subject.glow_window;

  if (!series || series.length === 0 || !sunTrack.length) {
    return events;
  }

  // Helper to get time string
  const getTimeStr = (minutes: number) => minutesToTime(baseTime, minutes);

  // Helper to get sun altitude at a given minute
  const getSunAlt = (minutes: number) => {
    const sun = sunTrack.find(s => Math.abs(s.minutes_from_start - minutes) < 3);
    return sun?.altitude_deg ?? 10;
  };

  // Find key moments in the lighting
  const minMinutes = Math.min(...series.map(p => p.minutes));
  const maxMinutes = Math.max(...series.map(p => p.minutes));

  // Track what we've added to avoid duplicates
  const addedMinutes = new Set<number>();
  const addEvent = (minutes: number, label: string, type: TimelineEvent["type"], intensity: number) => {
    // Round to nearest 5 minutes for cleaner display
    const roundedMinutes = Math.round(minutes / 5) * 5;
    if (!addedMinutes.has(roundedMinutes) && roundedMinutes >= minMinutes && roundedMinutes <= maxMinutes) {
      addedMinutes.add(roundedMinutes);
      events.push({
        time: getTimeStr(roundedMinutes),
        minutes: roundedMinutes,
        label,
        type,
        intensity,
      });
    }
  };

  // 1. Find when soft/warm light begins (sun altitude < 15°, incidence becoming positive)
  const softLightStart = series.find(p => {
    const alt = getSunAlt(p.minutes);
    return alt > 0 && alt < 15 && p.incidence > 0 && p.incidence < 0.5;
  });
  if (softLightStart) {
    addEvent(softLightStart.minutes, "soft light begins", "soft", 0.3);
  }

  // 2. Glow window start
  if (glowWindow) {
    addEvent(glowWindow.start_minutes, "glow begins", "glow", 0.6);
  }

  // 3. Find when texture is best (incidence around 0.15-0.25, glow score high)
  const texturePoints = series.filter(p =>
    p.incidence >= 0.1 && p.incidence <= 0.3 && p.glow_score >= 0.7
  );
  if (texturePoints.length > 0) {
    // Find the point with best texture (highest glow score in the grazing range)
    const bestTexture = texturePoints.reduce((best, p) =>
      p.glow_score > best.glow_score ? p : best
    );
    addEvent(bestTexture.minutes, "peak texture", "peak", 0.9);
  } else if (glowWindow) {
    // Fallback to peak glow time
    addEvent(glowWindow.peak_minutes, "peak light", "peak", 0.9);
  }

  // 4. Find rim-light opportunity (incidence going negative or very low, sun still up)
  const rimPoints = series.filter(p => {
    const alt = getSunAlt(p.minutes);
    return p.incidence < 0.1 && p.incidence > -0.3 && alt > 2 && alt < 20;
  });
  if (rimPoints.length > 0) {
    // Use the middle of the rim-light period
    const midRim = rimPoints[Math.floor(rimPoints.length / 2)];
    addEvent(midRim.minutes, "rim-light edges", "rim", 0.7);
  }

  // 5. Glow window end / fade
  if (glowWindow) {
    addEvent(glowWindow.end_minutes, "light fades", "fade", 0.2);
  } else {
    // Find when light becomes too flat or sun too high/low
    const fadePoint = series.find(p => {
      const alt = getSunAlt(p.minutes);
      return (p.incidence > 0.7 || alt > 30 || alt < 0) && p.minutes > (minMinutes + 20);
    });
    if (fadePoint) {
      addEvent(fadePoint.minutes, "fades to shadow", "fade", 0.2);
    }
  }

  // Sort by time
  events.sort((a, b) => a.minutes - b.minutes);

  // Ensure we have at least 3 events for a meaningful timeline
  // If too few, add intermediate points
  if (events.length < 3 && glowWindow) {
    const windowMid = (glowWindow.start_minutes + glowWindow.end_minutes) / 2;
    if (!addedMinutes.has(Math.round(windowMid / 5) * 5)) {
      addEvent(windowMid, "good light", "glow", 0.7);
    }
  }

  return events.slice(0, 5); // Limit to 5 events max
}

// Light Timeline Component
function LightTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;

  const typeColors: Record<TimelineEvent["type"], string> = {
    soft: "bg-yellow-200",
    glow: "bg-amber-400",
    peak: "bg-orange-500",
    rim: "bg-purple-400",
    fade: "bg-gray-300",
  };

  const typeTextColors: Record<TimelineEvent["type"], string> = {
    soft: "text-yellow-700",
    glow: "text-amber-700",
    peak: "text-orange-700",
    rim: "text-purple-700",
    fade: "text-gray-500",
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="text-xs text-gray-500 mb-2 font-medium">Light Timeline</div>
      <div className="space-y-1.5">
        {events.map((event, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-gray-500 font-mono text-[11px]">{event.time}</span>
            <div
              className={`w-2 h-2 rounded-full ${typeColors[event.type]}`}
              style={{ opacity: 0.4 + event.intensity * 0.6 }}
            />
            <span className={typeTextColors[event.type]}>{event.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Get the best description - prefer API explanation, fall back to generated
function getShotDescription(
  subject: Subject,
  standing: StandingLocation | null,
): string {
  // Use API-provided summary if available
  if (subject.properties.explain?.summary) {
    let description = subject.properties.explain.summary;

    // Add shadow warning if needed
    if (!subject.shadow_check.sun_visible) {
      description += ". Note: terrain may partially shadow this face";
    }

    // Add shooting position insight if available
    if (standing) {
      const elevDiff = standing.properties.elevation_diff_m;
      const distance = standing.properties.distance_to_subject_m;

      if (elevDiff < -5) {
        description += `. Shoot from ${Math.round(distance)}m away, looking up for an imposing perspective`;
      } else if (elevDiff > 10) {
        description += `. Elevated vantage point ${Math.round(distance)}m out gives you context and scale`;
      } else if (distance < 50) {
        description += `. Close shooting position (${Math.round(distance)}m) for intimate detail shots`;
      }
    }

    return description;
  }

  // Fallback to basic description if no API explanation
  // Use face_direction_deg (where surface FACES), not aspect_deg (downslope direction)
  const facing = degreesToCompass(subject.properties.face_direction_deg);
  const facingFull = compassToFull(facing);
  const slope = subject.properties.slope_deg;
  const area = subject.properties.area_m2;

  let sizeDesc = "feature";
  if (area >= 1000000) sizeDesc = "vast zone";
  else if (area >= 100000) sizeDesc = "large zone";
  else if (area >= 10000) sizeDesc = "medium zone";
  else if (area >= 1000) sizeDesc = "compact zone";

  return `A ${sizeDesc} facing ${facingFull} with ${Math.round(slope)}° slope`;
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
  event,
  showRejectedCandidates,
  onToggleRejected,
}: {
  subject: Subject;
  standing: StandingLocation | null;
  sunTrack: SunPosition[];
  isSelected: boolean;
  onSelect: () => void;
  index: number;
  event: "sunrise" | "sunset";
  showRejectedCandidates: boolean;
  onToggleRejected: () => void;
}) {
  const verdict = getShotVerdict(subject, standing);
  const baseTime = sunTrack[0]?.time_iso || new Date().toISOString();
  const description = getShotDescription(subject, standing);
  const explain = subject.properties.explain;

  const peakTime = subject.glow_window
    ? minutesToTime(baseTime, subject.glow_window.peak_minutes)
    : "Unknown";

  const windowStart = subject.glow_window
    ? minutesToTime(baseTime, subject.glow_window.start_minutes)
    : null;

  const windowEnd = subject.glow_window
    ? minutesToTime(baseTime, subject.glow_window.end_minutes)
    : null;

  // Use face_direction_deg (where surface FACES), not aspect_deg (downslope direction)
  const facingDirection = degreesToCompass(subject.properties.face_direction_deg);
  const facingFull = compassToFull(facingDirection);
  const lightQuality = subject.glow_window
    ? getLightQuality(subject.glow_window.peak_glow_score)
    : { label: "Unknown", color: "text-gray-500", bgColor: "bg-gray-100" };

  // Get lighting zone badge
  const zoneType = subject.properties.lighting_zone_type;
  const zoneBadge = zoneType === "rim-zone"
    ? { label: "Rim Light", color: "text-purple-700", bgColor: "bg-purple-100" }
    : zoneType === "shadow-zone"
    ? { label: "Shadow", color: "text-gray-600", bgColor: "bg-gray-100" }
    : { label: "Glow", color: "text-amber-700", bgColor: "bg-amber-100" };

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
              <div className="font-bold text-lg flex items-center gap-2">
                {verdict.verdict === "yes" && "Good Shot"}
                {verdict.verdict === "maybe" && "Maybe"}
                {verdict.verdict === "no" && "Skip This"}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${zoneBadge.bgColor} ${zoneBadge.color}`}>
                  {zoneBadge.label}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {explain?.face_direction || `${facingFull}-facing`} • {explain?.area || `${Math.round(subject.properties.area_m2).toLocaleString()}m²`}
              </div>
            </div>
          </div>
        </div>

        {/* Why this spot - Photographer-friendly description */}
        <p className="text-sm text-gray-600 mb-3 leading-relaxed">
          {description}
        </p>

        {/* Quick Facts - THE 5-SECOND INFO */}
        <div className="space-y-2 text-sm">
          {/* When to shoot */}
          <div className="flex items-center gap-3 p-2 bg-gray-50 rounded">
            <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-semibold">{peakTime}</span>
              <span className="text-gray-500"> — {explain?.best_time || "best light"}</span>
              {explain?.window_duration && (
                <div className="text-gray-400 text-xs mt-0.5">
                  {explain.window_duration}
                </div>
              )}
            </div>
          </div>

          {/* Light quality - using API explanations */}
          <div className="flex items-center gap-3 p-2 bg-gray-50 rounded">
            <Sun className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${lightQuality.bgColor} ${lightQuality.color}`}>
                  {lightQuality.label}
                </span>
                {!subject.shadow_check.sun_visible && (
                  <span className="text-red-500 text-xs">(may be shadowed)</span>
                )}
              </div>
              {explain && (
                <div className="text-gray-500 text-xs mt-1">
                  {explain.aspect_offset} • {explain.sun_altitude}
                </div>
              )}
            </div>
          </div>

          {/* Where to stand */}
          {standing ? (
            <div className="p-2 bg-blue-50 rounded space-y-1">
              <div className="flex items-center gap-3">
                <Camera className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div className="flex-1">
                  <span className="text-blue-700">
                    Stand {Math.round(standing.properties.distance_to_subject_m)}m{" "}
                    {compassToFull(degreesToCompass((standing.properties.camera_bearing_deg + 180) % 360))}
                  </span>
                  <span className="text-gray-500">, aim </span>
                  <span className="text-blue-700">{degreesToCompass(standing.properties.camera_bearing_deg)}</span>
                </div>
                {standing.nav_link && (
                  <a
                    href={standing.nav_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors"
                  >
                    <MapPin className="w-4 h-4" />
                    Navigate
                  </a>
                )}
              </div>
              {/* Approach info */}
              {standing.properties.approach_difficulty && standing.properties.approach_difficulty !== 'unknown' && (
                <div className="flex items-center gap-2 pl-8 text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    standing.properties.approach_difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                    standing.properties.approach_difficulty === 'moderate' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {standing.properties.approach_difficulty}
                  </span>
                  <span className="text-gray-500">
                    {standing.properties.distance_to_road_m != null && (
                      <>{Math.round(standing.properties.distance_to_road_m)}m from {standing.properties.nearest_road_type || 'road'}</>
                    )}
                    {standing.properties.uphill_gain_from_access_m != null && standing.properties.uphill_gain_from_access_m > 0 && (
                      <>, ↑{Math.round(standing.properties.uphill_gain_from_access_m)}m</>
                    )}
                    {standing.properties.downhill_gain_from_access_m != null && standing.properties.downhill_gain_from_access_m > 0 && (
                      <>, ↓{Math.round(standing.properties.downhill_gain_from_access_m)}m</>
                    )}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-2 bg-gray-50 rounded text-gray-500">
              <Camera className="w-5 h-5 flex-shrink-0" />
              <span>No clear shooting position found</span>
            </div>
          )}

          {/* Candidate Search Info - show when no standing location */}
          {!standing && subject.candidate_search && (
            <div className="mt-2 p-2 bg-orange-50 rounded border border-orange-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-orange-700 font-medium">
                  {subject.candidate_search.candidates_checked} positions checked
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleRejected();
                  }}
                  className={`text-xs px-2 py-1 rounded ${
                    showRejectedCandidates
                      ? "bg-orange-600 text-white"
                      : "bg-orange-200 text-orange-700 hover:bg-orange-300"
                  }`}
                >
                  {showRejectedCandidates ? "Hide on map" : "Show on map"}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                {Object.entries(subject.candidate_search.rejection_summary || {}).map(([reason, count]) => (
                  <div key={reason} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${
                      reason === 'slope_too_steep' ? 'bg-orange-500' :
                      reason === 'no_line_of_sight' ? 'bg-red-500' :
                      reason === 'invalid_geometry' ? 'bg-purple-500' :
                      reason === 'out_of_bounds' ? 'bg-gray-500' :
                      'bg-gray-400'
                    }`} />
                    <span className="text-gray-600 truncate">
                      {reason.replace(/_/g, ' ')}: {count as number}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Light Timeline */}
        <LightTimeline events={generateLightTimeline(subject, sunTrack, baseTime)} />

        {/* Technical Details (collapsed) */}
        <Collapsible className="mt-3">
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <CaretDown className="w-3 h-3" />
            Technical details
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
            {/* Terrain & Light Summary (photographer-friendly) */}
            {explain && (
              <div className="mb-3 space-y-1">
                <div className="flex gap-2">
                  <span className="text-gray-400 w-16">Terrain:</span>
                  <span>{explain.slope}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-16">Light:</span>
                  <span>{explain.light_quality}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-16">Zone:</span>
                  <span>{explain.zone_type}</span>
                </div>
              </div>
            )}

            {/* Surface Properties (raw values) */}
            <div className="mb-2 pt-2 border-t border-gray-200">
              <div className="text-gray-500 mb-1 font-medium">Raw Values</div>
              <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                <div>face_direction: {subject.properties.face_direction_deg.toFixed(0)}°</div>
                <div>slope: {subject.properties.slope_deg.toFixed(1)}°</div>
                <div>aspect_offset: {subject.properties.aspect_offset_deg?.toFixed(0) || "—"}°</div>
                <div>area: {(subject.properties.area_m2 / 1000000).toFixed(3)} km²</div>
                <div>elevation: {Math.round(subject.properties.elevation_m)}m</div>
                <div>zone_type: {subject.properties.lighting_zone_type || "—"}</div>
              </div>
            </div>

            {/* Lighting Conditions */}
            {subject.glow_window && (
              <div className="mb-2 pt-2 border-t border-gray-200">
                <div className="text-gray-500 mb-1 font-medium">Lighting at Peak</div>
                <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                  <div>sun_azimuth: {(() => {
                    const peakMin = subject.glow_window.peak_minutes;
                    const sunAtPeak = sunTrack.find(s => Math.abs(s.minutes_from_start - peakMin) < 3);
                    return sunAtPeak ? `${sunAtPeak.azimuth_deg.toFixed(0)}°` : "—";
                  })()}</div>
                  <div>sun_altitude: {(() => {
                    const peakMin = subject.glow_window.peak_minutes;
                    const sunAtPeak = sunTrack.find(s => Math.abs(s.minutes_from_start - peakMin) < 3);
                    return sunAtPeak ? `${sunAtPeak.altitude_deg.toFixed(1)}°` : "—";
                  })()}</div>
                  <div>incidence: {subject.glow_window.peak_incidence.toFixed(3)}</div>
                  <div>glow_score: {subject.glow_window.peak_glow_score.toFixed(3)}</div>
                  <div>window_duration: {subject.glow_window.duration_minutes.toFixed(0)} min</div>
                  <div>peak_minutes: {subject.glow_window.peak_minutes.toFixed(0)}</div>
                </div>
              </div>
            )}

            {/* Shooting Position */}
            {standing && (
              <div className="pt-2 border-t border-gray-200">
                <div className="text-gray-500 mb-1 font-medium">Shooting Position</div>
                <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                  <div>distance: {Math.round(standing.properties.distance_to_subject_m)}m</div>
                  <div>bearing: {standing.properties.camera_bearing_deg.toFixed(0)}°</div>
                  <div>elev_diff: {standing.properties.elevation_diff_m > 0 ? "+" : ""}{standing.properties.elevation_diff_m.toFixed(1)}m</div>
                  <div>line_of_sight: {standing.line_of_sight.clear ? "clear" : "blocked"}</div>
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Debug Card (collapsed) */}
        <Collapsible className="mt-2">
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <CaretDown className="w-3 h-3" />
            Debug info
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 p-2 bg-purple-50 rounded text-xs font-mono border border-purple-200">
            {/* Coordinates */}
            <div className="mb-2">
              <div className="text-purple-600 font-medium mb-1">Coordinates</div>
              <div className="grid grid-cols-1 gap-0.5 text-[11px]">
                <div>
                  <span className="text-gray-500">Subject:</span>{" "}
                  <span className="text-purple-800">{subject.centroid.lat.toFixed(6)}, {subject.centroid.lon.toFixed(6)}</span>
                  {subject.properties.snapped_to_max_structure && (
                    <span className="ml-1 px-1 bg-amber-200 text-amber-800 rounded text-[9px] font-medium">SNAPPED</span>
                  )}
                </div>
                {standing ? (
                  <div>
                    <span className="text-gray-500">Stand:</span>{" "}
                    <span className="text-purple-800">{standing.location.lat.toFixed(6)}, {standing.location.lon.toFixed(6)}</span>
                  </div>
                ) : (
                  <div className="text-gray-400">Stand: no position found</div>
                )}
              </div>
            </div>

            {/* Sun Position at Peak */}
            <div className="mb-2 pt-2 border-t border-purple-200">
              <div className="text-purple-600 font-medium mb-1">Sun at Peak</div>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                {(() => {
                  const peakMin = subject.glow_window?.peak_minutes;
                  const sunAtPeak = peakMin != null ? sunTrack.find(s => Math.abs(s.minutes_from_start - peakMin) < 3) : null;
                  return (
                    <>
                      <div>
                        <span className="text-gray-500">azimuth:</span>{" "}
                        <span className="text-purple-800">{sunAtPeak ? `${sunAtPeak.azimuth_deg.toFixed(1)}°` : "—"}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">altitude:</span>{" "}
                        <span className="text-purple-800">{sunAtPeak ? `${sunAtPeak.altitude_deg.toFixed(1)}°` : "—"}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Bearings */}
            <div className="mb-2 pt-2 border-t border-purple-200">
              <div className="text-purple-600 font-medium mb-1">Bearings</div>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <div>
                  <span className="text-gray-500">A_face:</span>{" "}
                  <span className="text-purple-800">{subject.properties.face_direction_deg.toFixed(1)}°</span>
                </div>
                <div>
                  <span className="text-gray-500">A_cam:</span>{" "}
                  <span className="text-purple-800">{standing ? `${standing.properties.camera_bearing_deg.toFixed(1)}°` : "—"}</span>
                </div>
              </div>
            </div>

            {/* Structure Metrics */}
            <div className="pt-2 border-t border-purple-200">
              <div className="text-purple-600 font-medium mb-1">Structure Metrics</div>
              {subject.properties.structure ? (
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div>
                    <span className="text-gray-500">class:</span>{" "}
                    <span className={`font-medium ${
                      subject.properties.structure.structure_class === 'micro-dramatic' ? 'text-green-700' :
                      subject.properties.structure.structure_class === 'macro-dramatic' ? 'text-blue-700' :
                      'text-gray-500'
                    }`}>{subject.properties.structure.structure_class}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">score:</span>{" "}
                    <span className="text-purple-800">{subject.properties.structure.structure_score.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">micro_relief:</span>{" "}
                    <span className="text-purple-800">{subject.properties.structure.micro_relief_m.toFixed(1)}m</span>
                  </div>
                  <div>
                    <span className="text-gray-500">macro_relief:</span>{" "}
                    <span className="text-purple-800">{subject.properties.structure.macro_relief_m.toFixed(1)}m</span>
                  </div>
                  <div>
                    <span className="text-gray-500">max_slope_break:</span>{" "}
                    <span className="text-purple-800">{subject.properties.structure.max_slope_break.toFixed(1)}°</span>
                  </div>
                  <div>
                    <span className="text-gray-500">max_curvature:</span>{" "}
                    <span className="text-purple-800">{subject.properties.structure.max_curvature.toFixed(4)}</span>
                  </div>
                  {/* Per-cell structure analysis */}
                  <div className="col-span-2 mt-2 pt-2 border-t border-purple-100">
                    <span className="text-purple-500 text-[10px]">Per-cell analysis:</span>
                  </div>
                  <div>
                    <span className="text-gray-500">score@centroid:</span>{" "}
                    <span className="text-purple-800">
                      {subject.properties.structure.structure_score_at_centroid?.toFixed(3) ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">max_score:</span>{" "}
                    <span className="text-purple-800">
                      {subject.properties.structure.max_structure_score_in_zone?.toFixed(3) ?? "—"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">max_loc:</span>{" "}
                    <span className="text-purple-800">
                      {subject.properties.structure.max_structure_location
                        ? `${subject.properties.structure.max_structure_location[0].toFixed(6)}, ${subject.properties.structure.max_structure_location[1].toFixed(6)}`
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">dist_to_max:</span>{" "}
                    <span className="text-purple-800">
                      {subject.properties.structure.distance_centroid_to_max_m?.toFixed(0) ?? "—"}m
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-gray-400 text-[11px]">No structure data available</div>
              )}
            </div>

            {/* Geometry Classification */}
            <div className="pt-2 border-t border-purple-200">
              <div className="text-purple-600 font-medium mb-1">Geometry</div>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <div>
                  <span className="text-gray-500">type:</span>{" "}
                  <span className={`font-medium ${
                    subject.properties.geometry_type === 'volumetric' ? 'text-orange-600' : 'text-gray-600'
                  }`}>{subject.properties.geometry_type || 'planar'}</span>
                </div>
                <div>
                  <span className="text-gray-500">face_variance:</span>{" "}
                  <span className="text-purple-800">{subject.properties.face_direction_variance?.toFixed(1) ?? "—"}°</span>
                </div>
                {subject.properties.volumetric_reason && (
                  <div className="col-span-2">
                    <span className="text-gray-500">reason:</span>{" "}
                    <span className="text-orange-600 font-medium">{subject.properties.volumetric_reason}</span>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// Parse lat,lon from a combined string like "33.955280, -116.077957"
function parseCoordinates(input: string): { lat: number; lon: number } | null {
  // Remove any whitespace and split by comma
  const parts = input.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;

  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);

  if (isNaN(lat) || isNaN(lon)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;

  return { lat, lon };
}

export default function PhotoScout() {
  const { isLoaded } = useGoogleMaps();

  const [coordinates, setCoordinates] = useState("39.0708, -106.9890");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [event, setEvent] = useState<"sunrise" | "sunset">("sunrise");
  const [radius, setRadius] = useState("2.0");

  const { analyze, result, isLoading, error } = useTerrainAnalysis();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [showAllPositions, setShowAllPositions] = useState(false);
  const [showRejectedCandidates, setShowRejectedCandidates] = useState(false);
  const [showAnalysisZones, setShowAnalysisZones] = useState(false);

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);

  // Parse coordinates for use
  const parsedCoords = useMemo(() => parseCoordinates(coordinates), [coordinates]);

  const handleAnalyze = useCallback(() => {
    if (!parsedCoords) return;
    analyze({
      lat: parsedCoords.lat,
      lon: parsedCoords.lon,
      date,
      event,
      radius_km: parseFloat(radius),
    });
  }, [analyze, parsedCoords, date, event, radius]);

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

    // Draw search location marker (crosshair)
    if (parsedCoords) {
      const searchMarker = new google.maps.Marker({
        position: { lat: parsedCoords.lat, lng: parsedCoords.lon },
        map,
        icon: {
          url: "data:image/svg+xml," + encodeURIComponent(`
            <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
              <circle cx="20" cy="20" r="16" fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="4 2"/>
              <circle cx="20" cy="20" r="8" fill="none" stroke="#7c3aed" stroke-width="2"/>
              <circle cx="20" cy="20" r="3" fill="#7c3aed"/>
              <line x1="20" y1="0" x2="20" y2="10" stroke="#7c3aed" stroke-width="2"/>
              <line x1="20" y1="30" x2="20" y2="40" stroke="#7c3aed" stroke-width="2"/>
              <line x1="0" y1="20" x2="10" y2="20" stroke="#7c3aed" stroke-width="2"/>
              <line x1="30" y1="20" x2="40" y2="20" stroke="#7c3aed" stroke-width="2"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 20),
        },
        title: "Search Location",
        zIndex: 1000,
      });
      overlaysRef.current.push(searchMarker);

      // Draw sun direction indicator (only when showing analysis zones)
      if (showAnalysisZones && result.sun_track?.length > 0) {
        const midSun = result.sun_track[Math.floor(result.sun_track.length / 2)];
        const sunAzimuth = midSun.azimuth_deg;

        // Convert azimuth to radians (0 = North, 90 = East)
        const azimuthRad = (sunAzimuth - 90) * Math.PI / 180;

        // Calculate endpoint ~500m from center in sun direction
        const distanceM = 500;
        const metersPerDegreeLat = 111320;
        const metersPerDegreeLon = 111320 * Math.cos(parsedCoords.lat * Math.PI / 180);

        const endLat = parsedCoords.lat + (distanceM * Math.sin(azimuthRad + Math.PI / 2)) / metersPerDegreeLat;
        const endLon = parsedCoords.lon + (distanceM * Math.cos(azimuthRad + Math.PI / 2)) / metersPerDegreeLon;

        // Sun direction line
        const sunLine = new google.maps.Polyline({
          path: [
            { lat: parsedCoords.lat, lng: parsedCoords.lon },
            { lat: endLat, lng: endLon },
          ],
          strokeColor: "#f59e0b",
          strokeWeight: 3,
          strokeOpacity: 0.8,
          icons: [
            {
              icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 4, fillColor: "#f59e0b", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1 },
              offset: "100%",
            },
          ],
          map,
        });
        overlaysRef.current.push(sunLine);

        // Sun marker at end
        const sunMarker = new google.maps.Marker({
          position: { lat: endLat, lng: endLon },
          map,
          icon: {
            url: "data:image/svg+xml," + encodeURIComponent(`
              <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="6" fill="#f59e0b" stroke="#fff" stroke-width="2"/>
                <line x1="12" y1="2" x2="12" y2="5" stroke="#f59e0b" stroke-width="2"/>
                <line x1="12" y1="19" x2="12" y2="22" stroke="#f59e0b" stroke-width="2"/>
                <line x1="2" y1="12" x2="5" y2="12" stroke="#f59e0b" stroke-width="2"/>
                <line x1="19" y1="12" x2="22" y2="12" stroke="#f59e0b" stroke-width="2"/>
              </svg>
            `),
            scaledSize: new google.maps.Size(24, 24),
            anchor: new google.maps.Point(12, 12),
          },
          title: `Sun direction: ${Math.round(sunAzimuth)}° (${degreesToCompass(sunAzimuth)})`,
        });
        overlaysRef.current.push(sunMarker);
      }
    }

    // Draw subjects
    result.subjects.forEach((subject) => {
      const standing = result.standing_locations.find((sl) => sl.subject_id === subject.subject_id);
      const verdict = getShotVerdict(subject, standing || null);
      const isSelected = subject.subject_id === selectedSubjectId;

      const color = verdict.verdict === "yes" ? "#16a34a" : verdict.verdict === "maybe" ? "#ca8a04" : "#dc2626";

      // Get subject anchor location (snapped max structure location or centroid)
      const anchorLat = subject.properties.snapped_to_max_structure && subject.properties.structure?.max_structure_location
        ? subject.properties.structure.max_structure_location[0]
        : subject.centroid.lat;
      const anchorLng = subject.properties.snapped_to_max_structure && subject.properties.structure?.max_structure_location
        ? subject.properties.structure.max_structure_location[1]
        : subject.centroid.lon;

      // Draw "Explore Area" polygon (only when showing analysis zones)
      if (showAnalysisZones) {
        const polygon = new google.maps.Polygon({
          paths: subject.polygon.map(([lat, lng]) => ({ lat, lng })),
          strokeColor: color,
          strokeWeight: isSelected ? 2 : 1,
          strokeOpacity: 0.5,
          fillColor: color,
          fillOpacity: isSelected ? 0.15 : 0.08,
          map,
          clickable: true,
        });

        polygon.addListener("click", () => setSelectedSubjectId(subject.subject_id));
        overlaysRef.current.push(polygon);
      }

      // Subject Anchor marker - ALWAYS shown for selected, or when showAllPositions
      if (isSelected || showAllPositions) {
        // Use a pin/target icon for the actual subject anchor
        const anchorMarker = new google.maps.Marker({
          position: { lat: anchorLat, lng: anchorLng },
          map,
          icon: {
            url: "data:image/svg+xml," + encodeURIComponent(`
              <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2"/>
                <circle cx="14" cy="14" r="6" fill="white"/>
                <circle cx="14" cy="14" r="3" fill="${color}"/>
              </svg>
            `),
            scaledSize: new google.maps.Size(isSelected ? 28 : 20, isSelected ? 28 : 20),
            anchor: new google.maps.Point(isSelected ? 14 : 10, isSelected ? 14 : 10),
          },
          title: `Subject #${subject.subject_id} - ${subject.properties.geometry_type || 'planar'}`,
          zIndex: isSelected ? 100 : 50,
        });
        anchorMarker.addListener("click", () => setSelectedSubjectId(subject.subject_id));
        overlaysRef.current.push(anchorMarker);
      }

      // Draw shooting position (camera) - show for selected OR when showing all
      if (standing && (isSelected || showAllPositions)) {
        const isCurrentlySelected = isSelected;
        const markerColor = isCurrentlySelected ? "#2563eb" : "#6b7280";

        // Camera marker
        const cameraMarker = new google.maps.Marker({
          position: { lat: standing.location.lat, lng: standing.location.lon },
          map,
          icon: {
            url: "data:image/svg+xml," + encodeURIComponent(`
              <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="${markerColor}" stroke="white" stroke-width="3"/>
                <path d="M10 12h12a1 1 0 011 1v8a1 1 0 01-1 1H10a1 1 0 01-1-1v-8a1 1 0 011-1z" fill="white"/>
                <path d="M13 10h6l1 2H12l1-2z" fill="white"/>
                <circle cx="16" cy="16" r="3" fill="${markerColor}"/>
              </svg>
            `),
            scaledSize: new google.maps.Size(isCurrentlySelected ? 32 : 24, isCurrentlySelected ? 32 : 24),
            anchor: new google.maps.Point(isCurrentlySelected ? 16 : 12, isCurrentlySelected ? 16 : 12),
          },
          title: `Standing position for #${subject.subject_id}`,
          zIndex: isSelected ? 90 : 40,
        });
        cameraMarker.addListener("click", () => setSelectedSubjectId(subject.subject_id));
        overlaysRef.current.push(cameraMarker);

        // Sight line from standing to subject ANCHOR (not polygon centroid)
        const sightLine = new google.maps.Polyline({
          path: [
            { lat: standing.location.lat, lng: standing.location.lon },
            { lat: anchorLat, lng: anchorLng },
          ],
          strokeColor: markerColor,
          strokeWeight: isCurrentlySelected ? 2 : 1,
          strokeOpacity: isCurrentlySelected ? 0.8 : 0.4,
          geodesic: true,
          icons: isCurrentlySelected ? [
            {
              icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 },
              offset: "100%",
            },
          ] : [],
          map,
        });
        overlaysRef.current.push(sightLine);
      }

      // Draw rejected candidates for selected subject (only when showing analysis zones)
      if (showAnalysisZones && isSelected && showRejectedCandidates && subject.candidate_search?.sample_rejected) {
        const rejectedColors: Record<string, string> = {
          slope_too_steep: "#f97316",    // orange
          no_line_of_sight: "#ef4444",   // red
          out_of_bounds: "#6b7280",      // gray
          invalid_geometry: "#8b5cf6",   // purple
          vertical_wall_trap: "#ec4899", // pink
          subject_too_large: "#06b6d4",  // cyan
        };

        subject.candidate_search.sample_rejected.forEach((rejected: any) => {
          const markerColor = rejectedColors[rejected.reason] || "#9ca3af";

          const rejectedMarker = new google.maps.Marker({
            position: { lat: rejected.lat, lng: rejected.lon },
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 4,
              fillColor: markerColor,
              fillOpacity: 0.6,
              strokeColor: "#fff",
              strokeWeight: 1,
            },
            title: `Rejected: ${rejected.reason}${rejected.slope_deg ? ` (${rejected.slope_deg.toFixed(1)}°)` : ''} at ${rejected.distance_m}m`,
          });
          overlaysRef.current.push(rejectedMarker);
        });
      }
    });

    // Fit bounds
    if (result.meta.dem_bounds) {
      const bounds = new google.maps.LatLngBounds(
        { lat: result.meta.dem_bounds.south, lng: result.meta.dem_bounds.west },
        { lat: result.meta.dem_bounds.north, lng: result.meta.dem_bounds.east }
      );
      map.fitBounds(bounds);
    }
  }, [map, result, selectedSubjectId, showAllPositions, showRejectedCandidates, showAnalysisZones, parsedCoords]);

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
                value={coordinates}
                onChange={(e) => setCoordinates(e.target.value)}
                className={`w-48 h-8 text-sm ${!parsedCoords && coordinates ? "border-red-300" : ""}`}
                placeholder="lat, lon"
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
            <Button onClick={handleAnalyze} disabled={isLoading || !parsedCoords} size="sm">
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
                <span className="font-semibold text-lg">Lighting Zones</span>
                <span className="text-sm text-gray-500">
                  {result.subjects.length} zone{result.subjects.length !== 1 ? "s" : ""} found
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
              {result.meta.structure_debug && (
                <div className="mt-1 text-xs text-purple-400 font-mono">
                  Structure: {result.meta.structure_debug.enabled ? "enabled" : "disabled"}
                  {" • "}{result.meta.structure_debug.computed_cells} cells computed
                  {" • "}{result.meta.structure_debug.attached_to_subjects} subjects with structure
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
                <p className="text-sm mt-1">Finding lighting zones</p>
              </div>
            )}

            {result?.subjects.map((subject, index) => {
              const standing = result.standing_locations.find((sl) => sl.subject_id === subject.subject_id) || null;
              const isSelected = selectedSubjectId === subject.subject_id;
              return (
                <ShotCard
                  key={subject.subject_id}
                  subject={subject}
                  standing={standing}
                  sunTrack={result.sun_track}
                  isSelected={isSelected}
                  onSelect={() => setSelectedSubjectId(subject.subject_id)}
                  index={index}
                  event={event}
                  showRejectedCandidates={isSelected && showRejectedCandidates}
                  onToggleRejected={() => setShowRejectedCandidates(!showRejectedCandidates)}
                />
              );
            })}

            {result && result.subjects.length === 0 && (
              <div className="text-center text-gray-500 py-12">
                <Mountains className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No lighting zones found</p>
                <p className="text-sm mt-2">Try a location with more varied terrain</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Map */}
        <div className="flex-1 relative">
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={{ lat: parsedCoords?.lat || 39.0708, lng: parsedCoords?.lon || -106.989 }}
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
              {/* Always visible markers */}
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 28 28">
                  <circle cx="14" cy="14" r="12" fill="#16a34a" stroke="white" strokeWidth="2"/>
                  <circle cx="14" cy="14" r="6" fill="white"/>
                  <circle cx="14" cy="14" r="3" fill="#16a34a"/>
                </svg>
                <span>Subject (shoot this)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-600" />
                <span>Standing position</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-dashed border-purple-600" />
                <span>Search center</span>
              </div>
              {/* Color key */}
              <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-1">
                <div className="w-3 h-3 rounded-full bg-green-600" />
                <span className="text-xs text-gray-600">Good</span>
                <div className="w-3 h-3 rounded-full bg-yellow-600 ml-1" />
                <span className="text-xs text-gray-600">Maybe</span>
                <div className="w-3 h-3 rounded-full bg-red-600 ml-1" />
                <span className="text-xs text-gray-600">Poor</span>
              </div>
              {/* Analysis zones (only when toggle on) */}
              {showAnalysisZones && (
                <>
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-1">
                    <div className="w-4 h-4 rounded border-2 border-green-600 bg-green-100 opacity-50" />
                    <span className="text-gray-500">Explore area</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-amber-500" />
                    <Sun className="w-3 h-3 text-amber-500" weight="fill" />
                    <span className="text-gray-500">Sun direction</span>
                  </div>
                </>
              )}
            </div>
            {/* Show analysis zones toggle */}
            {result && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAnalysisZones}
                    onChange={(e) => setShowAnalysisZones(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span>Show analysis zones</span>
                </label>
                {showAnalysisZones && (
                  <div className="mt-2 text-xs space-y-1 pl-6 text-gray-500">
                    <div>Explore areas, sun direction, structure anchors</div>
                  </div>
                )}
              </div>
            )}
            {/* Show all toggle */}
            {result && result.standing_locations.length > 0 && (
              <div className="mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAllPositions}
                    onChange={(e) => setShowAllPositions(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Show all positions</span>
                </label>
              </div>
            )}
            {/* Show rejected candidates toggle */}
            {result && selectedSubject?.candidate_search && (
              <div className="mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRejectedCandidates}
                    onChange={(e) => setShowRejectedCandidates(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span>Show rejected candidates</span>
                </label>
                {showRejectedCandidates && (
                  <div className="mt-2 text-xs space-y-1 pl-6">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      <span>Slope too steep</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span>No line of sight</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500" />
                      <span>Invalid geometry</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-500" />
                      <span>Out of bounds</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Sun azimuth indicator */}
            {result && result.sun_track?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4 text-yellow-500" weight="fill" />
                  <span className="text-xs">
                    Sun: {Math.round(result.sun_track[Math.floor(result.sun_track.length / 2)].azimuth_deg)}° ({degreesToCompass(result.sun_track[Math.floor(result.sun_track.length / 2)].azimuth_deg)})
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
