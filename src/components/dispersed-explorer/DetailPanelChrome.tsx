import { ReactNode } from 'react';
import { ArrowLeft, Check, Copy, MapPin } from '@phosphor-icons/react';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

// Shared chrome for the four detail panels (Spot / Campground / UserCampsite
// / Road). All four sit inside the right floating card on the explore page,
// so they share: back link, hero (icon + title + sub), coords strip, sectioned
// body (mono-cap labels separated by border-t), and a sticky bottom action bar.

// ---------------------------------------------------------------------------
// Layout shell

export const DetailShell = ({ children }: { children: ReactNode }) => (
  <div className="h-full flex flex-col">{children}</div>
);

// Scroll body — no horizontal padding so sections can use `px-[18px]` and
// borders can run edge-to-edge.
export const DetailBody = ({ children }: { children: ReactNode }) => (
  <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
);

// Sticky bottom action bar — cream surface with border-top + small drop
// shadow so primary CTAs stay anchored as the body scrolls.
export const DetailActions = ({ children }: { children: ReactNode }) => (
  <div className="shrink-0 border-t border-line bg-cream px-[18px] py-3 space-y-2">
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Header — back link + hero block (icon + title + sub)

export const BackLink = ({ onBack }: { onBack: () => void }) => (
  <button
    onClick={onBack}
    className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-ink-3 hover:text-ink transition-colors"
  >
    <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
    Back to results
  </button>
);

// Hero accent — square IconBlock + name + sub + optional badge slot. Mirrors
// the IconBlock pattern used on day cards (w-12 h-12 rounded-[12px] tinted
// bg + saturated icon).
export const DetailHero = ({
  Icon,
  iconBg,
  iconText,
  title,
  eyebrow,
  badge,
}: {
  Icon: typeof MapPin;
  iconBg: string;
  iconText: string;
  title: string;
  eyebrow?: ReactNode;
  badge?: ReactNode;
}) => (
  <div className="flex items-start gap-3">
    <div className={cn('w-12 h-12 rounded-[12px] flex items-center justify-center flex-shrink-0', iconBg, iconText)}>
      <Icon className="w-5 h-5" weight="regular" />
    </div>
    <div className="flex-1 min-w-0">
      {eyebrow && <Mono className="text-pine-6 block mb-1">{eyebrow}</Mono>}
      <h2 className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink leading-[1.15]">
        {title}
      </h2>
      {badge && <div className="mt-1.5">{badge}</div>}
    </div>
  </div>
);

// Coords strip — mono caps lat/lng + copy button. Used under the hero on
// every panel so all four feel consistent.
export const CoordsStrip = ({
  lat,
  lng,
  copied,
  onCopy,
}: {
  lat: number;
  lng: number;
  copied: boolean;
  onCopy: () => void;
}) => (
  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] border border-line bg-white">
    <Mono className="text-ink-3 truncate">
      {lat.toFixed(4)}, {lng.toFixed(4)}
    </Mono>
    <button
      onClick={onCopy}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors flex-shrink-0"
      title="Copy coordinates"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-pine-6" weight="bold" /> : <Copy className="w-3.5 h-3.5" weight="regular" />}
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Body sections — mono-cap title separated by border-t, like the filter
// FilterGroup pattern.

export const DetailSection = ({
  title,
  count,
  children,
  first = false,
}: {
  title: string;
  count?: string;
  children: ReactNode;
  first?: boolean;
}) => (
  <div className={cn('px-[18px] py-4', !first && 'border-t border-line')}>
    <div className="flex items-center justify-between mb-2.5">
      <Mono className="text-ink-2">{title}</Mono>
      {count && <Mono className="text-ink-3">{count}</Mono>}
    </div>
    {children}
  </div>
);

// Label/value row — used inside DetailSection. Right-aligned value, mono-cap
// label so a list of rows reads like a data table.
export const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <Mono className="text-ink-3 flex-shrink-0">{label}</Mono>
    <span className="text-[13px] text-ink text-right break-words font-sans">{value}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Tag pills — single component covering the variants we actually use across
// the four panels. Keeps the visual rhythm identical to the result-list rows.

type DetailTagVariant = 'pine' | 'sage' | 'clay' | 'ember' | 'water' | 'ghost' | 'ink';

const TAG_STYLES: Record<DetailTagVariant, string> = {
  pine:  'bg-pine-6/[0.18] border-pine-6 text-pine-6',
  sage:  'bg-sage/[0.18]   border-sage   text-sage',
  clay:  'bg-clay/[0.14]   border-clay   text-clay',
  ember: 'bg-ember/[0.14]  border-ember  text-ember',
  water: 'bg-water/[0.20]  border-water  text-ink-2',
  ghost: 'bg-white         border-line   text-ink',
  ink:   'bg-ink           border-ink    text-cream',
};

export const DetailTag = ({
  children,
  variant = 'ghost',
}: {
  children: ReactNode;
  variant?: DetailTagVariant;
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full border text-[10px] font-mono font-semibold uppercase tracking-[0.12em]',
      TAG_STYLES[variant],
    )}
  >
    {children}
  </span>
);
