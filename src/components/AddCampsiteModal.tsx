import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SpinnerGap, MapPin, Tent, Plus } from '@phosphor-icons/react';
import { useCampsites } from '@/context/CampsitesContext';
import { CampsiteFormData, CampsiteType, RoadAccess, CampsiteVisibility } from '@/types/campsite';
import { toast } from 'sonner';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface AddCampsiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
}

export function AddCampsiteModal({ isOpen, onClose, initialLat, initialLng }: AddCampsiteModalProps) {
  const { addCampsite } = useCampsites();
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    if (isOpen) {
      if (initialLat !== undefined) setLat(String(initialLat));
      if (initialLng !== undefined) setLng(String(initialLng));
    }
  }, [isOpen, initialLat, initialLng]);

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg border-line bg-white dark:bg-paper-2 rounded-[18px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <Mono className="text-pine-6 flex items-center gap-1.5">
            <Tent className="w-3.5 h-3.5" weight="regular" />
            New campsite
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[20px] leading-[1.15] mt-1">
            Save a camping spot.
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Name */}
          <Field label="Name" required>
            <input
              placeholder="e.g. Hidden Valley Camp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputCls}
            />
          </Field>

          {/* Coordinates */}
          <div className="space-y-1.5">
            <Mono className="text-ink-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" weight="regular" />
              GPS coordinates
              <span className="text-ember">*</span>
            </Mono>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                type="number"
                step="any"
                required
                className={inputCls}
              />
              <input
                placeholder="Longitude"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                type="number"
                step="any"
                required
                className={inputCls}
              />
            </div>
            <p className="text-[12px] text-ink-3">
              Tip: right-click a location in Google Maps to copy its coordinates.
            </p>
          </div>

          {/* Type & Visibility */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <FormSelect value={type} onValueChange={(v) => setType(v as CampsiteType)}>
                <SelectItem value="dispersed">Dispersed</SelectItem>
                <SelectItem value="established">Established</SelectItem>
                <SelectItem value="blm">BLM land</SelectItem>
                <SelectItem value="usfs">USFS land</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </FormSelect>
            </Field>
            <Field label="Visibility">
              <FormSelect value={visibility} onValueChange={(v) => setVisibility(v as CampsiteVisibility)}>
                <SelectItem value="private">Just me</SelectItem>
                <SelectItem value="friends">Friends only</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </FormSelect>
            </Field>
          </div>

          {/* Description */}
          <Field label="Description">
            <textarea
              placeholder="Describe the campsite…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={cn(inputCls, 'resize-none py-2')}
            />
          </Field>

          {/* Road access */}
          <Field label="Road access">
            <FormSelect
              value={roadAccess}
              onValueChange={(v) => setRoadAccess(v as RoadAccess)}
              placeholder="Select road conditions"
            >
              <SelectItem value="2wd">2WD — paved/graded</SelectItem>
              <SelectItem value="4wd_easy">4WD easy — dirt roads</SelectItem>
              <SelectItem value="4wd_moderate">4WD moderate — some obstacles</SelectItem>
              <SelectItem value="4wd_hard">4WD hard — technical</SelectItem>
            </FormSelect>
          </Field>

          {/* Cell coverage */}
          <Field label="Cell coverage">
            <FormSelect value={cellCoverage} onValueChange={setCellCoverage} placeholder="Select cell coverage">
              <SelectItem value="0">0 · No signal</SelectItem>
              <SelectItem value="1">1 · Very weak</SelectItem>
              <SelectItem value="2">2 · Weak</SelectItem>
              <SelectItem value="3">3 · Moderate</SelectItem>
              <SelectItem value="4">4 · Good</SelectItem>
              <SelectItem value="5">5 · Excellent</SelectItem>
            </FormSelect>
          </Field>

          {/* Toggles */}
          <div className="space-y-2.5">
            <ToggleRow label="Water available" checked={waterAvailable} onChange={setWaterAvailable} />
            <ToggleRow label="Fee required" checked={feeRequired} onChange={setFeeRequired} />
            {feeRequired && (
              <div className="pl-3 animate-fade-in">
                <Field label="Fee amount">
                  <input
                    placeholder="e.g. $10/night"
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Seasonal */}
          <Field label="Seasonal access">
            <input
              placeholder="e.g. Year-round, May–October"
              value={seasonalAccess}
              onChange={(e) => setSeasonalAccess(e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Private notes */}
          <div className="space-y-1.5">
            <Mono className="text-ink-2 block">Private notes</Mono>
            <textarea
              placeholder="Personal notes (only visible to you)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={cn(inputCls, 'resize-none py-2')}
            />
            <p className="text-[12px] text-ink-3">
              These notes are always private — even if the campsite is shared.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-3 border-t border-line">
            <Pill variant="ghost" mono={false} onClick={handleClose} className="!flex-1 !justify-center">
              Cancel
            </Pill>
            <Pill
              as="button"
              type="submit"
              variant="solid-pine"
              mono={false}
              className={cn('!flex-1 !justify-center', isSubmitting && 'opacity-50 pointer-events-none')}
            >
              {isSubmitting ? (
                <>
                  <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" weight="regular" />
                  Add campsite
                </>
              )}
            </Pill>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const inputCls =
  'w-full h-10 px-3 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors';

const Field = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Mono className="text-ink-2 block">
      {label}
      {required && <span className="text-ember"> *</span>}
    </Mono>
    {children}
  </div>
);

const FormSelect = ({
  value,
  onValueChange,
  placeholder,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  children: React.ReactNode;
}) => (
  <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger className="h-10 rounded-[12px] border-line bg-white dark:bg-paper-2 text-ink text-[14px] hover:border-ink-3 transition-colors">
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent className="rounded-[12px] border-line bg-white [&_[data-highlighted]]:bg-cream dark:bg-paper-2 [&_[data-highlighted]]:text-ink">
      {children}
    </SelectContent>
  </Select>
);

const ToggleRow = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex items-center justify-between px-3 py-2.5 rounded-[12px] border border-line bg-white dark:bg-paper-2 cursor-pointer hover:border-ink-3/40 transition-colors">
    <span className="text-[14px] text-ink">{label}</span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);
