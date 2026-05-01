import { useEffect, useState } from "react";
import { Jeep, List, SignOut, Tent, Moon, Sun, Users, Lock, CaretDown, MapPin, CheckCircle } from "@phosphor-icons/react";
import { useFriends } from "@/context/FriendsContext";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { Mono } from "@/components/redesign";
import { getUserLocation, type UserLocation } from "@/utils/getUserLocation";
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

// Pine Grove v3 nav pattern: rounded-full pills, active = solid ink with cream
// text, inactive = transparent ink, no borders. Avatar is a pine-filled circle
// with cream initials. A Mono location label sits to the avatar's left when
// available (matches the "SLT · UT · 38°34N" tag in the reference).
interface HeaderProps {
  /** Legacy prop — kept so existing call sites compile. */
  showBorder?: boolean;
}

export const Header = ({ showBorder: _showBorder = false }: HeaderProps) => {
  const { user, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { incomingRequests } = useFriends();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerLocation, setHeaderLocation] = useState<UserLocation | null>(null);
  const [copiedHeaderCoords, setCopiedHeaderCoords] = useState(false);
  // True when the header strip overlaps any element marked `data-dark-band`.
  // Pages opt-in by putting `data-dark-band` on dark sections (e.g. the pine
  // band on the home page) and the header flips to a cream-on-dark palette.
  const [onDark, setOnDark] = useState(false);
  // True after the user scrolls past the hero — header condenses (smaller
  // logo, avatar, padding) so it takes less visual weight while reading.
  const [scrolled, setScrolled] = useState(false);
  const userName = user?.user_metadata?.name as string | undefined;
  const initials = getInitials(userName, user?.email);
  const pendingRequestCount = incomingRequests.length;
  const isAdmin = user?.email && ['michelle@roamswild.com', 'mictaylo@gmail.com'].includes(user.email);

  // Quietly try to grab location for the mono label. If the user blocks
  // geolocation, the label simply doesn't render.
  useEffect(() => {
    getUserLocation().then(setHeaderLocation).catch(() => {});
  }, []);

  // Watch for dark bands behind the header strip. We check at the visual
  // mid-line of the header (~32px) so the flip happens when the band is
  // actually behind the text, not when it's just nearing.
  useEffect(() => {
    const HEADER_MID = 32;
    let rafId = 0;
    const check = () => {
      const bands = document.querySelectorAll<HTMLElement>('[data-dark-band]');
      let hit = false;
      bands.forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.top <= HEADER_MID && r.bottom >= HEADER_MID) hit = true;
      });
      setOnDark(hit);
      setScrolled(window.scrollY > 12);
    };
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [location.pathname]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const primaryNav = [
    { path: '/dispersed', label: 'Explore' },
    { path: '/my-trips',  label: 'My Trips' },
    { path: '/saved',     label: 'Favorites' },
  ];

  const betaActive = isActive('/light-report') || isActive('/terrain-validation') || isActive('/photo-scout');

  // Once scrolled, the header gets its own translucent surface, so the
  // `onDark` band-detection no longer applies — text is sitting on the
  // header's bg, not the page band. Treat scrolled as a forced-light
  // surface so all the conditional class branches resolve correctly.
  const effectiveOnDark = scrolled ? false : onDark;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300 ease-out",
        scrolled
          ? "bg-cream/85 dark:bg-paper/85 backdrop-blur-md border-b border-line/60 dark:border-line-2/40 shadow-[0_1px_2px_rgba(29,34,24,.04)]"
          : "bg-transparent border-b border-transparent",
      )}
    >
      <div className={cn(
        "max-w-[1440px] mx-auto relative flex items-center justify-between transition-all duration-300 ease-out",
        scrolled ? "h-10 md:h-12 px-4 md:px-10" : "h-16 md:h-20 px-4 md:px-14",
      )}>
        {/* Logo — Jeep icon collapses out of layout on scroll (width + opacity)
            so the bar reads as just the wordmark when condensed. */}
        <Link
          to="/"
          className={cn(
            "flex items-center group shrink-0 transition-[gap] duration-300 ease-out",
            scrolled ? "gap-0" : "gap-2 md:gap-2.5",
          )}
        >
          <Jeep
            className={cn(
              "text-pine-6 transition-all duration-300 ease-out group-hover:-translate-x-px overflow-hidden",
              scrolled ? "w-0 h-0 opacity-0" : "w-6 h-6 opacity-100",
            )}
            weight="regular"
          />
          <span className={cn(
            "font-sans font-bold tracking-[-0.01em] transition-all duration-300 ease-out",
            scrolled ? "text-[13px]" : "text-base md:text-[16px]",
            effectiveOnDark ? "text-cream" : "text-ink",
          )}>
            RoamsWild
          </span>
        </Link>

        {/* Desktop nav — pinned to the visual center of the bar (absolute, not
            flexed) so the link group is always page-centered regardless of how
            wide the logo or right-side cluster are. Solid pill active,
            transparent inactive. Inverts on dark bands. */}
        <nav className={cn(
          "hidden md:flex items-center absolute left-1/2 -translate-x-1/2 transition-all duration-300 ease-out",
          scrolled ? "gap-1" : "gap-1.5",
        )}>
          {primaryNav.map(({ path, label }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  "rounded-full font-sans font-semibold tracking-[-0.005em] transition-all duration-300 ease-out",
                  scrolled ? "px-3 py-1 text-[12px]" : "px-4 py-2 text-[13px]",
                  active
                    ? effectiveOnDark
                      ? "bg-cream dark:bg-paper-2 text-ink hover:bg-cream/90 dark:hover:bg-paper-2/90"
                      : "bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2"
                    : effectiveOnDark
                      ? "text-cream hover:bg-cream/10 dark:hover:bg-paper-2/10"
                      : "text-ink hover:bg-ink/5"
                )}
              >
                {label}
              </Link>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "inline-flex items-center gap-1 rounded-full font-sans font-semibold tracking-[-0.005em] transition-all duration-300 ease-out",
                scrolled ? "px-3 py-1 text-[12px]" : "px-4 py-2 text-[13px]",
                betaActive
                  ? effectiveOnDark
                    ? "bg-cream dark:bg-paper-2 text-ink hover:bg-cream/90 dark:hover:bg-paper-2/90"
                    : "bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2"
                  : effectiveOnDark
                    ? "text-cream hover:bg-cream/10 dark:hover:bg-paper-2/10"
                    : "text-ink hover:bg-ink/5"
              )}>
                Beta
                <CaretDown className="w-3 h-3" weight="bold" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-52 rounded-[12px] border-line dark:border-line-2 bg-white dark:bg-paper-2 [&_[data-highlighted]]:bg-cream [&_[data-highlighted]]:text-ink dark:[&_[data-highlighted]]:bg-paper">
              <DropdownMenuLabel className="px-3 py-2">
                <Mono className="text-pine-6">In testing</Mono>
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/light-report" className="flex items-center cursor-pointer text-[14px] text-ink">
                  The Light Report
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/terrain-validation" className="flex items-center cursor-pointer text-[14px] text-ink">
                  Terrain Analysis
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Right — Mono location label + avatar */}
        <div className={cn(
          "flex items-center shrink-0 transition-all duration-300 ease-out",
          scrolled ? "gap-2 md:gap-2.5" : "gap-3 md:gap-3.5",
        )}>
          {/* Pin + decimal-degree coordinates of the user's current location.
              Click to copy — pastes straight into Google Maps. */}
          {headerLocation && (() => {
            const coords = `${headerLocation.lat.toFixed(5)}, ${headerLocation.lng.toFixed(5)}`;
            return (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(coords);
                  setCopiedHeaderCoords(true);
                  setTimeout(() => setCopiedHeaderCoords(false), 2000);
                }}
                title="Copy coordinates — paste into Google Maps to open"
                className={cn(
                  "hidden lg:inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.05em] transition-colors duration-300 ease-out",
                  effectiveOnDark
                    ? "text-cream/60 hover:text-cream"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                {copiedHeaderCoords ? (
                  <CheckCircle size={13} weight="fill" className="text-pine-6" />
                ) : (
                  <MapPin size={12} weight="fill" className="text-pine-6" />
                )}
                {coords}
              </button>
            );
          })()}

          {/* Friends pending dot — only shown if there are requests */}
          {pendingRequestCount > 0 && (
            <Link
              to="/friends"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-clay/12 text-clay text-[11px] font-mono font-semibold uppercase tracking-[0.10em] hover:bg-clay/20 transition-colors"
              aria-label={`${pendingRequestCount} pending friend ${pendingRequestCount === 1 ? 'request' : 'requests'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-clay" />
              {pendingRequestCount}
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "hidden md:inline-flex items-center justify-center rounded-full bg-pine-6 text-cream dark:text-ink-pine font-sans font-semibold tracking-[0.02em] hover:bg-pine-5 transition-all duration-300 ease-out",
                  scrolled ? "w-6 h-6 text-[9px]" : "w-[34px] h-[34px] text-[12px]"
                )}
                aria-label="Account menu"
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
                onClick={handleSignOut}
                className="flex items-center cursor-pointer text-[14px] text-ember data-[highlighted]:!text-ember data-[highlighted]:!bg-ember/10"
              >
                <SignOut className="w-4 h-4 mr-2" weight="regular" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile trigger */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-full bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2 transition-colors"
                aria-label="Open menu"
              >
                <List className="w-4 h-4" weight="regular" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[340px] bg-cream dark:bg-paper-2 border-line dark:border-line-2">
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2 text-ink">
                  <Jeep className="w-5 h-5 text-pine-6" weight="regular" />
                  <span className="font-sans font-bold tracking-[-0.01em]">RoamsWild</span>
                </SheetTitle>
              </SheetHeader>

              {/* User Info */}
              <div className="flex items-center gap-3 mt-6 pb-5 border-b border-line dark:border-line-2">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-pine-6 text-cream dark:text-ink-pine font-semibold text-[13px]">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink truncate text-[14px]">{userName || 'Account'}</p>
                  <p className="text-[12px] text-ink-3 truncate">{user?.email}</p>
                </div>
              </div>

              {/* Mobile nav — pill style matches desktop */}
              <nav className="flex flex-col gap-1 mt-4">
                {primaryNav.map(({ path, label }) => {
                  const active = isActive(path);
                  return (
                    <Link
                      key={path}
                      to={path}
                      onClick={closeMobileMenu}
                      className={cn(
                        "flex items-center justify-between px-4 py-3 rounded-full font-sans font-semibold text-[14px] transition-colors",
                        active ? "bg-ink dark:bg-ink-pine text-cream" : "text-ink hover:bg-ink/5"
                      )}
                    >
                      {label}
                    </Link>
                  );
                })}
                <Link
                  to="/light-report"
                  onClick={closeMobileMenu}
                  className={cn(
                    "flex items-center px-4 py-3 rounded-full font-sans font-semibold text-[14px] transition-colors",
                    isActive('/light-report') ? "bg-ink dark:bg-ink-pine text-cream" : "text-ink hover:bg-ink/5"
                  )}
                >
                  Light Report <Mono className="ml-2 text-clay">BETA</Mono>
                </Link>
                <Link
                  to="/terrain-validation"
                  onClick={closeMobileMenu}
                  className={cn(
                    "flex items-center px-4 py-3 rounded-full font-sans font-semibold text-[14px] transition-colors",
                    isActive('/terrain-validation') ? "bg-ink dark:bg-ink-pine text-cream" : "text-ink hover:bg-ink/5"
                  )}
                >
                  Terrain Analysis <Mono className="ml-2 text-clay">BETA</Mono>
                </Link>
                <Link
                  to="/friends"
                  onClick={closeMobileMenu}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-full font-sans font-semibold text-[14px] transition-colors",
                    isActive('/friends') ? "bg-ink dark:bg-ink-pine text-cream" : "text-ink hover:bg-ink/5"
                  )}
                >
                  Friends
                  {pendingRequestCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-clay text-cream text-[10px] font-mono font-bold">
                      {pendingRequestCount}
                    </span>
                  )}
                </Link>
                {isFeatureEnabled('campsites') && (
                  <Link
                    to="/campsites"
                    onClick={closeMobileMenu}
                    className={cn(
                      "flex items-center px-4 py-3 rounded-full font-sans font-semibold text-[14px] transition-colors",
                      isActive('/campsites') ? "bg-ink dark:bg-ink-pine text-cream" : "text-ink hover:bg-ink/5"
                    )}
                  >
                    Campsites
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={closeMobileMenu}
                    className={cn(
                      "flex items-center px-4 py-3 rounded-full font-sans font-semibold text-[14px] transition-colors",
                      isActive('/admin') ? "bg-ink dark:bg-ink-pine text-cream" : "text-ink hover:bg-ink/5"
                    )}
                  >
                    Admin
                  </Link>
                )}
              </nav>

              {/* Theme + Sign out */}
              <div className="mt-6 pt-4 border-t border-line dark:border-line-2 flex flex-col gap-1">
                <button
                  onClick={toggleTheme}
                  className="flex items-center px-4 py-3 rounded-full font-sans font-semibold text-[14px] text-ink hover:bg-ink/5 transition-colors"
                >
                  {isDark ? (
                    <><Sun className="w-4 h-4 mr-2 text-ink-2" weight="regular" /> Light mode</>
                  ) : (
                    <><Moon className="w-4 h-4 mr-2 text-ink-2" weight="regular" /> Dark mode</>
                  )}
                </button>
                <button
                  onClick={() => { handleSignOut(); closeMobileMenu(); }}
                  className="flex items-center px-4 py-3 rounded-full font-sans font-semibold text-[14px] text-ember hover:bg-ember/10 transition-colors"
                >
                  <SignOut className="w-4 h-4 mr-2" weight="regular" />
                  Sign out
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
