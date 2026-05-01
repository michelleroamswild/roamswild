import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { Collaborator } from '@/context/TripContext';
import { useAuth } from '@/context/AuthContext';
import { Mono } from '@/components/redesign';

interface CollaboratorAvatarsProps {
  collaborators: Collaborator[];
  maxDisplay?: number;
  size?: 'sm' | 'md';
}

const getInitials = (name?: string, email?: string): string => {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return '?';
};

// Hash userId to one of the Pine + Paper accent tokens for consistent avatar colors.
const getAvatarColor = (userId: string): string => {
  const colors = [
    'bg-pine-6 text-cream dark:text-ink-pine',
    'bg-sage text-cream',
    'bg-water text-cream',
    'bg-clay text-cream',
    'bg-ember text-cream',
    'bg-ink dark:bg-ink-pine text-cream',
  ];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export function CollaboratorAvatars({
  collaborators,
  maxDisplay = 3,
  size = 'md'
}: CollaboratorAvatarsProps) {
  const { user } = useAuth();

  if (collaborators.length === 0) {
    return null;
  }

  const displayedCollaborators = collaborators.slice(0, maxDisplay);
  const remainingCount = collaborators.length - maxDisplay;

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
  };

  const containerClasses = {
    sm: 'gap-1',
    md: 'gap-1.5',
  };

  return (
    <TooltipProvider>
      <div className={`flex items-center ${containerClasses[size]}`}>
        {displayedCollaborators.map((collab) => (
          <Tooltip key={collab.id}>
            <TooltipTrigger asChild>
              <div
                className={`${sizeClasses[size]} ${getAvatarColor(collab.userId)} rounded-full flex items-center justify-center font-sans font-semibold tracking-[0.02em] cursor-default`}
              >
                {getInitials(collab.name, collab.email)}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink">
                {collab.userId === user?.id ? 'You' : (collab.name || collab.email)}
              </p>
              <Mono className="text-ink-3 mt-0.5 block capitalize">
                {collab.permission === 'owner' ? 'Owner' : `${collab.permission} access`}
              </Mono>
            </TooltipContent>
          </Tooltip>
        ))}

        {remainingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`${sizeClasses[size]} bg-cream dark:bg-paper-2 border border-line rounded-full flex items-center justify-center text-ink-2 font-sans font-semibold tracking-[0.02em] cursor-default`}
              >
                +{remainingCount}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-[13px] font-sans text-ink">
                {remainingCount} more collaborator{remainingCount > 1 ? 's' : ''}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
