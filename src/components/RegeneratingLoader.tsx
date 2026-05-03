import { CreateTripLoader } from '@/components/CreateTripLoader';

interface RegeneratingLoaderProps {
  tripName?: string;
  destinations?: Array<{ name: string }>;
}

// Thin wrapper around the shared trip-generation loader so the regenerate
// flow shares the same hero / route / cycling-status visual language as the
// initial create flow — only the headline changes.
export const RegeneratingLoader = ({ tripName, destinations }: RegeneratingLoaderProps) => (
  <CreateTripLoader
    headline="Regenerating trip"
    tripName={tripName}
    destinations={destinations}
  />
);
