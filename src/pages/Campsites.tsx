import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
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
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCampsites } from '@/context/CampsitesContext';
import { toast } from 'sonner';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { Campsite, CampsiteType, CampsiteVisibility } from '@/types/campsite';
import { AddCampsiteModal } from '@/components/AddCampsiteModal';
import { ImportCampsitesModal } from '@/components/ImportCampsitesModal';

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

const Campsites = () => {
  const navigate = useNavigate();
  const { campsites, publicCampsites, isLoading, deleteCampsite, exportToGeoJSON, fetchPublicCampsites } = useCampsites();

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string; name: string }>({
    isOpen: false,
    id: '',
    name: '',
  });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'mine' | 'discover'>('mine');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<CampsiteType | 'all'>('all');
  const [filterVisibility, setFilterVisibility] = useState<CampsiteVisibility | 'all'>('all');

  // Load public campsites when switching to discover tab
  const handleTabChange = (tab: 'mine' | 'discover') => {
    setActiveTab(tab);
    if (tab === 'discover' && publicCampsites.length === 0) {
      fetchPublicCampsites();
    }
  };

  // Filter and sort campsites
  const displayedCampsites = useMemo(() => {
    let list = activeTab === 'mine' ? campsites : publicCampsites;

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
  }, [campsites, publicCampsites, activeTab, searchQuery, filterType, filterVisibility, sortBy]);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" weight="bold" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">Campsites</h1>
                <p className="text-sm text-muted-foreground">
                  {campsites.length} saved
                </p>
              </div>
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
                Add Campsite
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-8 max-w-4xl mx-auto">
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
            My Campsites
          </button>
          <button
            onClick={() => handleTabChange('discover')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'discover'
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Discover
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search campsites..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={filterType} onValueChange={(v) => setFilterType(v as CampsiteType | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
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

              {activeTab === 'mine' && (
                <Select value={filterVisibility} onValueChange={(v) => setFilterVisibility(v as CampsiteVisibility | 'all')}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              )}

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[160px] border-2 border-primary">
                  <div className="flex items-center gap-2">
                    <SortAscending className="w-4 h-4 text-muted-foreground" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                  <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results count */}
            <p className="text-sm text-muted-foreground">
              {displayedCampsites.length} {displayedCampsites.length === 1 ? 'campsite' : 'campsites'}
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

                            {/* Type badge */}
                            <div className="flex items-center gap-2 mt-2">
                              <span className="inline-block px-2 py-0.5 bg-secondary rounded-full text-xs font-medium text-foreground">
                                {typeLabels[campsite.type]}
                              </span>
                              {campsite.roadAccess && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary rounded-full text-xs font-medium text-foreground">
                                  <Car className="w-3 h-3" />
                                  {roadAccessLabels[campsite.roadAccess] || campsite.roadAccess}
                                </span>
                              )}
                            </div>

                            {/* Coordinates */}
                            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                              <MapPin className="w-4 h-4 flex-shrink-0" />
                              <span>
                                {campsite.lat.toFixed(5)}, {campsite.lng.toFixed(5)}
                              </span>
                            </div>

                            {/* Description preview */}
                            {campsite.description && (
                              <p className="mt-2 text-sm text-muted-foreground line-clamp-1">
                                {campsite.description}
                              </p>
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
