import { useState } from 'react';
import { Users } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { Collaborator } from '@/context/TripContext';

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

// Generate a consistent color based on user ID
const getAvatarColor = (userId: string): string => {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-rose-500',
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
  if (collaborators.length === 0) {
    return null;
  }

  const displayedCollaborators = collaborators.slice(0, maxDisplay);
  const remainingCount = collaborators.length - maxDisplay;

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
  };

  const containerClasses = {
    sm: '-space-x-2',
    md: '-space-x-3',
  };

  return (
    <TooltipProvider>
      <div className={`flex items-center ${containerClasses[size]}`}>
        {displayedCollaborators.map((collab) => (
          <Tooltip key={collab.id}>
            <TooltipTrigger asChild>
              <div
                className={`${sizeClasses[size]} ${getAvatarColor(collab.userId)} rounded-full flex items-center justify-center text-white font-medium ring-2 ${collab.permission === 'owner' ? 'ring-amber-400' : 'ring-background'} cursor-default`}
              >
                {getInitials(collab.name, collab.email)}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{collab.name || collab.email}</p>
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
                className={`${sizeClasses[size]} bg-muted rounded-full flex items-center justify-center text-muted-foreground font-medium ring-2 ring-background cursor-default`}
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
