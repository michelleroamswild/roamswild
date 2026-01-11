import { ArrowLeft, Path, Clock, Mountains, Tent, GasPump, MapPin, Plus, DotsSixVertical, DotsThree, NavigationArrow, ShareNetwork, DownloadSimple, Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { RouteMap } from "@/components/RouteMap";
import { RouteStop } from "@/types/maps";

const routeStops: RouteStop[] = [
  {
    id: 1,
    name: "Lone Pine Creek Trail",
    type: "hike",
    duration: "3h hike",
    distance: "0 mi",
    description: "Scenic mountain trail with creek views",
    elevation: "6,500 ft",
    coordinates: { lat: 36.6062, lng: -118.0631 }
  },
  {
    id: 2,
    name: "Mobil Gas Station",
    type: "gas",
    duration: "15 min",
    distance: "12 mi",
    description: "Last gas before Alabama Hills",
    elevation: "3,800 ft",
    coordinates: { lat: 36.5996, lng: -118.0558 }
  },
  {
    id: 3,
    name: "Alabama Hills BLM",
    type: "camp",
    duration: "Overnight",
    distance: "28 mi",
    description: "Free dispersed camping with stunning rock formations",
    elevation: "4,400 ft",
    coordinates: { lat: 36.6089, lng: -118.1061 }
  },
];

const getIcon = (type: string) => {
  switch (type) {
    case "hike":
      return Mountains;
    case "gas":
      return GasPump;
    case "camp":
      return Tent;
    default:
      return MapPin;
  }
};

const getTypeStyles = (type: string) => {
  switch (type) {
    case "hike":
      return "bg-primary/10 text-primary border-primary/20";
    case "gas":
      return "bg-terracotta/10 text-terracotta border-terracotta/20";
    case "camp":
      return "bg-forest-light/20 text-forest border-forest/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

const RouteDetail = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">Eastern Sierra Loop</h1>
                <p className="text-sm text-muted-foreground">3 stops • 285 miles</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="rounded-full">
                <Star className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <ShareNetwork className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <DownloadSimple className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-6">
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Map Section */}
          <div className="lg:col-span-3 order-2 lg:order-1">
            <Card className="overflow-hidden h-[400px] lg:h-[calc(100vh-180px)] lg:sticky lg:top-24">
              <div className="relative w-full h-full">
                {/* Google Maps with route */}
                <RouteMap
                  stops={routeStops}
                  className="w-full h-full"
                  showDirections={true}
                />

                {/* Route info overlay */}
                <div className="absolute bottom-4 left-4 right-4 z-10">
                  <div className="bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-lg">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Path className="w-4 h-4 text-terracotta" />
                          <span className="font-semibold text-foreground">285 mi</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">5h 30m</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mountains className="w-4 h-4 text-primary" />
                          <span className="text-foreground">+4,200 ft</span>
                        </div>
                      </div>
                      <Button
                        variant="hero"
                        size="sm"
                        onClick={() => {
                          // Open Google Maps with directions
                          const waypoints = routeStops.slice(1, -1).map(s => `${s.coordinates.lat},${s.coordinates.lng}`).join('|');
                          const origin = `${routeStops[0].coordinates.lat},${routeStops[0].coordinates.lng}`;
                          const dest = `${routeStops[routeStops.length - 1].coordinates.lat},${routeStops[routeStops.length - 1].coordinates.lng}`;
                          window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${waypoints}`, '_blank');
                        }}
                      >
                        <NavigationArrow className="w-4 h-4 mr-2" />
                        Start Navigation
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Stops Panel */}
          <div className="lg:col-span-2 order-1 lg:order-2 space-y-4">
            {/* Trip Summary */}
            <Card className="bg-gradient-card">
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-foreground">285</p>
                    <p className="text-xs text-muted-foreground">Total Miles</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">5.5h</p>
                    <p className="text-xs text-muted-foreground">Drive Time</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">2</p>
                    <p className="text-xs text-muted-foreground">Days</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Route Stops */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-display font-semibold text-foreground">Route Stops</h2>
                <Button variant="ghost" size="sm" className="text-primary">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Stop
                </Button>
              </div>

              <div className="space-y-2">
                {routeStops.map((stop, index) => {
                  const Icon = getIcon(stop.type);
                  const typeStyles = getTypeStyles(stop.type);
                  
                  return (
                    <div key={stop.id} className="relative">
                      {/* Connection line */}
                      {index < routeStops.length - 1 && (
                        <div className="absolute left-[27px] top-[72px] w-0.5 h-[calc(100%-40px)] bg-border" />
                      )}
                      
                      <Card className="group hover:border-primary/30 transition-all duration-200 cursor-pointer animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {/* Drag handle */}
                            <div className="flex flex-col items-center gap-1 pt-1">
                              <DotsSixVertical className="w-4 h-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                            </div>
                            
                            {/* Stop icon */}
                            <div className={`flex items-center justify-center w-11 h-11 rounded-xl border ${typeStyles}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            
                            {/* Stop details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-medium text-foreground">{stop.name}</h3>
                                  <p className="text-sm text-muted-foreground mt-0.5">{stop.description}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <DotsThree className="w-4 h-4" />
                                </Button>
                              </div>
                              
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Path className="w-3 h-3" />
                                  {stop.distance}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {stop.duration}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Mountains className="w-3 h-3" />
                                  {stop.elevation}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>

              {/* Add stop button */}
              <Button variant="outline" className="w-full border-dashed">
                <Plus className="w-4 h-4 mr-2" />
                Add Another Stop
              </Button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button variant="hero" size="lg" className="flex-1">
                <NavigationArrow className="w-4 h-4 mr-2" />
                Start Trip
              </Button>
              <Button variant="outline" size="lg">
                Edit Route
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RouteDetail;
