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
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// Landing page photos
import photo1 from "@/images/landingpage/DJI_0693.jpg";
import photo2 from "@/images/landingpage/DSC09190.jpg";
import photo3 from "@/images/landingpage/DJI_0879.jpg";
import photo4 from "@/images/landingpage/DSC09645.jpg";
import photo5 from "@/images/landingpage/DJI_0671.jpg";
import photo6 from "@/images/landingpage/DJI_0682.jpg";
import photo7 from "@/images/landingpage/DJI_0696.jpg";
import photo8 from "@/images/landingpage/DJI_0792.jpg";
import photo9 from "@/images/landingpage/DJI_0809.jpg";
import photo10 from "@/images/landingpage/DJI_0824.jpg";
import photo11 from "@/images/landingpage/DJI_0032.jpg";
import photo12 from "@/images/landingpage/DJI_0060.jpg";
import photo13 from "@/images/landingpage/DJI_0082.jpg";
import photo14 from "@/images/landingpage/DSC03022.jpg";
import photo15 from "@/images/landingpage/DSC05769.jpg";

const features = [
  {
    icon: Path,
    title: "Smart Route Planning",
    description: "AI-powered trip planning that finds the best campsites, hikes, and scenic stops along your route.",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    icon: Tent,
    title: "Campsite Database",
    description: "Access thousands of dispersed camping spots, BLM land, and hidden gems saved by the community.",
    color: "text-softamber",
    bgColor: "bg-softamber/20",
  },
  {
    icon: Mountains,
    title: "Trail Discovery",
    description: "Find hiking trails near your campsites with difficulty ratings, distance, and elevation data.",
    color: "text-pinesoft",
    bgColor: "bg-pinesoft/20",
  },
  {
    icon: Users,
    title: "Trip Collaboration",
    description: "Plan trips with friends. Share itineraries, vote on stops, and keep everyone in sync.",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: Calendar,
    title: "Day-by-Day Itinerary",
    description: "Automatically generated daily schedules with drive times, activities, and rest stops.",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    icon: Sun,
    title: "Photography Conditions",
    description: "Get golden hour times, weather forecasts, and optimal shooting conditions for every stop.",
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
  },
];

const testimonials = [
  {
    quote: "RoamsWild completely changed how I plan overlanding trips. Found camping spots I never knew existed.",
    author: "Sarah M.",
    role: "Overlander & Photographer",
    avatar: "SM",
  },
  {
    quote: "The collaborative features are amazing. My group of 4 vehicles planned our entire Mojave trip in one evening.",
    author: "Jake T.",
    role: "Off-road Enthusiast",
    avatar: "JT",
  },
  {
    quote: "Best trip planning app for dispersed camping. The campsite database alone is worth it.",
    author: "Michelle R.",
    role: "Weekend Adventurer",
    avatar: "MR",
  },
];

