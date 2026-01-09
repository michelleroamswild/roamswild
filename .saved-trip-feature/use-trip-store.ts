import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Trip, TripStop, TripRow, TripStopRow, tripFromRow, StopType } from '@/types/trip';

// Fetch all trips
export function useTrips() {
  return useQuery({
    queryKey: ['trips'],
    queryFn: async (): Promise<Trip[]> => {
      const { data: trips, error: tripsError } = await supabase
        .from('trips')
        .select('*')
        .order('created_at', { ascending: false });

      if (tripsError) throw tripsError;
      if (!trips) return [];

      const { data: stops, error: stopsError } = await supabase
        .from('trip_stops')
        .select('*')
        .in('trip_id', trips.map(t => t.id));

      if (stopsError) throw stopsError;

      return trips.map((trip: TripRow) =>
        tripFromRow(trip, (stops || []).filter((s: TripStopRow) => s.trip_id === trip.id))
      );
    },
  });
}

// Fetch single trip
export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: ['trip', id],
    queryFn: async (): Promise<Trip | null> => {
      if (!id) return null;

      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .single();

      if (tripError) throw tripError;
      if (!trip) return null;

      const { data: stops, error: stopsError } = await supabase
        .from('trip_stops')
        .select('*')
        .eq('trip_id', id)
        .order('position');

      if (stopsError) throw stopsError;

      return tripFromRow(trip, stops || []);
    },
    enabled: !!id,
  });
}

// Create trip
export function useCreateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<Trip> => {
      const { data, error } = await supabase
        .from('trips')
        .insert({ name })
        .select()
        .single();

      if (error) throw error;
      return tripFromRow(data, []);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

// Update trip name
export function useUpdateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('trips')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', id] });
    },
  });
}

// Delete trip
export function useDeleteTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

// Add stop to trip
export function useAddStop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tripId,
      stop,
    }: {
      tripId: string;
      stop: Omit<TripStop, 'id' | 'tripId'>;
    }) => {
      const { data, error } = await supabase
        .from('trip_stops')
        .insert({
          trip_id: tripId,
          place_id: stop.placeId || null,
          name: stop.name,
          address: stop.address || null,
          lat: stop.lat,
          lng: stop.lng,
          stop_type: stop.stopType,
          duration: stop.duration || null,
          position: stop.position,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });
}

// Remove stop from trip
export function useRemoveStop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ stopId, tripId }: { stopId: string; tripId: string }) => {
      const { error } = await supabase
        .from('trip_stops')
        .delete()
        .eq('id', stopId);

      if (error) throw error;
    },
    onSuccess: (_, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });
}

// Reorder stops
export function useReorderStops() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tripId,
      stops,
    }: {
      tripId: string;
      stops: { id: string; position: number }[];
    }) => {
      // Update positions for all stops
      const updates = stops.map(({ id, position }) =>
        supabase
          .from('trip_stops')
          .update({ position })
          .eq('id', id)
      );

      await Promise.all(updates);
    },
    onSuccess: (_, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });
}

// Get stop type info
export const stopTypeInfo: Record<StopType, { label: string; icon: string; color: string }> = {
  destination: { label: 'Destination', icon: 'MapPin', color: 'text-primary' },
  gas: { label: 'Gas Station', icon: 'Fuel', color: 'text-terracotta' },
  water: { label: 'Water Fill', icon: 'Droplet', color: 'text-blue-500' },
  food: { label: 'Food & Dining', icon: 'UtensilsCrossed', color: 'text-orange-500' },
  camp: { label: 'Campsite', icon: 'Tent', color: 'text-forest' },
  viewpoint: { label: 'Viewpoint', icon: 'Mountain', color: 'text-primary' },
  rest: { label: 'Rest Area', icon: 'Coffee', color: 'text-amber-600' },
  cell: { label: 'Cell Service', icon: 'Signal', color: 'text-green-500' },
};
