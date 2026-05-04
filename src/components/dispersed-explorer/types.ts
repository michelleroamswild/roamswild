import type { PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';

export interface SpotAIAnalysis {
  campabilityScore: number;
  summary: string;
  ground: { rating: string; detail: string };
  access: { rating: string; detail: string };
  cover: { rating: string; detail: string };
  hazards: { rating: string; detail: string };
  trail: { rating: string; detail: string } | null;
  bestUse: string;
  confidence: string;
  confidenceNote?: string;
}

export interface UnifiedSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  // 'community' = user-contributed dispersed spot from the seeded
  // community dataset (sub_kind='community' in spots). Different
  // provenance from algorithmically-derived dead-ends.
  category: 'derived' | 'community' | 'campground' | 'mine' | 'friend';
  sharedBy?: string;
  score?: number;
  spotType?: 'dead-end' | 'camp-site' | 'intersection';
  reasons?: string[];
  reservable?: boolean;
  facilityType?: string;
  url?: string;
  agencyName?: string;
  campsiteType?: string;
  distance?: number;
  recScore?: number;
  isRecommended?: boolean;
  originalSpot?: PotentialSpot;
  originalCampground?: EstablishedCampground;
  originalCampsite?: Campsite;
}
