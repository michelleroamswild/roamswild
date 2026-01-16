import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Get the path after /api/ridb/
  const { path } = req.query;
  const pathString = Array.isArray(path) ? path.join('/') : path || '';

  // Build the RIDB API URL
  const ridbUrl = `https://ridb.recreation.gov/api/v1/${pathString}`;
  const url = new URL(ridbUrl);

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
        'apikey': process.env.RIDB_API_KEY || '',
        'Content-Type': 'application/json',
      },
    });

    const data = await response.text();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(response.status).send(data);
  } catch (error) {
    console.error('RIDB proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from RIDB API' });
  }
}
