import { useEffect, useState } from 'react';
import {
  Tent,
  MagnifyingGlass,
  Star,
  ArrowRight,
  CaretDown,
  X as XIcon,
  Sun,
  Moon,
  Mountains,
  Camera,
  GasPump,
  Path,
  Heart,
  Plus,
  Trash,
  ArrowsClockwise,
  Check,
  Warning,
  Info,
  CaretUp,
  Gear,
  User,
  SignOut,
  Share,
  Copy,
  Clock,
  Calendar,
  Cloud,
  MapPin,
  MapPinArea,
  NavigationArrow,
  Wind,
  Compass,
  Truck,
  Funnel,
} from '@phosphor-icons/react';
import {
  Mono,
  Pill,
  Tag,
  StatusDot,
  TopoBg,
  Surface,
  EmptyState,
  StatCard,
  Field,
  Banner,
  SegmentedControl,
  Spinner,
  DismissibleTag,
  SkeletonRow,
  SkeletonCard,
  SkeletonDayCard,
} from '@/components/redesign';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// 2026 Redesign Style Guide
// Comprehensive showcase of the Pine + Paper system. Covers surfaces, ink,
// pine ramp, supporting + functional palettes, type scale, primitives,
// interactive form controls, stop-type iconography, full Phosphor icon grid,
// guardrails — and a dark-mode preview the whole page can toggle into.

// ---------- helpers ----------
const Section = ({
  id,
  label,
  title,
  children,
  dark,
}: {
  id: string;
  label: string;
  title: string;
  children: React.ReactNode;
  dark?: boolean;
}) => (
  <section
    id={id}
    className={[
      'scroll-mt-6 border-t px-14 py-12',
      dark ? 'border-cream/10 bg-ink-pine text-cream' : 'border-line text-ink',
    ].join(' ')}
  >
    <div className="grid grid-cols-[220px_1fr] gap-12 items-start">
      <div>
        <Mono className={dark ? 'text-ink-ondark' : 'text-pine-6'} size={11}>{label}</Mono>
        <div className="mt-2 font-sans font-bold text-3xl leading-[1.05] tracking-[-0.02em]">{title}</div>
      </div>
      <div>{children}</div>
    </div>
  </section>
);

const Swatch = ({
  cls,
  name,
  hex,
  hsl,
  textOnLight,
}: {
  cls: string;
  name: string;
  hex: string;
  hsl: string;
  textOnLight?: boolean;
}) => (
  <div className="flex flex-col gap-2">
    <div className={`${cls} aspect-[1.6] rounded-[10px] border border-black/10 dark:border-white/10`} />
    <div className="flex justify-between items-baseline">
      <span className={`font-sans font-semibold text-[13px] ${textOnLight ? 'text-ink' : 'text-ink dark:text-cream'}`}>{name}</span>
      <Mono size={9} className="text-ink-3">{hex}</Mono>
    </div>
    <Mono size={9} className="text-ink-3 opacity-70">{hsl}</Mono>
  </div>
);

