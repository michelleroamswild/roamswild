import { Users } from '@phosphor-icons/react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { Collaborator } from '@/context/TripContext';
import { useAuth } from '@/context/AuthContext';

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

// Generate a consistent color based on user ID using site accent colors
const getAvatarColor = (userId: string): string => {
  const colors = [
    'bg-pinesoft',
    'bg-aquateal',
    'bg-skyblue',
    'bg-lavenderslate',
    'bg-softamber',
    'bg-blushorchid',
    'bg-terracotta',
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
                className={`${sizeClasses[size]} ${getAvatarColor(collab.userId)} rounded-full flex items-center justify-center text-white font-extrabold tracking-wide cursor-default`}
              >
                {getInitials(collab.name, collab.email)}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">
                {collab.userId === user?.id ? 'You' : (collab.name || collab.email)}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {collab.permission === 'owner' ? 'Owner' : `${collab.permission} access`}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}

        {remainingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`${sizeClasses[size]} bg-muted rounded-full flex items-center justify-center text-muted-foreground font-extrabold tracking-wide cursor-default`}
              >
                +{remainingCount}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{remainingCount} more collaborator{remainingCount > 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
