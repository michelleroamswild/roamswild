import { useState, useEffect } from 'react';
import { Mountains, Camera, Jeep, Check, X } from '@phosphor-icons/react';
import { PacePreference } from '@/types/trip';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

// Mirrors StepActivities in the wizard so editing from a saved trip looks
// identical to the original choice flow.
type AccentName = 'pine' | 'sage' | 'water' | 'clay' | 'ember';

const ACCENT: Record<AccentName, { iconBg: string; iconText: string; selectedBorder: string; selectedBg: string; check: string; dot: string }> = {
  pine:  { iconBg: 'bg-pine-6/12', iconText: 'text-pine-6', selectedBorder: 'border-pine-6', selectedBg: 'bg-pine-6/[0.06]', check: 'bg-pine-6', dot: 'border-pine-6 bg-pine-6' },
  sage:  { iconBg: 'bg-sage/15',   iconText: 'text-sage',   selectedBorder: 'border-sage',   selectedBg: 'bg-sage/[0.06]',   check: 'bg-sage',   dot: 'border-sage bg-sage' },
  water: { iconBg: 'bg-water/15',  iconText: 'text-water',  selectedBorder: 'border-water',  selectedBg: 'bg-water/[0.06]',  check: 'bg-water',  dot: 'border-water bg-water' },
  clay:  { iconBg: 'bg-clay/15',   iconText: 'text-clay',   selectedBorder: 'border-clay',   selectedBg: 'bg-clay/[0.06]',   check: 'bg-clay',   dot: 'border-clay bg-clay' },
  ember: { iconBg: 'bg-ember/15',  iconText: 'text-ember',  selectedBorder: 'border-ember',  selectedBg: 'bg-ember/[0.06]',  check: 'bg-ember',  dot: 'border-ember bg-ember' },
};

const ACTIVITIES: Array<{ id: string; label: string; description: string; icon: typeof Mountains; accent: AccentName }> = [
  { id: 'hiking',      label: 'Hiking',      description: 'Find trails near your route — easy strolls to summit pushes.', icon: Mountains, accent: 'sage' },
  { id: 'photography', label: 'Photography', description: 'Surface scenic viewpoints and golden-hour-friendly stops.',     icon: Camera,    accent: 'ember' },
  { id: 'offroading',  label: 'Offroading',  description: 'Find OHV trails and high-clearance routes along the way.',      icon: Jeep,      accent: 'clay' },
];

const PACE_OPTIONS: Array<{ id: PacePreference; label: string; description: string; accent: AccentName }> = [
  { id: 'relaxed',  label: 'Relaxed',  description: 'Fewer activities, more time at camp.',     accent: 'water' },
  { id: 'moderate', label: 'Moderate', description: 'A balance of activity and rest.',           accent: 'pine'  },
  { id: 'packed',   label: 'Packed',   description: 'Pack the day — sunrise to sunset.',         accent: 'ember' },
];

interface ActivityEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activities: string[];
  pacePreference?: PacePreference;
  offroadVehicleType?: '4wd-high' | 'awd-medium';
  onSave: (data: {
    activities: string[];
    pacePreference: PacePreference;
    offroadVehicleType?: '4wd-high' | 'awd-medium';
  }) => void;
}

