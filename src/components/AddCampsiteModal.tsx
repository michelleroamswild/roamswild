import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { SpinnerGap, MapPin, Tent } from '@phosphor-icons/react';
import { useCampsites } from '@/context/CampsitesContext';
import { CampsiteFormData, CampsiteType, RoadAccess, CampsiteVisibility } from '@/types/campsite';
import { toast } from 'sonner';

interface AddCampsiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddCampsiteModal({ isOpen, onClose }: AddCampsiteModalProps) {
  const { addCampsite } = useCampsites();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [type, setType] = useState<CampsiteType>('dispersed');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [roadAccess, setRoadAccess] = useState<RoadAccess | ''>('');
  const [cellCoverage, setCellCoverage] = useState<string>('');
  const [waterAvailable, setWaterAvailable] = useState(false);
  const [feeRequired, setFeeRequired] = useState(false);
  const [feeAmount, setFeeAmount] = useState('');
  const [seasonalAccess, setSeasonalAccess] = useState('');
  const [visibility, setVisibility] = useState<CampsiteVisibility>('private');

  const resetForm = () => {
    setName('');
    setLat('');
    setLng('');
    setType('dispersed');
    setDescription('');
    setNotes('');
    setRoadAccess('');
    setCellCoverage('');
    setWaterAvailable(false);
    setFeeRequired(false);
    setFeeAmount('');
    setSeasonalAccess('');
    setVisibility('private');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      toast.error('Please enter a valid latitude (-90 to 90)');
      return;
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      toast.error('Please enter a valid longitude (-180 to 180)');
      return;
    }

    setIsSubmitting(true);

    const formData: CampsiteFormData = {
      name: name.trim(),
      lat: latNum,
      lng: lngNum,
      type,
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
      roadAccess: roadAccess || undefined,
      cellCoverage: cellCoverage ? parseInt(cellCoverage) : undefined,
      waterAvailable: waterAvailable || undefined,
      feeRequired: feeRequired || undefined,
      feeAmount: feeAmount.trim() || undefined,
      seasonalAccess: seasonalAccess.trim() || undefined,
      visibility,
    };

    const result = await addCampsite(formData);

    setIsSubmitting(false);

    if (result) {
      toast.success('Campsite added');
      handleClose();
    } else {
      toast.error('Failed to add campsite');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tent className="w-5 h-5 text-primary" />
            Add Campsite
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="e.g. Hidden Valley Camp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Coordinates */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              GPS Coordinates *
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  placeholder="Latitude (e.g. 36.2345)"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  type="number"
                  step="any"
                  required
                />
              </div>
              <div>
                <Input
                  placeholder="Longitude (e.g. -116.8765)"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  type="number"
                  step="any"
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: You can get coordinates from Google Maps by right-clicking a location
            </p>
          </div>

          {/* Type & Visibility */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CampsiteType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dispersed">Dispersed</SelectItem>
                  <SelectItem value="established">Established</SelectItem>
                  <SelectItem value="blm">BLM Land</SelectItem>
                  <SelectItem value="usfs">USFS Land</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as CampsiteVisibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (just me)</SelectItem>
                  <SelectItem value="friends">Friends only</SelectItem>
                  <SelectItem value="public">Public (everyone)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the campsite..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Road Access */}
          <div className="space-y-2">
            <Label>Road Access</Label>
            <Select value={roadAccess} onValueChange={(v) => setRoadAccess(v as RoadAccess)}>
              <SelectTrigger>
                <SelectValue placeholder="Select road conditions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2wd">2WD - Paved/Graded</SelectItem>
                <SelectItem value="4wd_easy">4WD Easy - Dirt roads</SelectItem>
                <SelectItem value="4wd_moderate">4WD Moderate - Some obstacles</SelectItem>
                <SelectItem value="4wd_hard">4WD Hard - Technical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cell Coverage */}
          <div className="space-y-2">
            <Label>Cell Coverage (0-5 bars)</Label>
            <Select value={cellCoverage} onValueChange={setCellCoverage}>
              <SelectTrigger>
                <SelectValue placeholder="Select cell coverage" />
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

          {/* Toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="water">Water Available</Label>
              <Switch
                id="water"
                checked={waterAvailable}
                onCheckedChange={setWaterAvailable}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="fee">Fee Required</Label>
              <Switch
                id="fee"
                checked={feeRequired}
                onCheckedChange={setFeeRequired}
              />
            </div>

            {feeRequired && (
              <div className="space-y-2">
                <Label htmlFor="feeAmount">Fee Amount</Label>
                <Input
                  id="feeAmount"
                  placeholder="e.g. $10/night"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Seasonal Access */}
          <div className="space-y-2">
            <Label htmlFor="seasonal">Seasonal Access</Label>
            <Input
              id="seasonal"
              placeholder="e.g. Year-round, Summer only, May-October"
              value={seasonalAccess}
              onChange={(e) => setSeasonalAccess(e.target.value)}
            />
          </div>

          {/* Private Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Private Notes</Label>
            <Textarea
              id="notes"
              placeholder="Personal notes (only visible to you)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              These notes are private and won't be shared even if the campsite is public
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Campsite'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
