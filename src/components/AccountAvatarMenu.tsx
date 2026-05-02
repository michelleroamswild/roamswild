import { Link } from 'react-router-dom';
import { Lock, Moon, SignOut, Sun, Tent, User as UserIcon, Users } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { useFriends } from '@/context/FriendsContext';
import { useTheme } from '@/hooks/use-theme';
import { isFeatureEnabled } from '@/config/featureFlags';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const getInitials = (name?: string, email?: string): string => {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
};

// Reusable account avatar + dropdown menu. Used by the global Header and the
// custom explore-page header so both surfaces give users access to Friends,
// Campsites, Admin, theme toggle, and Sign-out.
interface AccountAvatarMenuProps {
  /** 'sm' = 28px (used in the floating explore header), 'default' = 34px. */
  size?: 'sm' | 'default';
  /** Override the trigger className (e.g. responsive visibility). */
  className?: string;
}

export const AccountAvatarMenu = ({ size = 'default', className }: AccountAvatarMenuProps) => {
  const { user, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { incomingRequests } = useFriends();

  const userName = user?.user_metadata?.name as string | undefined;
  const initials = getInitials(userName, user?.email);
  const pendingRequestCount = incomingRequests.length;
  const isAdmin = !!user?.email && ['michelle@roamswild.com', 'mictaylo@gmail.com'].includes(user.email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-pine-6 text-cream dark:text-ink-pine font-sans font-semibold tracking-[0.02em] hover:bg-pine-5 transition-colors',
            size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-[34px] h-[34px] text-[12px]',
            className,
          )}
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-[12px] border-line dark:border-line-2 bg-white dark:bg-paper-2 [&_[data-highlighted]]:bg-cream [&_[data-highlighted]]:text-ink dark:[&_[data-highlighted]]:bg-paper">
        <DropdownMenuLabel className="px-3 py-2.5">
          <div className="flex flex-col space-y-0.5">
            <p className="text-[14px] font-semibold text-ink">{userName || 'Account'}</p>
            <p className="text-[12px] text-ink-3 truncate">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-line dark:bg-line-2" />
        <DropdownMenuItem asChild>
          <Link to="/profile" className="flex items-center cursor-pointer text-[14px]">
            <UserIcon className="w-4 h-4 mr-2 text-ink-2" weight="regular" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/friends" className="flex items-center cursor-pointer text-[14px]">
            <Users className="w-4 h-4 mr-2 text-ink-2" weight="regular" />
            Friends
            {pendingRequestCount > 0 && (
              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-clay text-cream text-[10px] font-mono font-bold">
                {pendingRequestCount}
              </span>
            )}
          </Link>
        </DropdownMenuItem>
        {isFeatureEnabled('campsites') && (
          <DropdownMenuItem asChild>
            <Link to="/campsites" className="flex items-center cursor-pointer text-[14px]">
              <Tent className="w-4 h-4 mr-2 text-ink-2" weight="regular" />
              Campsites
            </Link>
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <>
            <DropdownMenuSeparator className="bg-line dark:bg-line-2" />
            <DropdownMenuItem asChild>
              <Link to="/admin" className="flex items-center cursor-pointer text-[14px]">
                <Lock className="w-4 h-4 mr-2 text-ink-2" weight="regular" />
                Admin
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator className="bg-line dark:bg-line-2" />
        <DropdownMenuItem onClick={toggleTheme} className="flex items-center cursor-pointer text-[14px]">
          {isDark ? (
            <>
              <Sun className="w-4 h-4 mr-2 text-ink-2" weight="regular" />
              Light mode
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 mr-2 text-ink-2" weight="regular" />
              Dark mode
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-line dark:bg-line-2" />
        <DropdownMenuItem
          onClick={() => signOut()}
          className="flex items-center cursor-pointer text-[14px] text-ember data-[highlighted]:!text-ember data-[highlighted]:!bg-ember/10"
        >
          <SignOut className="w-4 h-4 mr-2" weight="regular" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
