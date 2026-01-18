/**
 * Mock Data Generator for Terrain Validation
 *
 * Generates realistic terrain analysis results for testing the
 * validation UI without a backend.
 */

import {
  TerrainAnalysisResult,
  Subject,
  StandingLocation,
  SunPosition,
  IncidencePoint,
  GlowWindow,
  ShadowCheck,
  ShadowSample,
  SubjectProperties,
  SubjectValidation,
  LineOfSight,
  LOSSample,
  CandidateSearch,
  RejectedCandidate,
  StandingProperties,
} from '@/types/terrainValidation';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Compute sun vector from azimuth and altitude
 */
function computeSunVector(azDeg: number, altDeg: number): [number, number, number] {
  const azRad = azDeg * DEG2RAD;
  const altRad = altDeg * DEG2RAD;

  const Sx = Math.cos(altRad) * Math.sin(azRad);
  const Sy = Math.cos(altRad) * Math.cos(azRad);
  const Sz = Math.sin(altRad);

  return [Sx, Sy, Sz];
}

/**
 * Compute surface normal from slope and face direction
 */
function computeSurfaceNormal(slopeDeg: number, faceDirDeg: number): [number, number, number] {
  const slopeRad = slopeDeg * DEG2RAD;
  const faceRad = faceDirDeg * DEG2RAD;

  const Nx = Math.sin(slopeRad) * Math.sin(faceRad);
  const Ny = Math.sin(slopeRad) * Math.cos(faceRad);
  const Nz = Math.cos(slopeRad);

  return [Nx, Ny, Nz];
}

/**
 * Compute incidence (dot product)
 */
function computeIncidence(
  normal: [number, number, number],
  sun: [number, number, number]
): number {
  return normal[0] * sun[0] + normal[1] * sun[1] + normal[2] * sun[2];
}

/**
 * Compute glow score
 */
function computeGlowScore(incidence: number, target: number = 0.2): number {
  if (incidence < 0) return 0;
  return Math.exp(-Math.abs(incidence - target));
}

/**
 * Generate a random polygon around a centroid
 */
function generatePolygon(
  lat: number,
  lon: number,
  sizeM: number = 50
): [number, number][] {
  const points: [number, number][] = [];
  const numPoints = 5 + Math.floor(Math.random() * 4);
  const degPerM = 1 / 111000; // approximate

  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    const r = sizeM * (0.7 + Math.random() * 0.6);
    const dLat = r * Math.cos(angle) * degPerM;
    const dLon = r * Math.sin(angle) * degPerM / Math.cos(lat * DEG2RAD);
    points.push([lat + dLat, lon + dLon]);
  }

  // Close the polygon
  points.push(points[0]);

  return points;
}

/**
 * Generate sun track for a location and date
 */
function generateSunTrack(
  lat: number,
  lon: number,
  event: 'sunrise' | 'sunset'
): SunPosition[] {
  const track: SunPosition[] = [];

  // Simplified sun position calculation
  // In production, this would use pvlib or similar
  const baseAz = event === 'sunset' ? 280 : 80;
  const baseTime = event === 'sunset' ? '19:00' : '05:00';

  for (let minutes = 0; minutes <= 90; minutes += 6) {
    const azimuth = baseAz + minutes * 0.25;
    const altitude = event === 'sunset'
      ? 15 - minutes * 0.2
      : -5 + minutes * 0.22;

    const hours = event === 'sunset' ? 19 : 5;
    const totalMinutes = hours * 60 + minutes;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    track.push({
      time_iso: `2024-06-21T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00-07:00`,
      minutes_from_start: minutes,
      azimuth_deg: azimuth,
      altitude_deg: altitude,
      vector: computeSunVector(azimuth, altitude),
    });
  }

  return track;
}

/**
 * Generate incidence series for a subject given sun track
 */
function generateIncidenceSeries(
  normal: [number, number, number],
  sunTrack: SunPosition[]
): IncidencePoint[] {
  return sunTrack.map((sun) => {
    const incidence = computeIncidence(normal, sun.vector);
    return {
      minutes: sun.minutes_from_start,
      incidence: incidence,
      glow_score: computeGlowScore(incidence),
    };
  });
}

/**
 * Detect glow window from incidence series
 */
