import { Compass, Menu, Route, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
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
  const userName = user?.user_metadata?.name as string | undefined;
  const initials = getInitials(userName, user?.email);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container flex items-center justify-between h-16 px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-xl">
            <Compass className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-display font-bold text-foreground">RoamsWild</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Explore
          </Link>
          <Link to="/my-trips" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            My Trips
          </Link>
          <Link to="/saved" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Saved
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/create-trip">
            <Button variant="hero" size="sm" className="hidden md:flex">
              <Route className="w-4 h-4 mr-1" />
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
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};