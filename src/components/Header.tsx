import { Jeep, List, Path, SignOut, Tent } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

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

export const Header = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const userName = user?.user_metadata?.name as string | undefined;
  const initials = getInitials(userName, user?.email);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-transparent">
      <div className="container flex items-center justify-between h-16 px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <Jeep className="w-6 h-6 text-primary" weight="regular" />
          <span className="text-xl font-display font-bold text-foreground">RoamsWild</span>
        </Link>

        <nav className="hidden md:flex items-center gap-2">
          <Link
            to="/"
            className={cn(
              "text-base font-bold transition-colors px-3 py-1.5 rounded-full",
              isActive('/')
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            Explore
          </Link>
          <Link
            to="/my-trips"
            className={cn(
              "text-base font-bold transition-colors px-3 py-1.5 rounded-full",
              isActive('/my-trips')
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            My Trips
          </Link>
          <Link
            to="/saved"
            className={cn(
              "text-base font-bold transition-colors px-3 py-1.5 rounded-full",
              isActive('/saved')
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            Saved
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/create-trip">
            <Button variant="primary" size="sm" className="hidden md:flex">
              <Path className="w-4 h-4 mr-1" weight="bold" />
              Create Trip
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hidden md:flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors">
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{userName || 'Account'}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/campsites" className="flex items-center">
                  <Tent className="w-4 h-4 mr-2" weight="bold" />
                  Campsites
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <SignOut className="w-4 h-4 mr-2" weight="bold" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="md:hidden">
            <List className="w-5 h-5" weight="bold" />
          </Button>
        </div>
      </div>
    </header>
  );
};