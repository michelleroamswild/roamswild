import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";
import { SavedLocations } from "@/components/SavedLocations";
import { Suggestions } from "@/components/Suggestions";

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

const Index = () => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length);
        setIsAnimating(false);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with dark green topo background */}
      <div className="hero-topo">
        <Header />

        <div className="container px-4 md:px-6 py-8 md:py-12">
          <section className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-white mb-4">
              Plan Your Next
              <span
                className={`text-gradient-light block mt-1 transition-all duration-300 ${
                  isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
                }`}
              >
                {rotatingWords[currentWordIndex]}
              </span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-8">
              Discover trails, find dispersed campsites, and build the perfect overlanding route from your saved locations.
            </p>

            <SearchBar />
          </section>
        </div>
      </div>

      <main className="container px-4 md:px-6 py-8 md:py-12 topo-pattern">

        {/* Divider */}
        <div className="w-full h-px bg-border my-12" />

        {/* Saved Locations */}
        <div className="mb-12">
          <SavedLocations />
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-border my-12" />

        {/* Suggestions - Near You */}
        <div className="mb-12">
          <Suggestions />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="container px-4 md:px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © 2026 TrailBound. Built for adventurers.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Terms
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Help
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
