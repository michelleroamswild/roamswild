import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  NavigationArrow,
  Tent,
  Car,
  Drop,
  CurrencyDollar,
  CellSignalFull,
  Calendar,
  PencilSimple,
  Trash,
  Globe,
  Lock,
  Users,
  SpinnerGap,
  ArrowSquareOut,
  Check,
  X,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { GoogleMap } from '@/components/GoogleMap';
import { Marker } from '@react-google-maps/api';
import { useCampsites } from '@/context/CampsitesContext';
import { useAuth } from '@/context/AuthContext';
import { Campsite, CampsiteFormData, CampsiteType, RoadAccess, CampsiteVisibility } from '@/types/campsite';
import { toast } from 'sonner';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { createSimpleMarkerIcon } from '@/utils/mapMarkers';

const typeLabels: Record<CampsiteType, string> = {
  dispersed: 'Dispersed Camping',
  established: 'Established Campground',
  blm: 'BLM Land',
  usfs: 'US Forest Service',
  private: 'Private Property',
};

const roadAccessLabels: Record<RoadAccess, string> = {
  '2wd': '2WD - Paved/Graded Road',
  '4wd_easy': '4WD Easy - Dirt Roads',
  '4wd_moderate': '4WD Moderate - Some Obstacles',
  '4wd_hard': '4WD Hard - Technical Terrain',
};

const CampsiteDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getCampsite, updateCampsite, deleteCampsite } = useCampsites();

  const [campsite, setCampsite] = useState<Campsite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<CampsiteFormData>>({});

  useEffect(() => {
    const loadCampsite = async () => {
      if (!id) return;
      setIsLoading(true);
      const data = await getCampsite(id);
      setCampsite(data);
      setIsLoading(false);
    };
    loadCampsite();
  }, [id, getCampsite]);

  const isOwner = campsite && user && campsite.userId === user.id;

  const handleStartEdit = () => {
    if (!campsite) return;
    setEditForm({
      name: campsite.name,
      lat: campsite.lat,
      lng: campsite.lng,
      type: campsite.type,
      description: campsite.description,
      notes: campsite.notes,
      roadAccess: campsite.roadAccess,
      cellCoverage: campsite.cellCoverage,
      waterAvailable: campsite.waterAvailable,
      feeRequired: campsite.feeRequired,
      feeAmount: campsite.feeAmount,
      seasonalAccess: campsite.seasonalAccess,
      visibility: campsite.visibility,
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({});
  };

  const handleSave = async () => {
    if (!campsite || !id) return;

    setIsSaving(true);
    const success = await updateCampsite(id, editForm);
    setIsSaving(false);

    if (success) {
      // Refresh campsite data
      const updated = await getCampsite(id);
      setCampsite(updated);
      setIsEditing(false);
      toast.success('Campsite updated');
    } else {
      toast.error('Failed to update campsite');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const success = await deleteCampsite(id);
    if (success) {
      toast.success('Campsite deleted');
      navigate('/campsites');
    } else {
      toast.error('Failed to delete campsite');
    }
  };

  const handleGetDirections = () => {
    if (!campsite) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${campsite.lat},${campsite.lng}`,
      '_blank'
    );
  };

  const handleOpenInMaps = () => {
    if (!campsite) return;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${campsite.lat},${campsite.lng}`,
      '_blank'
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SpinnerGap className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!campsite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-display font-bold text-foreground mb-2">
            Campsite not found
          </h2>
          <p className="text-muted-foreground mb-4">
            This campsite doesn't exist or you don't have access to it.
          </p>
          <Link to="/campsites">
            <Button variant="primary">Back to Campsites</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/campsites">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" weight="bold" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">
                  {campsite.name}
                </h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{typeLabels[campsite.type]}</span>
                  <span>•</span>
                  {campsite.visibility === 'public' ? (
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Public
                    </span>
                  ) : campsite.visibility === 'friends' ? (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> Friends only
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Private
                    </span>
                  )}
                </div>
              </div>
            </div>
            {isOwner && !isEditing && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleStartEdit}>
                  <PencilSimple className="w-4 h-4 mr-1" weight="bold" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteModalOpen(true)}
                >
                  <Trash className="w-4 h-4 mr-1" weight="bold" />
                  Delete
                </Button>
              </div>
            )}
            {isEditing && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                  <X className="w-4 h-4 mr-1" weight="bold" />
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <SpinnerGap className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-1" weight="bold" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map Section */}
          <div className="order-2 lg:order-1 h-[400px] lg:h-[calc(100vh-73px)] lg:sticky lg:top-[73px]">
            <div className="relative w-full h-full">
              <GoogleMap
                center={{ lat: campsite.lat, lng: campsite.lng }}
                zoom={14}
                className="w-full h-full"
              >
                <Marker
                  position={{ lat: campsite.lat, lng: campsite.lng }}
                  icon={createSimpleMarkerIcon('camp', { size: 10 })}
                />
              </GoogleMap>
            </div>
          </div>

          {/* Info Panel */}
          <div className="order-1 lg:order-2 space-y-4 p-6 lg:h-[calc(100vh-73px)] lg:overflow-y-auto">
            {isEditing ? (
              /* Edit Form */
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Latitude</Label>
                      <Input
                        type="number"
                        step="any"
                        value={editForm.lat || ''}
                        onChange={(e) => setEditForm({ ...editForm, lat: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Longitude</Label>
                      <Input
                        type="number"
                        step="any"
                        value={editForm.lng || ''}
                        onChange={(e) => setEditForm({ ...editForm, lng: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={editForm.type}
                        onValueChange={(v) => setEditForm({ ...editForm, type: v as CampsiteType })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dispersed">Dispersed</SelectItem>
                          <SelectItem value="established">Established</SelectItem>
                          <SelectItem value="blm">BLM</SelectItem>
                          <SelectItem value="usfs">USFS</SelectItem>
                          <SelectItem value="private">Private</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Visibility</Label>
                      <Select
                        value={editForm.visibility}
                        onValueChange={(v) => setEditForm({ ...editForm, visibility: v as CampsiteVisibility })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="private">Private</SelectItem>
                          <SelectItem value="friends">Friends only</SelectItem>
                          <SelectItem value="public">Public</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Road Access</Label>
                    <Select
                      value={editForm.roadAccess || ''}
                      onValueChange={(v) => setEditForm({ ...editForm, roadAccess: v as RoadAccess })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2wd">2WD</SelectItem>
                        <SelectItem value="4wd_easy">4WD Easy</SelectItem>
                        <SelectItem value="4wd_moderate">4WD Moderate</SelectItem>
                        <SelectItem value="4wd_hard">4WD Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Cell Coverage</Label>
                    <Select
                      value={editForm.cellCoverage?.toString() || ''}
                      onValueChange={(v) => setEditForm({ ...editForm, cellCoverage: parseInt(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 - No signal</SelectItem>
                        <SelectItem value="1">1 - Very weak</SelectItem>
                        <SelectItem value="2">2 - Weak</SelectItem>
                        <SelectItem value="3">3 - Moderate</SelectItem>
                        <SelectItem value="4">4 - Good</SelectItem>
                        <SelectItem value="5">5 - Excellent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Water Available</Label>
                    <Switch
                      checked={editForm.waterAvailable || false}
                      onCheckedChange={(v) => setEditForm({ ...editForm, waterAvailable: v })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Fee Required</Label>
                    <Switch
                      checked={editForm.feeRequired || false}
                      onCheckedChange={(v) => setEditForm({ ...editForm, feeRequired: v })}
                    />
                  </div>

                  {editForm.feeRequired && (
                    <div className="space-y-2">
                      <Label>Fee Amount</Label>
                      <Input
                        value={editForm.feeAmount || ''}
                        onChange={(e) => setEditForm({ ...editForm, feeAmount: e.target.value })}
                        placeholder="e.g. $10/night"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Seasonal Access</Label>
                    <Input
                      value={editForm.seasonalAccess || ''}
                      onChange={(e) => setEditForm({ ...editForm, seasonalAccess: e.target.value })}
                      placeholder="e.g. Year-round"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Private Notes</Label>
                    <Textarea
                      value={editForm.notes || ''}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={2}
                      placeholder="Personal notes..."
                    />
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* View Mode */
              <>
                {/* Location */}
                <Card className="bg-gradient-card">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-14 h-14 bg-primary/10 rounded-xl">
                        <Tent className="w-7 h-7 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-xl font-display font-bold text-foreground">
                          {campsite.name}
                        </h2>
                        <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                          <MapPin className="w-4 h-4" />
                          <span className="text-sm">
                            {campsite.state && `${campsite.state} · `}
                            {campsite.lat.toFixed(6)}, {campsite.lng.toFixed(6)}
                          </span>
                        </div>
                        <span className="inline-block mt-2 px-3 py-1 bg-secondary rounded-full text-sm text-foreground">
                          {typeLabels[campsite.type]}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Description */}
                {campsite.description && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold text-foreground mb-2">Description</h3>
                      <p className="text-muted-foreground">{campsite.description}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Details */}
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-semibold text-foreground">Details</h3>

                    {campsite.roadAccess && (
                      <div className="flex items-center gap-3">
                        <Car className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Road Access</p>
                          <p className="text-sm text-muted-foreground">
                            {roadAccessLabels[campsite.roadAccess]}
                          </p>
                        </div>
                      </div>
                    )}

                    {campsite.cellCoverage !== undefined && (
                      <div className="flex items-center gap-3">
                        <CellSignalFull className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Cell Coverage</p>
                          <p className="text-sm text-muted-foreground">
                            {campsite.cellCoverage}/5 bars
                          </p>
                        </div>
                      </div>
                    )}

                    {campsite.waterAvailable !== undefined && (
                      <div className="flex items-center gap-3">
                        <Drop className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Water</p>
                          <p className="text-sm text-muted-foreground">
                            {campsite.waterAvailable ? 'Available' : 'Not available'}
                          </p>
                        </div>
                      </div>
                    )}

                    {(campsite.feeRequired || campsite.feeAmount) && (
                      <div className="flex items-center gap-3">
                        <CurrencyDollar className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Fee</p>
                          <p className="text-sm text-muted-foreground">
                            {campsite.feeAmount || (campsite.feeRequired ? 'Required' : 'Free')}
                          </p>
                        </div>
                      </div>
                    )}

                    {campsite.seasonalAccess && (
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Seasonal Access</p>
                          <p className="text-sm text-muted-foreground">{campsite.seasonalAccess}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Private Notes (owner only) */}
                {isOwner && campsite.notes && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        Private Notes
                      </h3>
                      <p className="text-muted-foreground">{campsite.notes}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Button variant="primary" size="lg" className="flex-1" onClick={handleGetDirections}>
                    <NavigationArrow className="w-4 h-4 mr-2" />
                    Get Directions
                  </Button>
                  <Button variant="outline" size="lg" onClick={handleOpenInMaps}>
                    <ArrowSquareOut className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Delete Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Campsite"
        description="Are you sure you want to delete this campsite? This action cannot be undone."
        itemName={campsite.name}
      />
    </div>
  );
};

export default CampsiteDetail;
