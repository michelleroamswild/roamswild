import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/Header';

interface Facility {
  FacilityID: string;
  FacilityName: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  FacilityTypeDescription: string;
}

export default function RidbTest() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Facility[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string>('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<string>('');
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  // Joshua Tree coordinates
  const lat = 34.1340144;
  const lng = -116.3155721;

  // Known Joshua Tree campgrounds
  const testCampgrounds = [
    { id: '272299', name: 'Cottonwood Campground' },
    { id: '232445', name: 'Black Rock Campground' },
    { id: '232444', name: 'Indian Cove Campground' },
  ];

  const testAvailability = async (facilityId: string) => {
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    setAvailabilityResult('');

    try {
      // Test with January 2026
      const monthStart = '2026-01-01T00:00:00.000Z';
      const params = new URLSearchParams({ start_date: monthStart });
      const url = `/api/recreation-availability/${facilityId}/month?${params}`;

      console.log(`Testing availability URL: ${url}`);
      const response = await fetch(url);
      const text = await response.text();

      if (!response.ok) {
        setAvailabilityError(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        return;
      }

      const data = JSON.parse(text);

      // Extract and show the date format used in the response
      let dateKeySample = 'No campsites found';
      let availabilityInfo = '';

      if (data.campsites) {
        const campsites = Object.values(data.campsites) as any[];
        if (campsites.length > 0 && campsites[0].availabilities) {
          const keys = Object.keys(campsites[0].availabilities);
          dateKeySample = `Date key format: ${keys[0]}\n\nSample keys: ${keys.slice(0, 10).join(', ')}`;

          // Count available dates
          let availableDates: string[] = [];
          for (const [key, value] of Object.entries(campsites[0].availabilities)) {
            if (value === 'Available') {
              availableDates.push(key);
            }
          }
          availabilityInfo = `\n\nAvailable dates for first site: ${availableDates.slice(0, 10).join(', ')}${availableDates.length > 10 ? '...' : ''}`;
        }

        setAvailabilityResult(`Found ${Object.keys(data.campsites).length} campsites\n\n${dateKeySample}${availabilityInfo}\n\nRaw sample:\n${JSON.stringify(data, null, 2).slice(0, 2000)}`);
      } else {
        setAvailabilityResult(`Response: ${JSON.stringify(data, null, 2).slice(0, 2000)}`);
      }
    } catch (err) {
      setAvailabilityError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const testRidbApi = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setRawResponse('');

    try {
      const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lng.toString(),
        radius: '50',
        limit: '20',
      });

      console.log('Fetching from /api/ridb/facilities...');
      const response = await fetch(`/api/ridb/facilities?${params}`);

      const text = await response.text();
      setRawResponse(text);

      if (!response.ok) {
        setError(`HTTP ${response.status}: ${text}`);
        return;
      }

      const data = JSON.parse(text);
      const facilities = data.RECDATA || [];

      // Filter for campgrounds
      const campgrounds = facilities.filter((f: Facility) => {
        const typeDesc = (f.FacilityTypeDescription || '').toLowerCase();
        const name = (f.FacilityName || '').toLowerCase();
        return typeDesc.includes('camp') || name.includes('camp');
      });

      setResults(campgrounds);
      console.log('Found campgrounds:', campgrounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-4">RIDB API Test</h1>

        <div className="mb-4 p-4 bg-muted rounded-lg">
          <p><strong>Test Location:</strong> Joshua Tree</p>
          <p><strong>Coordinates:</strong> {lat}, {lng}</p>
          <p><strong>Radius:</strong> 50 miles</p>
        </div>

        <Button onClick={testRidbApi} disabled={loading} className="mb-6">
          {loading ? 'Testing...' : 'Test RIDB API'}
        </Button>

        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-lg">
            <h3 className="font-bold text-red-700 dark:text-red-400">Error</h3>
            <pre className="text-sm whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {results.length > 0 && (
          <div className="mb-4">
            <h3 className="font-bold text-lg mb-2 text-green-600">
              Found {results.length} campgrounds
            </h3>
            <div className="space-y-2">
              {results.map((f) => (
                <div key={f.FacilityID} className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">{f.FacilityName}</p>
                  <p className="text-sm text-muted-foreground">
                    ID: {f.FacilityID} | Type: {f.FacilityTypeDescription}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Coords: {f.FacilityLatitude}, {f.FacilityLongitude}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {rawResponse && (
          <div className="mt-6">
            <h3 className="font-bold mb-2">Raw Response (first 2000 chars)</h3>
            <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto max-h-96">
              {rawResponse.slice(0, 2000)}
              {rawResponse.length > 2000 && '...'}
            </pre>
          </div>
        )}

        {/* Availability Test Section */}
        <div className="mt-8 pt-8 border-t">
          <h2 className="text-xl font-bold mb-4">Availability API Test</h2>

          <div className="mb-4 p-4 bg-muted rounded-lg">
            <p><strong>Test Month:</strong> January 2026</p>
            <p className="text-sm text-muted-foreground mt-2">
              Click a campground to test its availability and see the date format used by Recreation.gov
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {testCampgrounds.map((camp) => (
              <Button
                key={camp.id}
                onClick={() => testAvailability(camp.id)}
                disabled={availabilityLoading}
                variant="outline"
              >
                {availabilityLoading ? 'Testing...' : `Test ${camp.name}`}
              </Button>
            ))}
          </div>

          {availabilityError && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-lg">
              <h3 className="font-bold text-red-700 dark:text-red-400">Availability Error</h3>
              <pre className="text-sm whitespace-pre-wrap">{availabilityError}</pre>
            </div>
          )}

          {availabilityResult && (
            <div className="mb-4">
              <h3 className="font-bold text-lg mb-2 text-green-600">Availability Result</h3>
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                {availabilityResult}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
