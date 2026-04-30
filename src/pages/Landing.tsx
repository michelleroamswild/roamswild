import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Jeep,
  Path,
  Tent,
  Mountains,
  Users,
  Calendar,
  ArrowRight,
  Lightning,
  Shield,
  Sun,
  Boot,
  CaretLeft,
  Clock,
  MapPin,
  SpinnerGap,
  CheckCircle,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { Mono, Pill, TopoBg } from "@/components/redesign";
import { cn } from "@/lib/utils";

// Landing page photos
import mobileScreenshot from "@/images/landingpage/RW-home-mobile.png";
import photo1 from "@/images/landingpage/DJI_0693.jpg";
import photo3 from "@/images/landingpage/DJI_0879.jpg";
import photo5 from "@/images/landingpage/DJI_0671.jpg";
import photo7 from "@/images/landingpage/DJI_0696.jpg";
import photo8 from "@/images/landingpage/DJI_0792.jpg";
import photo9 from "@/images/landingpage/DJI_0809.jpg";
import photo10 from "@/images/landingpage/DJI_0824.jpg";
import photo11 from "@/images/landingpage/DJI_0032.jpg";
import photo13 from "@/images/landingpage/DJI_0082.jpg";
import photo14 from "@/images/landingpage/DSC03022.jpg";

// Six features. Cycle through the accent palette so the grid has visual rhythm
// instead of one accent across all six.
const features = [
  { icon: Path,      title: "Smart route planning",      description: "AI-powered trip planning that finds the best campsites, hikes, and scenic stops along your route.",       accent: 'pine'  as const },
  { icon: Tent,      title: "Campsite database",         description: "Access thousands of dispersed camping spots, BLM land, and hidden gems saved by the community.",          accent: 'clay'  as const },
  { icon: Mountains, title: "Trail discovery",           description: "Find hiking trails near your campsites with difficulty ratings, distance, and elevation data.",            accent: 'sage'  as const },
  { icon: Users,     title: "Trip collaboration",        description: "Plan trips with friends. Share itineraries, vote on stops, and keep everyone in sync.",                    accent: 'water' as const },
  { icon: Calendar,  title: "Day-by-day itinerary",      description: "Automatically generated daily schedules with drive times, activities, and rest stops.",                   accent: 'pine'  as const },
  { icon: Sun,       title: "Photography conditions",    description: "Get golden hour times, weather forecasts, and optimal shooting conditions for every stop.",                accent: 'ember' as const },
];

// Static accent class triples — Tailwind JIT can't do dynamic class names.
const ACCENT_BG: Record<'pine'|'sage'|'water'|'clay'|'ember', string> = {
  pine:  'bg-pine-6/12 text-pine-6',
  sage:  'bg-sage/15  text-sage',
  water: 'bg-water/15 text-water',
  clay:  'bg-clay/15  text-clay',
  ember: 'bg-ember/15 text-ember',
};