// Phone mockup component
const PhoneMockup = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative ${className}`}>
    {/* Phone frame - larger size with tilt and float animation */}
    <div className="relative mx-auto w-[320px] h-[660px] md:w-[360px] md:h-[740px] bg-gray-900 rounded-[3rem] p-3 shadow-2xl transform rotate-[6deg] animate-float-slow">
      {/* Inner bezel */}
      <div className="absolute inset-3 bg-gray-800 rounded-[2.5rem]" />

      {/* Screen */}
      <div className="relative h-full w-full bg-background rounded-[2.25rem] overflow-hidden border-[3px] border-gray-800">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-gray-900 rounded-b-2xl z-10" />

        {/* Screen content */}
        <div className="h-full w-full overflow-hidden">
          {children}
        </div>
      </div>

      {/* Side button */}
      <div className="absolute right-[-3px] top-28 w-1 h-14 bg-gray-700 rounded-l" />
      <div className="absolute left-[-3px] top-24 w-1 h-10 bg-gray-700 rounded-r" />
      <div className="absolute left-[-3px] top-36 w-1 h-14 bg-gray-700 rounded-r" />
    </div>
  </div>
);

// App screenshot mockup - Trip Detail View
const AppScreenshot = () => (
  <div className="h-full w-full bg-background flex flex-col">
    {/* Header */}
    <div className="bg-background border-b border-border px-3 pt-10 pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            <CaretLeft className="w-3 h-3 text-foreground" />
          </div>
          <div>
            <h4 className="text-[11px] font-bold text-foreground">Utah Canyon Country</h4>
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <span>5 days</span>
              <span>·</span>
              <span>342 mi</span>
            </div>
          </div>
        </div>
        <div className="flex -space-x-1.5">
          {["JD", "SM"].map((initials, i) => (
            <div key={i} className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[7px] font-medium border-2 border-background">
              {initials}
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Scrollable content */}
    <div className="flex-1 overflow-hidden px-3 py-3 space-y-2.5">
      {/* Day 1 Card */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 bg-muted/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-[8px] font-bold">1</div>
            <span className="text-[10px] font-semibold text-foreground">Day 1</span>
          </div>
          <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
            <Clock className="w-2.5 h-2.5" />
            <span>3h 20m</span>
          </div>
        </div>
        <div className="px-3 py-2 space-y-2">
          {/* Stop 1 */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-pinesoft/20 flex items-center justify-center">
              <Boot className="w-2.5 h-2.5 text-pinesoft" weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-medium text-foreground truncate">Corona Arch Trail</p>
              <p className="text-[8px] text-muted-foreground">3.0 mi · Moderate</p>
            </div>
          </div>
          {/* Stop 2 */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-wildviolet/20 flex items-center justify-center">
              <Tent className="w-2.5 h-2.5 text-wildviolet" weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-medium text-foreground truncate">BLM Dispersed - Willow Springs</p>
              <p className="text-[8px] text-muted-foreground">Free · No reservations</p>
            </div>
          </div>
        </div>
      </div>

      {/* Day 2 Card - Expanded with more detail */}
      <div className="bg-card rounded-xl border-2 border-accent overflow-hidden">
        <div className="px-3 py-2 bg-accent/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-[8px] font-bold">2</div>
            <span className="text-[10px] font-semibold text-foreground">Day 2</span>
          </div>
          <div className="flex items-center gap-1 text-[8px] text-accent font-medium">
            <Sun className="w-2.5 h-2.5" />
            <span>Great light</span>
          </div>
        </div>
        <div className="px-3 py-2 space-y-2">
          {/* Stop 1 */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-pinesoft/20 flex items-center justify-center">
              <Boot className="w-2.5 h-2.5 text-pinesoft" weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-medium text-foreground truncate">Delicate Arch</p>
              <p className="text-[8px] text-muted-foreground">3.2 mi · Moderate</p>
            </div>
          </div>
          {/* Stop 2 */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center">
              <MapPin className="w-2.5 h-2.5 text-rose-500" weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-medium text-foreground truncate">Dead Horse Point</p>
              <p className="text-[8px] text-muted-foreground">Viewpoint · Sunset spot</p>
            </div>
          </div>
          {/* Stop 3 */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-wildviolet/20 flex items-center justify-center">
              <Tent className="w-2.5 h-2.5 text-wildviolet" weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-medium text-foreground truncate">Horsethief Campground</p>
              <p className="text-[8px] text-muted-foreground">$15/night · First come</p>
            </div>
          </div>
        </div>
      </div>

      {/* Day 3 Card */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 bg-muted/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-[8px] font-bold">3</div>
            <span className="text-[10px] font-semibold text-foreground">Day 3</span>
          </div>
          <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
            <Clock className="w-2.5 h-2.5" />
            <span>4h 45m</span>
          </div>
        </div>
        <div className="px-3 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-pinesoft/20 flex items-center justify-center">
              <Boot className="w-2.5 h-2.5 text-pinesoft" weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-medium text-foreground truncate">Mesa Arch Trail</p>
              <p className="text-[8px] text-muted-foreground">0.7 mi · Easy</p>
            </div>
          </div>
        </div>
      </div>
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
  "Overlanding Expedition",
];

const Landing = () => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  // Track scroll position for parallax effect
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Rotating words effect
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

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container flex items-center justify-between h-16 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Jeep className="w-6 h-6 text-primary" weight="fill" />
            <span className="text-xl font-display font-bold text-foreground">RoamsWild</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link to="/signup">
              <Button variant="primary" size="sm">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-x-clip overflow-y-visible hero-topo pb-0 z-10">
        <div className="container px-4 md:px-6 pt-8 md:pt-10 lg:pt-12 pb-0">
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-4 items-center">
            {/* Left content */}
            <div className="text-center lg:text-left lg:pr-4 overflow-visible min-w-0 relative z-20">
              <div className="inline-flex items-center gap-2 bg-[hsl(249,50%,55%)] text-white px-3 py-1 rounded-full text-sm font-medium mb-6">
                <Lightning className="w-4 h-4" />
                Early Access Now Open
              </div>

              <h1 className="font-display font-bold text-foreground mb-6">
                <span className="text-3xl md:text-4xl lg:text-5xl block mb-2">Plan Your Next</span>
                <div className="h-[1.2em] text-5xl md:text-6xl lg:text-[4rem] xl:text-7xl relative" style={{ lineHeight: 1.15 }}>
                  <span
                    className={`text-gradient-forest whitespace-nowrap transition-all duration-200 inline-block ${
                      isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
                    }`}
                  >
                    {rotatingWords[currentWordIndex]}
                  </span>
                </div>
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8">
                Discover hidden campsites, plan scenic routes, and explore the backcountry with friends.
                Your next adventure starts here.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto lg:mx-0">
                <Link to="/signup" className="flex-1">
                  <Button variant="primary" size="lg" className="w-full h-14 text-lg">
                    Create Account
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link to="/login" className="flex-1">
                  <Button variant="secondary" size="lg" className="w-full h-14 text-lg">
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right content - Phone mockup */}
            <div className="relative flex justify-center min-h-[480px] md:min-h-[600px] mb-[-40px] md:mb-[-60px] lg:mb-[-80px]">
              {/* Background decoration */}
              <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-transparent to-amber-500/20 blur-3xl" />

              {/* Floating photos - BEHIND the device (z-0), poking out halfway */}
              {/* Image 1 - Top Left - flies at 300px */}
              <div
                className="absolute hidden lg:block z-0 animate-float-slow"
                style={{ left: '-96px', top: '-20px', animationDelay: '0s' }}
              >
                <div
                  className="w-80 h-60 md:w-96 md:h-72 overflow-hidden shadow-2xl rounded-2xl"
                  style={{
                    transform: `translateX(${scrollY > 300 ? '70vw' : `${scrollY * 0.3}px`}) rotate(-12deg)`,
                    transition: `transform ${scrollY > 300 ? '2s' : '0.8s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}
                >
                  <img src={photo8} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              {/* Image 2 - Top Right - flies at 400px */}
              <div
                className="absolute hidden lg:block z-0 animate-float-medium"
                style={{ right: '-120px', top: '-20px', animationDelay: '0.3s' }}
              >
                <div
                  className="w-96 h-72 md:w-[28rem] md:h-80 overflow-hidden shadow-2xl rounded-2xl"
                  style={{
                    transform: `translateX(${scrollY > 400 ? '70vw' : `${scrollY * 0.4}px`}) rotate(15deg)`,
                    transition: `transform ${scrollY > 400 ? '3s' : '1s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}
                >
                  <img src={photo7} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              {/* Image 3 - Bottom Left - flies at 320px */}
              <div
                className="absolute hidden lg:block z-0 animate-float-medium"
                style={{ left: '-140px', bottom: '240px', animationDelay: '0.5s' }}
              >
                <div
                  className="w-80 h-60 md:w-96 md:h-72 overflow-hidden shadow-2xl rounded-2xl"
                  style={{
                    transform: `translateX(${scrollY > 320 ? '70vw' : `${scrollY * 0.25}px`}) rotate(12deg)`,
                    transition: `transform ${scrollY > 320 ? '2.5s' : '0.9s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}
                >
                  <img src={photo10} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              {/* Image 4 - Bottom Right - flies at 450px */}
              <div
                className="absolute hidden xl:block z-0 animate-float-slow"
                style={{ right: '-180px', bottom: '180px', animationDelay: '0.8s' }}
              >
                <div
                  className="w-96 h-72 md:w-[28rem] md:h-80 overflow-hidden shadow-2xl rounded-2xl"
                  style={{
                    transform: `translateX(${scrollY > 450 ? '70vw' : `${scrollY * 0.35}px`}) rotate(-8deg)`,
                    transition: `transform ${scrollY > 450 ? '3.5s' : '1.1s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}
                >
                  <img src={photo14} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              {/* Image 5 - Bottom Left lower - flies at 380px */}
              <div
                className="absolute hidden lg:block z-0 animate-float-slow"
                style={{ left: '-60px', bottom: '40px', animationDelay: '1s' }}
              >
                <div
                  className="w-64 h-48 md:w-80 md:h-60 overflow-hidden shadow-2xl rounded-2xl"
                  style={{
                    transform: `translateX(${scrollY > 380 ? '70vw' : `${scrollY * 0.2}px`}) rotate(-8deg)`,
                    transition: `transform ${scrollY > 380 ? '2.75s' : '0.85s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}
                >
                  <img src={photo9} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              {/* Image 6 - Bottom Center - flies at 500px */}
              <div
                className="absolute hidden lg:block z-0 animate-float-medium"
                style={{ left: '65%', bottom: '20px', animationDelay: '1.2s' }}
              >
                <div
                  className="w-64 h-48 md:w-80 md:h-60 overflow-hidden shadow-2xl rounded-2xl"
                  style={{
                    transform: `translateX(calc(-50% + ${scrollY > 500 ? '70vw' : `${scrollY * 0.28}px`})) rotate(6deg)`,
                    transition: `transform ${scrollY > 500 ? '4s' : '1.2s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                  }}
                >
                  <img src={photo11} alt="" className="w-full h-full object-cover" />
                </div>
              </div>

              {/* Phone - IN FRONT (z-10) */}
              <PhoneMockup className="relative z-10">
                <AppScreenshot />
              </PhoneMockup>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="pt-20 md:pt-24 lg:pt-28 pb-16 md:pb-24 bg-card relative z-0">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="font-display font-bold text-foreground mb-4">
              Everything You Need for the Perfect Trip
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From finding hidden gems to coordinating with friends, RoamsWild has you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-background rounded-2xl p-6 border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300 group"
              >
                <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} weight="fill" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App Preview Section */}
      <section className="py-16 md:py-24 overflow-hidden">
        <div className="container px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Image gallery */}
            <div className="relative">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="rounded-2xl overflow-hidden shadow-lg">
                    <img src={photo1} alt="Overlanding adventure" className="w-full h-48 object-cover" />
                  </div>
                  <div className="rounded-2xl overflow-hidden shadow-lg">
                    <img src={photo3} alt="Mountain camping" className="w-full h-64 object-cover" />
                  </div>
                </div>
                <div className="space-y-4 pt-8">
                  <div className="rounded-2xl overflow-hidden shadow-lg">
                    <img src={photo5} alt="Desert trail" className="w-full h-64 object-cover" />
                  </div>
                  <div className="rounded-2xl overflow-hidden shadow-lg">
                    <img src={photo13} alt="Scenic overlook" className="w-full h-48 object-cover" />
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div>
              <h2 className="font-display font-bold text-foreground mb-6">
                Built for Real Adventurers
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                We've spent years exploring backcountry roads, finding dispersed campsites, and
                planning trips with friends. RoamsWild is the app we always wished existed.
              </p>

              <div className="space-y-4">
                {[
                  { icon: Shield, text: "Verified campsite locations from real overlanders" },
                  { icon: Sun, text: "Golden hour and photography condition forecasts" },
                  { icon: Users, text: "Real-time collaboration with your crew" },
                  { icon: Lightning, text: "AI-powered route optimization" },
                ].map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4 h-4 text-accent" weight="fill" />
                    </div>
                    <span className="text-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 md:py-24 hero-topo">
        <div className="container px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-display font-bold text-foreground mb-6">
              Ready to Plan Your Next Adventure?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Start planning your next adventure today. Create an account to discover
              hidden campsites, plan scenic routes, and explore with friends.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <Link to="/signup" className="flex-1">
                <Button variant="primary" size="lg" className="w-full h-14 text-lg">
                  Create Account
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/login" className="flex-1">
                <Button variant="secondary" size="lg" className="w-full h-14 text-lg">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="container px-4 md:px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Jeep className="w-5 h-5 text-primary" weight="fill" />
              <span className="font-display font-bold text-foreground">RoamsWild</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 RoamsWild. Built for adventurers.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Terms
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
