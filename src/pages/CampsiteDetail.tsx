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
import { Mono, Pill, TopoBg } from '@/components/redesign';
import { cn } from '@/lib/utils';

const typeLabels: Record<CampsiteType, string> = {
  dispersed: 'Dispersed camping',
  established: 'Established campground',
  blm: 'BLM land',
  usfs: 'US Forest Service',
  private: 'Private property',
};

const roadAccessLabels: Record<RoadAccess, string> = {
  '2wd': '2WD — paved/graded road',
  '4wd_easy': '4WD easy — dirt roads',
  '4wd_moderate': '4WD moderate — some obstacles',
  '4wd_hard': '4WD hard — technical terrain',
};

const VISIBILITY_META: Record<CampsiteVisibility, { label: string; Icon: typeof Globe; accent: string; bg: string; border: string }> = {
  public:  { label: 'Public',       Icon: Globe, accent: 'text-pine-6', bg: 'bg-pine-6/10', border: 'border-pine-6/30' },
  friends: { label: 'Friends only', Icon: Users, accent: 'text-water',  bg: 'bg-water/15',  border: 'border-water/40' },
  private: { label: 'Private',      Icon: Lock,  accent: 'text-ink-3',  bg: 'bg-ink/8',     border: 'border-line' },
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

  const isOwner = !!campsite && !!user && campsite.userId === user.id;

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

  // === Loading state ===
  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream dark:bg-paper text-ink font-sans relative flex items-center justify-center overflow-hidden">
        <TopoBg color="hsl(var(--paper))" opacity={0.55} scale={700} />
        <div className="relative flex flex-col items-center gap-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10">
            <SpinnerGap className="w-6 h-6 text-pine-6 animate-spin" />
          </div>
          <Mono className="text-pine-6">Loading campsite</Mono>
        </div>
      </div>
    );
  }

  // === Not found state ===
  if (!campsite) {
    return (
      <div className="min-h-screen bg-cream dark:bg-paper text-ink font-sans relative flex items-center justify-center p-6 overflow-hidden">
        <TopoBg color="hsl(var(--paper))" opacity={0.55} scale={700} />
        <div className="relative max-w-[420px] text-center bg-white dark:bg-paper-2 border border-line rounded-[18px] p-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6 mb-4">
            <Tent className="w-5 h-5" weight="regular" />
          </div>
          <h2 className="text-[22px] font-sans font-bold tracking-[-0.015em] text-ink leading-[1.15]">
            Campsite not found
          </h2>
          <p className="text-[14px] text-ink-3 mt-3 leading-[1.55]">
            This campsite doesn't exist or you don't have access to it.
          </p>
          <div className="mt-6">
            <Link
              to="/campsites"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-pine-6 text-cream dark:text-ink-pine text-[14px] font-sans font-semibold hover:bg-pine-5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
              Back to campsites
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const visibilityMeta = VISIBILITY_META[campsite.visibility];
  const VisibilityIcon = visibilityMeta.Icon;

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Sticky cluster — back nav + edit/delete */}
      <header className="sticky top-0 z-50 bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md border-b border-line">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <Link
                to="/campsites"
                aria-label="Back to campsites"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" weight="regular" />
              </Link>
              <div className="min-w-0">
                <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                  <VisibilityIcon className="w-3 h-3" weight="regular" />
                  {visibilityMeta.label} · {typeLabels[campsite.type]}
                </Mono>
                <h1 className="text-[16px] sm:text-[20px] font-sans font-bold tracking-[-0.01em] text-ink truncate mt-0.5">
                  {campsite.name}
                </h1>
              </div>
            </div>

            {isOwner && !isEditing && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Pill variant="ghost" sm mono={false} onClick={handleStartEdit}>
                  <PencilSimple className="w-3.5 h-3.5" weight="regular" />
                  <span className="hidden sm:inline">Edit</span>
                </Pill>
                <Pill
                  variant="ghost"
                  sm
                  mono={false}
                  onClick={() => setDeleteModalOpen(true)}
                  className="!text-ember !border-ember/40 hover:!bg-ember/10"
                >
                  <Trash className="w-3.5 h-3.5" weight="regular" />
                  <span className="hidden sm:inline">Delete</span>
                </Pill>
              </div>
            )}
            {isEditing && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Pill variant="ghost" sm mono={false} onClick={handleCancelEdit}>
                  <X className="w-3.5 h-3.5" weight="bold" />
                  Cancel
                </Pill>
                <Pill
                  variant="solid-pine"
                  sm
                  mono={false}
                  onClick={handleSave}
                  className={isSaving ? 'opacity-50 pointer-events-none' : ''}
                >
                  {isSaving ? <SpinnerGap className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" weight="bold" />}
                  Save
                </Pill>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map (left, sticky on lg) */}
          <div className="order-2 lg:order-1 h-[400px] lg:h-[calc(100vh-73px)] lg:sticky lg:top-[73px]">
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

          {/* Info / edit panel (right, scrollable on lg) */}
          <div className="order-1 lg:order-2 bg-paper lg:h-[calc(100vh-73px)] lg:overflow-y-auto">
            <div className="px-4 sm:px-6 py-5 space-y-5">
              {isEditing ? (
                <EditForm form={editForm} setForm={setEditForm} />
              ) : (
                <>
                  {/* Intro card — same pattern as the trip detail "Your trip" header */}
                  <div className="bg-white dark:bg-paper-2 border border-line rounded-[14px] p-5">
                    <Mono className="text-pine-6">Campsite</Mono>
                    <h1 className="text-[24px] sm:text-[28px] font-sans font-bold tracking-[-0.025em] text-ink leading-[1.1] mt-1">
                      {campsite.name}
                    </h1>

                    {/* Visibility + type badges */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-mono font-semibold uppercase tracking-[0.10em]',
                        visibilityMeta.bg, visibilityMeta.border, visibilityMeta.accent,
                      )}>
                        <VisibilityIcon className="w-3 h-3" weight="regular" />
                        {visibilityMeta.label}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-cream dark:bg-paper-2 border-line text-ink-3 text-[10px] font-mono font-semibold uppercase tracking-[0.10em]">
                        {typeLabels[campsite.type]}
                      </span>
                    </div>

                    {/* Coords / state */}
                    <div className="mt-4 pt-4 border-t border-line flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                      <MapPin className="w-3.5 h-3.5" weight="regular" />
                      {campsite.state && `${campsite.state} · `}
                      {campsite.lat.toFixed(4)}, {campsite.lng.toFixed(4)}
                    </div>
                  </div>

                  {/* Description */}
                  {campsite.description && (
                    <div className="bg-white dark:bg-paper-2 border border-line rounded-[14px] p-5">
                      <Mono className="text-ink-2 block mb-2">Description</Mono>
                      <p className="text-[14px] text-ink leading-[1.55]">{campsite.description}</p>
                    </div>
                  )}

                  {/* Detail rows */}
                  <div className="bg-white dark:bg-paper-2 border border-line rounded-[14px] p-5 space-y-3.5">
                    <Mono className="text-ink-2 block">Details</Mono>
                    {campsite.roadAccess && (
                      <DetailRow Icon={Car} label="Road access" value={roadAccessLabels[campsite.roadAccess]} />
                    )}
                    {campsite.cellCoverage !== undefined && (
                      <DetailRow Icon={CellSignalFull} label="Cell coverage" value={`${campsite.cellCoverage}/5 bars`} />
                    )}
                    {campsite.waterAvailable !== undefined && (
                      <DetailRow Icon={Drop} label="Water" value={campsite.waterAvailable ? 'Available' : 'Not available'} />
                    )}
                    {(campsite.feeRequired || campsite.feeAmount) && (
                      <DetailRow
                        Icon={CurrencyDollar}
                        label="Fee"
                        value={campsite.feeAmount || (campsite.feeRequired ? 'Required' : 'Free')}
                      />
                    )}
                    {campsite.seasonalAccess && (
                      <DetailRow Icon={Calendar} label="Seasonal" value={campsite.seasonalAccess} />
                    )}
                  </div>

                  {/* Private notes — owner only */}
                  {isOwner && campsite.notes && (
                    <div className="bg-clay/[0.06] border border-clay/30 rounded-[14px] p-5">
                      <Mono className="text-clay flex items-center gap-1.5">
                        <Lock className="w-3 h-3" weight="regular" />
                        Private notes
                      </Mono>
                      <p className="text-[14px] text-ink leading-[1.55] mt-2">{campsite.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Sticky bottom action bar */}
            {!isEditing && (
              <div className="sticky bottom-0 border-t border-line bg-cream dark:bg-paper-2 px-4 sm:px-6 py-3 flex items-center gap-2">
                <Pill
                  variant="solid-pine"
                  mono={false}
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${campsite.lat},${campsite.lng}`,
                      '_blank',
                    )
                  }
                  className="!flex-1 !justify-center"
                >
                  <NavigationArrow className="w-4 h-4" weight="regular" />
                  Get directions
                </Pill>
                <Pill
                  variant="ghost"
                  mono={false}
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${campsite.lat},${campsite.lng}`,
                      '_blank',
                    )
                  }
                >
                  <ArrowSquareOut className="w-4 h-4" weight="regular" />
                </Pill>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete confirmation */}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete campsite"
        description="Are you sure you want to delete this campsite? This action cannot be undone."
        itemName={campsite.name}
      />
    </div>
  );
};

// === Helpers ===

const DetailRow = ({
  Icon,
  label,
  value,
}: {
  Icon: typeof Car;
  label: string;
  value: string;
}) => (
  <div className="flex items-start gap-3">
    <div className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] bg-cream dark:bg-paper-2 text-ink-2 flex-shrink-0">
      <Icon className="w-4 h-4" weight="regular" />
    </div>
    <div className="flex-1 min-w-0">
      <Mono className="text-ink-3 block">{label}</Mono>
      <p className="text-[14px] text-ink mt-0.5">{value}</p>
    </div>
  </div>
);

