import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { SavedLocationsProvider } from "@/context/SavedLocationsContext";
import { TripProvider } from "@/context/TripContext";
import { GoogleMapsProvider } from "@/components/GoogleMapsProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <GoogleMapsProvider>
        <SavedLocationsProvider>
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

                  {/* Protected routes */}
                  <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                  <Route path="/route/:id" element={<ProtectedRoute><RouteDetail /></ProtectedRoute>} />
                  <Route path="/location/:id" element={<ProtectedRoute><LocationDetail /></ProtectedRoute>} />
                  <Route path="/saved" element={<ProtectedRoute><SavedLocations /></ProtectedRoute>} />
                  <Route path="/create-trip" element={<ProtectedRoute><CreateTrip /></ProtectedRoute>} />
                  <Route path="/trip/:id" element={<ProtectedRoute><TripDetail /></ProtectedRoute>} />
                  <Route path="/trip/:tripId/day/:dayNumber" element={<ProtectedRoute><DayDetail /></ProtectedRoute>} />
                  <Route path="/trips" element={<ProtectedRoute><MyTrips /></ProtectedRoute>} />
                  <Route path="/my-trips" element={<ProtectedRoute><MyTrips /></ProtectedRoute>} />
                  <Route path="/join/:token" element={<ProtectedRoute><JoinTrip /></ProtectedRoute>} />

                  {/* Catch-all */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </TripProvider>
        </SavedLocationsProvider>
      </GoogleMapsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
