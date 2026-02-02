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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Funnel,
  Bug,
} from "@phosphor-icons/react";
import { useGoogleMaps } from "@/components/GoogleMapsProvider";
import { useTerrainAnalysis } from "@/hooks/use-terrain-analysis";
import { Header } from "@/components/Header";
import { PlaceSearch } from "@/components/PlaceSearch";
import type { TerrainAnalysisResult, Subject, StandingLocation, SunPosition, RimOverlookDebugStats } from "@/types/terrainValidation";

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

// Scouting Funnel Component - shows candidate coverage and filtering stages
function ScoutingFunnel({ debug }: { debug: RimOverlookDebugStats | undefined }) {
  if (!debug) return null;

  const stages = [
    {
      label: "Cells in AOI",
      count: debug.grid_cells_total || 0,
      tooltip: "Total DEM grid cells in the analysis area",
    },
    {
      label: "Rim candidates",
      count: debug.rim_mask_cells || 0,
      tooltip: `Cells passing TPI (>${debug.chosen_tpi_threshold_m?.toFixed(1) || '?'}m) and slope (<${debug.chosen_slope_max_deg?.toFixed(0) || '?'}°) filters`,
      rejected: (debug.rejected_tpi || 0) + (debug.rejected_slope || 0) + (debug.rejected_edge || 0),
      rejectedLabel: `TPI: ${(debug.rejected_tpi || 0).toLocaleString()}, Slope: ${(debug.rejected_slope || 0).toLocaleString()}, Edge: ${(debug.rejected_edge || 0).toLocaleString()}`,
    },
    {
      label: "Local maxima",
      count: debug.rim_local_maxima_cells || 0,
      tooltip: "Distinct rim peaks after non-maximum suppression (NMS)",
      rejected: debug.rejected_nms || 0,
      rejectedLabel: `Collapsed by NMS: ${(debug.rejected_nms || 0).toLocaleString()}`,
    },
    {
      label: "View analyzed",
      count: debug.view_analyzed_total || 0,
      tooltip: `Top ${debug.chosen_view_candidates_k || '?'} candidates selected for horizon analysis`,
      rejected: debug.rejected_topk || 0,
      rejectedLabel: `Skipped (top-K): ${(debug.rejected_topk || 0).toLocaleString()}`,
    },
    {
      label: "Final results",
      count: debug.results_post_dedup || 0,
      tooltip: "After spatial deduplication (minimum distance between overlooks)",
      rejected: debug.rejected_after_view_dedup || 0,
      rejectedLabel: `Removed as duplicates: ${(debug.rejected_after_view_dedup || 0).toLocaleString()}`,
    },
  ];

  // Check funnel health - warn if ratio between stages is too aggressive
  const getHealthColor = (current: number, next: number): string => {
    if (next === 0 || current === 0) return "text-red-600";
    const ratio = current / next;
    if (ratio < 5) return "text-green-600";
    if (ratio < 10) return "text-yellow-600";
    if (ratio < 50) return "text-orange-600";
    return "text-red-600";
  };

  // Density sanity check
  const rimRatio = debug.rim_mask_cells / debug.grid_cells_total;
  const density = rimRatio < 0.01 ? "LOW" : rimRatio < 0.5 ? "OK" : "HIGH";
  const densityColor = density === "LOW" ? "text-red-600" : density === "OK" ? "text-green-600" : "text-yellow-600";
  const densityMessage = density === "LOW"
    ? "Scouting too narrow — thresholds likely too strict or AOI too small"
    : density === "OK"
    ? "Healthy candidate coverage"
    : "Very broad coverage — may include non-rim areas";

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
      {/* Header with density indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Funnel className="w-4 h-4 text-purple-600" weight="fill" />
          <span className="font-semibold text-purple-800">Scouting Funnel</span>
        </div>
        <div className={`px-2 py-0.5 rounded text-xs font-bold ${densityColor} bg-white`}>
          {density}
        </div>
      </div>

      <p className="text-xs text-purple-600 mb-3">{densityMessage}</p>

      {/* Funnel stages */}
      <div className="space-y-2">
        {stages.map((stage, idx) => {
          const nextStage = stages[idx + 1];
          const healthColor = nextStage ? getHealthColor(stage.count, nextStage.count) : "text-gray-600";
          const barWidth = Math.max(5, Math.min(100, (stage.count / stages[0].count) * 100));

          return (
            <div key={stage.label} className="relative group">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 w-28">{stage.label}:</span>
                <div className="flex-1 mx-2">
                  <div
                    className="h-2 bg-purple-300 rounded"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className={`font-mono font-bold w-20 text-right ${healthColor}`}>
                  {stage.count.toLocaleString()}
                </span>
              </div>
              {/* Tooltip on hover */}
              <div className="hidden group-hover:block absolute z-10 left-0 top-full mt-1 p-2 bg-gray-900 text-white text-xs rounded shadow-lg max-w-xs">
                <p>{stage.tooltip}</p>
                {stage.rejected != null && stage.rejected > 0 && (
                  <p className="mt-1 text-gray-300">{stage.rejectedLabel}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Threshold info */}
      <div className="mt-3 pt-3 border-t border-purple-200 text-xs text-purple-600">
        <div className="flex justify-between">
          <span>TPI threshold:</span>
          <span className="font-mono">{debug.chosen_tpi_threshold_m?.toFixed(1) || '—'}m</span>
        </div>
        <div className="flex justify-between">
          <span>Max slope:</span>
          <span className="font-mono">{debug.chosen_slope_max_deg?.toFixed(0) || '—'}°</span>
        </div>
        {debug.auto_threshold_applied && (
          <div className="mt-1 text-purple-500 italic">Auto-adjusted thresholds</div>
        )}
      </div>

      {/* View analysis stats */}
      {debug.avg_overlook_score != null && (
        <div className="mt-2 pt-2 border-t border-purple-200 text-xs text-purple-600">
          <div className="flex justify-between">
            <span>Avg overlook score:</span>
            <span className="font-mono">{(debug.avg_overlook_score * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span>Avg open sky:</span>
            <span className="font-mono">{((debug.avg_open_sky_fraction || 0) * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
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
              {/* View analysis for overlook/rim locations */}
              {standing.view && standing.view.overlook_score > 0 && (
                <div className="mt-2 pl-8 text-xs">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-cyan-500" />
                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                      standing.view.overlook_score >= 0.7 ? 'bg-cyan-100 text-cyan-700' :
                      standing.view.overlook_score >= 0.4 ? 'bg-cyan-50 text-cyan-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {standing.view.overlook_score >= 0.7 ? 'Great view' :
                       standing.view.overlook_score >= 0.4 ? 'Good view' : 'Limited view'}
                    </span>
                    <span className="text-gray-500">
                      Face {degreesToCompass(standing.view.best_bearing_deg)}
                    </span>
                  </div>
                  {standing.view.explanations && (
                    <p className="mt-1 text-gray-500 leading-relaxed">
                      {standing.view.explanations.short}
                    </p>
                  )}
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
  // Scout coverage debug mode
  const [showScoutDebug, setShowScoutDebug] = useState(false);
  const [showDebugRimCandidates, setShowDebugRimCandidates] = useState(true);
  const [showDebugLocalMaxima, setShowDebugLocalMaxima] = useState(true);
  const [showDebugViewAnalyzed, setShowDebugViewAnalyzed] = useState(true);

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
      debug: showScoutDebug,  // Enable debug stats when scout debug mode is on
    });
  }, [analyze, parsedCoords, date, event, radius, showScoutDebug]);

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

  // Get overlook standings (rim_overlook sources with no subject)
  const overlookStandings = useMemo(
    () => result?.standing_locations.filter((sl) => sl.source === 'rim_overlook' || sl.subject_id === null) || [],
    [result]
  );

  const selectedSubject = useMemo(
    () => result?.subjects.find((s) => s.subject_id === selectedSubjectId) || null,
    [result, selectedSubjectId]
  );

  const selectedStanding = useMemo(
    () => {
      // First try to find a subject-based standing
      const subjectStanding = result?.standing_locations.find((sl) => sl.subject_id === selectedSubjectId);
      if (subjectStanding) return subjectStanding;
      // Then try to find an overlook standing by standing_id
      return overlookStandings.find((sl) => sl.standing_id === selectedSubjectId) || null;
    },
    [result, selectedSubjectId, overlookStandings]
  );

  // Check if selected item is an overlook (not a subject)
  const selectedOverlook = useMemo(
    () => overlookStandings.find((sl) => sl.standing_id === selectedSubjectId) || null,
    [overlookStandings, selectedSubjectId]
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

  // Draw dropped pin when coordinates are set but no result yet
  const droppedPinRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    // Remove existing dropped pin
    if (droppedPinRef.current) {
      droppedPinRef.current.setMap(null);
      droppedPinRef.current = null;
    }

    // Only show dropped pin when we have coordinates but no result (or result is for different location)
    if (parsedCoords && !result) {
      droppedPinRef.current = new google.maps.Marker({
        position: { lat: parsedCoords.lat, lng: parsedCoords.lon },
        map,
        icon: {
          url: "data:image/svg+xml," + encodeURIComponent(`
            <svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 32 16 32s16-20 16-32C32 7.163 24.837 0 16 0z" fill="#7c3aed"/>
              <circle cx="16" cy="16" r="8" fill="white"/>
              <circle cx="16" cy="16" r="4" fill="#7c3aed"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(32, 48),
          anchor: new google.maps.Point(16, 48),
        },
        title: `Selected: ${parsedCoords.lat.toFixed(4)}, ${parsedCoords.lon.toFixed(4)}`,
        zIndex: 1000,
        animation: google.maps.Animation.DROP,
      });

      // Pan to the new location
      map.panTo({ lat: parsedCoords.lat, lng: parsedCoords.lon });
    }

    return () => {
      if (droppedPinRef.current) {
        droppedPinRef.current.setMap(null);
      }
    };
  }, [map, parsedCoords, result]);

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

      // Draw polygons (only when showing analysis zones)
      if (showAnalysisZones) {
        // 1. ExploreArea polygon - original zone (faint background layer)
        if (subject.explore_polygon && subject.explore_polygon.length > 0) {
          const explorePolygon = new google.maps.Polygon({
            paths: subject.explore_polygon.map(([lat, lng]) => ({ lat, lng })),
            strokeColor: color,
            strokeWeight: 1,
            strokeOpacity: 0.25,
            fillColor: color,
            fillOpacity: isSelected ? 0.06 : 0.03,
            map,
            clickable: true,
            zIndex: 1,
          });
          explorePolygon.addListener("click", () => setSelectedSubjectId(subject.subject_id));
          overlaysRef.current.push(explorePolygon);
        }

        // 2. Subject polygon - region-grown around anchor (bold foreground layer)
        const subjectPolygon = new google.maps.Polygon({
          paths: subject.polygon.map(([lat, lng]) => ({ lat, lng })),
          strokeColor: color,
          strokeWeight: isSelected ? 3 : 2,
          strokeOpacity: 0.9,
          fillColor: color,
          fillOpacity: isSelected ? 0.25 : 0.15,
          map,
          clickable: true,
          zIndex: 2,
        });
        subjectPolygon.addListener("click", () => setSelectedSubjectId(subject.subject_id));
        overlaysRef.current.push(subjectPolygon);
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

        // View cone polygon (for overlook/rim locations)
        if (isCurrentlySelected && standing.view?.view_cone && standing.view.view_cone.length >= 3) {
          const viewConePolygon = new google.maps.Polygon({
            paths: standing.view.view_cone.map(([lat, lng]) => ({ lat, lng })),
            strokeColor: "#06b6d4", // cyan
            strokeWeight: 2,
            strokeOpacity: 0.8,
            fillColor: "#06b6d4",
            fillOpacity: 0.15,
            map,
            zIndex: 80,
          });
          overlaysRef.current.push(viewConePolygon);
        }
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

    // Draw rim-overlook standings (standalone viewpoints with no subject)
    overlookStandings.forEach((overlook) => {
      const isSelected = overlook.standing_id === selectedSubjectId;
      const overlookScore = overlook.view?.overlook_score ?? 0;
      const markerColor = overlookScore >= 0.7 ? "#0891b2" : overlookScore >= 0.4 ? "#06b6d4" : "#67e8f9";

      // Overlook marker (eye icon)
      if (isSelected || showAllPositions) {
        const overlookMarker = new google.maps.Marker({
          position: { lat: overlook.location.lat, lng: overlook.location.lon },
          map,
          icon: {
            url: "data:image/svg+xml," + encodeURIComponent(`
              <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="${markerColor}" stroke="white" stroke-width="3"/>
                <ellipse cx="16" cy="16" rx="8" ry="5" fill="white" stroke="white"/>
                <circle cx="16" cy="16" r="3" fill="${markerColor}"/>
              </svg>
            `),
            scaledSize: new google.maps.Size(isSelected ? 36 : 28, isSelected ? 36 : 28),
            anchor: new google.maps.Point(isSelected ? 18 : 14, isSelected ? 18 : 14),
          },
          title: `Overlook #${overlook.standing_id} - ${overlookScore >= 0.7 ? 'Great view' : overlookScore >= 0.4 ? 'Good view' : 'Limited view'}`,
          zIndex: isSelected ? 100 : 50,
        });
        overlookMarker.addListener("click", () => setSelectedSubjectId(overlook.standing_id));
        overlaysRef.current.push(overlookMarker);
      }

      // View cone for selected overlook
      if (isSelected && overlook.view?.view_cone && overlook.view.view_cone.length >= 3) {
        const viewConePolygon = new google.maps.Polygon({
          paths: overlook.view.view_cone.map(([lat, lng]) => ({ lat, lng })),
          strokeColor: "#0891b2", // darker cyan
          strokeWeight: 2,
          strokeOpacity: 0.9,
          fillColor: "#06b6d4",
          fillOpacity: 0.2,
          map,
          zIndex: 80,
        });
        overlaysRef.current.push(viewConePolygon);

        // Best bearing direction line
        if (overlook.view.best_bearing_deg != null) {
          const bearing = overlook.view.best_bearing_deg;
          const bearingRad = (bearing - 90) * Math.PI / 180;
          const distanceM = 200;
          const metersPerDegreeLat = 111320;
          const metersPerDegreeLon = 111320 * Math.cos(overlook.location.lat * Math.PI / 180);

          const endLat = overlook.location.lat + (distanceM * Math.sin(bearingRad + Math.PI / 2)) / metersPerDegreeLat;
          const endLon = overlook.location.lon + (distanceM * Math.cos(bearingRad + Math.PI / 2)) / metersPerDegreeLon;

          const bearingLine = new google.maps.Polyline({
            path: [
              { lat: overlook.location.lat, lng: overlook.location.lon },
              { lat: endLat, lng: endLon },
            ],
            strokeColor: "#0891b2",
            strokeWeight: 3,
            strokeOpacity: 0.8,
            icons: [
              {
                icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 4, fillColor: "#0891b2", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1 },
                offset: "100%",
              },
            ],
            map,
          });
          overlaysRef.current.push(bearingLine);
        }
      }
    });

    // Draw scout coverage debug layers
    if (showScoutDebug && result.meta.rim_overlook_debug) {
      const debug = result.meta.rim_overlook_debug;

      // Layer 1: Rim candidates (pre-NMS) - pink dots
      if (showDebugRimCandidates && debug.sample_rim_candidates) {
        debug.sample_rim_candidates.forEach((cand) => {
          // Color by TPI - higher TPI = darker
          const tpiNorm = Math.min(1, (cand.tpi_large_m - 20) / 80); // Normalize 20-100m range
          const opacity = 0.3 + tpiNorm * 0.5;

          const marker = new google.maps.Marker({
            position: { lat: cand.lat, lng: cand.lon },
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 3,
              fillColor: "#ec4899", // pink
              fillOpacity: opacity,
              strokeColor: "#fff",
              strokeWeight: 0.5,
            },
            title: `Rim candidate: TPI=${cand.tpi_large_m.toFixed(1)}m, slope=${cand.slope_deg.toFixed(1)}°`,
            zIndex: 5,
          });
          overlaysRef.current.push(marker);
        });
      }

      // Layer 2: Local maxima (post-NMS) - yellow dots
      if (showDebugLocalMaxima && debug.sample_local_maxima) {
        debug.sample_local_maxima.forEach((maxima) => {
          const strengthNorm = maxima.rim_strength;
          const size = 4 + strengthNorm * 4;

          const marker = new google.maps.Marker({
            position: { lat: maxima.lat, lng: maxima.lon },
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: size,
              fillColor: "#eab308", // yellow
              fillOpacity: 0.7,
              strokeColor: "#fff",
              strokeWeight: 1,
            },
            title: `Local max: TPI=${maxima.tpi_large_m.toFixed(1)}m, strength=${(maxima.rim_strength * 100).toFixed(0)}%, elev=${maxima.elevation_m.toFixed(0)}m`,
            zIndex: 10,
          });
          overlaysRef.current.push(marker);
        });
      }

      // Layer 3: View analyzed points - cyan diamonds
      if (showDebugViewAnalyzed && debug.sample_view_analyzed) {
        debug.sample_view_analyzed.forEach((analyzed) => {
          const scoreColor = analyzed.overlook_score >= 0.7 ? "#0891b2" :
                            analyzed.overlook_score >= 0.4 ? "#06b6d4" : "#67e8f9";

          const marker = new google.maps.Marker({
            position: { lat: analyzed.lat, lng: analyzed.lon },
            map,
            icon: {
              path: "M 0,-8 L 6,0 L 0,8 L -6,0 Z", // Diamond shape
              scale: 1,
              fillColor: scoreColor,
              fillOpacity: 0.9,
              strokeColor: "#fff",
              strokeWeight: 1.5,
            },
            title: `View analyzed: score=${(analyzed.overlook_score * 100).toFixed(0)}%, depth=${analyzed.depth_p90_m.toFixed(0)}m, sky=${(analyzed.open_sky_fraction * 100).toFixed(0)}%`,
            zIndex: 15,
          });
          overlaysRef.current.push(marker);
        });
      }
    }

    // Fit bounds
    if (result.meta.dem_bounds) {
      const bounds = new google.maps.LatLngBounds(
        { lat: result.meta.dem_bounds.south, lng: result.meta.dem_bounds.west },
        { lat: result.meta.dem_bounds.north, lng: result.meta.dem_bounds.east }
      );
      map.fitBounds(bounds);
    }
  }, [map, result, selectedSubjectId, showAllPositions, showRejectedCandidates, showAnalysisZones, parsedCoords, overlookStandings, showScoutDebug, showDebugRimCandidates, showDebugLocalMaxima, showDebugViewAnalyzed]);

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

  // Handle place selection from PlaceSearch
  const handlePlaceSelect = useCallback((place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setCoordinates(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  }, []);

  // Handle map click to set location
  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setCoordinates(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  }, []);

  if (!isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading maps...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header showBorder />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden grid lg:grid-cols-2">
        {/* Left Panel - Map */}
        <div className="relative h-full">
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={{ lat: parsedCoords?.lat || 39.0708, lng: parsedCoords?.lon || -106.989 }}
            zoom={14}
            onLoad={setMap}
            onClick={handleMapClick}
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
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded border-2 border-cyan-500 bg-cyan-100 opacity-70" />
                <span>View cone</span>
              </div>
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="12" fill="#0891b2" stroke="white" strokeWidth="2"/>
                  <ellipse cx="16" cy="16" rx="6" ry="4" fill="white"/>
                  <circle cx="16" cy="16" r="2" fill="#0891b2"/>
                </svg>
                <span>Rim overlook</span>
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
            {/* Scout coverage debug toggle */}
            <div className="mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showScoutDebug}
                  onChange={(e) => setShowScoutDebug(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <Bug className="w-4 h-4 text-purple-500" />
                <span>Scout coverage (debug)</span>
              </label>
              {showScoutDebug && (
                <div className="mt-2 ml-6 space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={showDebugRimCandidates}
                      onChange={(e) => setShowDebugRimCandidates(e.target.checked)}
                      className="w-3 h-3 rounded border-gray-300 text-pink-500"
                    />
                    <div className="w-2 h-2 rounded-full bg-pink-400" />
                    <span>Rim candidates (pre-NMS)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={showDebugLocalMaxima}
                      onChange={(e) => setShowDebugLocalMaxima(e.target.checked)}
                      className="w-3 h-3 rounded border-gray-300 text-yellow-500"
                    />
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    <span>Local maxima (post-NMS)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={showDebugViewAnalyzed}
                      onChange={(e) => setShowDebugViewAnalyzed(e.target.checked)}
                      className="w-3 h-3 rounded border-gray-300 text-cyan-500"
                    />
                    <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    <span>View analyzed</span>
                  </label>
                </div>
              )}
            </div>
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

        {/* Right Panel - Controls and Shot Opportunities */}
        <div className="border-l bg-card flex flex-col overflow-hidden">
          {/* Search Controls */}
          <div className="p-4 border-b bg-muted/30 space-y-4">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" weight="fill" />
              <h2 className="text-lg font-semibold">Photo Scout</h2>
            </div>

            {/* Place Search */}
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Search Location</Label>
              <PlaceSearch
                onPlaceSelect={handlePlaceSelect}
                placeholder="Search for a place..."
                className="w-full"
              />
            </div>

            {/* Coordinate Input (fallback) */}
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Or enter coordinates</Label>
              <Input
                value={coordinates}
                onChange={(e) => setCoordinates(e.target.value)}
                className={`w-full ${!parsedCoords && coordinates ? "border-red-300" : ""}`}
                placeholder="lat, lon (e.g., 39.0708, -106.9890)"
              />
            </div>

            {/* Date and Event Selection */}
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-sm text-muted-foreground mb-1.5 block">Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-1">
                <Label className="text-sm text-muted-foreground mb-1.5 block">Event</Label>
                <Select value={event} onValueChange={(value: "sunrise" | "sunset") => setEvent(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sunrise">Sunrise</SelectItem>
                    <SelectItem value="sunset">Sunset</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleAnalyze} disabled={isLoading || !parsedCoords} className="w-full">
              {isLoading ? "Scanning terrain..." : "Scout Location"}
            </Button>
          </div>

          {/* Summary Header */}
          {result && (
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-lg">Scouting Results</span>
              </div>
              {/* Zone-centric summary - success-oriented framing */}
              <div className="flex items-center gap-3 text-sm">
                {result.subjects.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950 rounded-full">
                    <Sun className="w-4 h-4 text-amber-600" weight="fill" />
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      {result.subjects.length} lighting zone{result.subjects.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {overlookStandings.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 dark:bg-cyan-950 rounded-full">
                    <Eye className="w-4 h-4 text-cyan-600" weight="fill" />
                    <span className="font-medium text-cyan-700 dark:text-cyan-400">
                      {overlookStandings.length} overlook{overlookStandings.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {result.subjects.length === 0 && overlookStandings.length === 0 && (
                  <span className="text-muted-foreground">No viable locations found</span>
                )}
              </div>
              {result.meta.dem_source && (
                <div className="mt-3 text-xs text-muted-foreground">
                  DEM: {result.meta.dem_source}
                  {result.meta.dem_resolution_m && ` • ${result.meta.dem_resolution_m}m resolution`}
                </div>
              )}
              {result.meta.structure_debug && showScoutDebug && (
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
            {/* Scouting Funnel (debug mode) - inside scrollable area */}
            {showScoutDebug && result && (
              <ScoutingFunnel debug={result.meta.rim_overlook_debug} />
            )}

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg">
                {error}
              </div>
            )}

            {!result && !isLoading && !error && (
              <div className="text-center text-muted-foreground py-12">
                <Mountains className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p>Search, enter coordinates, or</p>
                <p className="font-medium">click on the map</p>
                <p className="mt-2 text-sm">then click "Scout Location" to find photo opportunities</p>
              </div>
            )}

            {isLoading && (
              <div className="text-center text-muted-foreground py-12">
                <Crosshair className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50 animate-pulse" />
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

            {/* Rim Overlook Cards - standalone viewpoints with Top Picks / More Options */}
            {overlookStandings.length > 0 && (() => {
              // Sort overlooks by score (highest first) and compute zone stats
              const sortedOverlooks = [...overlookStandings].sort((a, b) =>
                (b.view?.overlook_score ?? 0) - (a.view?.overlook_score ?? 0)
              );
              const topPicks = sortedOverlooks.slice(0, 3);
              const moreOptions = sortedOverlooks.slice(3);

              // Compute zone score for debug display
              const top3Scores = topPicks.map(o => o.view?.overlook_score ?? 0);
              const top3Avg = top3Scores.length > 0 ? top3Scores.reduce((a, b) => a + b, 0) / top3Scores.length : 0;
              const epicCount = sortedOverlooks.filter(o => o.view?.view_category === 'EPIC_OVERLOOK').length;
              const total = sortedOverlooks.length;
              const zoneScore = 0.55 * top3Avg + 0.25 * Math.min(1, epicCount / 3) + 0.20 * Math.min(1, total / 20);

              // Get category label
              const getCategoryLabel = (category?: string) => {
                switch (category) {
                  case 'EPIC_OVERLOOK': return { label: 'Epic Overlook', color: 'text-purple-700', bgColor: 'bg-purple-100' };
                  case 'DRAMATIC_ENCLOSED': return { label: 'Dramatic View', color: 'text-indigo-700', bgColor: 'bg-indigo-100' };
                  default: return { label: 'Scenic View', color: 'text-cyan-700', bgColor: 'bg-cyan-100' };
                }
              };

              const renderOverlookCard = (overlook: typeof overlookStandings[0], isTopPick: boolean) => {
                const isSelected = overlook.standing_id === selectedSubjectId;
                const overlookScore = overlook.view?.overlook_score ?? 0;
                const category = getCategoryLabel(overlook.view?.view_category);

                return (
                  <Card
                    key={overlook.standing_id}
                    className={`cursor-pointer transition-all ${
                      isSelected ? "ring-2 ring-cyan-500 shadow-md" : "hover:shadow-md"
                    } ${isTopPick ? "" : "opacity-90"}`}
                    onClick={() => setSelectedSubjectId(overlook.standing_id)}
                  >
                    <CardContent className={isTopPick ? "p-4" : "p-3"}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`${isTopPick ? "w-10 h-10" : "w-8 h-8"} rounded-full bg-cyan-100 flex items-center justify-center`}>
                            <Eye className={`${isTopPick ? "w-6 h-6" : "w-5 h-5"} text-cyan-600`} weight="fill" />
                          </div>
                          <div>
                            <div className={`${isTopPick ? "font-bold text-lg" : "font-semibold text-base"} flex items-center gap-2`}>
                              {overlook.view?.view_category === 'EPIC_OVERLOOK' ? 'Epic Overlook' :
                               overlook.view?.view_category === 'DRAMATIC_ENCLOSED' ? 'Dramatic View' : 'Rim Overlook'}
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${category.bgColor} ${category.color}`}>
                                {Math.round(overlookScore * 100)}%
                              </span>
                            </div>
                            <div className="text-sm text-gray-500">
                              Face {degreesToCompass(overlook.view?.best_bearing_deg ?? 0)} for best view
                            </div>
                          </div>
                        </div>
                        {overlook.nav_link && isTopPick && (
                          <a
                            href={overlook.nav_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-600 hover:text-cyan-800 hover:bg-cyan-100 rounded transition-colors"
                          >
                            <MapPin className="w-4 h-4" />
                            Navigate
                          </a>
                        )}
                      </div>

                      {/* Chips for key metrics */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {overlook.view?.depth_p90_m != null && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            Depth: {(overlook.view.depth_p90_m / 1000).toFixed(1)}km
                          </span>
                        )}
                        {overlook.view?.open_sky_fraction != null && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            Open ahead: {Math.round(overlook.view.open_sky_fraction * 100)}%
                          </span>
                        )}
                        {overlook.properties.access_type && overlook.properties.access_type !== 'none' && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            overlook.properties.access_type === 'road' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {overlook.properties.access_type}
                            {overlook.properties.distance_to_road_m != null && ` ${Math.round(overlook.properties.distance_to_road_m)}m`}
                          </span>
                        )}
                      </div>

                      {/* Explanation - only for top picks */}
                      {isTopPick && overlook.view?.explanations && (
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {overlook.view.explanations.short}
                        </p>
                      )}

                      {/* Coordinates in debug section - only for top picks */}
                      {isTopPick && (
                        <Collapsible className="mt-3">
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                            <CaretDown className="w-3 h-3" />
                            Coordinates
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono">
                            <div>{overlook.location.lat.toFixed(6)}, {overlook.location.lon.toFixed(6)}</div>
                            <div className="text-gray-500 mt-1">Elevation: {Math.round(overlook.properties.elevation_diff_m || 0)}m relative</div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </CardContent>
                  </Card>
                );
              };

              return (
                <>
                  {/* Top Picks Header */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <Eye className="w-5 h-5 text-cyan-600" weight="fill" />
                      <h3 className="font-semibold text-sm text-gray-700">Top Picks</h3>
                      <span className="text-xs text-gray-500">({topPicks.length} of {sortedOverlooks.length})</span>
                    </div>
                    {/* Debug: show zone score */}
                    {showScoutDebug && (
                      <div className="text-xs font-mono text-gray-400">
                        score={zoneScore.toFixed(2)} (top3={top3Avg.toFixed(2)}, epic={epicCount}, n={total})
                      </div>
                    )}
                  </div>

                  {/* Top 3 Picks - always visible */}
                  {topPicks.map(overlook => renderOverlookCard(overlook, true))}

                  {/* More Options - collapsed by default */}
                  {moreOptions.length > 0 && (
                    <Collapsible className="mt-2">
                      <CollapsibleTrigger className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-600 hover:text-gray-800 transition-colors">
                        <CaretDown className="w-4 h-4" />
                        <span>+{moreOptions.length} more overlook{moreOptions.length !== 1 ? "s" : ""}</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-2">
                        {moreOptions.map(overlook => renderOverlookCard(overlook, false))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </>
              );
            })()}

            {result && result.subjects.length === 0 && overlookStandings.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <Mountains className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p>No viable overlooks found</p>
                <p className="text-sm mt-2">Try a location with more dramatic terrain or canyon edges</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
