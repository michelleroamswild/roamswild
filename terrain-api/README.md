# Terrain Analysis API

FastAPI service that analyzes terrain to find optimal photography locations for sunrise/sunset.

## Features

- **DEM Fetching**: Gets elevation data from Open-Meteo API
- **Terrain Analysis**: Computes slope, aspect, surface normals using Horn's method
- **Subject Detection**: Finds steep, prominent terrain features
- **Illumination Analysis**: Calculates sun incidence angles and glow windows
- **Shadow Checking**: Ray marches to verify sun visibility
- **Standing Location Finder**: Identifies flat ground with clear sightlines

## Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload --port 8000
```

## API Endpoints

### POST /analyze

Analyze terrain around a location.

**Request:**
```json
{
  "lat": 37.746,
  "lon": -119.533,
  "date": "2024-06-15",
  "event": "sunset",
  "radius_km": 2.0
}
```

**Response:**
```json
{
  "meta": {
    "request_id": "abc12345",
    "computed_at": "2024-06-15T12:00:00Z",
    "dem_source": "open-meteo",
    "dem_bounds": {"north": 37.76, "south": 37.73, "east": -119.51, "west": -119.55},
    "cell_size_m": 30.0,
    "center_lat": 37.746,
    "center_lon": -119.533
  },
  "sun_track": [...],
  "subjects": [...],
  "standing_locations": [...]
}
```

### GET /health

Health check endpoint.

## Architecture

```
terrain-api/
├── main.py                 # FastAPI app
├── requirements.txt        # Dependencies
└── terrain/
    ├── __init__.py
    ├── types.py            # Data types (match TypeScript)
    ├── dem.py              # DEM fetching
    ├── sun.py              # Sun position calculations
    ├── analysis.py         # Slope, aspect, normals
    ├── subjects.py         # Subject detection
    ├── illumination.py     # Sun-surface interaction
    ├── shadows.py          # Shadow checking
    ├── standing.py         # Standing location finder
    └── pipeline.py         # Main orchestration
```

## Development

The API is designed to match the TypeScript types in `src/types/terrainValidation.ts` for seamless frontend integration.