// Edit form lives in its own component so the read-mode body stays slim.
// Inputs use the same chrome as the auth/wizard fields (rounded-[12px]
// border-line, focus pine-6) — no shadcn Input default styling.
const EditForm = ({
  form,
  setForm,
}: {
  form: Partial<CampsiteFormData>;
  setForm: (f: Partial<CampsiteFormData>) => void;
}) => {
  const inputClass =
    'w-full h-10 px-3 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors';

  return (
    <div className="bg-white dark:bg-paper-2 border border-line rounded-[14px] p-5 space-y-4">
      <Mono className="text-pine-6">Edit campsite</Mono>

      <Field label="Name">
        <input
          value={form.name || ''}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude">
          <input
            type="number"
            step="any"
            value={form.lat ?? ''}
            onChange={(e) => setForm({ ...form, lat: parseFloat(e.target.value) })}
            className={inputClass}
          />
        </Field>
        <Field label="Longitude">
          <input
            type="number"
            step="any"
            value={form.lng ?? ''}
            onChange={(e) => setForm({ ...form, lng: parseFloat(e.target.value) })}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <FormSelect
            value={form.type ?? ''}
            onChange={(v) => setForm({ ...form, type: v as CampsiteType })}
          >
            <SelectItem value="dispersed">Dispersed</SelectItem>
            <SelectItem value="established">Established</SelectItem>
            <SelectItem value="blm">BLM</SelectItem>
            <SelectItem value="usfs">USFS</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </FormSelect>
        </Field>
        <Field label="Visibility">
          <FormSelect
            value={form.visibility ?? ''}
            onChange={(v) => setForm({ ...form, visibility: v as CampsiteVisibility })}
          >
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="friends">Friends only</SelectItem>
            <SelectItem value="public">Public</SelectItem>
          </FormSelect>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={form.description || ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors resize-none"
        />
      </Field>

      <Field label="Road access">
        <FormSelect
          value={form.roadAccess ?? ''}
          onChange={(v) => setForm({ ...form, roadAccess: v as RoadAccess })}
          placeholder="Select…"
        >
          <SelectItem value="2wd">2WD</SelectItem>
          <SelectItem value="4wd_easy">4WD Easy</SelectItem>
          <SelectItem value="4wd_moderate">4WD Moderate</SelectItem>
          <SelectItem value="4wd_hard">4WD Hard</SelectItem>
        </FormSelect>
      </Field>

      <Field label="Cell coverage">
        <FormSelect
          value={form.cellCoverage?.toString() ?? ''}
          onChange={(v) => setForm({ ...form, cellCoverage: parseInt(v) })}
          placeholder="Select…"
        >
          <SelectItem value="0">0 — No signal</SelectItem>
          <SelectItem value="1">1 — Very weak</SelectItem>
          <SelectItem value="2">2 — Weak</SelectItem>
          <SelectItem value="3">3 — Moderate</SelectItem>
          <SelectItem value="4">4 — Good</SelectItem>
          <SelectItem value="5">5 — Excellent</SelectItem>
        </FormSelect>
      </Field>

      <ToggleRow label="Water available" checked={form.waterAvailable || false} onChange={(v) => setForm({ ...form, waterAvailable: v })} />
      <ToggleRow label="Fee required" checked={form.feeRequired || false} onChange={(v) => setForm({ ...form, feeRequired: v })} />

      {form.feeRequired && (
        <Field label="Fee amount">
          <input
            value={form.feeAmount || ''}
            onChange={(e) => setForm({ ...form, feeAmount: e.target.value })}
            placeholder="e.g. $10/night"
            className={inputClass}
          />
        </Field>
      )}

      <Field label="Seasonal access">
        <input
          value={form.seasonalAccess || ''}
          onChange={(e) => setForm({ ...form, seasonalAccess: e.target.value })}
          placeholder="e.g. Year-round"
          className={inputClass}
        />
      </Field>

      <Field label="Private notes">
        <textarea
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          placeholder="Personal notes…"
          className="w-full px-3 py-2 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors resize-none"
        />
      </Field>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Mono className="text-ink-2 block mb-1.5">{label}</Mono>
    {children}
  </div>
);

const FormSelect = ({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  children: React.ReactNode;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-10 w-full px-3 rounded-[12px] border-line bg-white dark:bg-paper-2 text-ink text-[14px] hover:border-ink-3 transition-colors">
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
  <div className="flex items-center justify-between">
    <Mono className="text-ink-2">{label}</Mono>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

export default CampsiteDetail;