function detectGlowWindow(
  incidenceSeries: IncidencePoint[],
  glowMin: number = 0.05,
  glowMax: number = 0.40,
  minScore: number = 0.80
): GlowWindow | null {
  const validPoints = incidenceSeries.filter(
    (p) => p.incidence >= glowMin && p.incidence <= glowMax && p.glow_score >= minScore
  );

  if (validPoints.length === 0) return null;

  const peakPoint = validPoints.reduce((max, p) =>
    p.glow_score > max.glow_score ? p : max
  );

  return {
    start_minutes: validPoints[0].minutes,
    end_minutes: validPoints[validPoints.length - 1].minutes,
    peak_minutes: peakPoint.minutes,
    duration_minutes: validPoints[validPoints.length - 1].minutes - validPoints[0].minutes,
    peak_incidence: peakPoint.incidence,
    peak_glow_score: peakPoint.glow_score,
  };
}

/**
 * Generate shadow check samples
 */
function generateShadowCheck(
  elevation: number,
  sunAz: number,
  sunAlt: number,
  blocked: boolean = false
): ShadowCheck {
  const distances = [100, 200, 500, 1000, 2000];
  const samples: ShadowSample[] = distances.map((d, i) => {
    const rayZ = elevation + d * Math.tan(sunAlt * DEG2RAD);
    const terrainZ = elevation - 20 + Math.random() * 100;
    const isBlocked = blocked && i === distances.length - 1;

    return {
      distance_m: d,
      ray_z: rayZ,
      terrain_z: isBlocked ? rayZ + 50 : terrainZ,
      blocked: isBlocked,
    };
  });

  return {
    checked_at_minutes: 30,
    sun_azimuth_deg: sunAz,
    sun_altitude_deg: sunAlt,
    samples,
    sun_visible: !blocked,
  };
}

/**
 * Generate line of sight samples
 */
function generateLineOfSight(
  startElev: number,
  endElev: number,
  clear: boolean = true
): LineOfSight {
  const samples: LOSSample[] = [];
  const eyeHeight = 1.7;
  const targetHeight = 5.0;

  for (let t = 0.25; t <= 0.75; t += 0.25) {
    const rayZ = startElev + eyeHeight + t * (endElev + targetHeight - startElev - eyeHeight);
    const terrainZ = startElev + t * (endElev - startElev) - 5 + Math.random() * 8;
    const blocked = !clear && t === 0.5;

    samples.push({
      t,
      ray_z: rayZ,
      terrain_z: blocked ? rayZ + 10 : terrainZ,
      blocked,
    });
  }

  return {
    clear,
    eye_height_m: eyeHeight,
    target_height_m: targetHeight,
    samples,
  };
}

/**
 * Generate candidate search results
 */
function generateCandidateSearch(selectedDistance: number): CandidateSearch {
  const rejected: RejectedCandidate[] = [];

  if (selectedDistance > 20) {
    rejected.push({
      distance_m: 20,
      lat: 0,
      lon: 0,
      reason: 'slope_too_steep',
      slope_deg: 22.3,
    });
  }

  if (selectedDistance > 25) {
    rejected.push({
      distance_m: 25,
      lat: 0,
      lon: 0,
      reason: 'slope_too_steep',
      slope_deg: 18.1,
    });
  }

  return {
    candidates_checked: rejected.length + 1,
    rejected,
    selected_at_distance_m: selectedDistance,
  };
}

/**
 * Generate a complete mock subject
 */
function generateSubject(
  id: number,
  baseLat: number,
  baseLon: number,
  sunTrack: SunPosition[],
  hasGlow: boolean = true
): Subject {
  // Random offset from base location
  const latOffset = (Math.random() - 0.5) * 0.01;
  const lonOffset = (Math.random() - 0.5) * 0.01;
  const lat = baseLat + latOffset;
  const lon = baseLon + lonOffset;

  // Generate properties
  const slopeDeg = 50 + Math.random() * 30; // 50-80 degrees
  const aspectDeg = Math.random() * 360;
  const faceDirDeg = (aspectDeg + 180) % 360;
  const elevation = 1500 + Math.random() * 500;

  const normal = computeSurfaceNormal(slopeDeg, faceDirDeg);

  // Adjust face direction for good glow if needed
  let adjustedFaceDir = faceDirDeg;
  if (hasGlow) {
    // Face roughly opposite to sun for grazing light
    const avgSunAz = sunTrack[Math.floor(sunTrack.length / 2)].azimuth_deg;
    adjustedFaceDir = (avgSunAz - 90 + Math.random() * 40 - 20) % 360;
    if (adjustedFaceDir < 0) adjustedFaceDir += 360;
  }

  const adjustedNormal = computeSurfaceNormal(slopeDeg, adjustedFaceDir);

  const properties: SubjectProperties = {
    elevation_m: elevation,
    slope_deg: slopeDeg,
    aspect_deg: (adjustedFaceDir + 180) % 360,
    face_direction_deg: adjustedFaceDir,
    area_m2: 5000 + Math.random() * 20000,
    normal: adjustedNormal,
  };

  // Generate incidence series
  const incidenceSeries = generateIncidenceSeries(adjustedNormal, sunTrack);

  // Detect glow window
  const glowWindow = hasGlow ? detectGlowWindow(incidenceSeries) : null;

  // Generate shadow check
  const peakSun = sunTrack[Math.floor(sunTrack.length / 2)];
  const shadowCheck = generateShadowCheck(
    elevation,
    peakSun.azimuth_deg,
    peakSun.altitude_deg,
    !hasGlow && Math.random() > 0.5
  );

  // Validation
  const normalMag = Math.sqrt(
    adjustedNormal[0] ** 2 + adjustedNormal[1] ** 2 + adjustedNormal[2] ** 2
  );

  const validation: SubjectValidation = {
    normal_unit_length: normalMag,
    aspect_normal_match_deg: Math.random() * 3,
    glow_in_range: glowWindow !== null,
    sun_visible_at_peak: shadowCheck.sun_visible,
  };

  return {
    subject_id: id,
    centroid: { lat, lon },
    polygon: generatePolygon(lat, lon, 30 + Math.random() * 40),
    properties,
    incidence_series: incidenceSeries,
    glow_window: glowWindow,
    shadow_check: shadowCheck,
    validation,
  };
}

