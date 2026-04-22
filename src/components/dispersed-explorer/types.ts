import type { PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';

export interface UnifiedSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: 'derived' | 'campground' | 'mine' | 'friend';
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
