import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const { id, start_date } = req.query;
  const facilityId = Array.isArray(id) ? id[0] : id;
  const startDate = Array.isArray(start_date) ? start_date[0] : start_date;

  if (!facilityId) {
    return res.status(400).json({ error: 'Facility ID required (pass as ?id=...)' });
  }

  // Build the Recreation.gov availability API URL
  const url = new URL(`https://www.recreation.gov/api/camps/availability/campground/${facilityId}/month`);

  if (startDate) {
    url.searchParams.set('start_date', startDate);
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
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
    res.setHeader('Content-Type', 'application/json');

    res.status(response.status).send(data);
  } catch (error) {
    console.error('Recreation.gov proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from Recreation.gov API' });
  }
}
