import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus,
  Tent,
  MapPin,
  Trash,
  CaretRight,
  SpinnerGap,
  Export,
  UploadSimple,
  Globe,
  Lock,
  Car,
  MagnifyingGlass,
  Tag as TagIcon,
  X,
  NoteBlank,
  Users,
  CheckCircle,
  Compass,
  SortAscending,
} from '@phosphor-icons/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GoogleMap } from '@/components/GoogleMap';
import { MapControls } from '@/components/MapControls';
import { CampsiteClusterer } from '@/components/CampsiteClusterer';
import { useCampsites } from '@/context/CampsitesContext';
import { useFriends } from '@/context/FriendsContext';
import { toast } from 'sonner';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { Campsite, CampsiteType, CampsiteVisibility } from '@/types/campsite';
import { AddCampsiteModal } from '@/components/AddCampsiteModal';
import { ImportCampsitesModal } from '@/components/ImportCampsitesModal';
import { Header } from '@/components/Header';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

const typeLabels: Record<CampsiteType, string> = {
  dispersed: 'Dispersed',
  established: 'Established',
  blm: 'BLM',
  usfs: 'USFS',
  private: 'Private',
};

const roadAccessLabels: Record<string, string> = {
  '2wd': '2WD',
  '4wd_easy': '4WD Easy',
  '4wd_moderate': '4WD Moderate',
  '4wd_hard': '4WD Hard',
};

type Tab = 'mine' | 'friends' | 'explorer' | 'public';

