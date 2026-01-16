import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Build the RIDB API URL
  const url = new URL('https://ridb.recreation.gov/api/v1/facilities');

  // Add query parameters
  if (req.query) {
    Object.entries(req.query).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, Array.isArray(value) ? value[0] : value);
      }
    });
  }

  console.log('[RIDB Proxy] Fetching:', url.toString());

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'apikey': process.env.RIDB_API_KEY || '',
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
    console.error('RIDB proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from RIDB API' });
  }
}