export function ActivityEditorModal({
  isOpen,
  onClose,
  activities: initialActivities,
  pacePreference: initialPace = 'moderate',
  offroadVehicleType: initialOffroadVehicle,
  onSave,
}: ActivityEditorModalProps) {
  const [activities, setActivities] = useState<string[]>(initialActivities);
  const [pacePreference, setPacePreference] = useState<PacePreference>(initialPace);
  const [offroadVehicle, setOffroadVehicle] = useState<'4wd-high' | 'awd-medium'>(initialOffroadVehicle || '4wd-high');

  useEffect(() => {
    if (isOpen) {
      setActivities(initialActivities);
      setPacePreference(initialPace);
      setOffroadVehicle(initialOffroadVehicle || '4wd-high');
    }
  }, [isOpen, initialActivities, initialPace, initialOffroadVehicle]);

  const handleActivityToggle = (id: string, checked: boolean) => {
    if (checked) setActivities([...activities, id]);
    else setActivities(activities.filter((x) => x !== id));
  };

  const handleSave = () => {
    onSave({
      activities,
      pacePreference,
      offroadVehicleType: activities.includes('offroading') ? offroadVehicle : undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      <div className="absolute inset-0 bg-ink-pine/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-paper-2 border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16),0_3px_8px_rgba(29,34,24,.08)] w-full max-w-md mx-4 max-h-[90dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
          <div>
            <Mono className="text-pine-6">Edit activities</Mono>
            <h2 className="text-[20px] font-sans font-semibold tracking-[-0.015em] text-ink leading-[1.15] mt-1">
              Update your trip plan.
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" weight="regular" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Activities */}
          <div className="space-y-3">
            <Mono className="text-ink-2 block">Activities</Mono>
            <div className="space-y-3">
              {ACTIVITIES.map(({ id, label, description, icon: Icon, accent }) => {
                const a = ACCENT[accent];
                const selected = activities.includes(id);
                return (
                  <div
                    key={id}
                    className={cn(
                      'rounded-[14px] border bg-white dark:bg-paper-2 transition-all',
                      selected ? `${a.selectedBorder} ${a.selectedBg}` : 'border-line hover:border-ink-3/40',
                    )}
                  >
                    <label className="flex items-start gap-4 p-4 cursor-pointer">
                      <div className={cn('w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0', a.iconBg, a.iconText)}>
                        <Icon className="w-5 h-5" weight="regular" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">{label}</div>
                        <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">{description}</p>
                      </div>
                      <div className={cn(
                        'w-5 h-5 rounded-[5px] border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
                        selected ? a.dot : 'border-ink-3/40 bg-transparent',
                      )}>
                        {selected && <Check className="w-3 h-3 text-cream" weight="bold" />}
                      </div>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => handleActivityToggle(id, e.target.checked)}
                        className="sr-only"
                      />
                    </label>

                    {/* Conditional vehicle selector under offroading */}
                    {id === 'offroading' && selected && (
                      <div className="px-4 pb-4 -mt-1 ml-14 animate-fade-in">
                        <Mono className="text-ink-3 block mb-2">Your vehicle</Mono>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <VehicleRadio
                            checked={offroadVehicle === '4wd-high'}
                            onChange={() => setOffroadVehicle('4wd-high')}
                            label="4WD high clearance"
                          />
                          <VehicleRadio
                            checked={offroadVehicle === 'awd-medium'}
                            onChange={() => setOffroadVehicle('awd-medium')}
                            label="AWD medium clearance"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pace */}
          <div className="space-y-3 pt-2 border-t border-line">
            <div className="pt-4">
              <Mono className="text-ink-2 block">Trip pace</Mono>
              <p className="text-[13px] text-ink-3 mt-1">How packed do you want each day to be?</p>
            </div>
            <div className="grid gap-2">
              {PACE_OPTIONS.map(({ id, label, description, accent }) => {
                const a = ACCENT[accent];
                const selected = pacePreference === id;
                return (
                  <label
                    key={id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-[12px] border bg-white dark:bg-paper-2 cursor-pointer transition-all',
                      selected ? `${a.selectedBorder} ${a.selectedBg}` : 'border-line hover:border-ink-3/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="modal-pace-preference"
                      checked={selected}
                      onChange={() => setPacePreference(id)}
                      className="sr-only"
                    />
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                      selected ? a.dot : 'border-ink-3/40 bg-transparent',
                    )}>
                      {selected && <span className="w-1.5 h-1.5 rounded-full bg-cream dark:bg-paper-2" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">{label}</div>
                      <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">{description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-line flex items-center gap-2">
          <Pill variant="ghost" mono={false} onClick={onClose} className="!flex-1 !justify-center">
            Cancel
          </Pill>
          <Pill variant="solid-pine" mono={false} onClick={handleSave} className="!flex-1 !justify-center">
            Save changes
          </Pill>
        </div>
      </div>
    </div>
  );
}

const VehicleRadio = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) => (
  <label className={cn(
    'flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border bg-white dark:bg-paper-2 cursor-pointer transition-colors',
    checked ? 'border-clay bg-clay/[0.06]' : 'border-line hover:border-ink-3/40',
  )}>
    <input type="radio" checked={checked} onChange={onChange} className="sr-only" />
    <div className={cn(
      'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
      checked ? 'border-clay bg-clay' : 'border-ink-3/40',
    )}>
      {checked && <span className="w-1.5 h-1.5 rounded-full bg-cream dark:bg-paper-2" />}
    </div>
    <span className="text-[13px] text-ink">{label}</span>
  </label>
);
