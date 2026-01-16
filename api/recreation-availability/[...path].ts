import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Get the path after /api/recreation-availability/
  const { path } = req.query;
  const pathString = Array.isArray(path) ? path.join('/') : path || '';

  // Build the Recreation.gov availability API URL
  const recUrl = `https://www.recreation.gov/api/camps/availability/campground/${pathString}`;
  const url = new URL(recUrl);

  // Add query parameters
  if (req.query) {
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== 'path' && value) {
        url.searchParams.set(key, Array.isArray(value) ? value[0] : value);
      }
    });
  }

  try {
    const response = await fetch(url.toString(), {
      method: req.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TripPlanner/1.0)',
        'Accept': 'application/json',
      },
    });

    const data = await response.text();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(response.status).send(data);
  } catch (error) {
    console.error('Recreation.gov proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from Recreation.gov API' });
  }
}