const Campsites = () => {
  const navigate = useNavigate();
  const {
    campsites,
    publicCampsites,
    friendsCampsites,
    isLoading,
    deleteCampsite,
    exportToGeoJSON,
    fetchPublicCampsites,
  } = useCampsites();
  const { getFriendById } = useFriends();

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string; name: string }>({
    isOpen: false,
    id: '',
    name: '',
  });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('mine');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<CampsiteType | 'all'>('all');
  const [filterVisibility, setFilterVisibility] = useState<CampsiteVisibility | 'all'>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterHasNotes, setFilterHasNotes] = useState(false);
  const [selectedCampsiteId, setSelectedCampsiteId] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if ((tab === 'explorer' || tab === 'public') && publicCampsites.length === 0) {
      fetchPublicCampsites();
    }
  };

  // Explorer spots = user's own + public confirmed explorer-source spots.
  const explorerSpots = useMemo(() => {
    const userExplorerSpots = campsites.filter((c) => c.sourceType === 'explorer');
    const publicExplorerSpots = publicCampsites.filter((c) => c.sourceType === 'explorer' && c.isConfirmed);
    const seen = new Set(userExplorerSpots.map((c) => c.id));
    const combined = [...userExplorerSpots];
    publicExplorerSpots.forEach((c) => {
      if (!seen.has(c.id)) combined.push(c);
    });
    return combined;
  }, [campsites, publicCampsites]);

  const getListForTab = (): Campsite[] => {
    switch (activeTab) {
      case 'mine':     return campsites;
      case 'friends':  return friendsCampsites;
      case 'explorer': return explorerSpots;
      case 'public':   return publicCampsites;
      default:         return campsites;
    }
  };

  const availableStates = useMemo(() => {
    const list = getListForTab();
    const states = new Set<string>();
    list.forEach((c) => { if (c.state) states.add(c.state); });
    return Array.from(states).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campsites, publicCampsites, friendsCampsites, explorerSpots, activeTab]);

  const availableTags = useMemo(() => {
    const list = getListForTab();
    const tags = new Set<string>();
    list.forEach((c) => c.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campsites, publicCampsites, friendsCampsites, explorerSpots, activeTab]);

  const displayedCampsites = useMemo(() => {
    let list = getListForTab();

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
    }
    if (filterType !== 'all') list = list.filter((c) => c.type === filterType);
    if (activeTab === 'mine' && filterVisibility !== 'all') list = list.filter((c) => c.visibility === filterVisibility);
    if (filterState !== 'all') list = list.filter((c) => c.state === filterState);
    if (filterTags.length > 0) list = list.filter((c) => c.tags?.some((tag) => filterTags.includes(tag)));
    if (filterHasNotes) {
      list = list.filter((c) =>
        (c.notes && c.notes.trim().length > 0) || (c.description && c.description.trim().length > 0),
      );
    }

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':  return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'oldest':    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'newest':
        default:          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campsites, publicCampsites, friendsCampsites, activeTab, searchQuery, filterType, filterVisibility, filterState, filterTags, filterHasNotes, sortBy]);

  const mapCenter = useMemo(() => {
    if (displayedCampsites.length === 0) return { lat: 39.8283, lng: -98.5795 };
    const avgLat = displayedCampsites.reduce((sum, c) => sum + c.lat, 0) / displayedCampsites.length;
    const avgLng = displayedCampsites.reduce((sum, c) => sum + c.lng, 0) / displayedCampsites.length;
    return { lat: avgLat, lng: avgLng };
  }, [displayedCampsites]);

  const handleDeleteClick = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setDeleteModal({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const success = await deleteCampsite(deleteModal.id);
    if (success) toast.success(`Deleted "${deleteModal.name}"`);
    else toast.error('Failed to delete campsite');
    setDeleteModal({ isOpen: false, id: '', name: '' });
  };

  const handleExport = () => {
    const geoJSON = exportToGeoJSON();
    const blob = new Blob([geoJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campsites.geojson';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Campsites exported');
  };

  const toggleTag = (tag: string) =>
    setFilterTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  // Tabs config — drives both render and accent color of the count badge.
  const tabs: Array<{ key: Tab; label: string; Icon?: typeof Tent; count?: number; badgeAccent?: 'pine' | 'sage' }> = [
    { key: 'mine',     label: 'My spots',  count: campsites.length },
    { key: 'friends',  label: 'Friends',   Icon: Users,    count: friendsCampsites.length, badgeAccent: 'sage' },
    { key: 'explorer', label: 'Explorer',  Icon: Compass,  count: explorerSpots.length,    badgeAccent: 'pine' },
    { key: 'public',   label: 'Public' },
  ];

  return (
    <div className="bg-paper text-ink font-sans min-h-screen">
      <Header showBorder />

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map — sticky on lg, hidden on mobile */}
          <div className="hidden lg:block h-[calc(100vh-80px)] sticky top-[80px] relative">
            <GoogleMap
              center={mapCenter}
              zoom={displayedCampsites.length === 1 ? 12 : 5}
              className="w-full h-full"
              onLoad={onMapLoad}
              options={{ mapTypeId: 'hybrid' }}
              mapControls={false}
            >
              <CampsiteClusterer
                map={mapRef.current}
                campsites={displayedCampsites}
                onCampsiteClick={(campsite) => {
                  setSelectedCampsiteId(campsite.id);
                  navigate(`/campsites/${campsite.id}`);
                }}
                selectedCampsiteId={selectedCampsiteId}
              />
            </GoogleMap>
            {/* Zoom controls — bottom-right. The wrapper's auto-controls
                live top-right; mapControls={false} disables those so the
                explicit ones below can take over. */}
            <div className="absolute bottom-3 right-3 z-10">
              <MapControls map={mapRef.current} showZoom />
            </div>
          </div>

          {/* List section */}
          <div className="bg-paper lg:h-[calc(100vh-80px)] lg:overflow-y-auto">
            <div className="px-5 py-6 space-y-5">
              {/* Page intro card — same pattern as the trip detail "Your trip" header */}
              <div className="bg-white dark:bg-paper-2 border border-line rounded-[14px] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Mono className="text-pine-6">My campsites</Mono>
                    <h1 className="text-[28px] font-sans font-bold tracking-[-0.025em] text-ink leading-[1.1] mt-1">
                      Campsites.
                    </h1>
                    <Mono className="text-ink-3 block mt-2">
                      {campsites.length} {campsites.length === 1 ? 'saved' : 'saved'}
                    </Mono>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Pill variant="ghost" sm mono={false} onClick={() => setImportModalOpen(true)}>
                      <UploadSimple className="w-3.5 h-3.5" weight="regular" />
                      Import
                    </Pill>
                    {campsites.length > 0 && (
                      <Pill variant="ghost" sm mono={false} onClick={handleExport}>
                        <Export className="w-3.5 h-3.5" weight="regular" />
                        Export
                      </Pill>
                    )}
                    <Pill variant="solid-pine" sm mono={false} onClick={() => setAddModalOpen(true)}>
                      <Plus className="w-3.5 h-3.5" weight="bold" />
                      Add
                    </Pill>
                  </div>
                </div>
              </div>

              {/* Tabs — same pill pattern as nav (active = solid ink) */}
              <div className="flex flex-wrap items-center gap-1.5">
                {tabs.map(({ key, label, Icon, count, badgeAccent }) => {
                  const active = activeTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleTabChange(key)}
                      className={cn(
                        'inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-sans font-semibold tracking-[-0.005em] transition-colors',
                        active ? 'bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2' : 'text-ink hover:bg-ink/5',
                      )}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5" weight="regular" />}
                      {label}
                      {count != null && count > 0 && (
                        <span className={cn(
                          'ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-[0.05em]',
                          active
                            ? 'bg-cream/20 dark:bg-paper-2/20 text-cream'
                            : badgeAccent === 'sage'
                              ? 'bg-sage/15 text-sage'
                              : badgeAccent === 'pine'
                                ? 'bg-pine-6/12 text-pine-6'
                                : 'bg-ink/10 text-ink-3',
                        )}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search + filter row */}
              <div className="space-y-3">
                <div className="relative">
                  <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" weight="regular" />
                  <input
                    placeholder="Search campsites…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-[14px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <FilterSelect value={filterType} onChange={(v) => setFilterType(v as CampsiteType | 'all')} placeholder="All types">
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="dispersed">Dispersed</SelectItem>
                    <SelectItem value="established">Established</SelectItem>
                    <SelectItem value="blm">BLM</SelectItem>
                    <SelectItem value="usfs">USFS</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </FilterSelect>

                  {activeTab === 'mine' && (
                    <FilterSelect
                      value={filterVisibility}
                      onChange={(v) => setFilterVisibility(v as CampsiteVisibility | 'all')}
                      placeholder="All visibility"
                    >
                      <SelectItem value="all">All visibility</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="friends">Friends</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </FilterSelect>
                  )}

                  {availableStates.length > 0 && (
                    <FilterSelect value={filterState} onChange={setFilterState} placeholder="All states">
                      <SelectItem value="all">All states</SelectItem>
                      {availableStates.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </FilterSelect>
                  )}

                  <FilterSelect
                    value={sortBy}
                    onChange={(v) => setSortBy(v as typeof sortBy)}
                    placeholder="Sort"
                    leadingIcon={SortAscending}
                  >
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z–A)</SelectItem>
                  </FilterSelect>

                  <button
                    onClick={() => setFilterHasNotes(!filterHasNotes)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-mono uppercase tracking-[0.10em] font-semibold transition-colors',
                      filterHasNotes
                        ? 'bg-pine-6 border-pine-6 text-cream dark:text-ink-pine'
                        : 'bg-white dark:bg-paper-2 border-line text-ink-3 hover:text-ink hover:border-ink-3',
                    )}
                  >
                    <NoteBlank className="w-3 h-3" weight="regular" />
                    Notes
                  </button>
                </div>

                {/* Tag pills */}
                {availableTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Mono className="text-ink-3 mr-0.5">Tags</Mono>
                    {availableTags.map((tag) => {
                      const on = filterTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={cn(
                            'inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-mono uppercase tracking-[0.10em] font-semibold transition-colors',
                            on
                              ? 'bg-pine-6 border-pine-6 text-cream dark:text-ink-pine'
                              : 'bg-white dark:bg-paper-2 border-line text-ink-3 hover:text-ink hover:border-ink-3',
                          )}
                        >
                          {tag}
                        </button>
                      );
                    })}
                    {filterTags.length > 0 && (
                      <button
                        onClick={() => setFilterTags([])}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-ink-3 hover:text-ember transition-colors"
                      >
                        <X className="w-3 h-3" weight="bold" />
                        Clear
                      </button>
                    )}
                  </div>
                )}

                <Mono className="text-ink-3 block">
                  {displayedCampsites.length} {displayedCampsites.length === 1 ? 'result' : 'results'}
                </Mono>
              </div>

              {/* Results */}
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10 mb-4">
                    <SpinnerGap className="w-6 h-6 text-pine-6 animate-spin" />
                  </div>
                  <Mono className="text-pine-6">Loading campsites…</Mono>
                </div>
              ) : activeTab === 'mine' && campsites.length === 0 ? (
                <div className="border border-dashed border-line bg-white/50 rounded-[18px] px-8 py-14 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6 mb-4">
                    <Tent className="w-5 h-5" weight="regular" />
                  </div>
                  <h2 className="font-sans font-semibold text-xl tracking-[-0.01em] text-ink">
                    No campsites yet
                  </h2>
                  <p className="text-[14px] text-ink-3 mt-2 max-w-[460px] mx-auto leading-[1.55]">
                    Add your favorite camping spots to build your personal database. Import from Google Maps or add locations manually.
                  </p>
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <Pill variant="ghost" mono={false} onClick={() => setImportModalOpen(true)}>
                      <UploadSimple className="w-3.5 h-3.5" weight="regular" />
                      Import
                    </Pill>
                    <Pill variant="solid-pine" mono={false} onClick={() => setAddModalOpen(true)}>
                      <Plus className="w-3.5 h-3.5" weight="bold" />
                      Add campsite
                    </Pill>
                  </div>
                </div>
              ) : displayedCampsites.length === 0 ? (
                <div className="border border-dashed border-line bg-white/50 rounded-[14px] px-6 py-10 text-center">
                  <p className="text-[14px] font-sans font-semibold text-ink">No matches</p>
                  <p className="text-[13px] text-ink-3 mt-1">Try loosening or removing a filter.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedCampsites.map((campsite) => (
                    <CampsiteRow
                      key={campsite.id}
                      campsite={campsite}
                      activeTab={activeTab}
                      friendName={
                        getFriendById(campsite.userId)?.name ||
                        getFriendById(campsite.userId)?.email ||
                        'Friend'
                      }
                      onClick={() => navigate(`/campsites/${campsite.id}`)}
                      onDelete={(e) => handleDeleteClick(e, campsite.id, campsite.name)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

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

      {/* Modals */}
      <AddCampsiteModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} />
      <ImportCampsitesModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', name: '' })}
        onConfirm={handleConfirmDelete}
        title="Remove from your sites"
        description="Remove this campsite from your saved sites?"
        itemName={deleteModal.name}
        helperText="This removes it from your collection only. The original spot stays in the explorer and you can save it again anytime."
        confirmLabel="Remove"
      />
    </div>
  );
};

// === Helpers ===

// Pill-shaped Select wrapper — keeps the filter row visually consistent with
// the rest of the redesign (no shadcn "border-2 border-primary" trigger).
const FilterSelect = ({
  value,
  onChange,
  placeholder,
  leadingIcon: LeadingIcon,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  leadingIcon?: typeof SortAscending;
  children: React.ReactNode;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="inline-flex items-center gap-1.5 h-8 w-auto px-3 py-1.5 rounded-full border border-line bg-white dark:bg-paper-2 text-ink text-[12px] font-mono uppercase tracking-[0.10em] font-semibold hover:border-ink-3 transition-colors [&>svg]:opacity-60">
      {LeadingIcon && <LeadingIcon className="w-3 h-3 text-ink-3" weight="regular" />}
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent className="rounded-[12px] border-line bg-white [&_[data-highlighted]]:bg-cream dark:bg-paper-2 [&_[data-highlighted]]:text-ink">
      {children}
    </SelectContent>
  </Select>
);

// Single campsite row — same row pattern as the redesigned MyTrips, but with
// campsite-specific badges (visibility, type, source, road access).
const CampsiteRow = ({
  campsite,
  activeTab,
  friendName,
  onClick,
  onDelete,
}: {
  campsite: Campsite;
  activeTab: Tab;
  friendName: string;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) => {
  const isPublic = campsite.visibility === 'public';

  return (
    <div
      onClick={onClick}
      className="group border border-line bg-white dark:bg-paper-2 rounded-[14px] overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(29,34,24,.10),0_3px_8px_rgba(29,34,24,.04)]"
    >
      <div className="flex items-stretch">
        {/* Left accent bar — pine for public, ink-3 for private */}
        <div className={cn('w-1.5', isPublic ? 'bg-pine-6' : 'bg-ink-3/30')} />

        <div className="flex-1 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Title + visibility icon */}
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
                  {campsite.name}
                </h3>
                {isPublic ? (
                  <Globe className="w-3.5 h-3.5 text-pine-6 flex-shrink-0" weight="regular" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" weight="regular" />
                )}
              </div>

              {/* Badge row */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <BadgePill variant="ghost">{typeLabels[campsite.type]}</BadgePill>
                {activeTab === 'friends' && (
                  <BadgePill variant="sage">
                    <Users className="w-3 h-3" weight="regular" />
                    {friendName}
                  </BadgePill>
                )}
                {campsite.sourceType === 'explorer' && (
                  <BadgePill variant="pine">
                    <Compass className="w-3 h-3" weight="regular" />
                    Explorer
                  </BadgePill>
                )}
                {campsite.sourceType === 'explorer' && campsite.confirmationCount > 0 && (
                  <BadgePill variant={campsite.isConfirmed ? 'pine' : 'clay'}>
                    {campsite.isConfirmed ? (
                      <CheckCircle className="w-3 h-3" weight="fill" />
                    ) : (
                      <Users className="w-3 h-3" weight="regular" />
                    )}
                    {campsite.confirmationCount} {campsite.isConfirmed ? 'verified' : 'pending'}
                  </BadgePill>
                )}
                {campsite.roadAccess && (
                  <BadgePill variant="ghost">
                    <Car className="w-3 h-3" weight="regular" />
                    {roadAccessLabels[campsite.roadAccess] || campsite.roadAccess}
                  </BadgePill>
                )}
              </div>

              {/* Location */}
              <div className="flex items-center gap-1.5 mt-2 text-[13px] text-ink-3">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" weight="regular" />
                <span>{campsite.state || `${campsite.lat.toFixed(4)}, ${campsite.lng.toFixed(4)}`}</span>
              </div>

              {/* Description preview */}
              {campsite.description && (
                <p className="mt-2 text-[13px] text-ink-3 line-clamp-1">{campsite.description}</p>
              )}

              {/* Tags */}
              {campsite.tags && campsite.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  {campsite.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pine-6/10 text-pine-6 text-[10px] font-mono font-semibold uppercase tracking-[0.10em]"
                    >
                      <TagIcon className="w-3 h-3" weight="regular" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {activeTab === 'mine' && (
                <button
                  onClick={onDelete}
                  className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-all"
                  aria-label="Delete campsite"
                >
                  <Trash className="w-4 h-4" weight="regular" />
                </button>
              )}
              <CaretRight className="w-4 h-4 text-ink-3 group-hover:text-pine-6 group-hover:translate-x-0.5 transition-all" weight="bold" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Small badge pill for the row meta line. Shared variant set with the rest
// of the redesign so colors stay aligned.
const BadgePill = ({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: 'pine' | 'sage' | 'clay' | 'ghost';
}) => {
  const styles =
    variant === 'pine'  ? 'bg-pine-6/10 text-pine-6 border-pine-6/30' :
    variant === 'sage'  ? 'bg-sage/15  text-sage   border-sage/30' :
    variant === 'clay'  ? 'bg-clay/15  text-clay   border-clay/40' :
                          'bg-cream dark:bg-paper-2    text-ink-3  border-line';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold uppercase tracking-[0.10em]', styles)}>
      {children}
    </span>
  );
};

export default Campsites;
