import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SavedLocationsProvider } from "@/context/SavedLocationsContext";
import { GoogleMapsProvider } from "@/components/GoogleMapsProvider";
import Index from "./pages/Index";
import RouteDetail from "./pages/RouteDetail";
import LocationDetail from "./pages/LocationDetail";
import SavedLocations from "./pages/SavedLocations";
import CreateTrip from "./pages/CreateTrip";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <GoogleMapsProvider>
      <SavedLocationsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/route/:id" element={<RouteDetail />} />
              <Route path="/location/:id" element={<LocationDetail />} />
              <Route path="/saved" element={<SavedLocations />} />
              <Route path="/create-trip" element={<CreateTrip />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SavedLocationsProvider>
    </GoogleMapsProvider>
  </QueryClientProvider>
);

export default App;
