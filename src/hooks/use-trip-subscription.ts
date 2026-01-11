import { useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { GeneratedTrip } from '@/types/trip';

interface UseTripSubscriptionOptions {
  tripId: string | undefined;
  onTripUpdate?: (trip: GeneratedTrip) => void;
  enabled?: boolean;
}

export function useTripSubscription({
  tripId,
  onTripUpdate,
  enabled = true,
}: UseTripSubscriptionOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  const subscribe = useCallback(() => {
    if (!tripId || !enabled) return;

    // Clean up existing subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Subscribe to changes on this specific trip
    const channel = supabase
      .channel(`trip-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'saved_trips',
          filter: `id=eq.${tripId}`,
        },
        (payload) => {
          console.log('Trip updated:', payload);
          if (payload.new && onTripUpdate) {
            // Transform the database record to GeneratedTrip format
            const record = payload.new as any;
            const updatedTrip: GeneratedTrip = {
              id: record.id,
              days: record.trip_data?.days || [],
              totalDistance: record.trip_data?.totalDistance || '0 mi',
              totalDrivingTime: record.trip_data?.totalDrivingTime || '0h',
              config: record.trip_data?.config || {},
              createdAt: record.created_at,
            };
            onTripUpdate(updatedTrip);
          }
        }
      )
      .subscribe((status) => {
        console.log(`Trip subscription status for ${tripId}:`, status);
      });

    channelRef.current = channel;
  }, [tripId, onTripUpdate, enabled]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    subscribe();

    return () => {
      unsubscribe();
    };
  }, [subscribe, unsubscribe]);

  return {
    subscribe,
    unsubscribe,
    isSubscribed: !!channelRef.current,
  };
}
