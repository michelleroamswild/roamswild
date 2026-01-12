import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Jeep,
  Path,
  Tent,
  Mountains,
  MapPin,
  Users,
  Calendar,
  Compass,
  CheckCircle,
  ArrowRight,
  Star,
  Lightning,
  Shield,
  DeviceMobile,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

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
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    icon: Mountains,
    title: "Trail Discovery",
    description: "Find hiking trails near your campsites with difficulty ratings, distance, and elevation data.",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
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
    icon: MapPin,
    title: "Offline Maps",
    description: "Download your trip for offline access. Navigate even without cell service.",
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

// App screenshot mockup - Trip Map View
const AppScreenshot = () => (
  <div className="h-full w-full bg-cream relative">
    {/* Map background - styled to look like a trip route */}
    <div className="absolute inset-0 bg-gradient-to-br from-[#e8e4d9] to-[#d4d0c4]">
      {/* Topo-style pattern overlay */}
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5c13.807 0 25 11.193 25 25S43.807 55 30 55 5 43.807 5 30 16.193 5 30 5zm0 10c-8.284 0-15 6.716-15 15s6.716 15 15 15 15-6.716 15-15-6.716-15-15-15z' fill='%23a8a090' fill-opacity='0.2' fill-rule='evenodd'/%3E%3C/svg%3E")`,
      }} />

      {/* Route line SVG */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Route path */}
        <path
          d="M 15 85 Q 25 70 30 55 Q 35 40 50 35 Q 65 30 70 20 Q 75 15 85 12"
          fill="none"
          stroke="#456B2A"
          strokeWidth="1"
          strokeDasharray="2,1"
          className="animate-pulse"
        />
        {/* Animated route highlight */}
        <path
          d="M 15 85 Q 25 70 30 55 Q 35 40 50 35 Q 65 30 70 20 Q 75 15 85 12"
          fill="none"
          stroke="#8BC34A"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
      </svg>

      {/* Map markers */}
      <div className="absolute left-[12%] bottom-[12%] w-6 h-6 bg-accent rounded-full border-2 border-white shadow-lg flex items-center justify-center">
        <span className="text-[8px] font-bold text-white">A</span>
      </div>
      <div className="absolute left-[28%] top-[52%] w-5 h-5 bg-amber-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
        <Tent className="w-2.5 h-2.5 text-white" weight="fill" />
      </div>
      <div className="absolute left-[48%] top-[32%] w-5 h-5 bg-emerald-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
        <Mountains className="w-2.5 h-2.5 text-white" weight="fill" />
      </div>
      <div className="absolute right-[28%] top-[18%] w-5 h-5 bg-amber-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
        <Tent className="w-2.5 h-2.5 text-white" weight="fill" />
      </div>
      <div className="absolute right-[12%] top-[9%] w-6 h-6 bg-rose-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
        <span className="text-[8px] font-bold text-white">B</span>
      </div>
    </div>

    {/* Top header bar */}
    <div className="absolute top-8 left-0 right-0 px-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-foreground">Utah Canyon Country</h4>
            <p className="text-[10px] text-muted-foreground">5 days · 342 miles</p>
          </div>
          <div className="flex -space-x-1.5">
            {["JD", "SM", "AK"].map((initials, i) => (
              <div key={i} className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[7px] font-medium border border-white">
                {initials}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Bottom trip info card */}
    <div className="absolute bottom-4 left-3 right-3">
      <div className="bg-white/95 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-border">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-accent/10 rounded-lg flex items-center justify-center">
            <Calendar className="w-3 h-3 text-accent" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-foreground">Day 2 of 5</p>
            <p className="text-[8px] text-muted-foreground">Canyonlands → Dead Horse Point</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 bg-accent/10 rounded-lg p-1.5 text-center">
            <Tent className="w-3 h-3 text-accent mx-auto" />
            <span className="text-[8px] font-medium text-foreground block">3 Camps</span>
          </div>
          <div className="flex-1 bg-emerald-500/10 rounded-lg p-1.5 text-center">
            <Mountains className="w-3 h-3 text-emerald-500 mx-auto" />
            <span className="text-[8px] font-medium text-foreground block">2 Hikes</span>
          </div>
          <div className="flex-1 bg-amber-500/10 rounded-lg p-1.5 text-center">
            <Path className="w-3 h-3 text-amber-500 mx-auto" />
            <span className="text-[8px] font-medium text-foreground block">68 mi</span>
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
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
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

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);

    // Simulate API call - replace with actual waitlist signup
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setIsSubmitting(false);
    setIsSubmitted(true);
    setEmail("");
    toast.success("You're on the list!", {
      description: "We'll notify you when RoamsWild is ready for you.",
    });
  };

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

              {/* Waitlist Form */}
              {!isSubmitted ? (
                <form onSubmit={handleWaitlistSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 h-12 text-base"
                    required
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    disabled={isSubmitting}
                    className="whitespace-nowrap"
                  >
                    {isSubmitting ? "Joining..." : "Request Access"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>
              ) : (
                <div className="flex items-center gap-2 text-accent font-medium max-w-md mx-auto lg:mx-0 bg-accent/10 p-4 rounded-xl">
                  <CheckCircle className="w-5 h-5" weight="fill" />
                  <span>You're on the waitlist! We'll be in touch soon.</span>
                </div>
              )}

              {/* Social proof */}
              <div className="flex items-center justify-center lg:justify-start gap-4 mt-8">
                <div className="flex -space-x-2">
                  {["JD", "SM", "AK", "TR"].map((initials, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium border-2 border-background"
                    >
                      {initials}
                    </div>
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">2,400+</span> adventurers on the waitlist
                </div>
              </div>
            </div>

            {/* Right content - Phone mockup */}
            <div className="relative flex justify-center min-h-[480px] md:min-h-[600px] mb-[-40px] md:mb-[-60px] lg:mb-[-80px]">
              {/* Background decoration */}
              <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-transparent to-amber-500/20 blur-3xl" />

              {/* Floating photos - BEHIND the device (z-0), poking out halfway */}
              {/* Image 1 - Top Left - flies at 300px */}
              <div
                className="absolute w-80 h-60 md:w-96 md:h-72 overflow-hidden shadow-2xl hidden lg:block z-0 rounded-2xl"
                style={{
                  left: '-96px',
                  top: '-20px',
                  transform: `translateX(${scrollY > 300 ? '70vw' : `${scrollY * 0.3}px`}) rotate(-12deg)`,
                  transition: `transform ${scrollY > 500 ? '2s' : '4s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={photo8} alt="" className="w-full h-full object-cover" />
              </div>
              {/* Image 2 - Top Right - flies at 400px */}
              <div
                className="absolute w-96 h-72 md:w-[28rem] md:h-80 overflow-hidden shadow-2xl hidden lg:block z-0 rounded-2xl"
                style={{
                  right: '-120px',
                  top: '-20px',
                  transform: `translateX(${scrollY > 400 ? '70vw' : `${scrollY * 0.4}px`}) rotate(15deg)`,
                  transition: `transform ${scrollY > 500 ? '3s' : '6s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={photo7} alt="" className="w-full h-full object-cover" />
              </div>
              {/* Image 3 - Bottom Left - flies at 320px */}
              <div
                className="absolute w-80 h-60 md:w-96 md:h-72 overflow-hidden shadow-2xl hidden lg:block z-0 rounded-2xl"
                style={{
                  left: '-140px',
                  bottom: '240px',
                  transform: `translateX(${scrollY > 320 ? '70vw' : `${scrollY * 0.25}px`}) rotate(12deg)`,
                  transition: `transform ${scrollY > 500 ? '2.5s' : '5s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={photo10} alt="" className="w-full h-full object-cover" />
              </div>
              {/* Image 4 - Bottom Right - flies at 450px */}
              <div
                className="absolute w-96 h-72 md:w-[28rem] md:h-80 overflow-hidden shadow-2xl hidden xl:block z-0 rounded-2xl"
                style={{
                  right: '-180px',
                  bottom: '180px',
                  transform: `translateX(${scrollY > 450 ? '70vw' : `${scrollY * 0.35}px`}) rotate(-8deg)`,
                  transition: `transform ${scrollY > 500 ? '3.5s' : '7s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={photo14} alt="" className="w-full h-full object-cover" />
              </div>
              {/* Image 5 - Bottom Left lower - flies at 380px */}
              <div
                className="absolute w-64 h-48 md:w-80 md:h-60 overflow-hidden shadow-2xl hidden lg:block z-0 rounded-2xl"
                style={{
                  left: '-60px',
                  bottom: '40px',
                  transform: `translateX(${scrollY > 380 ? '70vw' : `${scrollY * 0.2}px`}) rotate(-8deg)`,
                  transition: `transform ${scrollY > 500 ? '2.75s' : '5.5s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={photo9} alt="" className="w-full h-full object-cover" />
              </div>
              {/* Image 6 - Bottom Center - flies at 500px */}
              <div
                className="absolute w-64 h-48 md:w-80 md:h-60 overflow-hidden shadow-2xl hidden lg:block z-0 rounded-2xl"
                style={{
                  left: '65%',
                  bottom: '20px',
                  transform: `translateX(calc(-50% + ${scrollY > 500 ? '70vw' : `${scrollY * 0.28}px`})) rotate(6deg)`,
                  transition: `transform ${scrollY > 500 ? '4s' : '8s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={photo11} alt="" className="w-full h-full object-cover" />
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
                  { icon: DeviceMobile, text: "Works offline in remote areas" },
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
              Join the waitlist and be the first to know when RoamsWild launches.
              Early access members get exclusive features and lifetime benefits.
            </p>

            {!isSubmitted ? (
              <form onSubmit={handleWaitlistSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 h-12 text-base"
                  required
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Joining..." : "Join Waitlist"}
                </Button>
              </form>
            ) : (
              <div className="flex items-center justify-center gap-2 text-accent font-medium bg-accent/10 p-4 rounded-xl max-w-md mx-auto">
                <CheckCircle className="w-5 h-5" weight="fill" />
                <span>You're on the waitlist!</span>
              </div>
            )}

            <p className="text-sm text-muted-foreground mt-4">
              No spam, ever. Unsubscribe anytime.
            </p>
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
