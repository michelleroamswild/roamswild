import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MapPin,
  MapTrifold,
  Trash,
  Compass,
  Heart,
  ArrowRight,
  Copy,
  CheckCircle,
} from "@phosphor-icons/react";
import { useSavedLocations } from "@/context/SavedLocationsContext";
import { toast } from "sonner";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { Header } from "@/components/Header";
import { Mono, Pill } from "@/components/redesign";
import { cn } from "@/lib/utils";

// Format a relative date in a casual way: "Today", "Yesterday", "3 days ago",
// then falls back to "Mar 15, 2026" for older entries.
const formatRelative = (iso: string): string => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Decimal-degree format with comma-space — pasteable directly into Google Maps.
const fmtCoords = (lat: number, lng: number): string =>
  `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

const SavedLocations = () => {
  const navigate = useNavigate();
  const { locations, removeLocation } = useSavedLocations();
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string; name: string }>({
    isOpen: false,
    id: '',
    name: '',
  });
  const [activeType, setActiveType] = useState<string>('all');
  // Tracks which row's coords were just copied — drives the icon swap.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopyCoords = (id: string, coords: string) => {
    navigator.clipboard.writeText(coords);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  };

  const handleRemoveClick = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteModal({ isOpen: true, id, name });
  };

  const handleConfirmDelete = () => {
    removeLocation(deleteModal.id);
    toast.success(`Removed ${deleteModal.name}`, { description: 'Removed from favorites' });
  };

  // Build the unique-types list for filter pills + counts.
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const loc of locations) {
      const k = loc.type || 'place';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [locations]);

  const filtered = activeType === 'all'
    ? locations
    : locations.filter((l) => (l.type || 'place') === activeType);

  return (
    <div className="bg-cream dark:bg-paper text-ink font-sans min-h-screen">
      <Header />

      {/* === Hero strip — cream, page title + count + Explore CTA === */}
      <section className="relative overflow-hidden bg-cream dark:bg-paper-2 -mt-16 md:-mt-20">
        <div className="relative max-w-[1440px] mx-auto px-6 md:px-14 pt-28 md:pt-36 pb-10 md:pb-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Mono className="text-pine-6">
                {locations.length} {locations.length === 1 ? 'PLACE SAVED' : 'PLACES SAVED'}
              </Mono>
              <h1 className="font-sans font-bold tracking-[-0.035em] leading-[1] text-[44px] md:text-[64px] m-0 text-ink mt-2.5">
                Your favorites.
              </h1>
            </div>
            <Pill variant="solid-pine" mono={false} onClick={() => navigate('/dispersed')}>
              <Compass size={13} weight="regular" />
              Find more
            </Pill>
          </div>
        </div>
      </section>

      {/* === Grid section — paper-2 surface === */}
      <section className="bg-paper-2 min-h-[calc(100vh-300px)]">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-10 md:py-14">

          {/* Filter pills — only render when there's more than one type */}
          {typeCounts.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-8">
              <button
                onClick={() => setActiveType('all')}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-sans font-semibold tracking-[-0.005em] transition-colors',
                  activeType === 'all'
                    ? 'bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2'
                    : 'text-ink hover:bg-ink/5'
                )}
              >
                All
                <span className={cn(
                  'ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-[0.05em]',
                  activeType === 'all' ? 'bg-cream/20 dark:bg-paper-2/20 text-cream' : 'bg-ink/10 text-ink-3'
                )}>
                  {locations.length}
                </span>
              </button>
              {typeCounts.map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => setActiveType(type)}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-sans font-semibold tracking-[-0.005em] capitalize transition-colors',
                    activeType === type
                      ? 'bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2'
                      : 'text-ink hover:bg-ink/5'
                  )}
                >
                  {type}
                  <span className={cn(
                    'ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-[0.05em]',
                    activeType === type ? 'bg-cream/20 dark:bg-paper-2/20 text-cream' : 'bg-ink/10 text-ink-3'
                  )}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="border border-line dark:border-line-2 bg-white dark:bg-ink-pine rounded-[18px] px-8 py-14 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 mb-4">
                <Heart className="w-6 h-6 text-pine-6" weight="regular" />
              </div>
              <h2 className="font-sans font-semibold text-xl tracking-[-0.01em] text-ink">
                {locations.length === 0 ? 'No favorites yet' : 'No matches'}
              </h2>
              <p className="text-[14px] text-ink-3 mt-2 max-w-[460px] mx-auto leading-[1.55]">
                {locations.length === 0
                  ? 'Search for destinations and save them to quickly access them later.'
                  : `You don't have any saved ${activeType} locations.`}
              </p>
              {locations.length === 0 && (
                <div className="mt-6">
                  <Pill variant="solid-pine" mono={false} onClick={() => navigate('/dispersed')}>
                    <Compass size={13} weight="regular" />
                    Explore locations
                    <ArrowRight size={13} weight="bold" />
                  </Pill>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((loc) => {
                // Regions are saved with placeId="region:<uuid>" + type="region".
                // They render as a distinct card with a pine gradient hero strip
                // and route to /location/<bare-uuid> with surpriseMe state.
                const isRegion = loc.type === 'region';
                const bareRegionId = isRegion ? loc.placeId.replace(/^region:/, '') : loc.placeId;
                const linkTo = isRegion ? `/location/${bareRegionId}` : `/location/${loc.placeId}`;
                const linkState = isRegion
                  ? {
                      placeId: `surprise-${bareRegionId}`,
                      name: loc.name,
                      address: loc.address,
                      lat: loc.lat,
                      lng: loc.lng,
                      surpriseMe: { regionId: bareRegionId },
                    }
                  : {
                      placeId: loc.placeId,
                      name: loc.name,
                      address: loc.address,
                      lat: loc.lat,
                      lng: loc.lng,
                    };

                if (isRegion) {
                  // Region card — same layout as a saved place but with a
                  // pine-tinted MapTrifold icon (vs clay MapPin) and a "Region"
                  // badge so they're visually grouped but distinguishable.
                  return (
                    <Link
                      key={loc.id}
                      to={linkTo}
                      state={linkState}
                      className="group block border border-line dark:border-line-2 bg-white dark:bg-ink-pine rounded-[14px] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(29,34,24,.10),0_3px_8px_rgba(29,34,24,.04)]"
                    >
                      <div className="p-5">
                        <div className="flex items-start gap-3">
                          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-pine-6/10 text-pine-6 shrink-0 group-hover:bg-pine-6/20 transition-colors">
                            <MapTrifold className="w-4 h-4" weight="regular" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-[15px] font-sans font-semibold tracking-[-0.01em] text-ink truncate">
                              {loc.name}
                            </h3>
                            {loc.address && (
                              <p className="text-[13px] text-ink-3 mt-1 truncate">{loc.address}</p>
                            )}
                          </div>
                          <div className="relative shrink-0 h-8 min-w-[32px] flex items-start justify-end">
                            {loc.savedAt && (
                              <span className="text-[10px] font-mono uppercase tracking-[0.10em] text-ink-3 mt-1 whitespace-nowrap group-hover:opacity-0 transition-opacity">
                                {formatRelative(loc.savedAt)}
                              </span>
                            )}
                            <button
                              onClick={(e) => handleRemoveClick(e, loc.id, loc.name)}
                              className="absolute top-0 right-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 opacity-0 group-hover:opacity-100 transition-all"
                              aria-label={`Remove ${loc.name}`}
                            >
                              <Trash className="w-4 h-4" weight="regular" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full border bg-pine-6/10 text-pine-6 border-pine-6/40 text-[10px] font-mono font-semibold uppercase tracking-[0.10em]">
                            Region
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCopyCoords(loc.id, fmtCoords(loc.lat, loc.lng));
                            }}
                            title="Copy coordinates — paste into Google Maps to open"
                            className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.10em] text-ink-3 hover:text-ink transition-colors"
                          >
                            {copiedId === loc.id ? (
                              <CheckCircle size={13} weight="fill" className="text-pine-6" />
                            ) : (
                              <Copy size={11} weight="regular" />
                            )}
                            {fmtCoords(loc.lat, loc.lng)}
                          </button>
                        </div>
                      </div>
                    </Link>
                  );
                }

                // Standard spot/place card
                return (
                  <Link
                    key={loc.id}
                    to={linkTo}
                    state={linkState}
                    className="group block border border-line dark:border-line-2 bg-white dark:bg-ink-pine rounded-[14px] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(29,34,24,.10),0_3px_8px_rgba(29,34,24,.04)]"
                  >
                    <div className="p-5">
                      <div className="flex items-start gap-3">
                        {/* Icon area — clay (warm accent), consistent across all cards */}
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-clay/15 text-clay shrink-0 group-hover:bg-clay/25 transition-colors">
                          <MapPin className="w-4 h-4" weight="fill" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[15px] font-sans font-semibold tracking-[-0.01em] text-ink truncate">
                            {loc.name}
                          </h3>
                          <p className="text-[13px] text-ink-3 mt-1 truncate">{loc.address}</p>
                        </div>
                        {/* Right slot — saved-time meta by default, trash on hover (they swap) */}
                        <div className="relative shrink-0 h-8 min-w-[32px] flex items-start justify-end">
                          {loc.savedAt && (
                            <span className="text-[10px] font-mono uppercase tracking-[0.10em] text-ink-3 mt-1 whitespace-nowrap group-hover:opacity-0 transition-opacity">
                              {formatRelative(loc.savedAt)}
                            </span>
                          )}
                          <button
                            onClick={(e) => handleRemoveClick(e, loc.id, loc.name)}
                            className="absolute top-0 right-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 opacity-0 group-hover:opacity-100 transition-all"
                            aria-label={`Remove ${loc.name}`}
                          >
                            <Trash className="w-4 h-4" weight="regular" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        {/* Type badge — water (cool accent), pairs with the warm icon */}
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full border bg-water/12 text-water border-water/40 text-[10px] font-mono font-semibold uppercase tracking-[0.10em]">
                          {loc.type || 'Place'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCopyCoords(loc.id, fmtCoords(loc.lat, loc.lng));
                          }}
                          title="Copy coordinates — paste into Google Maps to open"
                          className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.10em] text-ink-3 hover:text-ink transition-colors"
                        >
                          {copiedId === loc.id ? (
                            <CheckCircle size={13} weight="fill" className="text-pine-6" />
                          ) : (
                            <Copy size={11} weight="regular" />
                          )}
                          {fmtCoords(loc.lat, loc.lng)}
                        </button>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-cream dark:bg-paper-2 border-t border-line px-6 md:px-14 py-10 flex flex-wrap items-center justify-between gap-4">
        <Mono>ROAMSWILD · OFF-GRID CAMPING · 2026</Mono>
        <div className="flex flex-wrap gap-6 text-[13px] text-ink-3">
          <Link to="/about" className="hover:text-ink transition-colors">Field notes</Link>
          <Link to="/how-we-map" className="hover:text-ink transition-colors">How we map</Link>
          <Link to="/submit-spot" className="hover:text-ink transition-colors">Submit a spot</Link>
          <Link to="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
        </div>
      </footer>

      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', name: '' })}
        onConfirm={handleConfirmDelete}
        title="Remove location"
        description="Are you sure you want to remove this favorite location?"
        itemName={deleteModal.name}
      />
    </div>
  );
};

export default SavedLocations;