/**
 * Generate a standing location for a subject
 */
function generateStandingLocation(
  id: number,
  subject: Subject
): StandingLocation {
  // Position behind the subject (opposite face direction)
  const offsetDir = (subject.properties.face_direction_deg + 180) % 360;
  const distance = 25 + Math.random() * 30;
  const degPerM = 1 / 111000;

  const dLat = distance * Math.cos(offsetDir * DEG2RAD) * degPerM;
  const dLon = distance * Math.sin(offsetDir * DEG2RAD) * degPerM / Math.cos(subject.centroid.lat * DEG2RAD);

  const standLat = subject.centroid.lat + dLat;
  const standLon = subject.centroid.lon + dLon;
  const standElev = subject.properties.elevation_m - 20 - Math.random() * 30;

  // Camera bearing points back to subject
  const cameraBearing = (offsetDir + 180) % 360;

  const properties: StandingProperties = {
    elevation_m: standElev,
    slope_deg: 8 + Math.random() * 6,
    distance_to_subject_m: distance,
    camera_bearing_deg: cameraBearing,
    elevation_diff_m: subject.properties.elevation_m - standElev,
  };

  return {
    standing_id: id,
    subject_id: subject.subject_id,
    location: { lat: standLat, lon: standLon },
    properties,
    line_of_sight: generateLineOfSight(standElev, subject.properties.elevation_m, true),
    candidate_search: generateCandidateSearch(distance),
  };
}

/**
 * Main function: Generate complete mock analysis result
 */
export function generateMockAnalysis(
  lat: number,
  lon: number,
  date: string,
  event: 'sunrise' | 'sunset'
): TerrainAnalysisResult {
  // Generate sun track
  const sunTrack = generateSunTrack(lat, lon, event);

  // Generate subjects (3-6 of them, some with glow, some without)
  const numSubjects = 3 + Math.floor(Math.random() * 4);
  const subjects: Subject[] = [];

  for (let i = 0; i < numSubjects; i++) {
    const hasGlow = i < numSubjects - 1 || Math.random() > 0.3; // Most have glow
    subjects.push(generateSubject(i + 1, lat, lon, sunTrack, hasGlow));
  }

  // Generate standing locations for subjects with glow
  const standingLocations: StandingLocation[] = subjects
    .filter((s) => s.glow_window !== null)
    .map((s, i) => generateStandingLocation(i + 1, s));

  return {
    meta: {
      request_id: `mock-${Date.now()}`,
      computed_at: new Date().toISOString(),
      dem_source: 'MOCK_DEM_10m',
      dem_bounds: {
        north: lat + 0.02,
        south: lat - 0.02,
        east: lon + 0.02,
        west: lon - 0.02,
      },
      cell_size_m: 10,
      center_lat: lat,
      center_lon: lon,
    },
    sun_track: sunTrack,
    subjects,
    standing_locations: standingLocations,
    debug_layers: {},
  };
}

/**
 * Generate Yosemite-specific mock data (validated example)
 */
