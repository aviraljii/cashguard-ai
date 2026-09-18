"""Validation and JSON quality reporting for ML datasets."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd


def validate_dataset(data: pd.DataFrame, target_column: str, report_path: str | Path) -> dict[str, object]:
    if target_column not in data:
        raise ValueError(f"Target column '{target_column}' is missing.")
    numeric = data.select_dtypes(include="number")
    report: dict[str, object] = {
        "rows": int(len(data)), "columns": int(data.shape[1]),
        "dtypes": {name: str(dtype) for name, dtype in data.dtypes.items()},
        "missing_values": {name: int(value) for name, value in data.isna().sum().items()},
        "duplicate_rows": int(data.duplicated().sum()),
        "infinite_values": int(np.isinf(numeric.to_numpy()).sum()),
        "target_distribution": {str(key): int(value) for key, value in data[target_column].value_counts().sort_index().items()},
        "numeric_ranges": {name: {"min": float(series.min()), "max": float(series.max())}
                           for name, series in numeric.items()},
    }
    if not report["rows"] or len(report["target_distribution"]) < 2:
        raise ValueError("Dataset must have rows and both target classes.")
    if report["infinite_values"]:
        raise ValueError("Dataset contains infinite numeric values.")
    destination = Path(report_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
