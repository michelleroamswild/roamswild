import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { SavedLocationsProvider } from "@/context/SavedLocationsContext";
import { TripProvider } from "@/context/TripContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import RouteDetail from "./pages/RouteDetail";
import LocationDetail from "./pages/LocationDetail";
import SavedLocations from "./pages/SavedLocations";
import CreateTrip from "./pages/CreateTrip";
import TripDetail from "./pages/TripDetail";
import MyTrips from "./pages/MyTrips";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <SavedLocationsProvider>
          <TripProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <Routes>
                {/* Public auth routes */}
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
                <Route path="/my-trips" element={<ProtectedRoute><MyTrips /></ProtectedRoute>} />

                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TooltipProvider>
          </TripProvider>
        </SavedLocationsProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
