import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  SortAscending,
  MagnifyingGlass,
  Tag,
  X,
  NoteBlank,
  Users,
  CheckCircle,
  Compass,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GoogleMap } from '@/components/GoogleMap';
import { Marker } from '@react-google-maps/api';
import { useCampsites } from '@/context/CampsitesContext';
import { useFriends } from '@/context/FriendsContext';
import { toast } from 'sonner';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { Campsite, CampsiteType, CampsiteVisibility } from '@/types/campsite';
import { AddCampsiteModal } from '@/components/AddCampsiteModal';
import { ImportCampsitesModal } from '@/components/ImportCampsitesModal';
import { createMarkerIcon } from '@/utils/mapMarkers';
import { Header } from '@/components/Header';

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

const sourceTypeLabels: Record<string, string> = {
  manual: 'Added',
  explorer: 'Explorer',
};

const Campsites = () => {
  const navigate = useNavigate();
  const { campsites, publicCampsites, friendsCampsites, isLoading, deleteCampsite, exportToGeoJSON, fetchPublicCampsites } = useCampsites();
  const { getFriendById } = useFriends();

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string; name: string }>({
    isOpen: false,
    id: '',
    name: '',
  });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'mine' | 'friends' | 'explorer' | 'public'>('mine');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<CampsiteType | 'all'>('all');
  const [filterVisibility, setFilterVisibility] = useState<CampsiteVisibility | 'all'>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterHasNotes, setFilterHasNotes] = useState(false);
  const [selectedCampsiteId, setSelectedCampsiteId] = useState<string | null>(null);

  // Load public campsites when switching tabs
  const handleTabChange = (tab: 'mine' | 'friends' | 'explorer' | 'public') => {
    setActiveTab(tab);
    if ((tab === 'explorer' || tab === 'public') && publicCampsites.length === 0) {
      fetchPublicCampsites();
    }
  };

  // Filter campsites for each tab
  const explorerSpots = useMemo(() => {
    // Explorer spots are confirmed spots from the dispersed explorer (source_type = 'explorer')
    // Combine user's explorer spots with public confirmed explorer spots
    const userExplorerSpots = campsites.filter(c => c.sourceType === 'explorer');
    const publicExplorerSpots = publicCampsites.filter(c => c.sourceType === 'explorer' && c.isConfirmed);
    // Dedupe by id
    const seen = new Set(userExplorerSpots.map(c => c.id));
    const combined = [...userExplorerSpots];
    publicExplorerSpots.forEach(c => {
      if (!seen.has(c.id)) {
        combined.push(c);
      }
    });
    return combined;
  }, [campsites, publicCampsites]);

  // Get the correct list based on active tab
  const getListForTab = () => {
    switch (activeTab) {
      case 'mine':
        return campsites;
      case 'friends':
        return friendsCampsites;
      case 'explorer':
        return explorerSpots;
      case 'public':
        return publicCampsites;
      default:
        return campsites;
    }
  };

  // Get unique states for filter dropdown
  const availableStates = useMemo(() => {
    const list = getListForTab();
    const states = new Set<string>();
    list.forEach(c => {
      if (c.state) states.add(c.state);
    });
    return Array.from(states).sort();
  }, [campsites, publicCampsites, friendsCampsites, explorerSpots, activeTab]);

  // Get unique tags for filter pills
  const availableTags = useMemo(() => {
    const list = getListForTab();
    const tags = new Set<string>();
    list.forEach(c => {
      c.tags?.forEach(t => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [campsites, publicCampsites, friendsCampsites, explorerSpots, activeTab]);

  // Filter and sort campsites
  const displayedCampsites = useMemo(() => {
    let list = getListForTab();

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (filterType !== 'all') {
      list = list.filter(c => c.type === filterType);
    }

    // Filter by visibility (only for "mine" tab)
    if (activeTab === 'mine' && filterVisibility !== 'all') {
      list = list.filter(c => c.visibility === filterVisibility);
    }

    // Filter by state
    if (filterState !== 'all') {
      list = list.filter(c => c.state === filterState);
    }

    // Filter by tags (show campsites that have ANY of the selected tags)
    if (filterTags.length > 0) {
      list = list.filter(c =>
        c.tags?.some(tag => filterTags.includes(tag))
      );
    }

    // Filter by has notes (check both notes and description fields)
    if (filterHasNotes) {
      list = list.filter(c =>
        (c.notes && c.notes.trim().length > 0) ||
        (c.description && c.description.trim().length > 0)
      );
    }

    // Sort
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [campsites, publicCampsites, friendsCampsites, activeTab, searchQuery, filterType, filterVisibility, filterState, filterTags, filterHasNotes, sortBy]);

  // Calculate map center based on displayed campsites
  const mapCenter = useMemo(() => {
    if (displayedCampsites.length === 0) {
      return { lat: 39.8283, lng: -98.5795 }; // Center of US
    }
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
    if (success) {
      toast.success(`Deleted "${deleteModal.name}"`);
    } else {
      toast.error('Failed to delete campsite');
    }
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

  const handleCampsiteClick = (campsite: Campsite) => {
    navigate(`/campsites/${campsite.id}`);
  };

  const toggleTag = (tag: string) => {
    setFilterTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const clearTagFilters = () => {
    setFilterTags([]);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header showBorder />

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map Section */}
          <div className="hidden lg:block h-[calc(100vh-80px)] sticky top-[80px]">
            <GoogleMap
              center={mapCenter}
              zoom={displayedCampsites.length === 1 ? 12 : 5}
              className="w-full h-full"
            >
              {displayedCampsites.map((campsite) => (
                <Marker
                  key={campsite.id}
                  position={{ lat: campsite.lat, lng: campsite.lng }}
                  icon={createMarkerIcon('camp', {
                    size: selectedCampsiteId === campsite.id ? 48 : 36,
                  })}
                  onClick={() => {
                    setSelectedCampsiteId(campsite.id);
                    navigate(`/campsites/${campsite.id}`);
                  }}
                />
              ))}
            </GoogleMap>
          </div>

          {/* List Section */}
          <div className="p-6 lg:h-[calc(100vh-80px)] lg:overflow-y-auto">
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-display font-bold text-foreground">Campsites</h1>
                <p className="text-muted-foreground mt-1">
                  {campsites.length} {campsites.length === 1 ? 'campsite' : 'campsites'} saved
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setImportModalOpen(true)}>
                  <UploadSimple className="w-4 h-4 mr-1" weight="bold" />
                  Import
                </Button>
                {campsites.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleExport}>
                    <Export className="w-4 h-4 mr-1" weight="bold" />
                    Export
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={() => setAddModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" weight="bold" />
                  Add
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg mb-6 w-fit">
              <button
                onClick={() => handleTabChange('mine')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'mine'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                My Spots
              </button>
              <button
                onClick={() => handleTabChange('friends')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'friends'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Users className="w-4 h-4" />
                Friends
                {friendsCampsites.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 text-xs rounded-full">
                    {friendsCampsites.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleTabChange('explorer')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'explorer'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Compass className="w-4 h-4" />
                Explorer
                {explorerSpots.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                    {explorerSpots.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleTabChange('public')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'public'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Public
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-16">
                <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
                  <SpinnerGap className="w-10 h-10 text-primary animate-spin" />
                </div>
                <h2 className="text-xl font-display font-medium text-muted-foreground">
                  Loading campsites...
                </h2>
              </div>
            ) : activeTab === 'mine' && campsites.length === 0 ? (
              <div className="text-center py-16">
                <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
                  <Tent className="w-10 h-10 text-muted-foreground" />
                </div>
                <h2 className="font-display font-bold text-foreground mb-2">
                  No campsites yet
                </h2>
                <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                  Add your favorite camping spots to build your personal database.
                  Import from Google Maps or add locations manually.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="secondary" size="lg" onClick={() => setImportModalOpen(true)}>
                    <UploadSimple className="w-5 h-5 mr-2" weight="bold" />
                    Import from Google
                  </Button>
                  <Button variant="primary" size="lg" onClick={() => setAddModalOpen(true)}>
                    <Plus className="w-5 h-5 mr-2" weight="bold" />
                    Add Campsite
                  </Button>
                </div>
              </div>
            ) : (
          <div className="space-y-4">
            {/* Filters */}
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search campsites..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>

              {/* Filter Row */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={filterType} onValueChange={(v) => setFilterType(v as CampsiteType | 'all')}>
                    <SelectTrigger className="w-[120px] h-8 text-sm">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="dispersed">Dispersed</SelectItem>
                      <SelectItem value="established">Established</SelectItem>
                      <SelectItem value="blm">BLM</SelectItem>
                      <SelectItem value="usfs">USFS</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {activeTab === 'mine' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Visibility</Label>
                    <Select value={filterVisibility} onValueChange={(v) => setFilterVisibility(v as CampsiteVisibility | 'all')}>
                      <SelectTrigger className="w-[110px] h-8 text-sm">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="friends">Friends</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {availableStates.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">State</Label>
                    <Select value={filterState} onValueChange={setFilterState}>
                      <SelectTrigger className="w-[100px] h-8 text-sm">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {availableStates.map((state) => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Sort</Label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                    <SelectTrigger className="w-[130px] h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="oldest">Oldest</SelectItem>
                      <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                      <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <button
                  onClick={() => setFilterHasNotes(!filterHasNotes)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors h-8 ${
                    filterHasNotes
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground hover:bg-secondary/80'
                  }`}
                >
                  <NoteBlank className="w-3.5 h-3.5" />
                  Notes
                </button>
              </div>
            </div>

            {/* Tag filter pills */}
            {availableTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground mr-1">Tags:</span>
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      filterTags.includes(tag)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {filterTags.length > 0 && (
                  <button
                    onClick={clearTagFilters}
                    className="px-1.5 py-0.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Results count */}
            <p className="text-xs text-muted-foreground">
              Showing {displayedCampsites.length} {displayedCampsites.length === 1 ? 'result' : 'results'}
            </p>

            {/* Campsite list */}
            {displayedCampsites.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No campsites match your filters
              </div>
            ) : (
              displayedCampsites.map((campsite, index) => (
                <Card
                  key={campsite.id}
                  className="group hover:border-primary/30 hover:shadow-card transition-all duration-300 cursor-pointer animate-fade-in overflow-hidden"
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => handleCampsiteClick(campsite)}
                >
                  <CardContent className="p-0">
                    <div className="flex items-stretch">
                      {/* Left accent bar */}
                      <div className={`w-1.5 ${
                        campsite.visibility === 'public' ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`} />

                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-display font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                {campsite.name}
                              </h3>
                              {campsite.visibility === 'public' ? (
                                <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                              ) : (
                                <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              )}
                            </div>

                            {/* Type and source badges */}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="inline-block px-2 py-0.5 bg-secondary rounded-full text-xs font-medium text-foreground">
                                {typeLabels[campsite.type]}
                              </span>
                              {activeTab === 'friends' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-medium">
                                  <Users className="w-3 h-3" />
                                  Shared by {getFriendById(campsite.userId)?.name || getFriendById(campsite.userId)?.email || 'Friend'}
                                </span>
                              )}
                              {campsite.sourceType === 'explorer' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                                  <Compass className="w-3 h-3" />
                                  Explorer
                                </span>
                              )}
                              {campsite.sourceType === 'explorer' && campsite.confirmationCount > 0 && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                  campsite.isConfirmed
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                }`}>
                                  {campsite.isConfirmed ? (
                                    <CheckCircle className="w-3 h-3" />
                                  ) : (
                                    <Users className="w-3 h-3" />
                                  )}
                                  {campsite.confirmationCount} {campsite.isConfirmed ? 'Verified' : 'Pending'}
                                </span>
                              )}
                              {campsite.roadAccess && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary rounded-full text-xs font-medium text-foreground">
                                  <Car className="w-3 h-3" />
                                  {roadAccessLabels[campsite.roadAccess] || campsite.roadAccess}
                                </span>
                              )}
                            </div>

                            {/* Location */}
                            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                              <MapPin className="w-4 h-4 flex-shrink-0" />
                              <span>
                                {campsite.state || `${campsite.lat.toFixed(4)}, ${campsite.lng.toFixed(4)}`}
                              </span>
                            </div>

                            {/* Description preview */}
                            {campsite.description && (
                              <p className="mt-2 text-sm text-muted-foreground line-clamp-1">
                                {campsite.description}
                              </p>
                            )}

                            {/* Tags */}
                            {campsite.tags && campsite.tags.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {campsite.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium"
                                  >
                                    <Tag className="w-3 h-3" />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            {activeTab === 'mine' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => handleDeleteClick(e, campsite.id, campsite.name)}
                              >
                                <Trash className="w-4 h-4" />
                              </Button>
                            )}
                            <CaretRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <AddCampsiteModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />

      <ImportCampsitesModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />

      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', name: '' })}
        onConfirm={handleConfirmDelete}
        title="Delete Campsite"
        description="Are you sure you want to delete this campsite? This action cannot be undone."
        itemName={deleteModal.name}
      />
    </div>
  );
};

export default Campsites;
