import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import {
  Campsite,
  CampsiteFormData,
  CampsiteRow,
  CampsiteVisibility,
  ParsedImportLocation,
  campsiteFromRow,
  campsiteToRow,
} from '@/types/campsite';

interface CampsitesContextType {
  // User's campsites (owned)
  campsites: Campsite[];
  // Public campsites from others
  publicCampsites: Campsite[];
  isLoading: boolean;

  // CRUD operations
  addCampsite: (data: CampsiteFormData) => Promise<Campsite | null>;
  updateCampsite: (id: string, data: Partial<CampsiteFormData>) => Promise<boolean>;
  deleteCampsite: (id: string) => Promise<boolean>;
  getCampsite: (id: string) => Promise<Campsite | null>;

  // Import/Export
  importFromCSV: (locations: ParsedImportLocation[], visibility: CampsiteVisibility) => Promise<number>;
  exportToGeoJSON: () => string;

  // Discovery
  fetchPublicCampsites: () => Promise<void>;
  searchNearbyCampsites: (lat: number, lng: number, radiusMiles: number) => Promise<Campsite[]>;

  // Refresh
  refreshCampsites: () => Promise<void>;
}

const CampsitesContext = createContext<CampsitesContextType | null>(null);

export function CampsitesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [campsites, setCampsites] = useState<Campsite[]>([]);
  const [publicCampsites, setPublicCampsites] = useState<Campsite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user's campsites
  const fetchCampsites = useCallback(async () => {
    if (!user) {
      setCampsites([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('campsites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch campsites:', error);
        return;
      }

      const rows = data as CampsiteRow[] | null;
      const transformed = (rows || []).map(campsiteFromRow);
      setCampsites(transformed);
    } catch (e) {
      console.error('Error fetching campsites:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch public campsites from other users
  const fetchPublicCampsites = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('campsites')
        .select('*')
        .eq('visibility', 'public')
        .neq('user_id', user?.id || '')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Failed to fetch public campsites:', error);
        return;
      }

      const rows = data as CampsiteRow[] | null;
      const transformed = (rows || []).map(campsiteFromRow);
      setPublicCampsites(transformed);
    } catch (e) {
      console.error('Error fetching public campsites:', e);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCampsites();
  }, [fetchCampsites]);

  // Add a new campsite
  const addCampsite = async (data: CampsiteFormData): Promise<Campsite | null> => {
    if (!user) return null;

    try {
      const rowData = campsiteToRow(data, user.id);

      const { data: result, error } = await supabase
        .from('campsites')
        .insert(rowData)
        .select()
        .single();

      if (error) {
        console.error('Failed to add campsite:', error);
        return null;
      }

      const newCampsite = campsiteFromRow(result as CampsiteRow);
      setCampsites(prev => [newCampsite, ...prev]);
      return newCampsite;
    } catch (e) {
      console.error('Error adding campsite:', e);
      return null;
    }
  };

  // Update a campsite
  const updateCampsite = async (id: string, data: Partial<CampsiteFormData>): Promise<boolean> => {
    if (!user) return false;

    try {
      // Convert camelCase to snake_case for database
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.lat !== undefined) updateData.lat = data.lat;
      if (data.lng !== undefined) updateData.lng = data.lng;
      if (data.placeId !== undefined) updateData.place_id = data.placeId;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.roadAccess !== undefined) updateData.road_access = data.roadAccess;
      if (data.cellCoverage !== undefined) updateData.cell_coverage = data.cellCoverage;
      if (data.waterAvailable !== undefined) updateData.water_available = data.waterAvailable;
      if (data.feeRequired !== undefined) updateData.fee_required = data.feeRequired;
      if (data.feeAmount !== undefined) updateData.fee_amount = data.feeAmount;
      if (data.seasonalAccess !== undefined) updateData.seasonal_access = data.seasonalAccess;
      if (data.maxVehicles !== undefined) updateData.max_vehicles = data.maxVehicles;
      if (data.maxStayDays !== undefined) updateData.max_stay_days = data.maxStayDays;
      if (data.visibility !== undefined) updateData.visibility = data.visibility;
      if (data.state !== undefined) updateData.state = data.state;
      if (data.tags !== undefined) updateData.tags = data.tags;
      updateData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('campsites')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Failed to update campsite:', error);
        return false;
      }

      // Update local state
      setCampsites(prev =>
        prev.map(c =>
          c.id === id
            ? { ...c, ...data, updatedAt: updateData.updated_at as string }
            : c
        )
      );
      return true;
    } catch (e) {
      console.error('Error updating campsite:', e);
      return false;
    }
  };

  // Delete a campsite
  const deleteCampsite = async (id: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('campsites')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Failed to delete campsite:', error);
        return false;
      }

      setCampsites(prev => prev.filter(c => c.id !== id));
      return true;
    } catch (e) {
      console.error('Error deleting campsite:', e);
      return false;
    }
  };

  // Get a single campsite by ID
  const getCampsite = async (id: string): Promise<Campsite | null> => {
    try {
      const { data, error } = await supabase
        .from('campsites')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Failed to get campsite:', error);
        return null;
      }

      return campsiteFromRow(data as CampsiteRow);
    } catch (e) {
      console.error('Error getting campsite:', e);
      return null;
    }
  };

  // Import from CSV (parsed locations)
  // Updates existing campsites if coordinates match, otherwise creates new ones
  const importFromCSV = async (
    locations: ParsedImportLocation[],
    visibility: CampsiteVisibility
  ): Promise<number> => {
    if (!user) return 0;

    let imported = 0;

    for (const location of locations) {
      try {
        // Check if a campsite with these coordinates already exists for this user
        const { data: existing } = await supabase
          .from('campsites')
          .select('id')
          .eq('user_id', user.id)
          .eq('lat', location.lat)
          .eq('lng', location.lng)
          .single();

        if (existing) {
          // Update existing campsite
          const { error } = await supabase
            .from('campsites')
            .update({
              name: location.name,
              description: location.note || null,
              notes: location.comment || null,
              state: location.state || null,
              tags: location.tags || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (!error) {
            imported++;
          }
        } else {
          // Create new campsite
          const rowData = campsiteToRow(
            {
              name: location.name,
              lat: location.lat,
              lng: location.lng,
              type: 'dispersed',
              description: location.note,
              notes: location.comment,
              visibility,
              state: location.state,
              tags: location.tags,
            },
            user.id
          );

          const { error } = await supabase.from('campsites').insert(rowData);

          if (!error) {
            imported++;
          }
        }
      } catch (e) {
        console.error('Error importing location:', e);
      }
    }

    // Refresh the list after import
    await fetchCampsites();
    return imported;
  };

  // Export to GeoJSON format (compatible with Google Maps)
  // Only exports campsites the user created, never shared/public ones from others
  const exportToGeoJSON = (): string => {
    // Filter to only include campsites owned by the current user
    const ownedCampsites = campsites.filter(c => c.userId === user?.id);

    const features = ownedCampsites.map(campsite => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [campsite.lng, campsite.lat], // GeoJSON is [lng, lat]
      },
      properties: {
        Title: campsite.name,
        Location: {
          Address: campsite.description || '',
        },
      },
    }));

    const geoJSON = {
      type: 'FeatureCollection' as const,
      features,
    };

    return JSON.stringify(geoJSON, null, 2);
  };

  // Search for nearby campsites (user's + public)
  const searchNearbyCampsites = async (
    lat: number,
    lng: number,
    radiusMiles: number
  ): Promise<Campsite[]> => {
    // Convert miles to approximate degrees (1 degree ≈ 69 miles at equator)
    const radiusDegrees = radiusMiles / 69;

    try {
      const { data, error } = await supabase
        .from('campsites')
        .select('*')
        .gte('lat', lat - radiusDegrees)
        .lte('lat', lat + radiusDegrees)
        .gte('lng', lng - radiusDegrees)
        .lte('lng', lng + radiusDegrees)
        .or(`user_id.eq.${user?.id},visibility.eq.public`);

      if (error) {
        console.error('Failed to search campsites:', error);
        return [];
      }

      const rows = data as CampsiteRow[] | null;
      const results = (rows || []).map(campsiteFromRow);

      // Calculate actual distance and filter by radius
      return results.filter(campsite => {
        const distance = getDistanceMiles(lat, lng, campsite.lat, campsite.lng);
        return distance <= radiusMiles;
      });
    } catch (e) {
      console.error('Error searching campsites:', e);
      return [];
    }
  };

  const refreshCampsites = async () => {
    await fetchCampsites();
  };

  return (
    <CampsitesContext.Provider
      value={{
        campsites,
        publicCampsites,
        isLoading,
        addCampsite,
        updateCampsite,
        deleteCampsite,
        getCampsite,
        importFromCSV,
        exportToGeoJSON,
        fetchPublicCampsites,
        searchNearbyCampsites,
        refreshCampsites,
      }}
    >
      {children}
    </CampsitesContext.Provider>
  );
}

export function useCampsites() {
  const context = useContext(CampsitesContext);
  if (!context) {
    throw new Error('useCampsites must be used within a CampsitesProvider');
  }
  return context;
}

// Haversine formula for distance calculation
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
