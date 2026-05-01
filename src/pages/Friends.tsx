import { useState } from 'react';
import {
  Users,
  UserPlus,
  Clock,
  PaperPlaneTilt,
  SpinnerGap,
  EnvelopeSimple,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { useFriends } from '@/context/FriendsContext';
import { FriendCard } from '@/components/friends/FriendCard';
import { AddFriendDialog } from '@/components/friends/AddFriendDialog';
import { toast } from 'sonner';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

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
      toast.success('Friend request sent', {
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
    if (success) toast.success('Friend request declined');
    return success;
  };

  const handleCancel = async (friendshipId: string) => {
    const success = await cancelRequest(friendshipId);
    if (success) toast.success('Friend request cancelled');
    return success;
  };

  const handleCancelInvite = async (inviteId: string) => {
    const success = await cancelInvite(inviteId);
    if (success) toast.success('Invite cancelled');
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
      toast.success('User blocked', { description: `${name} has been blocked` });
    }
    return success;
  };

  const sentCount = outgoingRequests.length + pendingInvites.length;

  const tabs: { key: TabType; label: string; icon: typeof Users; count: number; badgeAccent?: 'clay' | null }[] = [
    { key: 'friends',  label: 'Friends',  icon: Users,           count: friends.length,            badgeAccent: null },
    { key: 'requests', label: 'Requests', icon: Clock,           count: incomingRequests.length,   badgeAccent: 'clay' },
    { key: 'sent',     label: 'Sent',     icon: PaperPlaneTilt,  count: sentCount,                 badgeAccent: null },
  ];

  const renderEmptyState = () => {
    if (activeTab === 'friends') {
      return (
        <EmptyState
          icon={<Users className="w-6 h-6 text-pine-6" weight="regular" />}
          title="No friends yet"
          copy='Add friends to share your favorite campsites and see theirs. Friends can see campsites you share with "Friends" visibility.'
          ctaLabel="Add your first friend"
          onCta={() => setIsAddDialogOpen(true)}
        />
      );
    }
    if (activeTab === 'requests') {
      return (
        <EmptyState
          icon={<Clock className="w-6 h-6 text-pine-6" weight="regular" />}
          title="No pending requests"
          copy="When someone sends you a friend request, it will appear here."
        />
      );
    }
    return (
      <EmptyState
        icon={<PaperPlaneTilt className="w-6 h-6 text-pine-6" weight="regular" />}
        title="No sent requests"
        copy="Friend requests you send will appear here until they're accepted."
        ctaLabel="Send a friend request"
        onCta={() => setIsAddDialogOpen(true)}
      />
    );
  };

  return (
    <div className="bg-cream dark:bg-paper text-ink font-sans min-h-screen">
      <Header />

      {/* === Hero strip — cream, page title + count + Add Friend CTA === */}
      <section className="relative overflow-hidden bg-cream dark:bg-paper-2 -mt-16 md:-mt-20">
        <div className="relative max-w-[1440px] mx-auto px-6 md:px-14 pt-28 md:pt-36 pb-10 md:pb-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Mono className="text-pine-6">
                {friends.length} {friends.length === 1 ? 'FRIEND' : 'FRIENDS'}
                {incomingRequests.length > 0 && ` · ${incomingRequests.length} PENDING`}
                {sentCount > 0 && ` · ${sentCount} SENT`}
              </Mono>
              <h1 className="font-sans font-bold tracking-[-0.035em] leading-[1] text-[44px] md:text-[64px] m-0 text-ink mt-2.5">
                Your crew.
              </h1>
            </div>
            <Pill variant="solid-pine" mono={false} onClick={() => setIsAddDialogOpen(true)}>
              <UserPlus size={13} weight="bold" />
              Add friend
            </Pill>
          </div>
        </div>
      </section>

      {/* === List section — paper-2 surface === */}
      <section className="bg-paper-2 min-h-[calc(100vh-300px)]">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-10 md:py-14">

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 mb-8">
            {tabs.map(({ key, label, icon: Ico, count, badgeAccent }) => {
              const active = activeTab === key;
              const showCount = count > 0;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-sans font-semibold tracking-[-0.005em] transition-colors',
                    active ? 'bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2' : 'text-ink hover:bg-ink/5'
                  )}
                >
                  <Ico className="w-4 h-4" weight="regular" />
                  {label}
                  {showCount && (
                    <span className={cn(
                      'ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-[0.05em]',
                      active
                        ? 'bg-cream/20 dark:bg-paper-2/20 text-cream'
                        : badgeAccent === 'clay'
                          ? 'bg-clay text-cream'
                          : 'bg-ink/10 text-ink-3'
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-pine-6/10 rounded-full mb-4">
                <SpinnerGap className="w-6 h-6 text-pine-6 animate-spin" />
              </div>
              <p className="text-[14px] text-ink-3">Loading friends…</p>
            </div>
          ) : (
            <>
              {activeTab === 'friends' && (
                friends.length === 0 ? renderEmptyState() : (
                  <div className="space-y-3">
                    {friends.map((friend) => (
                      <FriendCard
                        key={friend.id}
                        type="friend"
                        friend={friend}
                        onRemove={() => handleRemove(friend.friendshipId, friend.name || friend.email)}
                        onBlock={() => handleBlock(friend.friendshipId, friend.name || friend.email)}
                      />
                    ))}
                  </div>
                )
              )}

              {activeTab === 'requests' && (
                incomingRequests.length === 0 ? renderEmptyState() : (
                  <div className="space-y-3">
                    {incomingRequests.map((request) => (
                      <FriendCard
                        key={request.id}
                        type="incoming"
                        request={request}
                        onAccept={() => handleAccept(request.id, request.from.name || request.from.email)}
                        onReject={() => handleReject(request.id)}
                      />
                    ))}
                  </div>
                )
              )}

              {activeTab === 'sent' && (
                sentCount === 0 ? renderEmptyState() : (
                  <div className="space-y-5">
                    {/* Pending invites (to non-users) */}
                    {pendingInvites.length > 0 && (
                      <div className="space-y-3">
                        <Mono className="text-pine-6 flex items-center gap-2">
                          <EnvelopeSimple className="w-3.5 h-3.5" weight="regular" />
                          Pending invites
                        </Mono>
                        {pendingInvites.map((invite) => (
                          <FriendCard
                            key={invite.id}
                            type="invite"
                            invite={invite}
                            onCancelInvite={() => handleCancelInvite(invite.id)}
                          />
                        ))}
                      </div>
                    )}
                    {/* Outgoing requests (to existing users) */}
                    {outgoingRequests.length > 0 && (
                      <div className="space-y-3">
                        <Mono className="text-pine-6 flex items-center gap-2">
                          <PaperPlaneTilt className="w-3.5 h-3.5" weight="regular" />
                          Pending requests
                        </Mono>
                        {outgoingRequests.map((outgoing) => (
                          <FriendCard
                            key={outgoing.id}
                            type="outgoing"
                            outgoing={outgoing}
                            onCancel={() => handleCancel(outgoing.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-cream dark:bg-paper-2 border-t border-line px-6 md:px-14 py-10 flex flex-wrap items-center justify-between gap-4">
        <Mono>ROAMSWILD · OFF-GRID CAMPING · 2026</Mono>
        <div className="flex flex-wrap gap-6 text-[13px] text-ink-3">
          <Link to="/about" className="hover:text-ink transition-colors">Field notes</Link>
          <Link to="/how-we-map" className="hover:text-ink transition-colors">How we map</Link>
          <Link to="/submit-spot" className="hover:text-ink transition-colors">Submit a spot</Link>
          <Link to="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
        </div>
      </footer>

      <AddFriendDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSendRequest={handleSendRequest}
      />
    </div>
  );
};

// Empty state — shared across the three tabs.
const EmptyState = ({
  icon,
  title,
  copy,
  ctaLabel,
  onCta,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  ctaLabel?: string;
  onCta?: () => void;
}) => (
  <div className="border border-line bg-white dark:bg-paper-2 rounded-[18px] px-8 py-14 text-center">
    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 mb-4">
      {icon}
    </div>
    <h2 className="font-sans font-semibold text-xl tracking-[-0.01em] text-ink">{title}</h2>
    <p className="text-[14px] text-ink-3 mt-2 max-w-[460px] mx-auto leading-[1.55]">{copy}</p>
    {ctaLabel && onCta && (
      <div className="mt-6">
        <Pill variant="solid-pine" mono={false} onClick={onCta}>
          <UserPlus size={13} weight="bold" />
          {ctaLabel}
        </Pill>
      </div>
    )}
  </div>
);

export default Friends;
