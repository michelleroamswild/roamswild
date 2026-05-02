import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  EnvelopeSimple,
  House,
  Jeep,
  Key,
  SpinnerGap,
  User as UserIcon,
} from '@phosphor-icons/react';
import { toast } from 'sonner';

import { Header } from '@/components/Header';
import { LocationSelector, type SelectedLocation } from '@/components/LocationSelector';
import { Mono, Pill } from '@/components/redesign';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// Enum-style vocab matching the CHECK constraints in
// 20260214_profile_preferences.sql.
type VehicleType = 'sedan' | 'suv' | 'truck' | '4wd' | 'rv';
type Drivetrain = 'fwd' | 'awd' | '4wd_part_time' | '4wd_full_time';
type Clearance = 'standard' | 'high' | 'extra_high';

const VEHICLE_OPTIONS: Array<{ value: VehicleType; label: string; sub: string }> = [
  { value: 'sedan', label: 'Sedan',  sub: 'paved roads' },
  { value: 'suv',   label: 'SUV',    sub: 'maintained gravel' },
  { value: 'truck', label: 'Truck',  sub: 'rough gravel + dirt' },
  { value: '4wd',   label: '4WD rig',sub: 'unmaintained / rocky' },
  { value: 'rv',    label: 'RV',     sub: 'paved + improved sites' },
];

const DRIVETRAIN_OPTIONS: Array<{ value: Drivetrain; label: string }> = [
  { value: 'fwd',            label: 'FWD' },
  { value: 'awd',            label: 'AWD' },
  { value: '4wd_part_time',  label: '4WD · part-time' },
  { value: '4wd_full_time',  label: '4WD · full-time' },
];

const CLEARANCE_OPTIONS: Array<{ value: Clearance; label: string; sub: string }> = [
  { value: 'standard',   label: 'Standard',   sub: '6–8″ — sedan / crossover' },
  { value: 'high',       label: 'High',       sub: '8–10″ — most SUVs / trucks' },
  { value: 'extra_high', label: 'Extra high', sub: '10″+ — built rigs' },
];

// Profile row shape — only the fields we read/write here. Casted manually
// from the supabase select since the project's generated types throw
// "type instantiation excessively deep" on profile selects.
interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
  home_lat: number | string | null;
  home_lng: number | string | null;
  home_name: string | null;
  vehicle_type: VehicleType | null;
  drivetrain: Drivetrain | null;
  clearance: Clearance | null;
}

