/**
 * Feature flags configuration
 *
 * Controls which features are accessible in the app.
 * When a feature is disabled, both navigation links AND direct URL access are blocked.
 */

// Master switch for dev/test features
const devFeaturesEnabled = import.meta.env.VITE_ENABLE_DEV_FEATURES === 'true';

/**
 * Feature flag definitions
 *
 * Add new features here. Each feature can be:
 * - Always enabled: true
 * - Always disabled: false
 * - Dev-only: devFeaturesEnabled
 * - Custom logic: any boolean expression
 */
export const featureFlags = {
  // Core features - always enabled
  trips: true,
  savedLocations: true,
  dispersedExplorer: true,

  // Features behind dev flag
  campsites: devFeaturesEnabled,

  // Dev/test pages - only in dev mode
  styleGuide: devFeaturesEnabled,
  photoWeatherTest: devFeaturesEnabled,
  terrainValidation: devFeaturesEnabled,
  photoScout: devFeaturesEnabled,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: FeatureFlag): boolean {
  return featureFlags[feature] ?? false;
}

/**
 * Get all enabled features (useful for debugging)
 */
export function getEnabledFeatures(): FeatureFlag[] {
  return (Object.keys(featureFlags) as FeatureFlag[]).filter(
    (key) => featureFlags[key]
  );
}
