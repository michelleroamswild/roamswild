import { Navigate } from "react-router-dom";
import { isFeatureEnabled, FeatureFlag } from "@/config/featureFlags";

interface FeatureGateProps {
  feature: FeatureFlag;
  children: React.ReactNode;
  /** Where to redirect if feature is disabled. Defaults to /404 */
  redirectTo?: string;
}

/**
 * Wrapper component that only renders children if the feature is enabled.
 * Otherwise redirects to NotFound (or custom path).
 *
 * Usage:
 *   <Route path="/campsites" element={
 *     <FeatureGate feature="campsites">
 *       <Campsites />
 *     </FeatureGate>
 *   } />
 */
export function FeatureGate({
  feature,
  children,
  redirectTo = "/404",
}: FeatureGateProps) {
  if (!isFeatureEnabled(feature)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

/**
 * Combines FeatureGate with ProtectedRoute for authenticated + feature-gated routes.
 * Import ProtectedRoute separately and wrap:
 *
 *   <FeatureGate feature="campsites">
 *     <ProtectedRoute>
 *       <Campsites />
 *     </ProtectedRoute>
 *   </FeatureGate>
 */
