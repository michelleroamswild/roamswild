import { useState, useEffect } from 'react';
import { X, Envelope, Link as LinkIcon, Copy, Check, Trash, UserPlus } from '@phosphor-icons/react';
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
import { Mono, Pill } from '@/components/redesign';

interface ShareTripModalProps {
  tripId: string;
  tripName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareTripModal({ tripId, tripName, isOpen, onClose }: ShareTripModalProps) {
  const {
    shareTrip,
    createShareLink,
    revokeShareLink,
    removeCollaborator,
    updateCollaboratorPermission,
    fetchCollaborators,
    fetchShareLinks,
  } = useTrip();

  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('edit');
  const [isInviting, setIsInviting] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && tripId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tripId]);

  const loadData = async () => {
    const [collabs, links] = await Promise.all([fetchCollaborators(tripId), fetchShareLinks(tripId)]);
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
      <DialogContent className="sm:max-w-md border-line bg-white dark:bg-paper-2 rounded-[18px]">
        <DialogHeader>
          <Mono className="text-pine-6 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" weight="regular" />
            Share trip
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[20px] leading-[1.15] mt-1 truncate">
            {tripName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Invite by email */}
          <div className="space-y-2">
            <Mono className="text-ink-2 block">Invite by email</Mono>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="friend@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                className="flex-1 h-10 px-3 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors"
              />
              <PermissionSelect value={permission} onChange={setPermission} />
            </div>
            <Pill
              variant="solid-pine"
              mono={false}
              onClick={handleInvite}
              className={`!w-full !justify-center ${isInviting ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Envelope className="w-3.5 h-3.5" weight="regular" />
              {isInviting ? 'Sending…' : 'Send invite'}
            </Pill>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-line" />
            <Mono className="text-ink-3">Or share with link</Mono>
            <div className="flex-1 border-t border-line" />
          </div>

          {/* Create share link */}
          <div className="flex items-center gap-2">
            <PermissionSelect value={permission} onChange={setPermission} />
            <Pill
              variant="ghost"
              mono={false}
              onClick={handleCreateLink}
              className={`!flex-1 !justify-center ${isCreatingLink ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <LinkIcon className="w-3.5 h-3.5" weight="regular" />
              {isCreatingLink ? 'Creating…' : 'Create link'}
            </Pill>
          </div>

          {/* Active share links */}
          {shareLinks.length > 0 && (
            <div className="space-y-2">
              <Mono className="text-ink-2 block">Active links</Mono>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {shareLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between px-3 py-2 rounded-[10px] border border-line bg-cream dark:bg-paper-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <LinkIcon className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" weight="regular" />
                      <Mono className="text-ink-2 capitalize">{link.permission}</Mono>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => handleCopyLink(link.token, link.id)}
                        aria-label="Copy link"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3 hover:text-ink hover:bg-white dark:hover:bg-paper-2 transition-colors"
                      >
                        {copiedLinkId === link.id ? (
                          <Check className="w-3.5 h-3.5 text-pine-6" weight="bold" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" weight="regular" />
                        )}
                      </button>
                      <button
                        onClick={() => handleRevokeLink(link.id)}
                        aria-label="Revoke link"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-colors"
                      >
                        <Trash className="w-3.5 h-3.5" weight="regular" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current collaborators */}
          {collaborators.length > 0 && (
            <div className="space-y-2">
              <Mono className="text-ink-2 block">People with access</Mono>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {collaborators.map((collab) => (
                  <div
                    key={collab.id}
                    className="flex items-center justify-between px-3 py-2 rounded-[10px] border border-line bg-cream dark:bg-paper-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-pine-6 text-cream dark:text-ink-pine inline-flex items-center justify-center text-[11px] font-sans font-semibold tracking-[0.02em] flex-shrink-0">
                        {(collab.name ?? collab.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
                          {collab.name || collab.email}
                        </p>
                        {collab.name && (
                          <Mono className="text-ink-3 block truncate">{collab.email}</Mono>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {collab.permission === 'owner' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-line bg-cream dark:bg-paper-2 text-ink-2 text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                          Owner
                        </span>
                      ) : (
                        <PermissionSelect
                          value={collab.permission}
                          onChange={(v) => handleUpdatePermission(collab.userId, v)}
                          compact
                        />
                      )}
                      <button
                        onClick={() => handleRemoveCollaborator(collab.userId, collab.name)}
                        aria-label="Remove collaborator"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" weight="bold" />
                      </button>
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

const PermissionSelect = ({
  value,
  onChange,
  compact = false,
}: {
  value: 'view' | 'edit';
  onChange: (v: 'view' | 'edit') => void;
  compact?: boolean;
}) => (
  <Select value={value} onValueChange={(v) => onChange(v as 'view' | 'edit')}>
    <SelectTrigger
      className={
        compact
          ? 'h-7 w-[72px] px-2.5 rounded-full border-line bg-white dark:bg-paper-2 text-ink text-[11px] font-mono uppercase tracking-[0.10em] font-semibold hover:border-ink-3 transition-colors'
          : 'h-10 w-[88px] px-3 rounded-[12px] border-line bg-white dark:bg-paper-2 text-ink text-[14px] hover:border-ink-3 transition-colors'
      }
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent className="rounded-[12px] border-line bg-white [&_[data-highlighted]]:bg-cream dark:bg-paper-2 [&_[data-highlighted]]:text-ink">
      <SelectItem value="edit">Edit</SelectItem>
      <SelectItem value="view">View</SelectItem>
    </SelectContent>
  </Select>
);
