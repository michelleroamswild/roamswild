export type CampsiteType = 'dispersed' | 'established' | 'blm' | 'usfs' | 'private';
export type RoadAccess = '2wd' | '4wd_easy' | '4wd_moderate' | '4wd_hard';
export type CampsiteVisibility = 'private' | 'public' | 'friends';
export type CampsiteSourceType = 'manual' | 'explorer';

// Original spot data from dispersed explorer (stored for explorer spots)
export interface OriginalSpotData {
  score?: number;
  reasons?: string[];
  roadName?: string;
  spotType?: string;
}

export interface Campsite {
  id: string;
  userId: string;
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
  type: CampsiteType;
  description?: string;
  notes?: string;
  roadAccess?: RoadAccess;
  cellCoverage?: number;
  waterAvailable?: boolean;
  feeRequired?: boolean;
  feeAmount?: string;
  seasonalAccess?: string;
  maxVehicles?: number;
  maxStayDays?: number;
  visibility: CampsiteVisibility;
  state?: string;
  tags?: string[];
  photos?: CampsitePhoto[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  // Confirmation tracking (for explorer spots)
  sourceType: CampsiteSourceType;
  confirmationCount: number;
  isConfirmed: boolean;
  originalSpotData?: OriginalSpotData;
}

export interface CampsitePhoto {
  id: string;
  campsiteId: string;
  userId: string;
  url: string;
  caption?: string;
  isPrimary: boolean;
  createdAt: string;
}

// Database row types (snake_case)
export interface CampsiteRow {
  id: string;
  user_id: string;
  name: string;
  lat: number;
  lng: number;
  place_id: string | null;
  type: string;
  description: string | null;
  notes: string | null;
  road_access: string | null;
  cell_coverage: number | null;
  water_available: boolean | null;
  fee_required: boolean | null;
  fee_amount: string | null;
  seasonal_access: string | null;
  max_vehicles: number | null;
  max_stay_days: number | null;
  visibility: string;
  state: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  // Confirmation tracking
  source_type: string;
  confirmation_count: number;
  is_confirmed: boolean;
  original_spot_data: OriginalSpotData | null;
}

export interface CampsitePhotoRow {
  id: string;
  campsite_id: string;
  user_id: string;
  url: string;
  caption: string | null;
  is_primary: boolean;
  created_at: string;
}

// Google Takeout CSV format (Saved Places export)
// Headers: Title, note, URL, tags, comment
export interface GoogleTakeoutCSVRow {
  Title: string;
  note: string;
  URL: string;
  tags: string;
  comment: string;
}

// Parsed import data with extracted coordinates
export interface ParsedImportLocation {
  name: string;
  lat: number;
  lng: number;
  note?: string;
  comment?: string;
  url?: string;
  state?: string;
  tags?: string[];
}

// Form data for creating/editing campsites
export interface CampsiteFormData {
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
  type: CampsiteType;
  description?: string;
  notes?: string;
  roadAccess?: RoadAccess;
  cellCoverage?: number;
  waterAvailable?: boolean;
  feeRequired?: boolean;
  feeAmount?: string;
  seasonalAccess?: string;
  maxVehicles?: number;
  maxStayDays?: number;
  visibility: CampsiteVisibility;
  state?: string;
  tags?: string[];
  // Confirmation tracking (optional, defaults applied on insert)
  sourceType?: CampsiteSourceType;
  originalSpotData?: OriginalSpotData;
}

// Helper functions to convert between row and model
export function campsiteFromRow(row: CampsiteRow): Campsite {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    lat: Number(row.lat),
    lng: Number(row.lng),
    placeId: row.place_id ?? undefined,
    type: row.type as CampsiteType,
    description: row.description ?? undefined,
    notes: row.notes ?? undefined,
    roadAccess: row.road_access as RoadAccess | undefined,
    cellCoverage: row.cell_coverage ?? undefined,
    waterAvailable: row.water_available ?? undefined,
    feeRequired: row.fee_required ?? undefined,
    feeAmount: row.fee_amount ?? undefined,
    seasonalAccess: row.seasonal_access ?? undefined,
    maxVehicles: row.max_vehicles ?? undefined,
    maxStayDays: row.max_stay_days ?? undefined,
    visibility: row.visibility as CampsiteVisibility,
    state: row.state ?? undefined,
    tags: row.tags ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ?? undefined,
    sourceType: (row.source_type as CampsiteSourceType) || 'manual',
    confirmationCount: row.confirmation_count ?? 0,
    isConfirmed: row.is_confirmed ?? (row.source_type !== 'explorer'),
    originalSpotData: row.original_spot_data ?? undefined,
  };
}

export function campsiteToRow(campsite: CampsiteFormData, userId: string): Omit<CampsiteRow, 'id' | 'created_at' | 'updated_at'> {
  const sourceType = campsite.sourceType ?? 'manual';
  return {
    user_id: userId,
    name: campsite.name,
    lat: campsite.lat,
    lng: campsite.lng,
    place_id: campsite.placeId ?? null,
    type: campsite.type,
    description: campsite.description ?? null,
    notes: campsite.notes ?? null,
    road_access: campsite.roadAccess ?? null,
    cell_coverage: campsite.cellCoverage ?? null,
    water_available: campsite.waterAvailable ?? null,
    fee_required: campsite.feeRequired ?? null,
    fee_amount: campsite.feeAmount ?? null,
    seasonal_access: campsite.seasonalAccess ?? null,
    max_vehicles: campsite.maxVehicles ?? null,
    max_stay_days: campsite.maxStayDays ?? null,
    visibility: campsite.visibility,
    state: campsite.state ?? null,
    tags: campsite.tags ?? null,
    metadata: null,
    source_type: sourceType,
    confirmation_count: sourceType === 'explorer' ? 1 : 0,
    is_confirmed: sourceType === 'manual',
    original_spot_data: campsite.originalSpotData ?? null,
  };
}
