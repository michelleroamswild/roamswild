import { useState } from "react";
import { Jeep, List, Path, SignOut, Tent, Compass, Heart, Moon, Sun, MapTrifold } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { isFeatureEnabled } from "@/config/featureFlags";

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
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userName = user?.user_metadata?.name as string | undefined;
  const initials = getInitials(userName, user?.email);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-transparent">
      <div className="container flex items-center justify-between h-20 px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <Jeep className="w-6 h-6 text-primary" weight="regular" />
          <span className="text-xl font-display font-bold text-foreground">RoamsWild</span>
        </Link>

        <nav className="hidden md:flex items-center gap-2">
          <Link
            to="/dispersed"
            className={cn(
              "text-base font-bold transition-colors px-3 py-1.5 rounded-full",
              isActive('/dispersed')
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
              {isFeatureEnabled('campsites') && (
                <DropdownMenuItem asChild>
                  <Link to="/campsites" className="flex items-center">
                    <Tent className="w-4 h-4 mr-2" weight="bold" />
                    Campsites
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleTheme} className="flex items-center cursor-pointer">
                {isDark ? (
                  <>
                    <Sun className="w-4 h-4 mr-2" weight="bold" />
                    Light Mode
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 mr-2" weight="bold" />
                    Dark Mode
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <SignOut className="w-4 h-4 mr-2" weight="bold" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <List className="w-5 h-5" weight="bold" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[320px]">
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2">
                  <Jeep className="w-5 h-5 text-primary" weight="regular" />
                  <span className="font-display font-bold">RoamsWild</span>
                </SheetTitle>
              </SheetHeader>

              {/* User Info */}
              <div className="flex items-center gap-3 mt-6 pb-4 border-b border-border">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-medium text-sm">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{userName || 'Account'}</p>
                  <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>

              {/* Navigation Links */}
              <nav className="flex flex-col gap-1 mt-4">
                <Link
                  to="/dispersed"
                  onClick={closeMobileMenu}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-lg font-medium transition-colors",
                    isActive('/dispersed')
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <MapTrifold className="w-5 h-5" weight={isActive('/dispersed') ? "fill" : "regular"} />
                  Explore
                </Link>
                <Link
                  to="/my-trips"
                  onClick={closeMobileMenu}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-lg font-medium transition-colors",
                    isActive('/my-trips')
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Compass className="w-5 h-5" weight={isActive('/my-trips') ? "fill" : "regular"} />
                  My Trips
                </Link>
                <Link
                  to="/saved"
                  onClick={closeMobileMenu}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-lg font-medium transition-colors",
                    isActive('/saved')
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Heart className="w-5 h-5" weight={isActive('/saved') ? "fill" : "regular"} />
                  Saved
                </Link>
                {isFeatureEnabled('campsites') && (
                  <Link
                    to="/campsites"
                    onClick={closeMobileMenu}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg font-medium transition-colors",
                      isActive('/campsites')
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <Tent className="w-5 h-5" weight={isActive('/campsites') ? "fill" : "regular"} />
                    Campsites
                  </Link>
                )}
              </nav>

              {/* Create Trip Button */}
              <div className="mt-6 pt-4 border-t border-border">
                <Link to="/create-trip" onClick={closeMobileMenu}>
                  <Button variant="primary" className="w-full">
                    <Path className="w-4 h-4 mr-2" weight="bold" />
                    Create Trip
                  </Button>
                </Link>
              </div>

              {/* Dark Mode Toggle */}
              <div className="mt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={toggleTheme}
                >
                  {isDark ? (
                    <>
                      <Sun className="w-4 h-4 mr-2" weight="bold" />
                      Light Mode
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4 mr-2" weight="bold" />
                      Dark Mode
                    </>
                  )}
                </Button>
              </div>

              {/* Sign Out */}
              <div className="mt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    handleSignOut();
                    closeMobileMenu();
                  }}
                >
                  <SignOut className="w-4 h-4 mr-2" weight="bold" />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};