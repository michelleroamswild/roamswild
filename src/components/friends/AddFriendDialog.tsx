import { useState } from 'react';
import { UserPlus, SpinnerGap, WarningCircle, CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter an email address');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      const result = await onSendRequest(trimmedEmail);
      if (result.success) {
        setSuccess(true);
        setWasInvited(result.invited || false);
        setEmail('');
        // Auto-close after showing success
        setTimeout(() => {
          handleClose();
        }, 2000);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Add Friend
          </DialogTitle>
          <DialogDescription>
            Send a friend request by email. They'll need to accept before you become friends.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              disabled={isLoading || success}
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <WarningCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle className="w-4 h-4 flex-shrink-0" weight="fill" />
              <span>
                {wasInvited
                  ? "Invite sent! They'll receive an email to join RoamsWild."
                  : 'Friend request sent!'}
              </span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading || success}>
              {isLoading ? (
                <>
                  <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Send Request
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
