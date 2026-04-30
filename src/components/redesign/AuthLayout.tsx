import { Link } from 'react-router-dom';
import { Jeep, Path, Tent, Mountains, Envelope } from '@phosphor-icons/react';
import { Mono } from './Mono';
import { cn } from '@/lib/utils';

// Shared bits for the auth pages (Login / Signup / Forgot / Reset).
// Pulled out of the page files so the redesign system owns the look.

// Side panel — photo with a dark pine gradient overlay so cream text reads
// cleanly. Hidden on mobile so the form gets the full screen.
export const AuthSidePanel = ({
  photo,
  headline,
}: {
  photo: string;
  headline: React.ReactNode;
}) => (
  <div className="hidden lg:flex lg:w-1/2 relative">
    <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
    <div className="absolute inset-0 bg-gradient-to-br from-ink-pine/85 via-ink-pine/65 to-pine-6/40" />
    <div className="relative z-10 flex flex-col justify-between p-12 text-cream w-full">
      <Link to="/" className="flex items-center gap-2.5 self-start">
        <Jeep className="w-6 h-6" weight="regular" />
        <span className="text-[16px] font-sans font-bold tracking-[-0.01em]">RoamsWild</span>
      </Link>

      <div className="space-y-7">
        <Mono className="text-cream/70">Off-grid camping · One honest map</Mono>
        <h2 className="font-sans font-bold leading-[1.05] tracking-[-0.03em] text-[44px] xl:text-[52px] m-0">
          {headline}
        </h2>
        <div className="space-y-3">
          {[
            { Icon: Path,      label: 'Plan scenic routes',          accent: 'bg-pine-6/30 text-cream' },
            { Icon: Tent,      label: 'Discover hidden campsites',   accent: 'bg-clay/30  text-cream' },
            { Icon: Mountains, label: 'Find amazing hikes',          accent: 'bg-sage/30  text-cream' },
          ].map(({ Icon, label, accent }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-[12px] flex items-center justify-center backdrop-blur-sm', accent)}>
                <Icon className="w-4 h-4" weight="regular" />
              </div>
              <span className="text-[15px] text-cream/95">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <Mono className="text-cream/60">Join thousands of overlanders planning with RoamsWild</Mono>
    </div>
  </div>
);

// Native input with icon prefix, mono label, ember error state. Pass
// `rightSlot` for a "Forgot?" link beside the label (used on password fields).
type AuthInputProps = {
  id: string;
  label: string;
  type: string;
  icon: typeof Envelope;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string | null;
  rightSlot?: React.ReactNode;
  className?: string;
  onBlur?: () => void;
  uppercase?: boolean;
  minLength?: number;
};

export const AuthInput = ({
  id,
  label,
  type,
  icon: Icon,
  placeholder,
  value,
  onChange,
  required,
  error,
  rightSlot,
  className,
  onBlur,
  uppercase,
  minLength,
}: AuthInputProps) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <label htmlFor={id} className="text-[12px] font-mono uppercase tracking-[0.10em] text-ink-2">
        {label}
      </label>
      {rightSlot}
    </div>
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" weight="regular" />
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className={cn(
          'w-full h-12 pl-10 pr-4 rounded-[14px] border bg-white text-ink text-[15px] outline-none placeholder:text-ink-3 transition-colors',
          error ? 'border-ember focus:border-ember' : 'border-line focus:border-pine-6',
          uppercase && 'uppercase',
          className,
        )}
      />
    </div>
    {error && (
      <p className="text-[13px] text-ember mt-1.5">{error}</p>
    )}
  </div>
);
