import { useState } from 'react';
import { User, Trash, X, Check, Clock, ProhibitInset } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Friend, FriendRequest, OutgoingRequest } from '@/types/friends';

interface FriendCardProps {
  type: 'friend' | 'incoming' | 'outgoing';
  friend?: Friend;
  request?: FriendRequest;
  outgoing?: OutgoingRequest;
  onAccept?: () => Promise<boolean>;
  onReject?: () => Promise<boolean>;
  onCancel?: () => Promise<boolean>;
  onRemove?: () => Promise<boolean>;
  onBlock?: () => Promise<boolean>;
}

export function FriendCard({
  type,
  friend,
  request,
  outgoing,
  onAccept,
  onReject,
  onCancel,
  onRemove,
  onBlock,
}: FriendCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<'remove' | 'block' | null>(null);

  const getName = () => {
    if (type === 'friend' && friend) return friend.name || friend.email;
    if (type === 'incoming' && request) return request.from.name || request.from.email;
    if (type === 'outgoing' && outgoing) return outgoing.to.name || outgoing.to.email;
    return 'Unknown';
  };

  const getEmail = () => {
    if (type === 'friend' && friend) return friend.email;
    if (type === 'incoming' && request) return request.from.email;
    if (type === 'outgoing' && outgoing) return outgoing.to.email;
    return '';
  };

  const getInitials = () => {
    const name = getName();
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
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
    if (onRemove) {
      await handleAction(onRemove);
    }
    setConfirmDialog(null);
  };

  const handleConfirmBlock = async () => {
    if (onBlock) {
      await handleAction(onBlock);
    }
    setConfirmDialog(null);
  };

  return (
    <>
      <Card className="hover:border-primary/20 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-medium text-sm">{getInitials()}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-foreground truncate">{getName()}</h4>
              {friend?.name && (
                <p className="text-sm text-muted-foreground truncate">{getEmail()}</p>
              )}
              {type === 'friend' && friend?.since && (
                <p className="text-xs text-muted-foreground mt-1">
                  Friends since {new Date(friend.since).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
              {type === 'incoming' && request?.createdAt && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Received {new Date(request.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              )}
              {type === 'outgoing' && outgoing?.createdAt && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Sent {new Date(outgoing.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {type === 'incoming' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReject && handleAction(onReject)}
                    disabled={isLoading}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Decline
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onAccept && handleAction(onAccept)}
                    disabled={isLoading}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Accept
                  </Button>
                </>
              )}

              {type === 'outgoing' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCancel && handleAction(onCancel)}
                  disabled={isLoading}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              )}

              {type === 'friend' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDialog('remove')}
                    disabled={isLoading}
                    className="text-muted-foreground hover:text-destructive hover:border-destructive"
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDialog('block')}
                    disabled={isLoading}
                    className="text-muted-foreground hover:text-destructive hover:border-destructive"
                  >
                    <ProhibitInset className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirm Remove Dialog */}
      <AlertDialog open={confirmDialog === 'remove'} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Friend</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{getName()}</strong> from your friends?
              You can send them a new friend request later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Block Dialog */}
      <AlertDialog open={confirmDialog === 'block'} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to block <strong>{getName()}</strong>?
              They won't be able to send you friend requests or see your shared content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBlock}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
