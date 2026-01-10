import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";
import { SavedLocations } from "@/components/SavedLocations";
import { TripPreview } from "@/components/TripPreview";
import { Suggestions } from "@/components/Suggestions";

const Index = () => {
  return (
    <div className="min-h-screen bg-background topo-pattern">
      <Header />

      <main className="container px-4 md:px-6 py-8 md:py-12">
        {/* Hero Section */}
        <section className="text-center mb-12 animate-fade-in">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground mb-4">
            Plan Your Next
            <span className="text-gradient block mt-1">Adventure</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Discover trails, find dispersed campsites, and build the perfect overlanding route from your saved locations.
          </p>

          <SearchBar />

          <div className="mt-8">
            <p className="text-sm text-muted-foreground mb-4">Filter your search by:</p>
            <FilterChips />
          </div>
        </section>

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

        {/* Trip Preview */}
        <TripPreview />
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
