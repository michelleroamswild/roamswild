import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import {
  Friend,
  FriendRequest,
  OutgoingRequest,
  UserFriendRow,
  ProfileRow,
} from '@/types/friends';

interface FriendsContextType {
  // Data
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: OutgoingRequest[];
  isLoading: boolean;

  // Actions
  sendFriendRequest: (email: string) => Promise<{ success: boolean; error?: string }>;
  acceptRequest: (friendshipId: string) => Promise<boolean>;
  rejectRequest: (friendshipId: string) => Promise<boolean>;
  cancelRequest: (friendshipId: string) => Promise<boolean>;
  removeFriend: (friendshipId: string) => Promise<boolean>;
  blockUser: (friendshipId: string) => Promise<boolean>;

  // Helpers
  isFriend: (userId: string) => boolean;
  hasPendingRequest: (userId: string) => boolean;
  getFriendById: (userId: string) => Friend | undefined;
  refetch: () => Promise<void>;
}

const FriendsContext = createContext<FriendsContextType | null>(null);

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());

  // Fetch all friend data
  const fetchFriends = useCallback(async () => {
    if (!user) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setFriendIds(new Set());
      setPendingUserIds(new Set());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch all friendships involving this user
      const { data: friendships, error } = await supabase
        .from('user_friends')
        .select('*')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (error) {
        console.error('Failed to fetch friendships:', error);
        setIsLoading(false);
        return;
      }

      const rows = (friendships || []) as UserFriendRow[];

      // Separate by status and direction
      const acceptedFriendships: UserFriendRow[] = [];
      const incomingPending: UserFriendRow[] = [];
      const outgoingPending: UserFriendRow[] = [];
      const newPendingUserIds = new Set<string>();

      for (const row of rows) {
        if (row.status === 'accepted') {
          acceptedFriendships.push(row);
        } else if (row.status === 'pending') {
          if (row.addressee_id === user.id) {
            incomingPending.push(row);
            newPendingUserIds.add(row.requester_id);
          } else {
            outgoingPending.push(row);
            newPendingUserIds.add(row.addressee_id);
          }
        }
      }

      // Get user IDs we need to fetch profiles for
      const userIdsToFetch = new Set<string>();
      for (const f of acceptedFriendships) {
        const friendId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
        userIdsToFetch.add(friendId);
      }
      for (const r of incomingPending) {
        userIdsToFetch.add(r.requester_id);
      }
      for (const r of outgoingPending) {
        userIdsToFetch.add(r.addressee_id);
      }

      // Fetch profiles
      let profiles: ProfileRow[] = [];
      if (userIdsToFetch.size > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, name')
          .in('id', Array.from(userIdsToFetch));

        if (profileError) {
          console.error('Failed to fetch profiles:', profileError);
        } else {
          profiles = (profileData || []) as ProfileRow[];
        }
      }

      const profileMap = new Map(profiles.map(p => [p.id, p]));

      // Build friends list
      const newFriends: Friend[] = [];
      const newFriendIds = new Set<string>();
      for (const f of acceptedFriendships) {
        const friendId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
        const profile = profileMap.get(friendId);
        if (profile) {
          newFriends.push({
            id: profile.id,
            email: profile.email,
            name: profile.name,
            friendshipId: f.id,
            since: f.updated_at,
          });
          newFriendIds.add(friendId);
        }
      }

      // Build incoming requests
      const newIncoming: FriendRequest[] = [];
      for (const r of incomingPending) {
        const profile = profileMap.get(r.requester_id);
        if (profile) {
          newIncoming.push({
            id: r.id,
            from: {
              id: profile.id,
              email: profile.email,
              name: profile.name,
            },
            createdAt: r.created_at,
          });
        }
      }

      // Build outgoing requests
      const newOutgoing: OutgoingRequest[] = [];
      for (const r of outgoingPending) {
        const profile = profileMap.get(r.addressee_id);
        if (profile) {
          newOutgoing.push({
            id: r.id,
            to: {
              id: profile.id,
              email: profile.email,
              name: profile.name,
            },
            createdAt: r.created_at,
          });
        }
      }

      setFriends(newFriends);
      setIncomingRequests(newIncoming);
      setOutgoingRequests(newOutgoing);
      setFriendIds(newFriendIds);
      setPendingUserIds(newPendingUserIds);
    } catch (e) {
      console.error('Error fetching friends:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  // Set up real-time subscription for friend updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user_friends_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_friends',
          filter: `requester_id=eq.${user.id}`,
        },
        () => {
          fetchFriends();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_friends',
          filter: `addressee_id=eq.${user.id}`,
        },
        () => {
          fetchFriends();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchFriends]);

  // Send a friend request by email
  const sendFriendRequest = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated' };

    const normalizedEmail = email.toLowerCase().trim();

    // Can't friend yourself
    if (normalizedEmail === user.email?.toLowerCase()) {
      return { success: false, error: 'You cannot send a friend request to yourself' };
    }

    try {
      // Debug: check session and fetch ALL profiles
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('Current session:', sessionData?.session?.user?.email, 'role:', sessionData?.session?.user?.role);

      const { data: allProfiles, error: allError } = await supabase
        .from('profiles')
        .select('id, email');
      console.log('All accessible profiles:', allProfiles, 'error:', allError);

      // Look up user by email (case-insensitive)
      console.log('Looking up email:', normalizedEmail);
      const { data: profiles, error: lookupError } = await supabase
        .from('profiles')
        .select('id, email')
        .ilike('email', normalizedEmail);

      console.log('Profile lookup result:', { profiles, lookupError, count: profiles?.length });

      if (lookupError) {
        console.error('Profile lookup error:', lookupError);
        return { success: false, error: `Error looking up user: ${lookupError.message}` };
      }

      if (!profiles || profiles.length === 0) {
        return { success: false, error: 'No user found with that email address' };
      }

      if (profiles.length > 1) {
        console.warn('Multiple profiles found for email:', normalizedEmail);
      }

      const targetProfile = profiles[0];

      // Check if already friends or request pending
      const { data: existing } = await supabase
        .from('user_friends')
        .select('id, status')
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${targetProfile.id}),` +
          `and(requester_id.eq.${targetProfile.id},addressee_id.eq.${user.id})`
        )
        .single();

      if (existing) {
        if (existing.status === 'accepted') {
          return { success: false, error: 'You are already friends with this user' };
        } else if (existing.status === 'pending') {
          return { success: false, error: 'A friend request is already pending' };
        } else if (existing.status === 'blocked') {
          return { success: false, error: 'Unable to send friend request' };
        }
      }

      // Send the request
      const { error: insertError } = await supabase
        .from('user_friends')
        .insert({
          requester_id: user.id,
          addressee_id: targetProfile.id,
          status: 'pending',
        });

      if (insertError) {
        console.error('Failed to send friend request:', insertError);
        return { success: false, error: 'Failed to send friend request' };
      }

      await fetchFriends();
      return { success: true };
    } catch (e) {
      console.error('Error sending friend request:', e);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  // Accept an incoming friend request
  const acceptRequest = async (friendshipId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_friends')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', friendshipId)
        .eq('addressee_id', user.id); // Only addressee can accept

      if (error) {
        console.error('Failed to accept friend request:', error);
        return false;
      }

      await fetchFriends();
      return true;
    } catch (e) {
      console.error('Error accepting friend request:', e);
      return false;
    }
  };

  // Reject an incoming friend request
  const rejectRequest = async (friendshipId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_friends')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', friendshipId)
        .eq('addressee_id', user.id);

      if (error) {
        console.error('Failed to reject friend request:', error);
        return false;
      }

      await fetchFriends();
      return true;
    } catch (e) {
      console.error('Error rejecting friend request:', e);
      return false;
    }
  };

  // Cancel an outgoing friend request
  const cancelRequest = async (friendshipId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_friends')
        .delete()
        .eq('id', friendshipId)
        .eq('requester_id', user.id)
        .eq('status', 'pending');

      if (error) {
        console.error('Failed to cancel friend request:', error);
        return false;
      }

      await fetchFriends();
      return true;
    } catch (e) {
      console.error('Error canceling friend request:', e);
      return false;
    }
  };

  // Remove an existing friend
  const removeFriend = async (friendshipId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_friends')
        .delete()
        .eq('id', friendshipId);

      if (error) {
        console.error('Failed to remove friend:', error);
        return false;
      }

      await fetchFriends();
      return true;
    } catch (e) {
      console.error('Error removing friend:', e);
      return false;
    }
  };

  // Block a user
  const blockUser = async (friendshipId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_friends')
        .update({
          status: 'blocked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', friendshipId);

      if (error) {
        console.error('Failed to block user:', error);
        return false;
      }

      await fetchFriends();
      return true;
    } catch (e) {
      console.error('Error blocking user:', e);
      return false;
    }
  };

  // Check if a user is a friend
  const isFriend = (userId: string): boolean => {
    return friendIds.has(userId);
  };

  // Check if there's a pending request with a user
  const hasPendingRequest = (userId: string): boolean => {
    return pendingUserIds.has(userId);
  };

  // Get friend by user ID
  const getFriendById = (userId: string): Friend | undefined => {
    return friends.find(f => f.id === userId);
  };

  const refetch = async () => {
    await fetchFriends();
  };

  return (
    <FriendsContext.Provider
      value={{
        friends,
        incomingRequests,
        outgoingRequests,
        isLoading,
        sendFriendRequest,
        acceptRequest,
        rejectRequest,
        cancelRequest,
        removeFriend,
        blockUser,
        isFriend,
        hasPendingRequest,
        getFriendById,
        refetch,
      }}
    >
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (!context) {
    throw new Error('useFriends must be used within a FriendsProvider');
  }
  return context;
}