const Profile = () => {
  const { user, resetPassword } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Field state — initialized from the DB row, edited locally, persisted on save.
  const [displayName, setDisplayName] = useState('');
  const [home, setHome] = useState<SelectedLocation | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [drivetrain, setDrivetrain] = useState<Drivetrain | null>(null);
  const [clearance, setClearance] = useState<Clearance | null>(null);

  // Snapshot of the saved values so the Save button only enables when there
  // are real changes. Updates whenever a save completes.
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        displayName,
        home: home ? { lat: home.lat, lng: home.lng, name: home.name } : null,
        vehicleType,
        drivetrain,
        clearance,
      }),
    [displayName, home, vehicleType, drivetrain, clearance],
  );

  const dirty = currentSnapshot !== savedSnapshot;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, home_lat, home_lng, home_name, vehicle_type, drivetrain, clearance')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('[profile] load failed:', error);
        toast.error('Could not load profile');
        setLoading(false);
        return;
      }
      const row = (data ?? null) as unknown as ProfileRow | null;
      const initialName = row?.name ?? '';
      const initialHome: SelectedLocation | null =
        row?.home_lat != null && row?.home_lng != null
          ? {
              lat: typeof row.home_lat === 'string' ? parseFloat(row.home_lat) : row.home_lat,
              lng: typeof row.home_lng === 'string' ? parseFloat(row.home_lng) : row.home_lng,
              name: row.home_name ?? '',
            }
          : null;
      setDisplayName(initialName);
      setHome(initialHome);
      setVehicleType(row?.vehicle_type ?? null);
      setDrivetrain(row?.drivetrain ?? null);
      setClearance(row?.clearance ?? null);
      setSavedSnapshot(
        JSON.stringify({
          displayName: initialName,
          home: initialHome ? { lat: initialHome.lat, lng: initialHome.lng, name: initialHome.name } : null,
          vehicleType: row?.vehicle_type ?? null,
          drivetrain: row?.drivetrain ?? null,
          clearance: row?.clearance ?? null,
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    const payload = {
      name: displayName.trim() || null,
      home_lat: home?.lat ?? null,
      home_lng: home?.lng ?? null,
      home_name: home?.name ?? null,
      vehicle_type: vehicleType,
      drivetrain,
      clearance,
    };
    const { error } = await supabase
      .from('profiles')
      .update(payload as never)
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      console.error('[profile] save failed:', error);
      toast.error('Save failed', { description: error.message });
      return;
    }
    setSavedSnapshot(currentSnapshot);
    toast.success('Profile saved');
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    const { error } = await resetPassword(user.email);
    if (error) {
      toast.error('Could not send reset email', { description: error.message });
      return;
    }
    toast.success('Password reset email sent', {
      description: `Check ${user.email} for a link.`,
    });
  };

  return (
    <div className="bg-cream dark:bg-paper text-ink font-sans min-h-screen">
      <Header />

      {/* Hero strip — same shape as SavedLocations */}
      <section className="relative overflow-hidden bg-cream dark:bg-paper-2 -mt-16 md:-mt-20">
        <div className="relative max-w-[900px] mx-auto px-6 md:px-14 pt-28 md:pt-36 pb-10 md:pb-14">
          <Mono className="text-pine-6">YOUR PROFILE</Mono>
          <h1 className="font-sans font-bold tracking-[-0.035em] leading-[1] text-[44px] md:text-[64px] m-0 text-ink mt-2.5">
            {displayName || 'Account'}.
          </h1>
          <p className="text-[14px] text-ink-3 mt-3 max-w-[520px] leading-[1.55]">
            Set your home base + vehicle once, and the rest of the app pre-fills
            from it — trip planning, near-you spots, the surprise-me bucket.
          </p>
        </div>
      </section>

      <section className="bg-paper-2 min-h-[calc(100vh-300px)]">
        <div className="max-w-[900px] mx-auto px-6 md:px-14 py-10 md:py-14 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <SpinnerGap size={28} className="text-ink-3 animate-spin" />
            </div>
          ) : (
            <>
              {/* Account — name, email, password */}
              <SectionCard
                icon={<UserIcon className="w-4 h-4 text-pine-6" weight="regular" />}
                title="Account"
              >
                <Field label="Display name">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="What should we call you?"
                    className="w-full px-4 py-2.5 rounded-[10px] border border-line dark:border-line-2 bg-white dark:bg-paper-2 text-ink text-[14px] focus:outline-none focus:border-pine-6 transition-colors"
                  />
                </Field>
                <Field label="Email">
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] border border-line dark:border-line-2 bg-cream/50 dark:bg-paper text-ink-3 text-[14px]">
                    <EnvelopeSimple size={14} weight="regular" />
                    {user?.email ?? '—'}
                  </div>
                </Field>
                <Field label="Password">
                  <Pill variant="ghost" mono={false} onClick={handlePasswordReset}>
                    <Key size={13} weight="regular" />
                    Send password reset email
                  </Pill>
                </Field>
              </SectionCard>

              {/* Home base */}
              <SectionCard
                icon={<House className="w-4 h-4 text-pine-6" weight="regular" />}
                title="Home base"
                description="Where you usually start trips from. Distances and Near You queries fall back to this when geolocation is unavailable."
              >
                <LocationSelector
                  value={home}
                  onChange={setHome}
                  placeholder="Search a city or address…"
                  showSavedLocations={false}
                  showCoordinates
                />
              </SectionCard>

              {/* Vehicle */}
              <SectionCard
                icon={<Jeep className="w-4 h-4 text-pine-6" weight="regular" />}
                title="Your rig"
                description="Pre-fills the trip wizard's vehicle and the access difficulty filters in the explore map."
              >
                <Field label="Vehicle type">
                  <PillGroup
                    value={vehicleType}
                    onChange={(v) => setVehicleType(v)}
                    options={VEHICLE_OPTIONS}
                    twoLine
                  />
                </Field>
                <Field label="Drivetrain">
                  <PillGroup
                    value={drivetrain}
                    onChange={(v) => setDrivetrain(v)}
                    options={DRIVETRAIN_OPTIONS}
                  />
                </Field>
                <Field label="Ground clearance">
                  <PillGroup
                    value={clearance}
                    onChange={(v) => setClearance(v)}
                    options={CLEARANCE_OPTIONS}
                    twoLine
                  />
                </Field>
              </SectionCard>

              {/* Save action — full-width primary CTA, in-flow (not floating). */}
              <div className="pt-4 pb-2">
                <Pill
                  variant="solid-pine"
                  mono={false}
                  onClick={handleSave}
                  className={cn(
                    '!w-full !justify-center !text-[14px] !px-8 !py-3.5 !gap-2',
                    !dirty || saving ? 'opacity-50 pointer-events-none' : '',
                  )}
                >
                  {saving ? <SpinnerGap size={15} className="animate-spin" /> : null}
                  {saving ? 'Saving…' : 'Save changes'}
                </Pill>
                {!dirty && savedSnapshot && (
                  <div className="flex justify-center mt-3">
                    <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                      <CheckCircle size={12} weight="fill" />
                      Saved
                    </Mono>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

// === Local layout helpers — kept inline since they're page-specific. ===

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}
const SectionCard = ({ icon, title, description, children }: SectionCardProps) => (
  <div className="border border-line dark:border-line-2 bg-white dark:bg-ink-pine rounded-[18px] p-6 md:p-8">
    <div className="flex items-center gap-2.5 mb-1">
      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-pine-6/10">
        {icon}
      </div>
      <h2 className="font-sans font-semibold text-[18px] tracking-[-0.01em] text-ink">{title}</h2>
    </div>
    {description && (
      <p className="text-[13px] text-ink-3 mt-1.5 mb-5 leading-[1.55] max-w-[640px]">
        {description}
      </p>
    )}
    <div className={cn('flex flex-col gap-5', description ? '' : 'mt-5')}>{children}</div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Mono className="text-ink-3 mb-2 block">{label}</Mono>
    {children}
  </div>
);

interface PillOption<T extends string> {
  value: T;
  label: string;
  sub?: string;
}
interface PillGroupProps<T extends string> {
  value: T | null;
  onChange: (v: T) => void;
  options: PillOption<T>[];
  /** Stack label + sub on two lines instead of inline. */
  twoLine?: boolean;
}
function PillGroup<T extends string>({ value, onChange, options, twoLine }: PillGroupProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex flex-col items-start text-left px-4 py-2.5 rounded-[12px] border transition-all',
              active
                ? 'border-pine-6 bg-pine-6/10 text-ink'
                : 'border-line dark:border-line-2 bg-white dark:bg-paper-2 text-ink hover:border-ink-3/40 hover:bg-cream dark:hover:bg-paper-2',
            )}
          >
            <span className="font-sans font-semibold text-[13px] tracking-[-0.005em]">
              {opt.label}
            </span>
            {opt.sub && (
              <span
                className={cn(
                  'text-[11px] mt-0.5',
                  twoLine ? 'block' : 'hidden',
                  active ? 'text-pine-6' : 'text-ink-3',
                )}
              >
                {opt.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Profile;