// Phone mockup component - iPhone 15 Pro style with Dynamic Island.
// Visual chrome unchanged from the original; this is product detail, not styling.
const PhoneMockup = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative ${className}`}>
    <div className="relative mx-auto w-[320px] h-[660px] md:w-[360px] md:h-[740px] bg-[#1a1a1a] rounded-[3.5rem] p-[10px] shadow-2xl transform rotate-[6deg] animate-float-slow border border-gray-700">
      <div className="absolute inset-0 rounded-[3.5rem] bg-gradient-to-br from-gray-600/20 via-transparent to-gray-800/20 pointer-events-none" />
      <div className="relative h-full w-full bg-black rounded-[2.75rem] overflow-hidden">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[100px] h-[32px] bg-black rounded-full z-20" />
        <div className="absolute inset-0 flex flex-col">
          <div className="h-14 bg-[#f5f5f5] dark:bg-[#1c1c1e] flex items-center justify-between px-6 pt-3">
            <span className="text-[13px] font-semibold text-black dark:text-white w-12">9:41</span>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-3" viewBox="0 0 18 12" fill="currentColor">
                <rect x="0" y="8" width="3" height="4" rx="0.5" className="text-black dark:text-white" />
                <rect x="5" y="5" width="3" height="7" rx="0.5" className="text-black dark:text-white" />
                <rect x="10" y="2" width="3" height="10" rx="0.5" className="text-black dark:text-white" />
                <rect x="15" y="0" width="3" height="12" rx="0.5" className="text-black dark:text-white" />
              </svg>
              <svg className="w-4 h-3 text-black dark:text-white" viewBox="0 0 16 12" fill="currentColor">
                <path d="M8 9.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM3.5 7.5c1.2-1.2 2.8-1.9 4.5-1.9s3.3.7 4.5 1.9l-1.1 1.1c-.9-.9-2.1-1.4-3.4-1.4s-2.5.5-3.4 1.4L3.5 7.5zM1 5c1.9-1.9 4.4-2.9 7-2.9s5.1 1 7 2.9l-1.1 1.1C12.3 4.5 10.2 3.6 8 3.6S3.7 4.5 2.1 6.1L1 5z" />
              </svg>
              <div className="flex items-center">
                <div className="w-6 h-3 border border-black dark:border-white rounded-sm relative">
                  <div className="absolute inset-[2px] right-[2px] bg-black dark:bg-white rounded-[1px]" />
                </div>
                <div className="w-[2px] h-1.5 bg-black dark:bg-white rounded-r-sm ml-[1px]" />
              </div>
            </div>
          </div>
          <div className="bg-[#f5f5f5] dark:bg-[#1c1c1e] px-3 pb-2">
            <div className="flex items-center gap-2 bg-[#e5e5e5] dark:bg-[#2c2c2e] rounded-xl px-3 py-2">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-1 text-center truncate">roamswild.com</span>
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
            {children}
          </div>
          <div className="h-12 bg-[#f5f5f5] dark:bg-[#1c1c1e] flex items-center justify-around px-4 border-t border-gray-200 dark:border-gray-700">
            <svg className="w-5 h-5 text-[#007AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <svg className="w-5 h-5 text-[#007AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            <svg className="w-5 h-5 text-[#007AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            <svg className="w-5 h-5 text-[#007AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
          </div>
          <div className="h-8 bg-[#f5f5f5] dark:bg-[#1c1c1e] flex items-center justify-center">
            <div className="w-32 h-1 bg-black dark:bg-white rounded-full" />
          </div>
        </div>
      </div>
      <div className="absolute right-[-2px] top-32 w-[3px] h-16 bg-[#2a2a2a] rounded-l" />
      <div className="absolute left-[-2px] top-28 w-[3px] h-8 bg-[#2a2a2a] rounded-r" />
      <div className="absolute left-[-2px] top-40 w-[3px] h-12 bg-[#2a2a2a] rounded-r" />
      <div className="absolute left-[-2px] top-56 w-[3px] h-12 bg-[#2a2a2a] rounded-r" />
    </div>
  </div>
);

const rotatingWords = [
  "Adventure",
  "Road Trip",
  "Camping Trip",
  "Photo Adventure",
  "Offroad Trip",
  "Guys Trip",
  "Ladies Weekend",
  "Dirtbag Gathering",
];

const Landing = () => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  // Waitlist form state
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState(false);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaitlistError(null);
    if (!waitlistEmail.trim() || !isValidEmail(waitlistEmail)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setWaitlistLoading(true);
    try {
      const response = await supabase.functions.invoke('join-waitlist', {
        body: { email: waitlistEmail.toLowerCase().trim() },
      });
      if (response.error) throw response.error;
      if (response.data?.error) {
        setWaitlistError(response.data.error);
      } else {
        setWaitlistSuccess(true);
      }
    } catch (err: any) {
      console.error('Waitlist error:', err);
      setWaitlistError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setWaitlistLoading(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length);
        setIsAnimating(false);
      }, 200);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Reusable waitlist form — used in hero and final CTA. `onDark` flips colors
  // for placement on the pine band.
  const WaitlistForm = ({ onDark = false }: { onDark?: boolean }) => (
    waitlistSuccess ? (
      <div className={cn(
        "rounded-[18px] p-5 inline-flex items-center gap-3 max-w-md",
        onDark
          ? "bg-cream/10 border border-cream/30 text-cream"
          : "bg-pine-6/10 border border-pine-6/40 text-ink"
      )}>
        <CheckCircle className={cn("w-7 h-7 flex-shrink-0", onDark ? "text-cream" : "text-pine-6")} weight="fill" />
        <div className="text-left">
          <h3 className="font-sans font-semibold text-[16px]">You're on the list.</h3>
          <p className={cn("text-[13px] mt-0.5", onDark ? "text-cream/70" : "text-ink-3")}>
            We'll send you an invite code soon.
          </p>
        </div>
      </div>
    ) : (
      <form onSubmit={handleWaitlistSubmit} className="max-w-md">
        <div className={cn(
          "flex items-center gap-2 rounded-[18px] pl-5 pr-2 py-2 transition-colors",
          onDark
            ? "bg-cream/10 border border-cream/25 focus-within:border-cream/50"
            : "bg-white border border-line focus-within:border-pine-6 shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]",
          emailError && (onDark ? "border-clay" : "border-ember")
        )}>
          <input
            type="email"
            placeholder="Enter your email"
            value={waitlistEmail}
            onChange={(e) => {
              setWaitlistEmail(e.target.value);
              if (emailError) setEmailError(false);
            }}
            className={cn(
              "flex-1 border-none outline-none text-[15px] bg-transparent py-2.5",
              onDark ? "text-cream placeholder:text-cream/50" : "text-ink placeholder:text-ink-3"
            )}
          />
          <button
            type="submit"
            disabled={waitlistLoading}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-[13px] font-sans font-semibold transition-colors disabled:opacity-50",
              onDark
                ? "bg-cream text-ink hover:bg-cream/90"
                : "bg-pine-6 text-cream hover:bg-pine-5"
            )}
          >
            {waitlistLoading ? (
              <SpinnerGap className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Join waitlist
                <ArrowRight className="w-4 h-4" weight="bold" />
              </>
            )}
          </button>
        </div>
        {(waitlistError || emailError) && (
          <p className={cn("text-[13px] mt-2", onDark ? "text-clay" : "text-ember")}>
            {emailError ? 'Please enter a valid email address' : waitlistError}
          </p>
        )}
        <p className={cn("text-[13px] mt-3", onDark ? "text-cream/70" : "text-ink-3")}>
          Already have an invite?{" "}
          <Link
            to="/signup"
            className={cn(
              "font-semibold transition-colors",
              onDark ? "text-cream hover:text-cream/80" : "text-pine-6 hover:text-pine-5"
            )}
          >
            Sign up
          </Link>
          {" · "}
          <Link
            to="/login"
            className={cn(
              "font-semibold transition-colors",
              onDark ? "text-cream hover:text-cream/80" : "text-pine-6 hover:text-pine-5"
            )}
          >
            Sign in
          </Link>
        </p>
      </form>
    )
  );

  return (
    <div className="bg-cream text-ink font-sans min-h-screen">
      {/* === Custom landing nav — transparent over the cream hero === */}
      <header className="absolute top-0 left-0 right-0 z-50">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between h-16 md:h-20 px-4 md:px-14">
          <Link to="/" className="flex items-center gap-2.5">
            <Jeep className="w-6 h-6 text-pine-6" weight="regular" />
            <span className="text-[16px] font-sans font-bold tracking-[-0.01em] text-ink">RoamsWild</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <Link
              to="/signup"
              className="px-4 py-2 rounded-full text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink hover:bg-ink/5 transition-colors"
            >
              Sign up
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 rounded-full text-[13px] font-sans font-semibold tracking-[-0.005em] bg-ink text-cream hover:bg-ink-2 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* === BAND 1 — cream hero with topo, split layout === */}
      <section className="relative overflow-x-clip overflow-y-visible bg-cream pt-24 md:pt-32 pb-0 z-10">
        <TopoBg color="hsl(var(--paper))" opacity={0.55} scale={700} />

        <div className="relative max-w-[1440px] mx-auto px-4 md:px-14 pb-0">
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-4 items-center">
            {/* Left content */}
            <div className="text-center lg:text-left lg:pr-4 overflow-visible min-w-0 relative z-20">
              <div className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-pine-6 bg-pine-6/10 mb-7">
                <span className="w-1.5 h-1.5 rounded-full bg-pine-6 ml-1" />
                <Mono className="text-pine-6">Early access · Now open</Mono>
              </div>

              <h1 className="font-sans font-bold text-ink m-0 mb-6 tracking-[-0.04em]">
                <span className="text-3xl md:text-4xl lg:text-5xl block mb-2 leading-[1.05]">
                  Plan your next
                </span>
                <div className="h-[1.2em] text-5xl md:text-6xl lg:text-[4rem] xl:text-7xl relative" style={{ lineHeight: 1.15 }}>
                  <span
                    className={cn(
                      "text-pine-6 whitespace-nowrap transition-all duration-200 inline-block",
                      isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
                    )}
                  >
                    {rotatingWords[currentWordIndex]}.
                  </span>
                </div>
              </h1>

              <p className="text-lg md:text-[19px] leading-[1.55] text-ink-3 max-w-[540px] mx-auto lg:mx-0 mb-9">
                Discover hidden campsites, plan scenic routes, and explore the backcountry with
                friends. Your next adventure starts here.
              </p>

              <div className="mx-auto lg:mx-0 max-w-md">
                <WaitlistForm />
              </div>
            </div>

            {/* Right content - Phone mockup with floating photos */}
            <div className="relative flex justify-center min-h-[480px] md:min-h-[600px] mb-[-40px] md:mb-[-60px] lg:mb-[-80px]">
              <div className="absolute inset-0 bg-gradient-to-br from-pine-6/15 via-transparent to-clay/15 blur-3xl" />

              {/* Floating photos behind phone */}
              <div className="absolute hidden lg:block z-0 animate-float-slow" style={{ left: '-96px', top: '-20px', animationDelay: '0s' }}>
                <div className="w-80 h-60 md:w-96 md:h-72 overflow-hidden shadow-2xl rounded-[18px]"
                  style={{
                    transform: `translateX(${scrollY > 300 ? '70vw' : `${scrollY * 0.3}px`}) rotate(-12deg)`,
                    transition: `transform ${scrollY > 300 ? '2s' : '0.8s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}>
                  <img src={photo8} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="absolute hidden lg:block z-0 animate-float-medium" style={{ right: '-120px', top: '-20px', animationDelay: '0.3s' }}>
                <div className="w-96 h-72 md:w-[28rem] md:h-80 overflow-hidden shadow-2xl rounded-[18px]"
                  style={{
                    transform: `translateX(${scrollY > 400 ? '70vw' : `${scrollY * 0.4}px`}) rotate(15deg)`,
                    transition: `transform ${scrollY > 400 ? '3s' : '1s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}>
                  <img src={photo7} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="absolute hidden lg:block z-0 animate-float-medium" style={{ left: '-140px', bottom: '240px', animationDelay: '0.5s' }}>
                <div className="w-80 h-60 md:w-96 md:h-72 overflow-hidden shadow-2xl rounded-[18px]"
                  style={{
                    transform: `translateX(${scrollY > 320 ? '70vw' : `${scrollY * 0.25}px`}) rotate(12deg)`,
                    transition: `transform ${scrollY > 320 ? '2.5s' : '0.9s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}>
                  <img src={photo10} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="absolute hidden xl:block z-0 animate-float-slow" style={{ right: '-180px', bottom: '180px', animationDelay: '0.8s' }}>
                <div className="w-96 h-72 md:w-[28rem] md:h-80 overflow-hidden shadow-2xl rounded-[18px]"
                  style={{
                    transform: `translateX(${scrollY > 450 ? '70vw' : `${scrollY * 0.35}px`}) rotate(-8deg)`,
                    transition: `transform ${scrollY > 450 ? '3.5s' : '1.1s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}>
                  <img src={photo14} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="absolute hidden lg:block z-0 animate-float-slow" style={{ left: '-60px', bottom: '40px', animationDelay: '1s' }}>
                <div className="w-64 h-48 md:w-80 md:h-60 overflow-hidden shadow-2xl rounded-[18px]"
                  style={{
                    transform: `translateX(${scrollY > 380 ? '70vw' : `${scrollY * 0.2}px`}) rotate(-8deg)`,
                    transition: `transform ${scrollY > 380 ? '2.75s' : '0.85s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}>
                  <img src={photo9} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="absolute hidden lg:block z-0 animate-float-medium" style={{ left: '65%', bottom: '20px', animationDelay: '1.2s' }}>
                <div className="w-64 h-48 md:w-80 md:h-60 overflow-hidden shadow-2xl rounded-[18px]"
                  style={{
                    transform: `translateX(calc(-50% + ${scrollY > 500 ? '70vw' : `${scrollY * 0.28}px`})) rotate(6deg)`,
                    transition: `transform ${scrollY > 500 ? '4s' : '1.2s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}>
                  <img src={photo11} alt="" className="w-full h-full object-cover" />
                </div>
              </div>

              <PhoneMockup className="relative z-10">
                <img src={mobileScreenshot} alt="RoamsWild app screenshot" className="w-full" />
              </PhoneMockup>
            </div>
          </div>
        </div>
      </section>

      {/* === BAND 2 — paper, features grid === */}
      <section className="bg-paper relative z-0 pt-24 md:pt-28 pb-20 md:pb-24">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14">
          <div className="text-center mb-14 md:mb-16">
            <Mono className="text-pine-6">Everything you need</Mono>
            <h2 className="font-sans font-bold tracking-[-0.03em] text-ink text-3xl md:text-5xl mt-2.5 max-w-[760px] mx-auto leading-[1.05]">
              Everything you need for the perfect trip.
            </h2>
            <p className="text-[16px] md:text-lg text-ink-3 max-w-[600px] mx-auto mt-5">
              From finding hidden gems to coordinating with friends, RoamsWild has you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group bg-white border border-line rounded-[18px] p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(29,34,24,.10),0_3px_8px_rgba(29,34,24,.04)]"
              >
                <div className={cn(
                  'w-12 h-12 rounded-[14px] flex items-center justify-center mb-4 transition-transform group-hover:scale-105',
                  ACCENT_BG[feature.accent],
                )}>
                  <feature.icon className="w-6 h-6" weight="regular" />
                </div>
                <h3 className="text-[17px] font-sans font-semibold tracking-[-0.01em] text-ink mb-2">
                  {feature.title}
                </h3>
                <p className="text-[14px] leading-[1.55] text-ink-3">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === BAND 3 — paper-2, story + image collage === */}
      <section className="bg-paper-2 py-20 md:py-28 overflow-hidden">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Image collage */}
            <div className="relative">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="rounded-[18px] overflow-hidden shadow-[0_18px_44px_rgba(29,34,24,.08)]">
                    <img src={photo1} alt="Overlanding adventure" className="w-full h-48 object-cover" />
                  </div>
                  <div className="rounded-[18px] overflow-hidden shadow-[0_18px_44px_rgba(29,34,24,.08)]">
                    <img src={photo3} alt="Mountain camping" className="w-full h-64 object-cover" />
                  </div>
                </div>
                <div className="space-y-4 pt-8">
                  <div className="rounded-[18px] overflow-hidden shadow-[0_18px_44px_rgba(29,34,24,.08)]">
                    <img src={photo5} alt="Desert trail" className="w-full h-64 object-cover" />
                  </div>
                  <div className="rounded-[18px] overflow-hidden shadow-[0_18px_44px_rgba(29,34,24,.08)]">
                    <img src={photo13} alt="Scenic overlook" className="w-full h-48 object-cover" />
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div>
              <Mono className="text-pine-6">Field-tested · Real overlanders</Mono>
              <h2 className="font-sans font-bold tracking-[-0.03em] text-ink text-3xl md:text-5xl mt-2.5 mb-6 leading-[1.05]">
                Built for real adventurers.
              </h2>
              <p className="text-[16px] md:text-lg leading-[1.6] text-ink-3 mb-9">
                We've spent years exploring backcountry roads, finding dispersed campsites, and
                planning trips with friends. RoamsWild is the app we always wished existed.
              </p>

              <div className="space-y-4">
                {[
                  { icon: Shield,    text: "Verified campsite locations from real overlanders", accent: 'pine'  as const },
                  { icon: Sun,       text: "Golden hour and photography condition forecasts",   accent: 'ember' as const },
                  { icon: Users,     text: "Real-time collaboration with your crew",            accent: 'water' as const },
                  { icon: Lightning, text: "AI-powered route optimization",                     accent: 'clay'  as const },
                ].map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className={cn(
                      'w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0',
                      ACCENT_BG[item.accent],
                    )}>
                      <item.icon className="w-4 h-4" weight="regular" />
                    </div>
                    <span className="text-[15px] text-ink">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === BAND 4 — dark pine CTA band === */}
      <section className="relative bg-ink-pine text-cream overflow-hidden py-20 md:py-28">
        <TopoBg color="hsl(var(--cream))" opacity={0.05} scale={700} />
        <div className="relative max-w-[1440px] mx-auto px-6 md:px-14">
          <div className="max-w-[640px] mx-auto text-center">
            <Mono className="text-cream/70">Join the waitlist</Mono>
            <h2 className="font-sans font-bold tracking-[-0.03em] text-cream text-3xl md:text-5xl mt-2.5 mb-5 leading-[1.05]">
              Ready to plan your next adventure?
            </h2>
            <p className="text-[16px] md:text-lg leading-[1.6] text-cream/70 mb-9">
              Get early access and be the first to discover hidden campsites, plan scenic routes,
              and explore with friends.
            </p>
            <div className="flex justify-center">
              <WaitlistForm onDark />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-cream border-t border-line px-6 md:px-14 py-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Jeep className="w-5 h-5 text-pine-6" weight="regular" />
          <Mono>ROAMSWILD · OFF-GRID CAMPING · 2026</Mono>
        </div>
        <div className="flex flex-wrap gap-6 text-[13px] text-ink-3">
          <a href="#" className="hover:text-ink transition-colors">Privacy</a>
          <a href="#" className="hover:text-ink transition-colors">Terms</a>
          <a href="#" className="hover:text-ink transition-colors">Contact</a>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
