import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { SavedLocationsProvider } from "@/context/SavedLocationsContext";
import { TripProvider } from "@/context/TripContext";
import { CampsitesProvider } from "@/context/CampsitesContext";
import { GoogleMapsProvider } from "@/components/GoogleMapsProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SpinnerGap } from "@phosphor-icons/react";
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import RouteDetail from "./pages/RouteDetail";
import LocationDetail from "./pages/LocationDetail";
import SavedLocations from "./pages/SavedLocations";
import CreateTrip from "./pages/CreateTrip";
import TripDetail from "./pages/TripDetail";
import DayDetail from "./pages/DayDetail";
import MyTrips from "./pages/MyTrips";
import JoinTrip from "./pages/JoinTrip";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Campsites from "./pages/Campsites";
import CampsiteDetail from "./pages/CampsiteDetail";
import DispersedExplorer from "./pages/DispersedExplorer";
import StyleGuide from "./pages/StyleGuide";
import RidbTest from "./pages/RidbTest";

const showDevFeatures = import.meta.env.VITE_ENABLE_DEV_FEATURES === 'true';

// Smart home route - shows Landing for guests, Index for authenticated users
const HomeRoute = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <SpinnerGap className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? <Index /> : <Landing />;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <GoogleMapsProvider>
        <SavedLocationsProvider>
          <CampsitesProvider>
          <TripProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  {/* Public routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/landing" element={<Landing />} />

                  {/* Home - Landing for guests, Index for authenticated */}
                  <Route path="/" element={<HomeRoute />} />

                  {/* Protected routes */}
                  <Route path="/route/:id" element={<ProtectedRoute><RouteDetail /></ProtectedRoute>} />
                  <Route path="/location/:id" element={<ProtectedRoute><LocationDetail /></ProtectedRoute>} />
                  <Route path="/saved" element={<ProtectedRoute><SavedLocations /></ProtectedRoute>} />
                  <Route path="/create-trip" element={<ProtectedRoute><CreateTrip /></ProtectedRoute>} />
                  <Route path="/trip/:slug" element={<ProtectedRoute><TripDetail /></ProtectedRoute>} />
                  <Route path="/trip/:slug/day/:dayNumber" element={<ProtectedRoute><DayDetail /></ProtectedRoute>} />
                  <Route path="/trips" element={<ProtectedRoute><MyTrips /></ProtectedRoute>} />
                  <Route path="/my-trips" element={<ProtectedRoute><MyTrips /></ProtectedRoute>} />
                  <Route path="/join/:token" element={<ProtectedRoute><JoinTrip /></ProtectedRoute>} />
                  <Route path="/dispersed" element={<ProtectedRoute><DispersedExplorer /></ProtectedRoute>} />
                  <Route path="/campsites" element={<ProtectedRoute><Campsites /></ProtectedRoute>} />
                  <Route path="/campsites/:id" element={<ProtectedRoute><CampsiteDetail /></ProtectedRoute>} />
                  <Route path="/style-guide" element={<StyleGuide />} />
                  <Route path="/ridb-test" element={<RidbTest />} />

                  {/* Catch-all */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </TripProvider>
          </CampsitesProvider>
        </SavedLocationsProvider>
      </GoogleMapsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