export function generateYosemiteMock(): TerrainAnalysisResult {
  const lat = 37.72489;
  const lon = -119.63512;

  // Use the validated Yosemite example data
  const sunTrack: SunPosition[] = [
    { time_iso: '2024-06-21T19:00:00-07:00', minutes_from_start: 0, azimuth_deg: 284.2, altitude_deg: 18.73, vector: computeSunVector(284.2, 18.73) },
    { time_iso: '2024-06-21T19:18:00-07:00', minutes_from_start: 18, azimuth_deg: 287.9, altitude_deg: 15.97, vector: computeSunVector(287.9, 15.97) },
    { time_iso: '2024-06-21T19:30:00-07:00', minutes_from_start: 30, azimuth_deg: 289.7, altitude_deg: 13.21, vector: computeSunVector(289.7, 13.21) },
    { time_iso: '2024-06-21T19:45:00-07:00', minutes_from_start: 45, azimuth_deg: 292.4, altitude_deg: 10.32, vector: computeSunVector(292.4, 10.32) },
    { time_iso: '2024-06-21T20:00:00-07:00', minutes_from_start: 60, azimuth_deg: 295.1, altitude_deg: 7.42, vector: computeSunVector(295.1, 7.42) },
    { time_iso: '2024-06-21T20:10:00-07:00', minutes_from_start: 70, azimuth_deg: 297.2, altitude_deg: 5.18, vector: computeSunVector(297.2, 5.18) },
  ];

  const subject: Subject = {
    subject_id: 4,
    centroid: { lat, lon },
    polygon: [
      [37.72512, -119.63567],
      [37.72501, -119.63489],
      [37.72461, -119.63478],
      [37.72472, -119.63556],
      [37.72512, -119.63567],
    ],
    properties: {
      elevation_m: 1723.4,
      slope_deg: 70.0,
      aspect_deg: 27.0,
      face_direction_deg: 207.0,
      area_m2: 18420,
      normal: [-0.427, -0.838, 0.342],
    },
    incidence_series: [
      { minutes: 0, incidence: 0.312, glow_score: 0.894 },
      { minutes: 18, incidence: 0.254, glow_score: 0.947 },
      { minutes: 30, incidence: 0.198, glow_score: 0.998 },
      { minutes: 45, incidence: 0.142, glow_score: 0.944 },
      { minutes: 60, incidence: 0.076, glow_score: 0.883 },
      { minutes: 70, incidence: 0.029, glow_score: 0.843 },
    ],
    glow_window: {
      start_minutes: 0,
      end_minutes: 70,
      peak_minutes: 30,
      duration_minutes: 70.0,
      peak_incidence: 0.198,
      peak_glow_score: 0.998,
    },
    shadow_check: {
      checked_at_minutes: 30,
      sun_azimuth_deg: 289.7,
      sun_altitude_deg: 13.21,
      samples: [
        { distance_m: 100, ray_z: 1746.9, terrain_z: 1702.3, blocked: false },
        { distance_m: 500, ray_z: 1840.8, terrain_z: 1756.2, blocked: false },
        { distance_m: 2000, ray_z: 2193.0, terrain_z: 2087.4, blocked: false },
      ],
      sun_visible: true,
    },
    validation: {
      normal_unit_length: 0.9998,
      aspect_normal_match_deg: 2.3,
      glow_in_range: true,
      sun_visible_at_peak: true,
    },
  };

  const standing: StandingLocation = {
    standing_id: 1,
    subject_id: 4,
    location: { lat: 37.72391, lon: -119.63694 },
    properties: {
      elevation_m: 1687.2,
      slope_deg: 14.2,
      distance_to_subject_m: 30,
      camera_bearing_deg: 55.8,
      elevation_diff_m: 36.2,
    },
    line_of_sight: {
      clear: true,
      eye_height_m: 1.7,
      target_height_m: 5.0,
      samples: [
        { t: 0.25, ray_z: 1698.8, terrain_z: 1692.1, blocked: false },
        { t: 0.50, ray_z: 1708.7, terrain_z: 1701.3, blocked: false },
        { t: 0.75, ray_z: 1718.5, terrain_z: 1714.8, blocked: false },
      ],
    },
    candidate_search: {
      candidates_checked: 3,
      rejected: [
        { distance_m: 20, lat: 37.72412, lon: -119.63623, reason: 'slope_too_steep', slope_deg: 22.3 },
        { distance_m: 25, lat: 37.72403, lon: -119.63645, reason: 'slope_too_steep', slope_deg: 18.1 },
      ],
      selected_at_distance_m: 30,
    },
  };

  return {
    meta: {
      request_id: 'yosemite-validated',
      computed_at: new Date().toISOString(),
      dem_source: 'USGS_3DEP_10m',
      dem_bounds: {
        north: 37.7350,
        south: 37.7150,
        east: -119.6150,
        west: -119.6450,
      },
      cell_size_m: 10,
      center_lat: lat,
      center_lon: lon,
    },
    sun_track: sunTrack,
    subjects: [subject],
    standing_locations: [standing],
    debug_layers: {},
  };
}
