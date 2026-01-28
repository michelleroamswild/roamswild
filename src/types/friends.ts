export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Friend {
  id: string;
  email: string;
  name: string | null;
  friendshipId: string;
  since: string; // When friendship was accepted
}

export interface FriendRequest {
  id: string;
  from: {
    id: string;
    email: string;
    name: string | null;
  };
  createdAt: string;
}

export interface OutgoingRequest {
  id: string;
  to: {
    id: string;
    email: string;
    name: string | null;
  };
  createdAt: string;
}

export interface PendingInvite {
  id: string;
  invitedEmail: string;
  createdAt: string;
}

// Database row types (snake_case as returned from Supabase)
export interface UserFriendRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  email: string;
  name: string | null;
}

export interface FriendInviteRow {
  id: string;
  requester_id: string;
  invited_email: string;
  status: 'pending' | 'accepted' | 'expired';
  created_at: string;
}
