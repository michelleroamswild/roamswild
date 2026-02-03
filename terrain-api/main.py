"""
Terrain Analysis API

FastAPI server for the photo-moment terrain analysis engine.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal, Optional, List, Dict, Any
import dataclasses
import json
from datetime import datetime

from terrain import analyze_terrain, AnalyzeRequest
from terrain.calibration import (
    CalibrationStore,
    CalibrationRating,
    FeatureVector,
    WeightProfile,
    extract_feature_vector,
    tune_weights,
)

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
    debug: bool = Field(False, description="Enable debug stats in response (rim_overlook_debug)")
    auto_thresholds: bool = Field(
        True,
        description="Auto-adjust TPI/slope thresholds per-request to target healthy rim candidate yield"
    )
    access_bias: Literal["NONE", "NEAR_ROADS", "NEAR_TRAILS", "NEAR_ROADS_OR_TRAILS"] = Field(
        "NONE",
        description="Bias rim-overlook results toward accessible locations: NONE, NEAR_ROADS, NEAR_TRAILS, or NEAR_ROADS_OR_TRAILS"
    )
    access_max_distance_m: float = Field(
        800.0,
        description="Max distance in meters for full access bonus (locations beyond 2x this get no bonus)",
        ge=100,
        le=5000
    )


# =============================================================================
# Calibration Models
# =============================================================================

class FeatureVectorModel(BaseModel):
    """Feature vector for calibration rating."""
    # DAGS components
    depth_norm: float = 0.0
    open_norm: float = 0.0
    rim_norm: float = 0.0
    sun_low_norm: float = 0.0
    sun_clear_norm: float = 0.0
    dir_norm: float = 0.0

    # VAS components
    anchor_score: float = 0.0
    curvature_salience: float = 0.0
    slope_break_salience: float = 0.0
    relief_salience: float = 0.0
    anchor_distance_m: float = 0.0

    # LAA components
    anchor_sun_incidence: float = 0.0
    anchor_shadowed: int = 0
    anchor_light_score: float = 0.0
    anchor_light_type: int = 0

    # Glow window
    peak_score: float = 0.0
    duration_minutes: int = 0
    sun_clears_ridge_minutes: int = -1
    peak_anchor_light_score: float = 0.0

    # Final score
    distant_glow_final_score: float = 0.0


class RatingRequestModel(BaseModel):
    """Request model for saving a calibration rating."""
    # Request metadata
    region_lat: float = Field(..., description="Region center latitude")
    region_lon: float = Field(..., description="Region center longitude")
    date: str = Field(..., description="Analysis date")
    event_type: Literal["sunrise", "sunset"] = Field(..., description="Event type")

    # Viewpoint identification
    viewpoint_id: str = Field(..., description="Viewpoint identifier")
    viewpoint_lat: float = Field(..., description="Viewpoint latitude")
    viewpoint_lon: float = Field(..., description="Viewpoint longitude")

    # Rating
    rating: Literal["hit", "meh", "miss"] = Field(..., description="User rating")

    # Feature vector (can be provided directly or extracted from distant_glow)
    features: Optional[FeatureVectorModel] = None
    distant_glow: Optional[Dict[str, Any]] = Field(
        None,
        description="Full distant_glow object to extract features from"
    )


class TuneRequestModel(BaseModel):
    """Request model for weight tuning."""
    profile_name: str = Field("default", description="Name of profile to tune")
    method: Literal["logistic", "coordinate_descent"] = Field(
        "logistic",
        description="Tuning method"
    )
    save_as: Optional[str] = Field(
        None,
        description="Save tuned weights under this name (default: 'tuned')"
    )


def dataclass_to_dict(obj):
    """Recursively convert dataclass instances to dicts."""
    import numpy as np
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: dataclass_to_dict(v) for k, v in dataclasses.asdict(obj).items()}
    elif isinstance(obj, list):
        return [dataclass_to_dict(v) for v in obj]
    elif isinstance(obj, dict):
        return {k: dataclass_to_dict(v) for k, v in obj.items()}
    elif isinstance(obj, tuple):
        return list(obj)
    elif isinstance(obj, (np.bool_, np.integer)):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
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
            debug=request.debug,
            auto_thresholds=request.auto_thresholds,
            access_bias=request.access_bias,
            access_max_distance_m=request.access_max_distance_m,
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


# =============================================================================
# Calibration Endpoints
# =============================================================================

# Initialize calibration store
calibration_store = CalibrationStore()


@app.post("/calibration/rate")
async def save_rating(request: RatingRequestModel):
    """
    Save a user rating for a viewpoint.

    The feature vector can be provided directly or extracted from the
    distant_glow object.
    """
    try:
        # Extract or use provided features
        if request.features:
            features = FeatureVector(**request.features.model_dump())
        elif request.distant_glow:
            features = extract_feature_vector(request.distant_glow)
        else:
            raise HTTPException(
                status_code=400,
                detail="Either 'features' or 'distant_glow' must be provided"
            )

        # Create rating record
        rating = CalibrationRating(
            timestamp=datetime.utcnow().isoformat() + "Z",
            region_lat=request.region_lat,
            region_lon=request.region_lon,
            date=request.date,
            event_type=request.event_type,
            viewpoint_id=request.viewpoint_id,
            viewpoint_lat=request.viewpoint_lat,
            viewpoint_lon=request.viewpoint_lon,
            rating=request.rating,
            features=features,
        )

        # Save to store
        calibration_store.save_rating(rating)

        return {
            "status": "ok",
            "message": "Rating saved",
            "total_ratings": calibration_store.get_rating_count(),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save rating: {str(e)}")


@app.get("/calibration/export")
async def export_ratings(format: Literal["json", "csv"] = "json"):
    """
    Export all calibration ratings.

    Args:
        format: Output format ("json" or "csv")

    Returns:
        List of rating records with feature vectors
    """
    try:
        ratings = calibration_store.export_ratings()

        if format == "csv":
            # Flatten for CSV
            if not ratings:
                return {"data": "", "count": 0}

            # Build CSV header from first record
            flat_rows = []
            for r in ratings:
                flat = {
                    "timestamp": r["timestamp"],
                    "region_lat": r["region_lat"],
                    "region_lon": r["region_lon"],
                    "date": r["date"],
                    "event_type": r["event_type"],
                    "viewpoint_id": r["viewpoint_id"],
                    "viewpoint_lat": r["viewpoint_lat"],
                    "viewpoint_lon": r["viewpoint_lon"],
                    "rating": r["rating"],
                }
                # Flatten features
                for k, v in r["features"].items():
                    flat[f"feature_{k}"] = v
                flat_rows.append(flat)

            # Build CSV string
            headers = list(flat_rows[0].keys())
            csv_lines = [",".join(headers)]
            for row in flat_rows:
                csv_lines.append(",".join(str(row.get(h, "")) for h in headers))

            return {
                "data": "\n".join(csv_lines),
                "count": len(ratings),
                "format": "csv",
            }

        return {
            "ratings": ratings,
            "count": len(ratings),
            "format": "json",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export: {str(e)}")


@app.post("/calibration/tune")
async def tune_calibration_weights(request: TuneRequestModel):
    """
    Compute updated weights from calibration data.

    Uses labeled ratings to optimize weight parameters via logistic
    regression or coordinate descent.

    Returns the proposed new weights which can be saved to a profile.
    """
    try:
        # Load ratings
        ratings = calibration_store.load_ratings()

        if not ratings:
            raise HTTPException(
                status_code=400,
                detail="No calibration ratings available. Rate some viewpoints first."
            )

        # Load base profile if specified
        base_profile = None
        if request.profile_name != "default":
            base_profile = calibration_store.load_weights(request.profile_name)

        # Tune weights
        tuned = tune_weights(
            ratings=ratings,
            method=request.method,
            base_profile=base_profile,
        )

        # Set name
        tuned.name = request.save_as or "tuned"

        # Save if requested
        if request.save_as:
            calibration_store.save_weights(tuned)

        # Count by rating type
        hit_count = sum(1 for r in ratings if r.rating == "hit")
        miss_count = sum(1 for r in ratings if r.rating == "miss")
        meh_count = sum(1 for r in ratings if r.rating == "meh")

        return {
            "status": "ok",
            "method": request.method,
            "samples_used": {
                "total": len(ratings),
                "hit": hit_count,
                "meh": meh_count,
                "miss": miss_count,
            },
            "weights": {
                "name": tuned.name,
                "dags_weights": {
                    "depth": tuned.dags_weight_depth,
                    "open": tuned.dags_weight_open,
                    "rim": tuned.dags_weight_rim,
                    "sun_low": tuned.dags_weight_sun_low,
                    "sun_clear": tuned.dags_weight_sun_clear,
                    "dir": tuned.dags_weight_dir,
                },
                "vas_weights": {
                    "base_mult": tuned.vas_dags_base_mult,
                    "anchor_mult": tuned.vas_dags_anchor_mult,
                },
                "laa_weights": {
                    "final_base_mult": tuned.laa_final_base_mult,
                    "final_light_mult": tuned.laa_final_light_mult,
                },
                "created_at": tuned.created_at,
            },
            "saved": request.save_as is not None,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tuning failed: {str(e)}")


@app.get("/calibration/weights")
async def get_weights(name: str = "default"):
    """
    Get a weight profile by name.

    Returns the default weights if the profile doesn't exist.
    """
    profile = calibration_store.load_weights(name)

    if profile is None:
        # Return default
        profile = WeightProfile(name="default")

    return {
        "name": profile.name,
        "dags_weights": {
            "depth": profile.dags_weight_depth,
            "open": profile.dags_weight_open,
            "rim": profile.dags_weight_rim,
            "sun_low": profile.dags_weight_sun_low,
            "sun_clear": profile.dags_weight_sun_clear,
            "dir": profile.dags_weight_dir,
        },
        "vas_weights": {
            "base_mult": profile.vas_dags_base_mult,
            "anchor_mult": profile.vas_dags_anchor_mult,
        },
        "laa_weights": {
            "final_base_mult": profile.laa_final_base_mult,
            "final_light_mult": profile.laa_final_light_mult,
        },
        "created_at": profile.created_at,
        "tuned_from_n_samples": profile.tuned_from_n_samples,
    }


@app.get("/calibration/stats")
async def get_calibration_stats():
    """Get statistics about calibration data."""
    ratings = calibration_store.load_ratings()

    hit_count = sum(1 for r in ratings if r.rating == "hit")
    miss_count = sum(1 for r in ratings if r.rating == "miss")
    meh_count = sum(1 for r in ratings if r.rating == "meh")

    # Unique regions
    regions = set((r.region_lat, r.region_lon) for r in ratings)

    return {
        "total_ratings": len(ratings),
        "by_rating": {
            "hit": hit_count,
            "meh": meh_count,
            "miss": miss_count,
        },
        "unique_regions": len(regions),
        "ready_for_tuning": hit_count >= 1 and miss_count >= 1,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
