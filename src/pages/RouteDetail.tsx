import {
  ArrowLeft,
  Path,
  Clock,
  Mountains,
  Tent,
  GasPump,
  MapPin,
  Plus,
  DotsSixVertical,
  DotsThree,
  NavigationArrow,
  ShareNetwork,
  DownloadSimple,
  Star,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { RouteMap } from '@/components/RouteMap';
import { RouteStop } from '@/types/maps';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

const routeStops: RouteStop[] = [
  {
    id: 1,
    name: 'Lone Pine Creek Trail',
    type: 'hike',
    duration: '3h hike',
    distance: '0 mi',
    description: 'Scenic mountain trail with creek views',
    elevation: '6,500 ft',
    coordinates: { lat: 36.6062, lng: -118.0631 },
  },
  {
    id: 2,
    name: 'Mobil Gas Station',
    type: 'gas',
    duration: '15 min',
    distance: '12 mi',
    description: 'Last gas before Alabama Hills',
    elevation: '3,800 ft',
    coordinates: { lat: 36.5996, lng: -118.0558 },
  },
  {
    id: 3,
    name: 'Alabama Hills BLM',
    type: 'camp',
    duration: 'Overnight',
    distance: '28 mi',
    description: 'Free dispersed camping with stunning rock formations',
    elevation: '4,400 ft',
    coordinates: { lat: 36.6089, lng: -118.1061 },
  },
];

const STOP_TONES: Record<string, { bg: string; text: string; border: string; Icon: typeof Mountains }> = {
  hike: { bg: 'bg-sage/15',  text: 'text-sage',   border: 'border-sage/30', Icon: Mountains },
  gas:  { bg: 'bg-clay/15',  text: 'text-clay',   border: 'border-clay/30', Icon: GasPump },
  camp: { bg: 'bg-pine-6/12', text: 'text-pine-6', border: 'border-pine-6/30', Icon: Tent },
  default: { bg: 'bg-cream', text: 'text-ink-3', border: 'border-line', Icon: MapPin },
};

const RouteDetail = () => {
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Sticky cream header */}
      <header className="sticky top-0 z-50 bg-cream/95 backdrop-blur-md border-b border-line">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <Link
                to="/"
                aria-label="Back home"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" weight="regular" />
              </Link>
              <div className="min-w-0">
                <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                  <Path className="w-3 h-3" weight="regular" />
                  Route · 3 stops · 285 mi
                </Mono>
                <h1 className="text-[16px] sm:text-[20px] font-sans font-bold tracking-[-0.01em] text-ink truncate mt-0.5">
                  Eastern Sierra Loop
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                aria-label="Save route"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors"
              >
                <Star className="w-4 h-4" weight="regular" />
              </button>
              <button
                aria-label="Share route"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors"
              >
                <ShareNetwork className="w-4 h-4" weight="regular" />
              </button>
              <button
                aria-label="Download route"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors"
              >
                <DownloadSimple className="w-4 h-4" weight="regular" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 md:px-8 py-6">
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Map */}
          <div className="lg:col-span-3 order-2 lg:order-1">
            <div className="bg-white border border-line rounded-[14px] overflow-hidden h-[400px] lg:h-[calc(100vh-180px)] lg:sticky lg:top-24">
              <div className="relative w-full h-full">
                <RouteMap stops={routeStops} className="w-full h-full" showDirections />

                {/* Route info overlay */}
                <div className="absolute bottom-4 left-4 right-4 z-10">
                  <div className="bg-white/95 backdrop-blur-md border border-line rounded-[14px] shadow-[0_8px_22px_rgba(29,34,24,.10)] p-3.5">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-4">
                        <div className="inline-flex items-center gap-1.5">
                          <Path className="w-3.5 h-3.5 text-pine-6" weight="regular" />
                          <span className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">285 mi</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-ink-3" weight="regular" />
                          <span className="text-[14px] text-ink">5h 30m</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <Mountains className="w-3.5 h-3.5 text-sage" weight="regular" />
                          <span className="text-[14px] text-ink">+4,200 ft</span>
                        </div>
                      </div>
                      <Pill
                        variant="solid-pine"
                        sm
                        mono={false}
                        onClick={() => {
                          const waypoints = routeStops
                            .slice(1, -1)
                            .map((s) => `${s.coordinates.lat},${s.coordinates.lng}`)
                            .join('|');
                          const origin = `${routeStops[0].coordinates.lat},${routeStops[0].coordinates.lng}`;
                          const dest = `${routeStops[routeStops.length - 1].coordinates.lat},${routeStops[routeStops.length - 1].coordinates.lng}`;
                          window.open(
                            `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${waypoints}`,
                            '_blank',
                          );
                        }}
                      >
                        <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
                        Start navigation
                      </Pill>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stops panel */}
          <div className="lg:col-span-2 order-1 lg:order-2 space-y-4">
            {/* Trip summary */}
            <div className="bg-white border border-line rounded-[14px] p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[24px] font-sans font-bold tracking-[-0.02em] text-ink leading-none">285</p>
                  <Mono className="text-ink-3 mt-1 block">Total miles</Mono>
                </div>
                <div>
                  <p className="text-[24px] font-sans font-bold tracking-[-0.02em] text-ink leading-none">5.5h</p>
                  <Mono className="text-ink-3 mt-1 block">Drive time</Mono>
                </div>
                <div>
                  <p className="text-[24px] font-sans font-bold tracking-[-0.02em] text-ink leading-none">2</p>
                  <Mono className="text-ink-3 mt-1 block">Days</Mono>
                </div>
              </div>
            </div>

            {/* Stops list */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Mono className="text-ink-2">Route stops</Mono>
                <Pill variant="ghost" sm mono={false}>
                  <Plus className="w-3 h-3" weight="regular" />
                  Add stop
                </Pill>
              </div>

              <div className="space-y-2">
                {routeStops.map((stop, index) => {
                  const tone = STOP_TONES[stop.type] || STOP_TONES.default;
                  const Icon = tone.Icon;

                  return (
                    <div key={stop.id} className="relative">
                      {index < routeStops.length - 1 && (
                        <div className="absolute left-[31px] top-[68px] w-0.5 h-[calc(100%-40px)] bg-line" />
                      )}

                      <div
                        className="group bg-white border border-line rounded-[14px] hover:border-pine-6/40 transition-all cursor-pointer animate-fade-in"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center gap-1 pt-2">
                              <DotsSixVertical
                                className="w-4 h-4 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
                                weight="regular"
                              />
                            </div>

                            <div className={cn('inline-flex items-center justify-center w-10 h-10 rounded-[10px] border', tone.bg, tone.text, tone.border)}>
                              <Icon className="w-5 h-5" weight="regular" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                                    {stop.name}
                                  </h3>
                                  <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">{stop.description}</p>
                                </div>
                                <button
                                  aria-label="More"
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ink hover:bg-cream transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                >
                                  <DotsThree className="w-4 h-4" weight="regular" />
                                </button>
                              </div>

                              <div className="flex items-center gap-3 mt-2 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                                <span className="inline-flex items-center gap-1">
                                  <Path className="w-3 h-3" weight="regular" />
                                  {stop.distance}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" weight="regular" />
                                  {stop.duration}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Mountains className="w-3 h-3" weight="regular" />
                                  {stop.elevation}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pill variant="ghost" mono={false} className="!w-full !justify-center !border-dashed">
                <Plus className="w-3.5 h-3.5" weight="regular" />
                Add another stop
              </Pill>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-4">
              <Pill variant="solid-pine" mono={false} className="!flex-1 !justify-center">
                <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
                Start trip
              </Pill>
              <Pill variant="ghost" mono={false}>
                Edit route
              </Pill>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RouteDetail;
