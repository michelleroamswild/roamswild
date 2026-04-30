import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Tent,
  Mountains,
  Compass,
  Shuffle,
  SunHorizon,
  MagnifyingGlass,
  SpinnerGap,
  Plus,
  Star,
  CaretRight,
  Users,
  Path,
  MapTrifold as MapIcon,
  Sun,
  Wind,
} from '@phosphor-icons/react';
import { Header } from '@/components/Header';
import { SurpriseMeDialog } from '@/components/SurpriseMeDialog';
import { BestHikesTodayDialog } from '@/components/BestHikesTodayDialog';
import { SunsetConditionsDialog } from '@/components/SunsetConditionsDialog';
import { LocationSelector, type SelectedLocation } from '@/components/LocationSelector';
import { useTrip } from '@/context/TripContext';
import { useAuth } from '@/context/AuthContext';
import { getUserLocation, type UserLocation } from '@/utils/getUserLocation';
import { getTripUrl } from '@/utils/slugify';
import { usePhotoWeather } from '@/hooks/use-photo-weather';
import { getSunTimes, formatTime, azimuthToCompass } from '@/utils/sunCalc';
import { Mono, Pill, Tag, TopoBg } from '@/components/redesign';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Authenticated home — Pine Grove v3 layout. Hero (search + conditions) →
// featured region → near-you spots on dark band → your trips.

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { savedTrips, loadSavedTrip } = useTrip();

  const [surpriseMeOpen, setSurpriseMeOpen] = useState(false);
  const [bestHikesOpen, setBestHikesOpen] = useState(false);
  const [sunsetOpen, setSunsetOpen] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [campsLocationOpen, setCampsLocationOpen] = useState(false);
  const [campsManualLocation, setCampsManualLocation] = useState<SelectedLocation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Conditions widget — pull silently in the background; if location fails,
  // the card simply renders a neutral fallback rather than blocking the hero.
  const [conditionsLocation, setConditionsLocation] = useState<UserLocation | null>(null);
  useEffect(() => {
    getUserLocation().then(setConditionsLocation).catch(() => {});
  }, []);
  const { forecast, loading: weatherLoading } = usePhotoWeather(
    conditionsLocation?.lat ?? 0,
    conditionsLocation?.lng ?? 0,
    0
  );

  const metrics = forecast?.current?.metrics;
  const tempF = metrics?.temperature !== undefined
    ? Math.round(metrics.temperature * 9 / 5 + 32)
    : null;
  const humidity = metrics?.humidity !== undefined ? Math.round(metrics.humidity) : null;
  const windMph = metrics?.windSpeed !== undefined
    ? Math.round(metrics.windSpeed * 2.237)
    : null;
  const windGustMph = metrics?.windGust !== undefined && metrics?.windSpeed !== undefined && metrics.windGust > metrics.windSpeed + 0.5
    ? Math.round(metrics.windGust * 2.237)
    : null;
  const windDir = metrics?.windDirection !== undefined
    ? azimuthToCompass(metrics.windDirection)
    : null;

  const sunTimes = conditionsLocation
    ? getSunTimes(conditionsLocation.lat, conditionsLocation.lng)
    : null;
  let nextSunEvent: { type: 'sunrise' | 'sunset'; time: Date; civil: Date } | null = null;
  if (sunTimes && conditionsLocation) {
    const now = new Date();
    if (now < sunTimes.sunrise) {
      nextSunEvent = { type: 'sunrise', time: sunTimes.sunrise, civil: sunTimes.civilDawn };
    } else if (now < sunTimes.sunset) {
      nextSunEvent = { type: 'sunset', time: sunTimes.sunset, civil: sunTimes.civilDusk };
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tom = getSunTimes(conditionsLocation.lat, conditionsLocation.lng, tomorrow);
      nextSunEvent = { type: 'sunrise', time: tom.sunrise, civil: tom.civilDawn };
    }
  }

  // Strip state/country tail, keep just the city — fits the small-cap header.
  const placeLabel = conditionsLocation?.name?.split(',')[0]?.trim() || null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/dispersed?name=${encodeURIComponent(searchQuery)}`);
  };

  const handleFindCampsNearMe = async () => {
    setIsGettingLocation(true);
    try {
      const loc = await getUserLocation({ enableHighAccuracy: true, maximumAgeMs: 60000 });
      setIsGettingLocation(false);
      const name = loc.name ?? 'My Location';
      navigate(`/dispersed?lat=${loc.lat}&lng=${loc.lng}&name=${encodeURIComponent(name)}`);
    } catch {
      setIsGettingLocation(false);
      setCampsLocationOpen(true);
    }
  };

  const handleCampsManualLocation = () => {
    if (!campsManualLocation) return;
    setCampsLocationOpen(false);
    navigate(`/dispersed?lat=${campsManualLocation.lat}&lng=${campsManualLocation.lng}&name=${encodeURIComponent(campsManualLocation.name)}`);
  };

  const handleTripClick = (tripId: string, tripName: string) => {
    loadSavedTrip(tripId);
    navigate(getTripUrl(tripName));
  };

  // Sort upcoming trips first
  const sortedTrips = [...savedTrips]
    .sort((a, b) => {
      const aDate = a.config.startDate ? new Date(a.config.startDate).getTime() : null;
      const bDate = b.config.startDate ? new Date(b.config.startDate).getTime() : null;
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      if (aDate && bDate) return aDate - bDate;
      return 0;
    })
    .slice(0, 3);

  return (
    <div className="bg-cream text-ink font-sans min-h-screen">
      <Header />

      {/* === BAND 1 — cream hero, split layout. Pulled up under the floating
           header so the cream + topo extend behind the nav (no seam). === */}
      <section className="relative overflow-hidden bg-cream -mt-16 md:-mt-20">
        <TopoBg color="hsl(var(--paper))" opacity={0.55} scale={700} />

        <div className="relative max-w-[1440px] mx-auto px-6 md:px-14 pt-28 md:pt-40 pb-20 md:pb-28 grid md:grid-cols-[1fr_460px] gap-10 lg:gap-16 items-start">
          {/* LEFT — title + search */}
          <div>
            <div className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-pine-6 bg-pine-6/10 mb-9">
              <span className="w-1.5 h-1.5 rounded-full bg-pine-6 ml-1" />
              <Mono className="text-pine-6">Off-grid camping, on one map</Mono>
            </div>

            <h1 className="font-sans font-bold tracking-[-0.045em] leading-[0.94] text-[64px] md:text-[88px] lg:text-[112px] m-0 text-ink">
              Find a quiet
              <br />
              place to <span className="text-pine-6">roam.</span>
            </h1>

            <p className="text-lg md:text-[19px] leading-[1.55] text-ink-3 max-w-[540px] mt-7">
              Off-grid camping on public land — community spots, dispersed sites, and established
              campgrounds, on one honest map.
            </p>

            {/* Search input */}
            <form
              onSubmit={handleSearch}
              className="mt-10 max-w-[680px] flex items-center gap-3 bg-white dark:bg-paper-2 border border-line dark:border-line-2 rounded-[18px] pl-5 pr-2.5 py-2.5 shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)] focus-within:border-pine-6 transition-colors"
            >
              <MagnifyingGlass size={20} weight="regular" className="text-ink-2 shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search a region — Moab, Olympic Peninsula, Joshua Tree…"
                className="flex-1 border-none outline-none text-base font-sans bg-transparent placeholder:text-ink-3 py-3"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-[14px] border border-pine-6 bg-pine-6 text-cream text-sm font-semibold hover:bg-pine-5 transition-colors"
              >
                Search
                <ArrowRight size={14} weight="bold" />
              </button>
            </form>

            {/* Quick category pills — light solid surface (matches design's
                ghost variant but opaque so they read on the topo). */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Pill variant="ghost" sm mono={false} className="!bg-white hover:!bg-white !border-line hover:!border-ink-3" onClick={handleFindCampsNearMe}>
                {isGettingLocation ? <SpinnerGap size={14} className="animate-spin" /> : <Tent size={14} weight="regular" />}
                Camps near me
              </Pill>
              <Pill variant="ghost" sm mono={false} className="!bg-white hover:!bg-white !border-line hover:!border-ink-3" onClick={() => setBestHikesOpen(true)}>
                <Mountains size={14} weight="regular" />
                Best hikes today
              </Pill>
              <Pill variant="ghost" sm mono={false} className="!bg-white hover:!bg-white !border-line hover:!border-ink-3" onClick={() => setSurpriseMeOpen(true)}>
                <Shuffle size={14} weight="bold" />
                Surprise me
              </Pill>
              <Pill variant="ghost" sm mono={false} className="!bg-white hover:!bg-white !border-line hover:!border-ink-3" onClick={() => setSunsetOpen(true)}>
                <SunHorizon size={14} weight="regular" />
                Sunset tonight
              </Pill>
            </div>
          </div>

          {/* RIGHT — featured photo + conditions card */}
          <div className="flex flex-col gap-5">
            <div className="rounded-[18px] overflow-hidden border border-line aspect-[4/3] shadow-[0_18px_40px_rgba(29,34,24,.10)] bg-gradient-to-br from-[#c08a5a] via-[#8a5a3a] to-[#3d2a1d] relative">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 14px, rgba(0,0,0,.06) 14px 28px)',
                }}
              />
              <Mono className="absolute left-3 bottom-2.5 text-white/85" size={11}>
                UT-279 · POTASH RD · 38.55N
              </Mono>
            </div>

            <div className="border border-line dark:border-line-2 rounded-[18px] bg-white dark:bg-paper-2 px-6 py-5 shadow-[0_8px_22px_rgba(29,34,24,.04)]">
              <div className="flex justify-between items-baseline mb-4">
                <Mono className="text-pine-6">RIGHT NOW · NEAR YOU</Mono>
                <span className="text-[12px] text-ink-3">
                  {placeLabel ?? (conditionsLocation ? '—' : 'Locating…')}
                </span>
              </div>
              {weatherLoading && !forecast ? (
                <div className="flex items-center gap-2 text-ink-3 py-3">
                  <SpinnerGap size={16} className="animate-spin" />
                  <span className="text-[13px]">Pulling current conditions…</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {/* Temp */}
                  <div>
                    <div className="flex items-center gap-1.5 text-ink-3 mb-1.5">
                      <Sun size={16} weight="regular" />
                      <Mono size={11}>Temp</Mono>
                    </div>
                    <div className="font-sans font-semibold text-[26px] tracking-[-0.02em]">
                      {tempF !== null ? `${tempF}°` : '—'}
                    </div>
                    <div className="text-[12px] text-ink-3 mt-0.5">
                      {humidity !== null ? `${humidity}% rh` : ' '}
                    </div>
                  </div>
                  {/* Wind */}
                  <div>
                    <div className="flex items-center gap-1.5 text-ink-3 mb-1.5">
                      <Wind size={16} weight="regular" />
                      <Mono size={11}>Wind</Mono>
                    </div>
                    <div className="font-sans font-semibold text-[26px] tracking-[-0.02em]">
                      {windMph !== null ? `${windMph} mph` : '—'}
                    </div>
                    <div className="text-[12px] text-ink-3 mt-0.5">
                      {windGustMph !== null
                        ? `gusts ${windGustMph}${windDir ? ` · ${windDir}` : ''}`
                        : windDir ?? ' '}
                    </div>
                  </div>
                  {/* Sun */}
                  <div>
                    <div className="flex items-center gap-1.5 text-ink-3 mb-1.5">
                      <SunHorizon size={16} weight="regular" />
                      <Mono size={11}>{nextSunEvent?.type === 'sunrise' ? 'Sunrise' : 'Sunset'}</Mono>
                    </div>
                    <div className="font-sans font-semibold text-[26px] tracking-[-0.02em]">
                      {nextSunEvent ? formatTime(nextSunEvent.time).replace(/\s?(AM|PM)/i, '') : '—'}
                    </div>
                    <div className="text-[12px] text-ink-3 mt-0.5">
                      {nextSunEvent
                        ? `civil ${formatTime(nextSunEvent.civil).replace(/\s?(AM|PM)/i, '')}`
                        : ' '}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === BAND 2 — paper, featured region === */}
      <section className="bg-paper">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-24">
          <div className="flex flex-wrap gap-4 items-baseline justify-between mb-10">
            <div>
              <Mono className="text-pine-6">FEATURED · THIS WEEK</Mono>
              <h2 className="font-sans font-bold text-3xl md:text-5xl tracking-[-0.03em] mt-2.5 max-w-[600px]">
                This week, the Sawtooths.
              </h2>
            </div>
            <Link to="/dispersed?name=Sawtooth%20NRA" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-pine-6 hover:text-pine-5 transition-colors">
              Open region
              <ArrowRight size={13} weight="bold" />
            </Link>
          </div>

          <div className="grid md:grid-cols-[1.4fr_1fr] gap-0 border border-line dark:border-line-2 rounded-[18px] overflow-hidden bg-white dark:bg-paper-2">
            <div className="relative min-h-[380px] bg-gradient-to-br from-[#a89779] via-[#7d6e54] to-[#4d4636]">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 14px, rgba(0,0,0,.06) 14px 28px)',
                }}
              />
              <div className="absolute left-4 top-4">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase font-semibold px-2.5 py-1 rounded-full bg-pine-6 text-cream">
                  USFS · IDAHO
                </span>
              </div>
              <Mono className="absolute left-4 bottom-3 text-white/85" size={11}>
                SAWTOOTH NRA · 44.06N · 114.96W
              </Mono>
            </div>

            <div className="px-8 py-9 flex flex-col">
              <div className="font-sans font-bold text-[28px] tracking-[-0.02em]">Sawtooth NRA</div>
              <div className="text-[14px] text-ink-3 mt-2 leading-[1.55]">
                756,000 acres of mountain alpine, threaded by 40+ trailheads and free dispersed
                sites along FR-208.
              </div>
              <div className="mt-8 grid grid-cols-3 gap-4">
                {[
                  { l: 'SPOTS', v: '137' },
                  { l: '4WD-FREE', v: '62%' },
                  { l: 'RATING', v: '4.6', after: '/5' },
                ].map((s) => (
                  <div key={s.l}>
                    <Mono>{s.l}</Mono>
                    <div className="font-sans font-bold text-[28px] tracking-[-0.02em] mt-1">
                      {s.v}
                      {s.after && <span className="text-ink-3 font-normal text-[14px]">{s.after}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-1.5">
                <Tag>USFS</Tag>
                <Tag>Free dispersed</Tag>
                <Tag>No permits</Tag>
                <Tag>Bear country</Tag>
                <Tag>Open Jun – Oct</Tag>
              </div>
              <div className="flex-1" />
              <div className="mt-8 flex gap-2.5">
                <Pill variant="accent" mono={false} onClick={() => navigate('/dispersed?name=Sawtooth%20NRA')}>
                  <MapIcon size={14} weight="regular" />
                  Open on map
                </Pill>
                <Pill variant="ghost" mono={false}>
                  <Plus size={13} weight="bold" />
                  Save region
                </Pill>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === BAND 3 — dark pine, near-you spots === */}
      <section data-dark-band className="bg-ink-pine text-cream">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-24">
          <div className="flex flex-wrap gap-4 items-baseline justify-between mb-10">
            <div>
              <Mono className="text-ink-ondark">NEAR YOU · 40.76N · 111.89W</Mono>
              <h2 className="font-sans font-bold text-3xl md:text-5xl tracking-[-0.03em] mt-2.5 max-w-[600px] text-cream">
                Quiet places, within reach.
              </h2>
            </div>
            <Pill variant="cream" sm onDark onClick={handleFindCampsNearMe}>
              <Tent size={13} />
              Camps near me
            </Pill>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { n: 'Mill D South', d: '12.4 mi · BLM', tags: ['Passenger', 'Verified'], rating: 38, kind: 'KNOWN', dot: 'bg-pin-safe', tone: 'from-[#cdb892] via-[#a78a63] to-[#6e5a3d]' },
              { n: 'Lake Hardy', d: '18.0 mi · USFS', tags: ['HC+'], rating: 35, kind: 'KNOWN', dot: 'bg-pin-safe', tone: 'from-[#7d8a83] via-[#4f5b54] to-[#2c3530]' },
              { n: 'End of FR 137', d: '21.6 mi · USFS', tags: ['4WD'], rating: 30, kind: 'DERIVED', dot: 'bg-pin-moderate', tone: 'from-[#c08a5a] via-[#8a5a3a] to-[#3d2a1d]' },
              { n: 'Dry Creek pullout', d: '9.2 mi · BLM', tags: ['Passenger'], rating: 27, kind: 'DERIVED', dot: 'bg-pin-moderate', tone: 'from-[#a89779] via-[#7d6e54] to-[#4d4636]' },
            ].map((s) => (
              <article key={s.n} className="border border-cream/15 rounded-[14px] overflow-hidden bg-cream/[0.04]">
                <div className={`relative h-[160px] bg-gradient-to-br ${s.tone}`}>
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 14px, rgba(0,0,0,.06) 14px 28px)',
                    }}
                  />
                  <div className="absolute left-3 top-3">
                    <span className={`font-mono text-[10px] tracking-[0.14em] uppercase font-semibold px-2.5 py-1 rounded-full text-cream ${s.dot}`}>
                      {s.kind}
                    </span>
                  </div>
                  <div className="absolute right-3 top-3 bg-ink-pine/80 rounded-full px-2.5 py-1 inline-flex items-center gap-1 font-mono text-[12px] font-semibold text-cream">
                    <Star size={11} weight="fill" />
                    {s.rating}
                  </div>
                </div>
                <div className="px-5 pt-4 pb-5">
                  <div className="font-semibold text-[15px] tracking-[-0.01em] text-cream">{s.n}</div>
                  <Mono className="text-ink-ondark">{s.d}</Mono>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {s.tags.map((t) => (
                      <Tag key={t} onDark>
                        {t}
                      </Tag>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-12 flex justify-center">
            <Pill variant="cream" onDark onClick={() => navigate('/dispersed')}>
              <MapIcon size={14} />
              See all spots in view
              <ArrowRight size={13} weight="bold" />
            </Pill>
          </div>
        </div>
      </section>

      {/* === BAND 4 — paper-2, your trips === */}
      <section className="bg-paper-2">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-24">
          <div className="flex flex-wrap gap-4 items-baseline justify-between mb-10">
            <div>
              <Mono>{savedTrips.length} SAVED · {sortedTrips.filter((t) => t.config.startDate).length} UPCOMING</Mono>
              <h2 className="font-sans font-bold text-3xl md:text-5xl tracking-[-0.03em] mt-2.5">Your trips.</h2>
            </div>
            <div className="flex gap-2.5">
              <Pill variant="ghost" mono={false} onClick={() => navigate('/create-trip')}>
                <Plus size={13} weight="bold" />
                New trip
              </Pill>
              <Pill variant="accent" mono={false} onClick={() => navigate('/my-trips')}>
                View all
                <ArrowRight size={13} weight="bold" />
              </Pill>
            </div>
          </div>

          {savedTrips.length === 0 ? (
            <div className="border border-line bg-cream rounded-[18px] px-8 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6 mb-4">
                <Path size={20} weight="regular" />
              </div>
              <div className="font-sans font-semibold text-xl tracking-[-0.01em] text-ink">
                No trips yet
              </div>
              <div className="text-[14px] text-ink-3 mt-2 max-w-[420px] mx-auto">
                Create custom road-trip itineraries with campsites, hikes, and scenic stops.
              </div>
              <div className="mt-5">
                <Pill variant="solid-pine" mono={false} onClick={() => navigate('/create-trip')}>
                  <Plus size={13} weight="bold" />
                  Plan your first trip
                </Pill>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sortedTrips.map((trip) => {
                const daysUntil = trip.config.startDate
                  ? Math.ceil(
                      (new Date(trip.config.startDate).getTime() - new Date().setHours(0, 0, 0, 0)) /
                        (1000 * 60 * 60 * 24)
                    )
                  : null;
                const totalHikingMiles = trip.days.reduce((total, day) => {
                  return (
                    total +
                    day.stops
                      .filter((stop) => stop.type === 'hike')
                      .reduce((sum, hike) => sum + parseFloat(hike.distance?.replace(/[^0-9.]/g, '') || '0'), 0)
                  );
                }, 0);
                const hikeCount = trip.days.reduce(
                  (count, day) => count + day.stops.filter((stop) => stop.type === 'hike').length,
                  0
                );
                const startName = trip.config.baseLocation?.name.split(',')[0] || trip.config.startLocation?.name.split(',')[0] || null;
                const stops = trip.config.destinations?.length || 0;
                const tagText = daysUntil != null && daysUntil >= 0
                  ? daysUntil === 0
                    ? 'TODAY'
                    : daysUntil === 1
                      ? 'TOMORROW'
                      : `IN ${daysUntil} DAYS`
                  : 'DRAFT';
                const tone =
                  daysUntil != null && daysUntil <= 7
                    ? 'from-[#c08a5a] via-[#8a5a3a] to-[#3d2a1d]'
                    : daysUntil != null && daysUntil <= 30
                      ? 'from-[#cdb892] via-[#a78a63] to-[#6e5a3d]'
                      : 'from-[#7d8a83] via-[#4f5b54] to-[#2c3530]';
                return (
                  <article
                    key={trip.id}
                    onClick={() => handleTripClick(trip.id, trip.config.name)}
                    className="border border-line dark:border-line-2 rounded-[14px] overflow-hidden bg-white dark:bg-paper-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(29,34,24,.10),0_3px_8px_rgba(29,34,24,.04)]"
                  >
                    <div className={`h-[160px] relative bg-gradient-to-br ${tone}`}>
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 14px, rgba(0,0,0,.06) 14px 28px)',
                        }}
                      />
                    </div>
                    <div className="px-5 pt-4 pb-5">
                      <Tag>{tagText}</Tag>
                      <div className="font-sans font-semibold text-[17px] tracking-[-0.01em] mt-2">
                        {trip.config.name || 'Untitled trip'}
                      </div>
                      {startName && (
                        <div className="text-[13px] text-ink-3 mt-1">
                          {startName} → {stops} {stops === 1 ? 'stop' : 'stops'}
                          {trip.config.returnToStart ? ' · round trip' : ''}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-3 text-[12px] text-ink-3 font-mono">
                        <span>{trip.days.length} days</span>
                        {hikeCount > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {hikeCount} {hikeCount === 1 ? 'hike' : 'hikes'} · {totalHikingMiles.toFixed(1)} mi
                            </span>
                          </>
                        )}
                        {(trip.collaboratorCount ?? 0) > 0 && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} weight="regular" />
                              {trip.collaboratorCount}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-cream border-t border-line px-6 md:px-14 py-10 flex flex-wrap items-center justify-between gap-4">
        <Mono>ROAMSWILD · OFF-GRID CAMPING · 2026</Mono>
        <div className="flex flex-wrap gap-6 text-[13px] text-ink-3">
          <Link to="/about" className="hover:text-ink transition-colors">Field notes</Link>
          <Link to="/how-we-map" className="hover:text-ink transition-colors">How we map</Link>
          <Link to="/submit-spot" className="hover:text-ink transition-colors">Submit a spot</Link>
          <Link to="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
        </div>
      </footer>

      {/* Dialogs */}
      <SurpriseMeDialog open={surpriseMeOpen} onOpenChange={setSurpriseMeOpen} />
      <BestHikesTodayDialog open={bestHikesOpen} onOpenChange={setBestHikesOpen} />
      <SunsetConditionsDialog open={sunsetOpen} onOpenChange={setSunsetOpen} />

      {/* Manual location selector for "Camps near me" when geolocation fails */}
      <Dialog open={campsLocationOpen} onOpenChange={setCampsLocationOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Where are you searching?</DialogTitle>
            <DialogDescription>
              We couldn&apos;t pick up your location. Pick a region to search around.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <LocationSelector value={campsManualLocation} onChange={setCampsManualLocation} />
            <button
              onClick={handleCampsManualLocation}
              disabled={!campsManualLocation}
              className="mt-4 w-full px-5 py-3 rounded-[14px] border border-pine-6 bg-pine-6 text-cream text-sm font-semibold hover:bg-pine-5 transition-colors disabled:opacity-50"
            >
              Find camps near here
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
