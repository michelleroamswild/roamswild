import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface RecentSearch {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  timestamp: number;
}

const LOCAL_STORAGE_KEY = 'recentSearches';
const MAX_RECENT_SEARCHES = 10;

export function useRecentSearches() {
  const { user } = useAuth();
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [loading, setLoading] = useState(true);

  // Load searches on mount and when user changes
  useEffect(() => {
    loadSearches();
  }, [user?.id]);

  const loadSearches = async () => {
    setLoading(true);

    if (user) {
      // Load from Supabase for logged-in users
      try {
        const { data, error } = await supabase
          .from('recent_searches')
          .select('*')
          .eq('user_id', user.id)
          .order('searched_at', { ascending: false })
          .limit(MAX_RECENT_SEARCHES);

        if (error) throw error;

        const searches: RecentSearch[] = (data || []).map((row: any) => ({
          placeId: row.place_id,
          name: row.name,
          address: row.address || '',
          lat: row.lat,
          lng: row.lng,
          timestamp: new Date(row.searched_at).getTime(),
        }));

        setRecentSearches(searches);
      } catch (e) {
        console.error('Failed to load recent searches from database', e);
        // Fall back to localStorage
        loadFromLocalStorage();
      }
    } else {
      // Load from localStorage for guests
      loadFromLocalStorage();
    }

    setLoading(false);
  };

  const loadFromLocalStorage = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      setRecentSearches(stored.slice(0, MAX_RECENT_SEARCHES));
    } catch (e) {
      setRecentSearches([]);
    }
  };

  const addSearch = useCallback(async (search: Omit<RecentSearch, 'timestamp'>) => {
    const newSearch: RecentSearch = {
      ...search,
      timestamp: Date.now(),
    };

    if (user) {
      // Save to Supabase for logged-in users
      try {
        const { error } = await supabase
          .from('recent_searches')
          .upsert({
            user_id: user.id,
            place_id: search.placeId,
            name: search.name,
            address: search.address,
            lat: search.lat,
            lng: search.lng,
            searched_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,place_id',
          });

        if (error) throw error;

        // Update local state
        setRecentSearches(prev => {
          const filtered = prev.filter(s => s.placeId !== search.placeId);
          return [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);
        });
      } catch (e) {
        console.error('Failed to save recent search to database', e);
        // Fall back to localStorage
        saveToLocalStorage(newSearch);
      }
    } else {
      // Save to localStorage for guests
      saveToLocalStorage(newSearch);
    }
  }, [user]);

  const saveToLocalStorage = (newSearch: RecentSearch) => {
    try {
      const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      const filtered = existing.filter((item: RecentSearch) => item.placeId !== newSearch.placeId);
      const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      setRecentSearches(updated);
    } catch (e) {
      console.error('Failed to save recent search to localStorage', e);
    }
  };

  const clearSearches = useCallback(async () => {
    if (user) {
      try {
        const { error } = await supabase
          .from('recent_searches')
          .delete()
          .eq('user_id', user.id);

        if (error) throw error;
      } catch (e) {
        console.error('Failed to clear recent searches from database', e);
      }
    }

    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setRecentSearches([]);
  }, [user]);

  return {
    recentSearches,
    loading,
    addSearch,
    clearSearches,
    refresh: loadSearches,
  };
}
