"""
Terrain Analysis Module for Photo-Moment Engine

Computes optimal photography locations based on terrain geometry
and sun position during sunrise/sunset.
"""

from .pipeline import analyze_terrain
from .types import AnalyzeRequest, TerrainAnalysisResult

__all__ = ["analyze_terrain", "AnalyzeRequest", "TerrainAnalysisResult"]
