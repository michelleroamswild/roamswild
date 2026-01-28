import { useState } from 'react';
import { Users, UserPlus, Clock, PaperPlaneTilt, SpinnerGap, EnvelopeSimple } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/Header';
import { useFriends } from '@/context/FriendsContext';
import { FriendCard } from '@/components/friends/FriendCard';
import { AddFriendDialog } from '@/components/friends/AddFriendDialog';
import { toast } from 'sonner';

type TabType = 'friends' | 'requests' | 'sent';

const Friends = () => {
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    pendingInvites,
    isLoading,
    sendFriendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    cancelInvite,
    removeFriend,
    blockUser,
  } = useFriends();

  const [activeTab, setActiveTab] = useState<TabType>('friends');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const handleSendRequest = async (email: string) => {
    const result = await sendFriendRequest(email);
    if (result.success) {
      toast.success('Friend request sent!', {
        description: `We've sent a friend request to ${email}`,
      });
    }
    return result;
  };

  const handleAccept = async (friendshipId: string, name: string) => {
    const success = await acceptRequest(friendshipId);
    if (success) {
      toast.success('Friend request accepted', {
        description: `You and ${name} are now friends`,
      });
    }
    return success;
  };

  const handleReject = async (friendshipId: string) => {
    const success = await rejectRequest(friendshipId);
    if (success) {
      toast.success('Friend request declined');
    }
    return success;
  };

  const handleCancel = async (friendshipId: string) => {
    const success = await cancelRequest(friendshipId);
    if (success) {
      toast.success('Friend request cancelled');
    }
    return success;
  };

  const handleCancelInvite = async (inviteId: string) => {
    const success = await cancelInvite(inviteId);
    if (success) {
      toast.success('Invite cancelled');
    }
    return success;
  };

  const handleRemove = async (friendshipId: string, name: string) => {
    const success = await removeFriend(friendshipId);
    if (success) {
      toast.success('Friend removed', {
        description: `${name} has been removed from your friends`,
      });
    }
    return success;
  };

  const handleBlock = async (friendshipId: string, name: string) => {
    const success = await blockUser(friendshipId);
    if (success) {
      toast.success('User blocked', {
        description: `${name} has been blocked`,
      });
    }
    return success;
  };

  const renderEmptyState = () => {
    if (activeTab === 'friends') {
      return (
        <div className="text-center py-16">
          <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
            <Users className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="font-display font-bold text-foreground mb-2">No friends yet</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Add friends to share your favorite campsites and see theirs. Friends can see campsites
            you share with "Friends" visibility.
          </p>
          <Button variant="primary" size="lg" onClick={() => setIsAddDialogOpen(true)}>
            <UserPlus className="w-5 h-5 mr-2" weight="bold" />
            Add your first friend
          </Button>
        </div>
      );
    }

    if (activeTab === 'requests') {
      return (
        <div className="text-center py-16">
          <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
            <Clock className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="font-display font-bold text-foreground mb-2">No pending requests</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            When someone sends you a friend request, it will appear here.
          </p>
        </div>
      );
    }

    return (
      <div className="text-center py-16">
        <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
          <PaperPlaneTilt className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="font-display font-bold text-foreground mb-2">No sent requests</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Friend requests you send will appear here until they're accepted.
        </p>
        <Button variant="primary" size="lg" onClick={() => setIsAddDialogOpen(true)}>
          <UserPlus className="w-5 h-5 mr-2" weight="bold" />
          Send a friend request
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-4 md:px-6 py-8 max-w-4xl mx-auto">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Friends</h1>
            <p className="text-muted-foreground mt-1">
              {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
            </p>
          </div>
          <Button variant="primary" onClick={() => setIsAddDialogOpen(true)}>
            <UserPlus className="w-5 h-5 mr-2" />
            Add Friend
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'friends'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Users className="w-4 h-4" />
            Friends
            {friends.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === 'friends' ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
                }`}
              >
                {friends.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'requests'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Clock className="w-4 h-4" />
            Requests
            {incomingRequests.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === 'requests'
                    ? 'bg-primary-foreground/20'
                    : 'bg-amber-500 text-white'
                }`}
              >
                {incomingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'sent'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <PaperPlaneTilt className="w-4 h-4" />
            Sent
            {(outgoingRequests.length + pendingInvites.length) > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === 'sent' ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
                }`}
              >
                {outgoingRequests.length + pendingInvites.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
              <SpinnerGap className="w-10 h-10 text-primary animate-spin" />
            </div>
            <h2 className="text-xl font-display font-medium text-muted-foreground">
              Loading friends...
            </h2>
          </div>
        ) : (
          <>
            {activeTab === 'friends' && (
              friends.length === 0 ? (
                renderEmptyState()
              ) : (
                <div className="space-y-3">
                  {friends.map((friend, index) => (
                    <div
                      key={friend.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <FriendCard
                        type="friend"
                        friend={friend}
                        onRemove={() => handleRemove(friend.friendshipId, friend.name || friend.email)}
                        onBlock={() => handleBlock(friend.friendshipId, friend.name || friend.email)}
                      />
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'requests' && (
              incomingRequests.length === 0 ? (
                renderEmptyState()
              ) : (
                <div className="space-y-3">
                  {incomingRequests.map((request, index) => (
                    <div
                      key={request.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <FriendCard
                        type="incoming"
                        request={request}
                        onAccept={() => handleAccept(request.id, request.from.name || request.from.email)}
                        onReject={() => handleReject(request.id)}
                      />
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'sent' && (
              outgoingRequests.length === 0 && pendingInvites.length === 0 ? (
                renderEmptyState()
              ) : (
                <div className="space-y-3">
                  {/* Pending invites (to non-users) */}
                  {pendingInvites.length > 0 && (
                    <>
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <EnvelopeSimple className="w-4 h-4" />
                        Pending Invites
                      </h3>
                      {pendingInvites.map((invite, index) => (
                        <div
                          key={invite.id}
                          className="animate-fade-in"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <FriendCard
                            type="invite"
                            invite={invite}
                            onCancelInvite={() => handleCancelInvite(invite.id)}
                          />
                        </div>
                      ))}
                    </>
                  )}
                  {/* Outgoing requests (to existing users) */}
                  {outgoingRequests.length > 0 && (
                    <>
                      {pendingInvites.length > 0 && (
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mt-6">
                          <PaperPlaneTilt className="w-4 h-4" />
                          Pending Requests
                        </h3>
                      )}
                      {outgoingRequests.map((outgoing, index) => (
                        <div
                          key={outgoing.id}
                          className="animate-fade-in"
                          style={{ animationDelay: `${(pendingInvites.length + index) * 50}ms` }}
                        >
                          <FriendCard
                            type="outgoing"
                            outgoing={outgoing}
                            onCancel={() => handleCancel(outgoing.id)}
                          />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )
            )}
          </>
        )}
      </main>

      {/* Add Friend Dialog */}
      <AddFriendDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSendRequest={handleSendRequest}
      />
    </div>
  );
};

export default Friends;
