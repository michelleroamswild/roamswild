import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { SavedLocationsProvider } from "@/context/SavedLocationsContext";
import { TripProvider } from "@/context/TripContext";
import { CampsitesProvider } from "@/context/CampsitesContext";
import { FriendsProvider } from "@/context/FriendsContext";
import { ChatProvider } from "@/context/ChatContext";
import { ChatAssistant } from "@/components/ChatAssistant";
import { GoogleMapsProvider } from "@/components/GoogleMapsProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FeatureGate } from "@/components/FeatureGate";
import { SpinnerGap } from "@phosphor-icons/react";
import Index from "./pages/Index";
import { RouteTransition } from "@/components/RouteTransition";
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
import MapPreview from "./pages/MapPreview";
import LightReportPreview from "./pages/LightReportPreview";
import SurpriseMePreview from "./pages/SurpriseMePreview";
import StyleGuide from "./pages/StyleGuide";
import PhotoWeatherTest from "./pages/PhotoWeatherTest";
import TerrainValidation from "./pages/TerrainValidation";
import PhotoScout from "./pages/PhotoScout";
import Admin from "./pages/Admin";
import Friends from "./pages/Friends";
import IoTest from "./pages/IoTest";

// Smart home route - shows Landing for guests, Index for authenticated users
const HomeRoute = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream dark:bg-paper flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
            <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
          </div>
          <p className="text-[12px] font-mono font-semibold uppercase tracking-[0.12em] text-pine-6">Loading…</p>
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
          <FriendsProvider>
          <TripProvider>
          <ChatProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <RouteTransition>
                <Routes>
                  {/* Public routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/landing" element={<Landing />} />
                  <Route path="/iotest" element={<IoTest />} />

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
                  <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
                  <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
                  {/* Feature-gated routes */}
                  <Route path="/campsites" element={
                    <FeatureGate feature="campsites">
                      <ProtectedRoute><Campsites /></ProtectedRoute>
                    </FeatureGate>
                  } />
                  <Route path="/campsites/:id" element={
                    <FeatureGate feature="campsites">
                      <ProtectedRoute><CampsiteDetail /></ProtectedRoute>
                    </FeatureGate>
                  } />
                  <Route path="/style-guide" element={<StyleGuide />} />
                  <Route path="/map-preview" element={<MapPreview />} />
                  <Route path="/light-preview" element={<LightReportPreview />} />
                  <Route path="/surprise-preview" element={<SurpriseMePreview />} />
                  <Route path="/light-report" element={
                    <FeatureGate feature="photoWeatherTest"><PhotoWeatherTest /></FeatureGate>
                  } />
                  <Route path="/terrain-validation" element={
                    <FeatureGate feature="terrainValidation"><TerrainValidation /></FeatureGate>
                  } />
                  <Route path="/photo-scout" element={
                    <FeatureGate feature="photoScout"><PhotoScout /></FeatureGate>
                  } />

                  {/* Catch-all */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </RouteTransition>
                <ChatAssistant />
              </BrowserRouter>
            </TooltipProvider>
          </ChatProvider>
          </TripProvider>
          </FriendsProvider>
          </CampsitesProvider>
        </SavedLocationsProvider>
      </GoogleMapsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
