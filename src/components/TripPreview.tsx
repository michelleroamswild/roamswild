import { Route, Clock, Mountain, Tent, Fuel, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";

const stops = [
  { name: "Lone Pine Creek Trail", type: "hike", duration: "3h hike" },
  { name: "Mobil Gas Station", type: "gas", duration: "Quick stop" },
  { name: "Alabama Hills BLM", type: "camp", duration: "Overnight" },
];

const getIcon = (type: string) => {
  switch (type) {
    case "hike":
      return Mountain;
    case "gas":
      return Fuel;
    case "camp":
      return Tent;
    default:
      return Route;
  }
};

export const TripPreview = () => {
  return (
    <section className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Suggested Route</h2>
          <p className="text-muted-foreground mt-1">Based on your saved locations</p>
        </div>
      </div>

      <div className="relative bg-gradient-card rounded-2xl border border-border overflow-hidden shadow-card">
        {/* Map placeholder */}
        <div className="relative h-48 bg-sand topo-pattern overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card/80" />
          <div className="absolute bottom-4 left-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Route className="w-4 h-4 text-terracotta" />
            <span className="font-medium">285 miles total</span>
            <span className="text-muted-foreground">•</span>
            <Clock className="w-4 h-4" />
            <span>~5.5 hours driving</span>
          </div>
        </div>

        {/* Stops */}
        <div className="p-6">
          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            {stops.map((stop, index) => {
              const Icon = getIcon(stop.type);
              return (
                <div key={index} className="flex items-center gap-3">
                  <div 
                    className="flex flex-col items-center gap-2 min-w-[120px] p-4 bg-secondary/50 rounded-xl border border-border hover:border-primary/30 transition-all duration-200 cursor-pointer animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className={`
                      flex items-center justify-center w-10 h-10 rounded-full
                      ${stop.type === 'hike' ? 'bg-primary/10 text-primary' : ''}
                      ${stop.type === 'gas' ? 'bg-terracotta/10 text-terracotta' : ''}
                      ${stop.type === 'camp' ? 'bg-forest-light/20 text-forest' : ''}
                    `}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground truncate max-w-[100px]">{stop.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{stop.duration}</p>
                    </div>
                  </div>
                  {index < stops.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-6 pt-6 border-t border-border">
            <Link to="/create-trip" className="flex-1">
              <Button variant="hero" size="lg" className="w-full">
                Plan Your Own Trip
              </Button>
            </Link>
            <Link to="/route/1">
              <Button variant="outline" size="lg">
                View Demo
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
