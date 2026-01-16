import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  console.log('[Recreation Proxy] Request received, query:', req.query);

  const { id } = req.query;
  const facilityId = Array.isArray(id) ? id[0] : id;

  console.log('[Recreation Proxy] Facility ID:', facilityId);

  if (!facilityId) {
    console.log('[Recreation Proxy] No facility ID, returning 400');
    return res.status(400).json({ error: 'Facility ID required' });
  }

  // Build the Recreation.gov availability API URL
  const url = new URL(`https://www.recreation.gov/api/camps/availability/campground/${facilityId}/month`);

  // Add query parameters (like start_date)
  if (req.query) {
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== 'id' && value) {
        url.searchParams.set(key, Array.isArray(value) ? value[0] : value);
      }
    });
  }

  console.log('[Recreation Proxy] Fetching:', url.toString());

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TripPlanner/1.0)',
        'Accept': 'application/json',
      },
    });

    const data = await response.text();
    console.log('[Recreation Proxy] Response status:', response.status, 'Data length:', data.length);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    res.status(response.status).send(data);
  } catch (error) {
    console.error('Recreation.gov proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from Recreation.gov API' });
  }
}
