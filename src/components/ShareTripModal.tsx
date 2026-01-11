import { useState, useEffect } from 'react';
import { X, Envelope, Link, Copy, Check, Trash, UserPlus } from '@phosphor-icons/react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useTrip, Collaborator, ShareLink } from '@/context/TripContext';
import { toast } from 'sonner';

interface ShareTripModalProps {
  tripId: string;
  tripName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareTripModal({ tripId, tripName, isOpen, onClose }: ShareTripModalProps) {
  const { shareTrip, createShareLink, revokeShareLink, removeCollaborator, updateCollaboratorPermission, fetchCollaborators, fetchShareLinks } = useTrip();

  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('edit');
  const [isInviting, setIsInviting] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Load collaborators and share links when modal opens
  useEffect(() => {
    if (isOpen && tripId) {
      loadData();
    }
  }, [isOpen, tripId]);

  const loadData = async () => {
    const [collabs, links] = await Promise.all([
      fetchCollaborators(tripId),
      fetchShareLinks(tripId),
    ]);
    setCollaborators(collabs);
    setShareLinks(links);
  };

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setIsInviting(true);
    const result = await shareTrip(tripId, email.trim(), permission);
    setIsInviting(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Invitation sent to ${email}`);
      setEmail('');
      loadData();
    }
  };

  const handleCreateLink = async () => {
    setIsCreatingLink(true);
    const result = await createShareLink(tripId, permission);
    setIsCreatingLink(false);

    if (result.error) {
      toast.error(result.error);
    } else if (result.link) {
      toast.success('Share link created');
      navigator.clipboard.writeText(result.link);
      loadData();
    }
  };

  const handleCopyLink = async (token: string, linkId: string) => {
    const link = `${window.location.origin}/join/${token}`;
    await navigator.clipboard.writeText(link);
    setCopiedLinkId(linkId);
    setTimeout(() => setCopiedLinkId(null), 2000);
    toast.success('Link copied to clipboard');
  };

  const handleRevokeLink = async (linkId: string) => {
    await revokeShareLink(linkId);
    toast.success('Share link revoked');
    loadData();
  };

  const handleRemoveCollaborator = async (userId: string, name?: string) => {
    await removeCollaborator(tripId, userId);
    toast.success(`Removed ${name || 'collaborator'} from trip`);
    loadData();
  };

  const handleUpdatePermission = async (userId: string, newPermission: 'view' | 'edit') => {
    await updateCollaboratorPermission(tripId, userId, newPermission);
    toast.success('Permission updated');
    loadData();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Share "{tripName}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invite by email */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Invite by email</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="Enter email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                />
              </div>
              <Select value={permission} onValueChange={(v) => setPermission(v as 'view' | 'edit')}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edit">Edit</SelectItem>
                  <SelectItem value="view">View</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleInvite} disabled={isInviting} className="w-full">
              <Envelope className="w-4 h-4 mr-2" />
              {isInviting ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or share with link</span>
            </div>
          </div>

          {/* Create share link */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Select value={permission} onValueChange={(v) => setPermission(v as 'view' | 'edit')}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edit">Edit</SelectItem>
                  <SelectItem value="view">View</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleCreateLink} disabled={isCreatingLink} variant="outline" className="flex-1">
                <Link className="w-4 h-4 mr-2" />
                {isCreatingLink ? 'Creating...' : 'Create Link'}
              </Button>
            </div>
          </div>

          {/* Active share links */}
          {shareLinks.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Active links</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {shareLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground capitalize">{link.permission}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleCopyLink(link.token, link.id)}
                      >
                        {copiedLinkId === link.id ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleRevokeLink(link.id)}
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current collaborators */}
          {collaborators.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">People with access</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {collaborators.map((collab) => (
                  <div key={collab.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">
                        {collab.name ? collab.name.slice(0, 2).toUpperCase() : collab.email.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{collab.name || collab.email}</p>
                        {collab.name && <p className="text-xs text-muted-foreground truncate">{collab.email}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Select
                        value={collab.permission}
                        onValueChange={(v) => handleUpdatePermission(collab.userId, v as 'view' | 'edit')}
                      >
                        <SelectTrigger className="h-7 w-20 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="edit">Edit</SelectItem>
                          <SelectItem value="view">View</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveCollaborator(collab.userId, collab.name)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
