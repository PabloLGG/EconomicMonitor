"""Shared constants for feature engineering and model I/O."""

from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_ROOT.parent
DATA_DIR = ML_ROOT / "data" / "artifacts"
PUBLIC_MODELS = REPO_ROOT / "public" / "models"
ECONOMIC_JSON = REPO_ROOT / "public" / "data" / "economic-data.json"

CORRELATION_WINDOW = 36
INPUT_WINDOW = 60
FORECAST_HORIZON = 36
HAZARD_HORIZON = 24
PROBABILITY_HORIZON = 12
N_CORR = 3

FEATURE_NAMES = [
    "corr1",
    "corr2",
    "corr4",
    "d1_corr1",
    "d1_corr2",
    "d1_corr4",
    "d2_corr1",
    "d2_corr2",
    "d2_corr4",
    "vol_corr1",
    "vol_corr2",
    "vol_corr4",
    "yield_curve",
]

CORR_FEATURE_IDX = [0, 1, 2]
START_1960 = "1960-01-01"
START_1985 = "1985-01-01"

FRED_SERIES = [
    {"key": "gdpYoy", "series_id": "A191RO1Q156NBEA", "start": START_1960},
    {"key": "jobsCreated", "series_id": "PAYEMS", "start": START_1960, "units": "chg"},
    {"key": "yieldCurve", "series_id": "T10Y3M", "start": START_1960, "frequency": "m", "aggregation_method": "avg"},
    {"key": "joblessClaims", "series_id": "ICSA", "start": START_1960},
    {"key": "usRec", "series_id": "USREC", "start": START_1960},
    {"key": "sp500", "series_id": "SP500", "start": START_1985, "frequency": "m", "aggregation_method": "avg"},
]
