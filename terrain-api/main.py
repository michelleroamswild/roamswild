"""
Terrain Analysis API

FastAPI server for the photo-moment terrain analysis engine.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal
import dataclasses
import json

from terrain import analyze_terrain, AnalyzeRequest

app = FastAPI(
    title="Terrain Analysis API",
    description="Analyzes terrain to find optimal photography locations for sunrise/sunset",
    version="1.0.0",
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequestModel(BaseModel):
    """Request model for terrain analysis."""
    lat: float = Field(..., description="Center latitude", ge=-90, le=90)
    lon: float = Field(..., description="Center longitude", ge=-180, le=180)
    date: str = Field(..., description="Date in ISO format (YYYY-MM-DD)")
    event: Literal["sunrise", "sunset"] = Field(..., description="Event type")
    radius_km: float = Field(2.0, description="Analysis radius in km", ge=0.5, le=10)
    dem_source: Literal["auto", "copernicus-glo30", "usgs-3dep", "aws-terrain-tiles"] = Field(
        "auto",
        description="DEM source: auto (recommended), copernicus-glo30, usgs-3dep, or aws-terrain-tiles (visualization only)"
    )
    use_synthetic: bool = Field(False, description="Use synthetic DEM for testing")


def dataclass_to_dict(obj):
    """Recursively convert dataclass instances to dicts."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: dataclass_to_dict(v) for k, v in dataclasses.asdict(obj).items()}
    elif isinstance(obj, list):
        return [dataclass_to_dict(v) for v in obj]
    elif isinstance(obj, dict):
        return {k: dataclass_to_dict(v) for k, v in obj.items()}
    elif isinstance(obj, tuple):
        return list(obj)
    else:
        return obj


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "terrain-analysis"}


@app.post("/analyze")
async def analyze(request: AnalyzeRequestModel):
    """
    Analyze terrain around a location for photography opportunities.

    Returns subjects (terrain features), standing locations, and sun track.
    """
    try:
        # Convert to internal request type
        internal_request = AnalyzeRequest(
            lat=request.lat,
            lon=request.lon,
            date=request.date,
            event=request.event,
            radius_km=request.radius_km,
            dem_source=request.dem_source,
        )

        result = await analyze_terrain(internal_request, use_synthetic=request.use_synthetic)

        # Convert dataclasses to JSON-serializable dict
        return dataclass_to_dict(result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/health")
async def health():
    """Detailed health check."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "modules": {
            "dem": {
                "authoritative": ["copernicus-glo30", "usgs-3dep"],
                "visualization": ["aws-terrain-tiles"],
                "default": "auto (USGS 3DEP for US, Copernicus elsewhere)",
            },
            "sun": "simplified-astronomical",
            "analysis": "horn-method",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