// ---------- page ----------
const StyleGuide = () => {
  // Page-level dark toggle. Wraps the page in a div with `.dark` so the
  // global dark-mode CSS variables kick in for everything inside.
  const [dark, setDark] = useState(false);

  // Interactive form state
  const [vehicle, setVehicle] = useState('passenger');
  const [agencies, setAgencies] = useState<Set<string>>(new Set(['blm', 'usfs']));
  const [showDerived, setShowDerived] = useState(true);
  const [hideVisited, setHideVisited] = useState(false);
  // Dual-thumb range slider (low/high), in miles, max 50.
  const [distLow, setDistLow] = useState(2);
  const [distHigh, setDistHigh] = useState(14);
  const distMax = 50;
  const [sortBy, setSortBy] = useState('Recommended');
  const [region, setRegion] = useState('');

  // Restore dark preference within the page session
  useEffect(() => {
    const saved = localStorage.getItem('styleguide-dark');
    if (saved === '1') setDark(true);
  }, []);
  useEffect(() => {
    localStorage.setItem('styleguide-dark', dark ? '1' : '0');
  }, [dark]);

  const toggleAgency = (key: string) =>
    setAgencies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="lg:flex lg:items-start bg-paper text-ink font-sans">
        <StyleGuideNav />
        <div className="flex-1 min-w-0">
        {/* HEADER */}
        <div className="relative overflow-hidden px-14 pt-14 pb-2">
          <TopoBg color="hsl(var(--ink-pine))" opacity={0.12} />
          <div className="relative flex justify-between items-start">
            <div>
              <Mono className="text-pine-6" size={11}>STYLE GUIDE · v0.2 · 2026</Mono>
              <h1 className="font-sans font-bold text-[88px] leading-[0.94] tracking-[-0.04em] mt-3.5 max-w-[880px]">
                One paper. One ink. One accent.
              </h1>
              <p className="text-[18px] leading-[1.55] text-ink-3 max-w-[680px] mt-6 mb-8">
                The full primitive set behind the redesign. Surfaces, ink ramps,
                a single accent, type scale, controls, and form elements — all
                on warm paper, detailed with mono labels and quiet outlines.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {/* Dark-mode toggle */}
              <button
                type="button"
                onClick={() => setDark((d) => !d)}
                aria-pressed={dark}
                className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-cream dark:bg-paper-2 px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-paper-2 dark:hover:bg-paper"
              >
                {dark ? <Sun size={14} weight="regular" /> : <Moon size={14} weight="regular" />}
                {dark ? 'Light' : 'Dark'} preview
              </button>
              <Mono>FONT</Mono>
              <div className="font-sans font-bold text-[32px] tracking-[-0.02em]">Manrope</div>
              <Mono>+ Space Mono · meta</Mono>
            </div>
          </div>
        </div>

        {/* 01 SURFACES */}
        <Section id="surfaces" label="01 · SURFACES" title="Warm neutral paper">
          <div className="grid grid-cols-5 gap-3.5">
            <Swatch cls="bg-cream"   name="Cream"   hex="#FAF6EA" hsl="hsl(45 56% 95%)" />
            <Swatch cls="bg-paper"   name="Paper"   hex="#F4F0E4" hsl="hsl(43 50% 92%)" />
            <Swatch cls="bg-paper-2" name="Paper 2" hex="#ECE6D4" hsl="hsl(45 38% 88%)" />
            <Swatch cls="bg-line"    name="Line"    hex="#DFD8C4" hsl="hsl(45 33% 82%)" />
            <Swatch cls="bg-line-2"  name="Line 2"  hex="#C9C0A8" hsl="hsl(43 25% 72%)" />
          </div>
        </Section>

        {/* 02 INK */}
        <Section id="ink" label="02 · INK" title="Five steps for hierarchy">
          <div className="grid grid-cols-5 gap-3.5">
            <Swatch cls="bg-ink"        name="Ink"      hex="#13160F" hsl="hsl(80 18% 7%)" />
            <Swatch cls="bg-ink-pine"   name="Pine ink" hex="#1D2218" hsl="hsl(96 18% 11%)" />
            <Swatch cls="bg-ink-2"      name="Ink 2"    hex="#33352E" hsl="hsl(60 8% 19%)" />
            <Swatch cls="bg-ink-3"      name="Ink 3"    hex="#5A5D52" hsl="hsl(80 6% 34%)" />
            <Swatch cls="bg-ink-ondark" name="On dark"  hex="#9AA190" hsl="hsl(96 8% 60%)" />
          </div>
        </Section>

        {/* 03 ACCENT */}
        <Section id="accent" label="03 · ACCENT" title="Pine ramp · 1 to 9">
          <div className="grid grid-cols-9 gap-2.5">
            {[
              { c: 'bg-pine-1', n: 'Pine 1', h: '#EEF1E4', hsl: 'hsl(78 38% 92%)' },
              { c: 'bg-pine-2', n: 'Pine 2', h: '#D9E1C4', hsl: 'hsl(78 36% 83%)' },
              { c: 'bg-pine-3', n: 'Pine 3', h: '#B9C79B', hsl: 'hsl(80 30% 70%)' },
              { c: 'bg-pine-4', n: 'Pine 4', h: '#8AA067', hsl: 'hsl(85 25% 52%)' },
              { c: 'bg-pine-5', n: 'Pine 5', h: '#5B6F3F', hsl: 'hsl(90 27% 34%)' },
              { c: 'bg-pine-6', n: 'Pine 6 ★', h: '#3A4A2A', hsl: 'hsl(96 27% 23%)' },
              { c: 'bg-pine-7', n: 'Pine 7', h: '#2F3D22', hsl: 'hsl(96 28% 19%)' },
              { c: 'bg-pine-8', n: 'Pine 8', h: '#28341D', hsl: 'hsl(96 30% 16%)' },
              { c: 'bg-pine-9', n: 'Pine 9', h: '#243018', hsl: 'hsl(96 33% 14%)' },
            ].map((s) => <Swatch key={s.n} cls={s.c} name={s.n} hex={s.h} hsl={s.hsl} />)}
          </div>
        </Section>

        {/* 04 SUPPORTING */}
        <Section id="supporting" label="04 · SUPPORTING" title="Used sparingly, with intent">
          <div className="grid grid-cols-4 gap-3.5">
            <Swatch cls="bg-clay"  name="Clay (derived)"   hex="#A86A3C" hsl="hsl(25 47% 45%)" />
            <Swatch cls="bg-sage"  name="Sage (verified)"  hex="#7A9156" hsl="hsl(86 25% 45%)" />
            <Swatch cls="bg-ember" name="Ember (alert)"    hex="#B8542E" hsl="hsl(15 60% 45%)" />
            <Swatch cls="bg-water" name="Water (map only)" hex="#9AB1A3" hsl="hsl(150 13% 65%)" />
          </div>
        </Section>

        {/* 05 PINS */}
        <Section id="map-pins" label="05 · MAP PINS" title="Severity ramp + provenance">
          <div className="grid grid-cols-6 gap-3.5">
            <Swatch cls="bg-pin-easy"       name="Easy"       hex="#D7AB45" hsl="hsl(45 62% 56%)" />
            <Swatch cls="bg-pin-safe"       name="Known/Safe" hex="#476E3D" hsl="hsl(96 28% 38%)" />
            <Swatch cls="bg-pin-moderate"   name="Moderate"   hex="#D9712B" hsl="hsl(24 68% 52%)" />
            <Swatch cls="bg-pin-hard"       name="Hard"       hex="#3A2A1F" hsl="hsl(20 30% 16%)" />
            <Swatch cls="bg-pin-campground" name="Campground" hex="#4979A7" hsl="hsl(206 38% 46%)" />
            <Swatch cls="bg-pin-community"  name="Community"  hex="#B84684" hsl="hsl(320 45% 50%)" />
          </div>
          <p className="text-[13px] text-ink-3 mt-4 leading-[1.5] max-w-[620px]">
            Hierarchy: easy → moderate → hard reads ordinally. Known/Safe (OSM camp-sites)
            sits off the severity ramp. Campground (blue) and Community (pink) are separate
            kinds — Community pins are user-contributed dispersed spots, the warm magenta
            pops them out from the difficulty ramp on the explorer map.
          </p>
        </Section>

        {/* 06 LAND OVERLAYS */}
        <Section id="land-overlays" label="06 · LAND OVERLAYS" title="Seven agencies, all desaturated except tribal">
          <div className="grid grid-cols-7 gap-3.5">
            <Swatch cls="bg-land-blm"        name="BLM"          hex="#BD8538" hsl="hsl(36 55% 52%)" />
            <Swatch cls="bg-land-usfs"       name="USFS"         hex="#4D8F65" hsl="hsl(140 32% 42%)" />
            <Swatch cls="bg-land-nps"        name="NPS"          hex="#7A6A9E" hsl="hsl(268 28% 52%)" />
            <Swatch cls="bg-land-statepark"  name="State Park"   hex="#4A7DB5" hsl="hsl(206 42% 50%)" />
            <Swatch cls="bg-land-statetrust" name="State Trust"  hex="#4A95A4" hsl="hsl(186 36% 48%)" />
            <Swatch cls="bg-land-landtrust"  name="Land Trust"   hex="#B3677A" hsl="hsl(338 38% 58%)" />
            <Swatch cls="bg-land-tribal"     name="Tribal"       hex="#A13E36" hsl="hsl(5 50% 42%)" />
          </div>
          <p className="text-[13px] text-ink-3 mt-4 leading-[1.5] max-w-[620px]">
            Tribal sits at HSL 5° — saturated oxblood, distinct from BLM's 36° clay
            and ember alerts at 15°. Higher saturation than the rest because
            dispersed camping inside reservations usually requires permission, so
            the polygon outline needs to draw the eye on the explorer map.
          </p>
        </Section>

        {/* 07 ROADS */}
        <Section id="road-tiers" label="07 · ROAD TIERS" title="Solid, dashed by access">
          <div className="space-y-3.5">
            {[
              { c: 'bg-road-paved',     n: 'Paved',           dash: 'solid' },
              { c: 'bg-road-passenger', n: 'Passenger',       dash: 'solid' },
              { c: 'bg-road-highclear', n: 'High clearance',  dash: '8 4' },
              { c: 'bg-road-fourwd',    n: '4WD',             dash: '4 4' },
              { c: 'bg-road-atv',       n: 'ATV / motorcycle', dash: '2 5' },
            ].map((r) => (
              <div key={r.n} className="flex items-center gap-4">
                <div className={`${r.c} h-1.5 w-32 rounded-full`} />
                <div className="text-[13.5px] font-medium text-ink-2 dark:text-cream/80">{r.n}</div>
                <Mono>DASH {r.dash}</Mono>
              </div>
            ))}
          </div>
        </Section>

        {/* 08 TYPE */}
        <Section id="type" label="08 · TYPE" title="One sans, one mono. That's all.">
          <div className="space-y-5">
            {[
              { n: 'Display L', px: 96, lh: 0.92, w: 700, t: -0.045, sample: 'Find a quiet place to roam.' },
              { n: 'Display M', px: 72, lh: 0.94, w: 700, t: -0.04, sample: 'Less colour. More character.' },
              { n: 'Headline',  px: 48, lh: 1.0,  w: 700, t: -0.03, sample: 'This week, the Sawtooths.' },
              { n: 'Title',     px: 28, lh: 1.15, w: 700, t: -0.02, sample: 'Sawtooth NRA' },
              { n: 'Body Large', px: 19, lh: 1.55, w: 500, t: 0, sample: 'Off-grid camping on public land — community spots, dispersed sites, and established campgrounds, on one honest map.' },
              { n: 'Body',      px: 15, lh: 1.55, w: 500, t: 0, sample: '756,000 acres of mountain alpine, threaded by 40+ trailheads.' },
              { n: 'Caption',   px: 12, lh: 1.5,  w: 500, t: 0, sample: 'Updated 14 minutes ago · Salt Lake City' },
              { n: 'Mono · meta', px: 10, lh: 1.4, w: 500, t: 0.14, mono: true, upper: true, sample: 'BLM · UT-279 · 38.55N 109.67W' },
            ].map((t) => (
              <div key={t.n} className="grid grid-cols-[150px_1fr] gap-6 items-baseline border-b border-line dark:border-line/30 pb-5">
                <div>
                  <Mono>{t.n}</Mono>
                  <div className="text-[11px] text-ink-3 mt-1 font-mono">{t.px}px · {t.lh} · {t.w}</div>
                </div>
                <div
                  className={t.mono ? 'font-mono' : 'font-sans'}
                  style={{
                    fontSize: t.px,
                    lineHeight: t.lh,
                    fontWeight: t.w,
                    letterSpacing: `${t.t}em`,
                    textTransform: t.upper ? 'uppercase' : 'none',
                    textWrap: 'pretty',
                    maxWidth: '95%',
                  }}
                >
                  {t.sample}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 09 PILLS & TAGS */}
        <Section id="pills-tags" label="09 · PILLS & TAGS" title="One shape, three weights">
          <div className="space-y-6">
            <div>
              <Mono>SOLID · primary CTA · hover me</Mono>
              <div className="flex gap-2.5 mt-2.5 flex-wrap">
                <Pill variant="solid-pine" mono={false} onClick={() => null}>Find camps near me <ArrowRight size={13} weight="bold" /></Pill>
                <Pill variant="solid-ink" mono={false} onClick={() => null}>Open map</Pill>
              </div>
            </div>
            <div>
              <Mono>GHOST · secondary CTA</Mono>
              <div className="flex gap-2.5 mt-2.5 flex-wrap">
                <Pill variant="ghost" mono={false} onClick={() => null}>Best hikes today</Pill>
                <Pill variant="accent" mono={false} onClick={() => null}>Save region</Pill>
                <Pill variant="clay" mono={false} onClick={() => null}>Mark unverified</Pill>
              </div>
            </div>
            <div>
              <Mono>TAGS · small, mono caps, outline only · facts and amenities</Mono>
              <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
                {['BLM', 'USFS', 'Dead-end', '4WD', 'Vault toilet', 'Bear country', 'Free dispersed'].map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </div>

            {/* Filled accent chips — used for status, source, sub-kind labels.
               Same shape as Tag but filled with an accent tint instead of outlined. */}
            <div>
              <Mono>STATUS CHIPS · filled accent · status, source, sub-kind</Mono>
              <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
                <StatusChip tone="pine">Saved</StatusChip>
                <StatusChip tone="sage">USFS</StatusChip>
                <StatusChip tone="clay">Pending</StatusChip>
                <StatusChip tone="ember">Closed</StatusChip>
                <StatusChip tone="water">Recreation.gov</StatusChip>
                <StatusChip tone="ink">Owner</StatusChip>
              </div>
              <p className="text-[12.5px] text-ink-3 mt-2 leading-[1.55] max-w-[640px]">
                Same dimensions as a Tag (10px mono, full-radius) but filled with{' '}
                <code className="font-mono text-ink-2">bg-{`{accent}`}/15 text-{`{accent}`}</code>. Use for source
                labels, status states, and category sub-kinds — anywhere a Tag's outline feels too quiet.
              </p>
            </div>

            {/* Same chip shape with leading icon */}
            <div>
              <Mono>STATUS CHIPS · with icon · timed states</Mono>
              <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
                <StatusChip tone="pine" Icon={Check}>Approved</StatusChip>
                <StatusChip tone="clay" Icon={Clock}>Pending</StatusChip>
                <StatusChip tone="water" Icon={User}>Signed up</StatusChip>
                <StatusChip tone="ember" Icon={Warning}>Failed</StatusChip>
                <StatusChip tone="sage" Icon={Star}>Verified</StatusChip>
              </div>
            </div>

            {/* Highlight type chips — used in Surprise Me banner + LocationDetail */}
            <div>
              <Mono>HIGHLIGHT CHIPS · type-coloured · for stops on a discovery card</Mono>
              <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
                <StatusChip tone="ember" Icon={Camera}>Viewpoint</StatusChip>
                <StatusChip tone="sage" Icon={Path}>Trail</StatusChip>
                <StatusChip tone="water" Icon={MapPinArea}>Water</StatusChip>
                <StatusChip tone="clay" Icon={Tent}>Camp</StatusChip>
              </div>
            </div>

            {/* Score badges — solid rounded chip with bold sans number */}
            <div>
              <Mono>SCORE BADGES · solid · ordinal score, 0–100</Mono>
              <div className="flex gap-2 mt-2.5 flex-wrap items-center">
                <ScoreBadge score={92} />
                <ScoreBadge score={71} />
                <ScoreBadge score={48} />
                <ScoreBadge score={24} />
                <span className="text-[12px] text-ink-3 ml-2">
                  ≥70 pine · ≥50 clay · ≥30 ember · &lt;30 ink
                </span>
              </div>
            </div>

            {/* Code chips — invite codes, coords, mono ids */}
            <div>
              <Mono>CODE CHIPS · cream + line · invite codes, IDs, coords</Mono>
              <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
                <CodeChip>ROAM-4789</CodeChip>
                <CodeChip>BLM-MOAB-12</CodeChip>
                <CodeChip>38.55, -109.67</CodeChip>
              </div>
            </div>

            {/* Permission badges — share dialog */}
            <div>
              <Mono>PERMISSION BADGES · soft · trip share dialog</Mono>
              <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
                <StatusChip tone="ink">Owner</StatusChip>
                <StatusChip tone="pine">Edit</StatusChip>
                <StatusChip tone="water">View</StatusChip>
              </div>
            </div>

            <div>
              <Mono>STATUS DOTS · single accent + shape</Mono>
              <div className="flex gap-2.5 mt-2.5 flex-wrap items-center">
                <StatusDot kind="known" />
                <StatusDot kind="derived" />
                <StatusDot kind="verified" />
                <StatusDot kind="alert" />
              </div>
            </div>
          </div>
        </Section>

        {/* 10 FORM CONTROLS — interactive */}
        <Section id="form-controls" label="10 · FORM CONTROLS" title="Radios, checkboxes, sliders, inputs">
          <div className="grid grid-cols-2 gap-8">
            {/* Radios */}
            <div className="bg-cream dark:bg-paper-2 border border-line dark:border-line-2 rounded-[14px] px-6 py-5">
              <Mono className="text-pine-6">RADIO · single select</Mono>
              <div className="font-sans font-bold text-[18px] mt-2 tracking-[-0.01em]">Vehicle type</div>
              <div className="mt-3.5 flex flex-col gap-2.5">
                {[
                  { v: 'any',        l: 'Any vehicle',          sub: 'No filter applied' },
                  { v: 'passenger',  l: 'Passenger car',        sub: 'Maintained gravel + paved' },
                  { v: 'hc',         l: 'High-clearance (HC+)', sub: 'Rough but no engagement' },
                  { v: '4wd',        l: '4WD only',             sub: 'Engagement required' },
                ].map((r) => {
                  const on = vehicle === r.v;
                  return (
                    <label key={r.v} className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="radio"
                        name="vehicle"
                        value={r.v}
                        checked={on}
                        onChange={() => setVehicle(r.v)}
                        className="sr-only"
                      />
                      <span
                        className={[
                          'shrink-0 w-[18px] h-[18px] mt-px rounded-full border-[1.5px] grid place-items-center transition-colors',
                          on ? 'border-pine-6' : 'border-ink-3/50 group-hover:border-ink-3',
                        ].join(' ')}
                      >
                        {on && <span className="w-2 h-2 rounded-full bg-pine-6" />}
                      </span>
                      <div>
                        <div className={`text-[14px] ${on ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>{r.l}</div>
                        <div className="text-[12px] text-ink-3 mt-0.5">{r.sub}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Checkboxes */}
            <div className="bg-cream dark:bg-paper-2 border border-line dark:border-line-2 rounded-[14px] px-6 py-5">
              <Mono className="text-pine-6">CHECKBOX · multi select</Mono>
              <div className="font-sans font-bold text-[18px] mt-2 tracking-[-0.01em]">Land manager</div>
              <div className="mt-3.5 flex flex-col gap-2">
                {[
                  { k: 'blm', l: 'BLM',         sub: 'Bureau of Land Management', count: 58 },
                  { k: 'usfs', l: 'USFS',       sub: 'US Forest Service',         count: 71 },
                  { k: 'nps', l: 'NPS',         sub: 'National Park Service',     count: 3 },
                  { k: 'sp',  l: 'State park',  sub: '',                          count: 2 },
                  { k: 'st',  l: 'State trust', sub: '',                          count: 3 },
                ].map((r) => {
                  const on = agencies.has(r.k);
                  return (
                    <label key={r.k} className="flex items-center gap-3 cursor-pointer py-1 group">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleAgency(r.k)}
                        className="sr-only"
                      />
                      <span
                        className={[
                          'shrink-0 w-[18px] h-[18px] rounded-[5px] border-[1.5px] grid place-items-center transition-colors',
                          on ? 'border-pine-6 bg-pine-6 text-cream' : 'border-ink-3/50 group-hover:border-ink-3',
                        ].join(' ')}
                      >
                        {on && <Check size={11} weight="bold" />}
                      </span>
                      <div className="flex-1">
                        <div className={`text-[14px] ${on ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>{r.l}</div>
                        {r.sub && <div className="text-[11px] text-ink-3 mt-0.5">{r.sub}</div>}
                      </div>
                      <Mono>{r.count}</Mono>
                    </label>
                  );
                })}
              </div>

              <div className="mt-6 pt-5 border-t border-line">
                <Mono className="text-pine-6">TOGGLE · binary</Mono>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  {[
                    { l: 'Show derived spots',  on: showDerived,  set: setShowDerived },
                    { l: 'Hide already-visited', on: hideVisited, set: setHideVisited },
                  ].map((t) => (
                    <button
                      key={t.l}
                      type="button"
                      onClick={() => t.set(!t.on)}
                      className="flex items-center justify-between w-full text-left"
                    >
                      <span className="text-[13px] font-medium text-ink-2">{t.l}</span>
                      <span className={`relative w-9 h-5 rounded-full transition-colors ${t.on ? 'bg-pine-6' : 'bg-line-2'}`}>
                        <span
                          className="absolute top-0.5 w-4 h-4 rounded-full bg-cream transition-[left] duration-150"
                          style={{ left: t.on ? 18 : 2 }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Slider — working dual-thumb */}
            <div className="bg-cream dark:bg-paper-2 border border-line dark:border-line-2 rounded-[14px] px-6 py-5">
              <Mono className="text-pine-6">SLIDER · range</Mono>
              <div className="flex justify-between items-baseline mt-2">
                <div className="font-sans font-bold text-[18px] tracking-[-0.01em]">Distance from me</div>
                <div className="font-mono text-[12px] font-semibold text-ink">{distLow} – {distHigh} mi</div>
              </div>
              <div className="mt-6 relative h-6 select-none">
                {/* Track */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-line rounded-full" />
                {/* Active fill */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-1 bg-pine-6 rounded-full"
                  style={{
                    left: `${(distLow / distMax) * 100}%`,
                    right: `${100 - (distHigh / distMax) * 100}%`,
                  }}
                />
                {/* Two range inputs overlaid; pointer-events:none on track,
                   pointer-events:auto on the thumbs only via Tailwind arbitrary
                   variants for the webkit/moz thumb pseudo-elements. */}
                {[
                  { value: distLow, set: (v: number) => setDistLow(Math.min(v, distHigh - 1)) },
                  { value: distHigh, set: (v: number) => setDistHigh(Math.max(v, distLow + 1)) },
                ].map((s, i) => (
                  <input
                    key={i}
                    type="range"
                    min={0}
                    max={distMax}
                    value={s.value}
                    onChange={(e) => s.set(Number(e.target.value))}
                    className={[
                      'absolute inset-0 w-full appearance-none bg-transparent pointer-events-none',
                      '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none',
                      '[&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px]',
                      '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cream',
                      '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-pine-6',
                      '[&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(29,34,24,.18)]',
                      '[&::-webkit-slider-thumb]:cursor-grab active:[&::-webkit-slider-thumb]:cursor-grabbing',
                      '[&::-moz-range-thumb]:pointer-events-auto',
                      '[&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px]',
                      '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-cream',
                      '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-pine-6',
                      '[&::-moz-range-thumb]:shadow-[0_2px_6px_rgba(29,34,24,.18)]',
                      '[&::-moz-range-thumb]:cursor-grab',
                    ].join(' ')}
                    style={{ height: 24 }}
                    aria-label={i === 0 ? 'Minimum distance' : 'Maximum distance'}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2.5">
                <Mono>0 MI</Mono><Mono>{distMax} MI</Mono>
              </div>
            </div>

            {/* Inputs — built out: text, search, dropdown (no inner label),
               error state, disabled. Borders use ink-3/30 instead of line for
               better contrast against cream. */}
            <div className="bg-cream dark:bg-paper-2 border border-line dark:border-line-2 rounded-[14px] px-6 py-5">
              <Mono className="text-pine-6">INPUT · variants</Mono>

              <div className="mt-4 space-y-4">
                {/* 1. Text — label above, helper below */}
                <div>
                  <label className="block">
                    <Mono className="text-ink-2">REGION</Mono>
                    <input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="e.g. Moab, Olympic, Sawtooth NRA"
                      className="mt-1.5 w-full bg-cream dark:bg-ink-pine border border-ink-3/35 dark:border-ink-3/40 rounded-[10px] px-3.5 py-2.5 text-[14px] outline-none placeholder:text-ink-3 transition-colors hover:border-ink-3 focus:border-pine-6"
                    />
                  </label>
                  <div className="text-[12px] text-ink-3 mt-1.5">A region, road, or coordinate.</div>
                </div>

                {/* 2. Search with icon */}
                <div>
                  <Mono className="text-ink-2">SEARCH</Mono>
                  <div className="mt-1.5 flex items-center gap-2.5 bg-cream dark:bg-ink-pine border border-ink-3/35 dark:border-ink-3/40 rounded-[10px] px-3.5 py-2.5 hover:border-ink-3 focus-within:border-pine-6 transition-colors">
                    <MagnifyingGlass size={16} weight="regular" className="text-ink-2" />
                    <input
                      placeholder="Search a road, agency, or coordinate"
                      className="flex-1 border-none outline-none text-[14px] bg-transparent placeholder:text-ink-3"
                    />
                  </div>
                </div>

                {/* 3. Dropdown — label OUTSIDE, value alone in field */}
                <div>
                  <label className="block">
                    <Mono className="text-ink-2">SORT BY</Mono>
                    <div className="relative mt-1.5">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="w-full appearance-none bg-cream dark:bg-ink-pine border border-ink-3/35 dark:border-ink-3/40 rounded-[10px] px-3.5 py-2.5 pr-10 text-[14px] font-semibold text-ink outline-none cursor-pointer hover:border-ink-3 focus:border-pine-6 transition-colors"
                      >
                        {['Recommended', 'Closest', 'Highest rated', 'Recently added', 'Most photos'].map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                      <CaretDown size={14} weight="bold" className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-2" />
                    </div>
                  </label>
                </div>

                {/* 4. Error state */}
                <div>
                  <Mono className="text-ember">COORDINATES · invalid</Mono>
                  <input
                    defaultValue="38.55, --109.67"
                    className="mt-1.5 w-full bg-cream dark:bg-ink-pine border border-ember rounded-[10px] px-3.5 py-2.5 text-[14px] outline-none focus:border-ember focus:ring-2 focus:ring-ember/20"
                  />
                  <div className="text-[12px] text-ember mt-1.5 flex items-center gap-1">
                    <Warning size={12} weight="fill" />
                    Longitude must be a positive or negative number.
                  </div>
                </div>

                {/* 5. Disabled */}
                <div>
                  <Mono className="text-ink-3">DISABLED</Mono>
                  <input
                    disabled
                    placeholder="Locked while syncing…"
                    className="mt-1.5 w-full bg-paper-2/60 border border-line-2 rounded-[10px] px-3.5 py-2.5 text-[14px] text-ink-3 placeholder:text-ink-3 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* 11 STOP TYPE ICONS — restored from old guide, re-themed */}
        <Section id="stop-types" label="11 · STOP TYPES" title="Trip stop iconography">
          <div className="grid grid-cols-3 gap-3">
            {[
              { Icon: Tent,       l: 'Camp',     sub: 'Established + dispersed', color: 'text-pine-6' },
              { Icon: Mountains,  l: 'Hike',     sub: 'Trailhead, summit',       color: 'text-pine-6' },
              { Icon: Camera,     l: 'View',     sub: 'Photo / scenic spot',     color: 'text-pine-6' },
              { Icon: GasPump,    l: 'Fuel',     sub: 'Gas station, propane',    color: 'text-clay' },
              { Icon: MapPinArea, l: 'Region',   sub: 'Park, NRA, NF',           color: 'text-pine-6' },
              { Icon: NavigationArrow, l: 'Pass-through', sub: 'Routing waypoint', color: 'text-ink-3' },
              { Icon: Cloud,      l: 'Weather',  sub: 'Forecast checkpoint',     color: 'text-water' },
              { Icon: Path,       l: 'Drive',    sub: 'Scenic road segment',     color: 'text-pine-6' },
              { Icon: Star,       l: 'Saved',    sub: 'User favourite',          color: 'text-clay' },
            ].map(({ Icon, l, sub, color }) => (
              <div key={l} className="flex items-center gap-3 px-4 py-3 border border-line dark:border-line-2 rounded-[10px] bg-cream dark:bg-paper-2">
                <div className="w-10 h-10 rounded-[8px] bg-paper dark:bg-ink-pine border border-line dark:border-line-2 grid place-items-center">
                  <Icon size={20} weight="regular" className={color} />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-ink">{l}</div>
                  <Mono className="text-ink-3">{sub}</Mono>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 12 ICON GRID — Phosphor reference */}
        <Section id="icons" label="12 · ICONS" title="Phosphor — single weight, currentColor">
          <div className="grid grid-cols-8 gap-3">
            {([
              [MagnifyingGlass, 'Search'], [MapPin, 'Pin'], [MapPinArea, 'Region'],
              [Tent, 'Camp'], [Mountains, 'Hike'], [Camera, 'Photo'],
              [Compass, 'Compass'], [Sun, 'Sun'], [Moon, 'Moon'], [Cloud, 'Cloud'], [Wind, 'Wind'],
              [Truck, 'Truck'], [GasPump, 'Fuel'], [Path, 'Path'], [NavigationArrow, 'Nav'],
              [Funnel, 'Filter'], [Star, 'Star'], [Heart, 'Heart'],
              [Plus, 'Plus'], [ArrowsClockwise, 'Reload'], [ArrowRight, 'Arrow'],
              [Check, 'Check'], [XIcon, 'Close'], [Warning, 'Warning'], [Info, 'Info'],
              [CaretDown, 'CaretDown'], [CaretUp, 'CaretUp'],
              [Gear, 'Gear'], [User, 'User'], [SignOut, 'SignOut'],
              [Share, 'Share'], [Copy, 'Copy'], [Clock, 'Clock'], [Calendar, 'Calendar'],
              [Trash, 'Trash'],
            ] as const).map(([Icon, name]) => (
              <div key={name} className="flex flex-col items-center gap-1.5 px-3 py-3 border border-line dark:border-line-2 rounded-[8px] bg-cream dark:bg-paper-2">
                <Icon size={20} weight="regular" className="text-ink" />
                <Mono size={9} className="text-ink-3">{name}</Mono>
              </div>
            ))}
          </div>
        </Section>

        {/* 13 COMPONENTS — cards + list rows */}
        <Section id="components" label="13 · COMPONENTS" title="Cards, list rows, and badges">
          <div className="grid grid-cols-2 gap-5">
            <article className="border border-line dark:border-line-2 rounded-[14px] overflow-hidden bg-white dark:bg-paper-2">
              <div className="h-[140px] relative bg-gradient-to-br from-[#a89779] via-[#7d6e54] to-[#4d4636]">
                <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 14px, rgba(0,0,0,.06) 14px 28px)' }} />
                <div className="absolute left-3 top-3">
                  <span className="font-mono text-[9px] tracking-[0.14em] uppercase font-semibold px-2.5 py-1 rounded-full bg-pine-6 text-cream">KNOWN</span>
                </div>
                <div className="absolute right-3 top-3 bg-ink-pine/80 rounded-full px-2.5 py-1 inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-cream">
                  <Star size={11} weight="fill" />38
                </div>
                <div className="absolute left-2.5 bottom-2 font-mono text-[9px] tracking-[0.14em] uppercase text-white/80">UT-279 · 38.55N</div>
              </div>
              <div className="px-5 py-4">
                <div className="font-semibold text-[15px] tracking-[-0.01em]">Mill D South</div>
                <Mono className="text-ink-3">12.4 mi · BLM · UT-279</Mono>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Tag>Passenger</Tag>
                  <Tag>Verified</Tag>
                  <Tag>Fire ring</Tag>
                </div>
              </div>
            </article>

            <div className="border border-line dark:border-line-2 rounded-[14px] overflow-hidden bg-white dark:bg-paper-2">
              {[
                { n: 'End of FR 1821A', d: '3.4 mi', sub: 'BLM · Road terminus', r: 38, dot: 'bg-pine-6' },
                { n: 'Camp Site · Mesquite', d: '8.9 mi', sub: 'USFS · Camping', r: 35, dot: 'bg-pine-6' },
                { n: 'End of 1816', d: '5.3 mi', sub: 'BLM · Dead-end', r: 36, dot: 'bg-clay' },
              ].map((r, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[52px_1fr_auto] gap-3 items-start px-4 py-3.5 ${i > 0 ? 'border-t border-line dark:border-line-2' : ''} hover:bg-paper dark:hover:bg-paper-2/60 transition-colors cursor-pointer`}
                >
                  <div className="w-[52px] h-[52px] rounded-lg overflow-hidden border border-line bg-gradient-to-br from-[#cdb892] via-[#a78a63] to-[#6e5a3d]" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${r.dot}`} />
                      <span className="font-semibold text-[13px] tracking-[-0.01em]">{r.n}</span>
                    </div>
                    <Mono className="text-ink-3">{r.d} · {r.sub}</Mono>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star size={12} weight="fill" />
                    <span className="font-mono text-[11px] font-semibold">{r.r}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* 14 TOKENS */}
        <Section id="tokens" label="14 · TOKENS" title="Radii, spacing, shadow">
          <div className="grid grid-cols-3 gap-8">
            <div>
              <Mono className="text-pine-6">RADIUS</Mono>
              <div className="flex flex-col gap-2.5 mt-3.5">
                {[
                  { n: 'sm', v: 6, use: 'tags, swatches' },
                  { n: 'md', v: 10, use: 'inputs, segmented' },
                  { n: 'lg', v: 14, use: 'cards, panels' },
                  { n: 'xl', v: 18, use: 'hero search' },
                  { n: 'full', v: 999, use: 'pills, status' },
                ].map((r) => (
                  <div key={r.n} className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-cream dark:bg-paper-2 border border-line dark:border-line-2" style={{ borderRadius: r.v }} />
                    <div>
                      <div className="font-mono text-[11px] font-semibold">{r.n} · {r.v === 999 ? '999' : r.v + 'px'}</div>
                      <div className="text-[11px] text-ink-3 mt-0.5">{r.use}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Mono className="text-pine-6">SPACING · 4pt grid</Mono>
              <div className="flex flex-col gap-1.5 mt-3.5">
                {[4, 8, 12, 16, 24, 32, 48, 64, 96].map((s) => (
                  <div key={s} className="flex items-center gap-2.5">
                    <div className="h-3.5 bg-pine-6 rounded-sm" style={{ width: s }} />
                    <span className="font-mono text-[11px] text-ink-3">{s}px</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Mono className="text-pine-6">SHADOW</Mono>
              <div className="flex flex-col gap-3.5 mt-3.5">
                {[
                  { n: 'subtle', s: '0 1px 2px rgba(29,34,24,.06)', use: 'inputs, list rows' },
                  { n: 'card', s: '0 8px 22px rgba(29,34,24,.05)', use: 'cards on paper' },
                  { n: 'float', s: '0 18px 44px rgba(29,34,24,.10), 0 3px 8px rgba(29,34,24,.04)', use: 'hero search' },
                  { n: 'pop', s: '0 24px 60px rgba(29,34,24,.18)', use: 'modals, focus' },
                ].map((s) => (
                  <div key={s.n} className="flex items-center gap-3.5">
                    <div className="w-[60px] h-12 bg-cream dark:bg-paper-2 rounded-[10px] border border-line dark:border-line-2" style={{ boxShadow: s.s }} />
                    <div>
                      <div className="font-mono text-[11px] font-semibold">{s.n}</div>
                      <div className="text-[11px] text-ink-3 mt-0.5">{s.use}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* 15 GUARDRAILS */}
        <Section id="guardrails" label="15 · GUARDRAILS" title="Don'ts" dark>
          <div className="grid grid-cols-2 gap-4">
            {[
              'No drop shadows on tags — shape carries weight',
              'No emoji in UI — Space Mono carries the tone',
              'No gradients on backgrounds — paper or pine ink only',
              'No icon-only buttons without a tooltip — labels matter',
              'No mid-pine ramp tints (4/5) for body type',
            ].map((d) => (
              <div key={d} className="flex items-start gap-3 px-4 py-3.5 border border-cream/15 rounded-[10px]">
                <span className="shrink-0 mt-0.5 w-[18px] h-[18px] rounded-full bg-ember text-cream grid place-items-center">
                  <XIcon size={9} weight="bold" />
                </span>
                <span className="text-[14px] text-cream leading-[1.5]">{d}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* 16 SURFACE */}
        <Section id="surface" label="16 · SURFACE" title="The card primitive">
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <Surface>
              <Mono className="text-pine-6">Default</Mono>
              <p className="text-[14px] text-ink mt-1">
                White on cream — the standard card treatment.
              </p>
            </Surface>
            <Surface variant="paper">
              <Mono className="text-pine-6">Paper</Mono>
              <p className="text-[14px] text-ink mt-1">
                Recedes into the page background.
              </p>
            </Surface>
            <Surface variant="pine-tinted">
              <Mono className="text-pine-6">Pine-tinted</Mono>
              <p className="text-[14px] text-ink mt-1">
                Soft pine wash for "preset" or "saved" data tiles.
              </p>
            </Surface>
            <Surface variant="ink-pine">
              <Mono className="text-ink-ondark">Ink-pine</Mono>
              <p className="text-[14px] text-cream mt-1">
                Dark surface for hero or dark-band cards.
              </p>
            </Surface>
          </div>
        </Section>

        {/* 17 EMPTY STATE */}
        <Section id="empty-state" label="17 · EMPTY STATE" title="No-data treatment">
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <Surface padding="none">
              <EmptyState
                icon={Tent}
                eyebrow="No saved trips"
                title="Nothing saved yet."
                description="Plan a trip and it'll show up here for next time."
                accent="pine"
                action={
                  <Pill variant="solid-pine" mono={false}>
                    <Plus className="w-3.5 h-3.5" weight="bold" />
                    New trip
                  </Pill>
                }
              />
            </Surface>
            <Surface padding="none">
              <EmptyState
                icon={MagnifyingGlass}
                title="No spots in this area."
                description="Pan the map or zoom out to find dispersed sites nearby."
                accent="clay"
              />
            </Surface>
          </div>
        </Section>

        {/* 18 STAT CARD */}
        <Section id="stat-card" label="18 · STAT CARD" title="Big-number metrics">
          <div className="grid grid-cols-3 gap-3 max-w-3xl">
            <StatCard accent="clay" icon={Clock} label="Pending" value={12} />
            <StatCard accent="pine" icon={Check} label="Approved" value={48} />
            <StatCard accent="water" icon={User} label="Signed up" value={31} />
          </div>
        </Section>

        {/* 19 FIELD */}
        <Section id="field" label="19 · FIELD" title="Form-field wrapper">
          <div className="space-y-5 max-w-md">
            <Field label="Trip name" hint="Leave blank to auto-generate.">
              <input
                type="text"
                placeholder="e.g. Southwest Desert Adventure"
                className="w-full h-12 px-4 rounded-[14px] border border-line bg-white dark:bg-paper-2 text-ink text-[15px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors"
              />
            </Field>
            <Field label="Email" optional hint="Helps us send you trip recaps.">
              <input
                type="email"
                placeholder="you@email.com"
                className="w-full h-12 px-4 rounded-[14px] border border-line bg-white dark:bg-paper-2 text-ink text-[15px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors"
              />
            </Field>
            <Field label="Trip name" error="A trip with this name already exists.">
              <input
                type="text"
                defaultValue="Southwest Desert"
                className="w-full h-12 px-4 rounded-[14px] border border-ember bg-white dark:bg-paper-2 text-ink text-[15px] outline-none focus:border-ember transition-colors"
              />
            </Field>
          </div>
        </Section>

        {/* 20 BANNER */}
        <Section id="banner" label="20 · BANNER" title="Inline non-modal feedback">
          <div className="space-y-3 max-w-2xl">
            <Banner tone="info" title="Heads up." description="The trail head closes at sunset; plan the descent accordingly." />
            <Banner tone="warning" title="Permit window narrow." description="Backcountry permits open Oct 1; reserve before then." />
            <Banner tone="error" title="Save failed." description="Couldn't reach the server. Check your connection and try again." />
            <Banner tone="success" title="Saved." description="Your trip is in My Trips." onDismiss={() => null} />
          </div>
        </Section>

        {/* 21 SEGMENTED CONTROL */}
        <Section id="segmented-control" label="21 · SEGMENTED" title="Single-select pill row">
          <div className="space-y-4">
            <SegmentedControlDemo />
            <Mono className="text-ink-3 block">With counts + icons</Mono>
            <SegmentedControlDemoCounts />
          </div>
        </Section>

        {/* 22 SPINNER */}
        <Section id="spinner" label="22 · SPINNER" title="Inline loading indicator">
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-2"><Spinner size="xs" /><Mono className="text-ink-3">xs</Mono></div>
            <div className="flex flex-col items-center gap-2"><Spinner size="sm" /><Mono className="text-ink-3">sm</Mono></div>
            <div className="flex flex-col items-center gap-2"><Spinner size="md" /><Mono className="text-ink-3">md</Mono></div>
            <div className="flex flex-col items-center gap-2"><Spinner size="lg" /><Mono className="text-ink-3">lg</Mono></div>
            <div className="flex flex-col items-center gap-2"><Spinner size="xl" /><Mono className="text-ink-3">xl</Mono></div>
            <div className="flex flex-col items-center gap-2"><Spinner size="md" tone="ink" /><Mono className="text-ink-3">ink</Mono></div>
            <div className="flex flex-col items-center gap-2"><Spinner size="md" tone="ink-3" /><Mono className="text-ink-3">ink-3</Mono></div>
          </div>
        </Section>

        {/* 23 DISMISSIBLE TAG */}
        <Section id="dismissible-tag" label="23 · DISMISSIBLE TAG" title="Selection / filter chip">
          <div className="flex flex-wrap gap-2 max-w-2xl">
            <DismissibleTag accent="pine" onDismiss={() => null}>Moab</DismissibleTag>
            <DismissibleTag accent="water" onDismiss={() => null}>Salt Lake City</DismissibleTag>
            <DismissibleTag accent="ember" onDismiss={() => null}>Capitol Reef</DismissibleTag>
            <DismissibleTag accent="clay" onDismiss={() => null}>Dispersed</DismissibleTag>
            <DismissibleTag accent="sage" onDismiss={() => null}>Hiking</DismissibleTag>
          </div>
        </Section>

        {/* 24 SKELETONS */}
        <Section id="skeletons" label="24 · SKELETONS" title="Shape-aware loading states">
          <div className="grid grid-cols-2 gap-6 max-w-3xl">
            <div>
              <Mono className="text-ink-3 block mb-2">Row</Mono>
              <Surface padding="none" className="px-4 divide-y divide-line">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </Surface>
            </div>
            <div>
              <Mono className="text-ink-3 block mb-2">Card</Mono>
              <SkeletonCard />
            </div>
            <div className="col-span-2">
              <Mono className="text-ink-3 block mb-2">Day card</Mono>
              <SkeletonDayCard />
            </div>
          </div>
        </Section>

        {/* 25 DIALOG */}
        <Section id="dialog" label="25 · DIALOG" title="Modal overlay">
          <Dialog>
            <DialogTrigger asChild>
              <Pill variant="solid-pine" mono={false}>Open dialog</Pill>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <Mono className="text-pine-6">Edit dates</Mono>
                <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
                  When are you going?
                </DialogTitle>
                <DialogDescription>
                  Pick the days you'll be on the road. Changing them after generation will re-plan the trip.
                </DialogDescription>
              </DialogHeader>
              <div className="text-[13px] text-ink-3">Body content goes here.</div>
            </DialogContent>
          </Dialog>
        </Section>

        {/* 26 SHEET */}
        <Section id="sheet" label="26 · SHEET" title="Side drawer">
          <Sheet>
            <SheetTrigger asChild>
              <Pill variant="ghost" mono={false}>Open sheet</Pill>
            </SheetTrigger>
            <SheetContent>
              <Mono className="text-pine-6">Filters</Mono>
              <h3 className="font-sans font-bold text-[20px] text-ink mt-1">Refine spots</h3>
              <p className="text-[13px] text-ink-3 mt-2">Slide-in panel for secondary actions.</p>
            </SheetContent>
          </Sheet>
        </Section>

        {/* 27 DROPDOWN MENU */}
        <Section id="dropdown-menu" label="27 · DROPDOWN" title="Action menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Pill variant="ghost" mono={false}>
                Account
                <CaretDown className="w-3 h-3" weight="bold" />
              </Pill>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Signed in as Michelle</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem><User className="w-4 h-4 mr-2" weight="regular" />Profile</DropdownMenuItem>
              <DropdownMenuItem><Heart className="w-4 h-4 mr-2" weight="regular" />Saved</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem><SignOut className="w-4 h-4 mr-2" weight="regular" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        {/* 28 SELECT */}
        <Section id="select" label="28 · SELECT" title="Native dropdown">
          <Select defaultValue="utah">
            <SelectTrigger className="max-w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="utah">Utah</SelectItem>
              <SelectItem value="arizona">Arizona</SelectItem>
              <SelectItem value="colorado">Colorado</SelectItem>
              <SelectItem value="oregon">Oregon</SelectItem>
            </SelectContent>
          </Select>
        </Section>

        {/* 29 TOOLTIP */}
        <Section id="tooltip" label="29 · TOOLTIP" title="On-hover hint">
          <TooltipProvider>
            <div className="flex gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Pill variant="ghost" mono={false}>Hover me</Pill>
                </TooltipTrigger>
                <TooltipContent>The dark tooltip pattern — ink-pine on cream text.</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </Section>

        {/* 30 TABS */}
        <Section id="tabs" label="30 · TABS" title="Panel switcher">
          <Tabs defaultValue="overview" className="max-w-xl">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-[13px] text-ink-3 mt-3">Overview content goes here.</TabsContent>
            <TabsContent value="map" className="text-[13px] text-ink-3 mt-3">Map preview goes here.</TabsContent>
            <TabsContent value="details" className="text-[13px] text-ink-3 mt-3">Detail rows go here.</TabsContent>
          </Tabs>
        </Section>

        {/* 31 AVATAR */}
        <Section id="avatar" label="31 · AVATAR" title="User identity">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" alt="MT" />
              <AvatarFallback>MT</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>JR</AvatarFallback>
            </Avatar>
            <Avatar className="w-8 h-8">
              <AvatarFallback className="text-[11px]">SM</AvatarFallback>
            </Avatar>
          </div>
        </Section>

        {/* Footer */}
        <footer className="border-t border-line dark:border-line-2 px-14 py-8 bg-cream dark:bg-paper-2 flex items-center justify-between">
          <Mono>ROAMSWILD · STYLE GUIDE · 2026</Mono>
          <div className="flex gap-4">
            <Pill variant="ghost" mono={false} onClick={() => null}><Tent size={13} weight="regular" />Find a spot</Pill>
            <Pill variant="solid-pine" mono={false} onClick={() => null}>Open map<ArrowRight size={13} weight="bold" /></Pill>
          </div>
        </footer>
        </div>
      </div>
    </div>
  );
};

export default StyleGuide;

// ====== Tag helpers used inside section 09 ======

type ChipTone = 'pine' | 'sage' | 'clay' | 'ember' | 'water' | 'ink';

const CHIP_TONES: Record<ChipTone, string> = {
  pine:  'bg-pine-6/12 text-pine-6',
  sage:  'bg-sage/15 text-sage',
  clay:  'bg-clay/15 text-clay',
  ember: 'bg-ember/15 text-ember',
  water: 'bg-water/15 text-water',
  ink:   'bg-ink/8 text-ink-2 border border-line',
};

const StatusChip = ({
  tone,
  Icon,
  children,
}: {
  tone: ChipTone;
  Icon?: typeof Sun;
  children: React.ReactNode;
}) => (
  <span
    className={[
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
      'text-[10px] font-mono uppercase tracking-[0.10em] font-semibold',
      CHIP_TONES[tone],
    ].join(' ')}
  >
    {Icon && <Icon className="w-3 h-3" weight="regular" />}
    {children}
  </span>
);

const ScoreBadge = ({ score }: { score: number }) => {
  const tone =
    score >= 70 ? 'bg-pine-6 text-cream'
    : score >= 50 ? 'bg-clay text-cream'
    : score >= 30 ? 'bg-ember text-cream'
    : 'bg-ink-3 text-cream';
  return (
    <span
      className={[
        'inline-flex items-center justify-center min-w-[36px] px-2 py-0.5 rounded-full',
        'text-[12px] font-sans font-bold tracking-[-0.005em]',
        tone,
      ].join(' ')}
    >
      {score}
    </span>
  );
};

const CodeChip = ({ children }: { children: React.ReactNode }) => (
  <code className="inline-flex items-center px-2 py-1 rounded-[8px] bg-cream border border-line text-ink text-[12px] font-mono font-semibold tracking-[0.06em]">
    {children}
  </code>
);

// Sticky left-side navigation for the style guide. Anchor links scroll to
// each section's id; the page is single-scroll for now.
const NAV_GROUPS: Array<{ label: string; items: Array<{ id: string; label: string }> }> = [
  {
    label: 'Foundations',
    items: [
      { id: 'surfaces',       label: '01 · Surfaces' },
      { id: 'ink',            label: '02 · Ink' },
      { id: 'accent',         label: '03 · Accent' },
      { id: 'supporting',     label: '04 · Supporting' },
      { id: 'map-pins',       label: '05 · Map pins' },
      { id: 'land-overlays',  label: '06 · Land overlays' },
      { id: 'road-tiers',     label: '07 · Road tiers' },
      { id: 'type',           label: '08 · Type' },
    ],
  },
  {
    label: 'Primitives',
    items: [
      { id: 'pills-tags',     label: '09 · Pills & tags' },
      { id: 'form-controls',  label: '10 · Form controls' },
      { id: 'stop-types',     label: '11 · Stop types' },
      { id: 'icons',          label: '12 · Icons' },
      { id: 'components',     label: '13 · Components' },
    ],
  },
  {
    label: 'Composition',
    items: [
      { id: 'surface',           label: '16 · Surface' },
      { id: 'empty-state',       label: '17 · Empty state' },
      { id: 'stat-card',         label: '18 · Stat card' },
      { id: 'field',             label: '19 · Field' },
      { id: 'banner',            label: '20 · Banner' },
      { id: 'segmented-control', label: '21 · Segmented' },
      { id: 'spinner',           label: '22 · Spinner' },
      { id: 'dismissible-tag',   label: '23 · Dismissible tag' },
      { id: 'skeletons',         label: '24 · Skeletons' },
    ],
  },
  {
    label: 'Overlays & menus',
    items: [
      { id: 'dialog',         label: '25 · Dialog' },
      { id: 'sheet',          label: '26 · Sheet' },
      { id: 'dropdown-menu',  label: '27 · Dropdown' },
      { id: 'select',         label: '28 · Select' },
      { id: 'tooltip',        label: '29 · Tooltip' },
      { id: 'tabs',           label: '30 · Tabs' },
      { id: 'avatar',         label: '31 · Avatar' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { id: 'tokens',         label: '14 · Tokens' },
      { id: 'guardrails',     label: '15 · Guardrails' },
    ],
  },
];

const StyleGuideNav = () => (
  // Sticky on the aside itself (not on an inner div), with `self-start` so
  // the flex item doesn't stretch to match the long content column. The
  // nav stays pinned to the top of the viewport as the page scrolls.
  <aside className="hidden lg:block lg:w-60 lg:flex-shrink-0 lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto border-r border-line bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md">
    <div className="px-4 py-6">
      <Mono className="text-pine-6 px-2 mb-3 block">Style guide</Mono>
      <nav className="space-y-5" aria-label="Style guide sections">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <Mono className="text-ink-3 px-2 mb-1.5 block">{group.label}</Mono>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="block px-2 py-1.5 rounded-[8px] text-[12px] font-sans font-semibold tracking-[-0.005em] text-ink-2 hover:text-ink hover:bg-paper transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  </aside>
);

// Local demos for the SegmentedControl section.
const SegmentedControlDemo = () => {
  const [view, setView] = useState<'list' | 'map' | 'cards'>('list');
  return (
    <SegmentedControl
      value={view}
      onChange={setView}
      options={[
        { value: 'list', label: 'List' },
        { value: 'map', label: 'Map' },
        { value: 'cards', label: 'Cards' },
      ]}
      aria-label="Display mode"
    />
  );
};

const SegmentedControlDemoCounts = () => {
  const [filter, setFilter] = useState<'all' | 'outside' | 'edge' | 'tribal'>('all');
  return (
    <SegmentedControl
      value={filter}
      onChange={setFilter}
      options={[
        { value: 'all', label: 'All flags', icon: Funnel, count: 312 },
        { value: 'outside', label: 'Outside', count: 184 },
        { value: 'edge', label: 'Edge', count: 92 },
        { value: 'tribal', label: 'Tribal', count: 36 },
      ]}
      aria-label="Flag filter"
    />
  );
};
