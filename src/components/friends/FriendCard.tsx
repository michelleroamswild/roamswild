import { useState } from 'react';
import { Trash, X, Check, Clock, ProhibitInset } from '@phosphor-icons/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Friend, FriendRequest, OutgoingRequest, PendingInvite } from '@/types/friends';
import { Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface FriendCardProps {
  type: 'friend' | 'incoming' | 'outgoing' | 'invite';
  friend?: Friend;
  request?: FriendRequest;
  outgoing?: OutgoingRequest;
  invite?: PendingInvite;
  onAccept?: () => Promise<boolean>;
  onReject?: () => Promise<boolean>;
  onCancel?: () => Promise<boolean>;
  onCancelInvite?: () => Promise<boolean>;
  onRemove?: () => Promise<boolean>;
  onBlock?: () => Promise<boolean>;
}

// Reusable row card for friends / requests / invites. Style mirrors the
// MyTrips trip rows: white surface, line border, mono-cap meta, ember for
// destructive actions. Avatar uses the pine-6 fill from the header.
export function FriendCard({
  type,
  friend,
  request,
  outgoing,
  invite,
  onAccept,
  onReject,
  onCancel,
  onCancelInvite,
  onRemove,
  onBlock,
}: FriendCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<'remove' | 'block' | null>(null);

  const getName = () => {
    if (type === 'friend' && friend) return friend.name || friend.email;
    if (type === 'incoming' && request) return request.from.name || request.from.email;
    if (type === 'outgoing' && outgoing) return outgoing.to.name || outgoing.to.email;
    if (type === 'invite' && invite) return invite.invitedEmail;
    return 'Unknown';
  };

  const getEmail = () => {
    if (type === 'friend' && friend) return friend.email;
    if (type === 'incoming' && request) return request.from.email;
    if (type === 'outgoing' && outgoing) return outgoing.to.email;
    if (type === 'invite' && invite) return invite.invitedEmail;
    return '';
  };

  const getInitials = () => {
    const name = getName();
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const handleAction = async (action: () => Promise<boolean>) => {
    setIsLoading(true);
    try {
      await action();
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (onRemove) await handleAction(onRemove);
    setConfirmDialog(null);
  };

  const handleConfirmBlock = async () => {
    if (onBlock) await handleAction(onBlock);
    setConfirmDialog(null);
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Pick the meta line + label for each variant.
  const meta: { label: string; date?: string } | null =
    type === 'friend' && friend?.since ? { label: 'Friends since', date: friend.since } :
    type === 'incoming' && request?.createdAt ? { label: 'Received', date: request.createdAt } :
    type === 'outgoing' && outgoing?.createdAt ? { label: 'Sent', date: outgoing.createdAt } :
    type === 'invite' && invite?.createdAt ? { label: 'Invited', date: invite.createdAt } :
    null;

  // Tiny "non-user" badge for invites — they don't have an account yet.
  const isInvite = type === 'invite';

  return (
    <>
      <div className="border border-line bg-white rounded-[14px] p-5 flex items-center gap-4 transition-colors hover:border-ink-3/40">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full bg-pine-6 text-cream font-sans font-semibold text-[12px] tracking-[0.02em] inline-flex items-center justify-center flex-shrink-0">
          {getInitials()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[15px] font-sans font-semibold tracking-[-0.01em] text-ink truncate">
              {getName()}
            </h4>
            {isInvite && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-clay/12 text-clay border border-clay/40 text-[10px] font-mono font-semibold uppercase tracking-[0.10em]">
                Invited
              </span>
            )}
          </div>
          {friend?.name && (
            <p className="text-[13px] text-ink-3 truncate mt-0.5">{getEmail()}</p>
          )}
          {meta && (
            <p className="text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3 mt-1.5 flex items-center gap-1.5">
              <Clock className="w-3 h-3" weight="regular" />
              {meta.label} {meta.date && fmtDate(meta.date)}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {type === 'incoming' && (
            <>
              <Pill
                variant="ghost"
                sm
                mono={false}
                onClick={() => onReject && handleAction(onReject)}
                className={cn(isLoading && 'opacity-50 pointer-events-none')}
              >
                <X size={12} weight="bold" />
                Decline
              </Pill>
              <Pill
                variant="solid-pine"
                sm
                mono={false}
                onClick={() => onAccept && handleAction(onAccept)}
                className={cn(isLoading && 'opacity-50 pointer-events-none')}
              >
                <Check size={12} weight="bold" />
                Accept
              </Pill>
            </>
          )}

          {type === 'outgoing' && (
            <Pill
              variant="ghost"
              sm
              mono={false}
              onClick={() => onCancel && handleAction(onCancel)}
              className={cn(isLoading && 'opacity-50 pointer-events-none')}
            >
              <X size={12} weight="bold" />
              Cancel
            </Pill>
          )}

          {type === 'invite' && (
            <Pill
              variant="ghost"
              sm
              mono={false}
              onClick={() => onCancelInvite && handleAction(onCancelInvite)}
              className={cn(isLoading && 'opacity-50 pointer-events-none')}
            >
              <X size={12} weight="bold" />
              Cancel
            </Pill>
          )}

          {type === 'friend' && (
            <>
              <button
                onClick={() => setConfirmDialog('remove')}
                disabled={isLoading}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-colors disabled:opacity-50"
                aria-label="Remove friend"
              >
                <Trash className="w-4 h-4" weight="regular" />
              </button>
              <button
                onClick={() => setConfirmDialog('block')}
                disabled={isLoading}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-colors disabled:opacity-50"
                aria-label="Block user"
              >
                <ProhibitInset className="w-4 h-4" weight="regular" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Confirm Remove Dialog */}
      <AlertDialog open={confirmDialog === 'remove'} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent className="border-line bg-white rounded-[18px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-sans font-semibold tracking-[-0.01em] text-ink">
              Remove friend
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] text-ink-3 leading-[1.55]">
              Are you sure you want to remove <strong className="text-ink font-semibold">{getName()}</strong> from your friends?
              You can send them a new friend request later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-line text-ink hover:bg-cream">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              className="rounded-full bg-ember text-cream hover:bg-ember/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Block Dialog */}
      <AlertDialog open={confirmDialog === 'block'} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent className="border-line bg-white rounded-[18px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-sans font-semibold tracking-[-0.01em] text-ink">
              Block user
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] text-ink-3 leading-[1.55]">
              Are you sure you want to block <strong className="text-ink font-semibold">{getName()}</strong>?
              They won't be able to send you friend requests or see your shared content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-line text-ink hover:bg-cream">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBlock}
              className="rounded-full bg-ember text-cream hover:bg-ember/90"
            >
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
