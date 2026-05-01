import { useState } from 'react';
import { UserPlus, SpinnerGap, WarningCircle, CheckCircle, Envelope } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mono, Pill, AuthInput } from '@/components/redesign';

interface AddFriendDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSendRequest: (email: string) => Promise<{ success: boolean; error?: string; invited?: boolean }>;
}

export function AddFriendDialog({ isOpen, onClose, onSendRequest }: AddFriendDialogProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [wasInvited, setWasInvited] = useState(false);

  const handleClose = () => {
    setEmail('');
    setError(null);
    setSuccess(false);
    setWasInvited(false);
    onClose();
  };

  const validateEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter an email address');
      return;
    }
    if (!validateEmail(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      const result = await onSendRequest(trimmed);
      if (result.success) {
        setSuccess(true);
        setWasInvited(result.invited || false);
        setEmail('');
        setTimeout(() => handleClose(), 2000);
      } else {
        setError(result.error || 'Failed to send friend request');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md border-line bg-white dark:bg-paper-2 rounded-[18px]">
        <DialogHeader>
          <Mono className="text-pine-6">Add friend</Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
            Send a friend request.
          </DialogTitle>
          <DialogDescription className="text-[14px] text-ink-3 leading-[1.55]">
            Send a friend request by email. They'll need to accept before you become friends.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <AuthInput
            id="add-friend-email"
            label="Email address"
            type="email"
            icon={Envelope}
            placeholder="friend@example.com"
            value={email}
            onChange={(v) => {
              setEmail(v);
              setError(null);
            }}
            error={error}
            required
          />

          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-pine-6/10 border border-pine-6/30 rounded-[12px] text-pine-6 text-[13px]">
              <CheckCircle className="w-4 h-4 flex-shrink-0" weight="fill" />
              <span>
                {wasInvited
                  ? "Invite sent — they'll receive an email to join RoamsWild."
                  : 'Friend request sent.'}
              </span>
            </div>
          )}

          {/* Inline non-field errors (e.g. server failures) — field errors render under the input via AuthInput */}
          {error && !validateEmail(email) === false && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-ember/10 border border-ember/30 rounded-[12px] text-ember text-[13px]">
              <WarningCircle className="w-4 h-4 flex-shrink-0" weight="regular" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2 mt-2">
            <Pill
              variant="ghost"
              mono={false}
              onClick={handleClose}
              type="button"
              as="button"
              className={isLoading ? 'opacity-50 pointer-events-none' : ''}
            >
              Cancel
            </Pill>
            <Pill
              variant="solid-pine"
              mono={false}
              onClick={() => { /* form onSubmit handles it */ }}
              type="submit"
              as="button"
              className={(isLoading || success) ? 'opacity-50 pointer-events-none' : ''}
            >
              {isLoading ? (
                <>
                  <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" weight="bold" />
                  Send request
                </>
              )}
            </Pill>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
