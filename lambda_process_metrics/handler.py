"""Lambda handler for processing metrics and detecting anomalies."""

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd


def clean_nan_values(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert NaN values to None for JSON serialization.

    Args:
        data: Dictionary that may contain NaN values.

    Returns:
        Dictionary with NaN values replaced by None.
    """
    cleaned = {}
    for key, value in data.items():
        # Handle arrays/Series first to avoid pandas ambiguity errors
        if isinstance(value, pd.Series):
            cleaned[key] = [clean_nan_values({"item": v})["item"] for v in value.tolist()]
        elif isinstance(value, np.ndarray):
            cleaned[key] = [clean_nan_values({"item": v})["item"] for v in value.tolist()]
        elif isinstance(value, dict):
            cleaned[key] = clean_nan_values(value)
        elif isinstance(value, list):
            cleaned[key] = [clean_nan_values({"item": v})["item"] for v in value]
        elif isinstance(value, (bool, np.bool_)):
            cleaned[key] = bool(value)  # Convert numpy bool to Python bool
        elif isinstance(value, (np.integer, np.int64)):
            cleaned[key] = int(value)  # Convert numpy int to Python int
        elif isinstance(value, (np.floating, np.float64)):
            if np.isnan(value):
                cleaned[key] = None
            else:
                cleaned[key] = float(value)
        elif isinstance(value, float):
            # Handle Python float NaN
            if np.isnan(value):
                cleaned[key] = None
            else:
                cleaned[key] = value
        else:
            # For other types, check if it's a scalar NaN (only check scalars to avoid ambiguity)
            try:
                # pd.isna() on scalars is safe, but wrap in try/except for safety
                if pd.isna(value):
                    cleaned[key] = None
                else:
                    cleaned[key] = value
            except (ValueError, TypeError):
                # If pd.isna() fails (e.g., on non-scalar), just keep the value
                cleaned[key] = value
    return cleaned

from common.config import settings
from common.logging_utils import setup_logger
from common.s3_utils import (
    download_json_from_s3,
    get_s3_key_for_date,
    upload_json_to_s3,
)

logger = setup_logger(__name__)


def detect_anomalies(df: pd.DataFrame) -> pd.DataFrame:
    """Detect anomalies in health metrics data.

    Args:
        df: DataFrame with health metrics columns: date, hrv, resting_hr, sleep_score, steps.

    Returns:
        DataFrame enriched with anomaly detection columns.
    """
    result_df = df.copy()

    # Validate required columns
    required_columns = ["date", "hrv", "resting_hr", "sleep_score", "steps"]
    missing_columns = [col for col in required_columns if col not in result_df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")

    # Convert date to date type
    result_df["date"] = pd.to_datetime(result_df["date"]).dt.date

    # Sort by date
    result_df = result_df.sort_values("date").reset_index(drop=True)

    # Compute 7-day rolling medians for baselines
    result_df["hrv_baseline"] = (
        result_df["hrv"].rolling(window=7, min_periods=1).median()
    )
    result_df["rhr_baseline"] = (
        result_df["resting_hr"].rolling(window=7, min_periods=1).median()
    )

    # Core anomaly flags
    result_df["low_hrv_flag"] = result_df["hrv"] < (result_df["hrv_baseline"] * 0.7)
    result_df["high_rhr_flag"] = result_df["resting_hr"] > (
        result_df["rhr_baseline"] * 1.15
    )
    result_df["low_sleep_flag"] = result_df["sleep_score"] < 60

    # Collect flag columns
    flag_columns = ["low_hrv_flag", "high_rhr_flag", "low_sleep_flag"]

    # Optional metrics
    if "recovery_index" in result_df.columns:
        result_df["recovery_baseline"] = (
            result_df["recovery_index"].rolling(window=7, min_periods=1).median()
        )
        result_df["low_recovery_flag"] = result_df["recovery_index"] < 50
        flag_columns.append("low_recovery_flag")

    if "movement_index" in result_df.columns:
        result_df["movement_baseline"] = (
            result_df["movement_index"].rolling(window=7, min_periods=1).median()
        )
        result_df["low_movement_flag"] = result_df["movement_index"] < 40
        flag_columns.append("low_movement_flag")

    if "steps" in result_df.columns:
        result_df["steps_baseline"] = (
            result_df["steps"].rolling(window=7, min_periods=1).median()
        )
        result_df["low_steps_flag"] = result_df["steps"] < (
            result_df["steps_baseline"] * 0.6
        )
        flag_columns.append("low_steps_flag")

    # Compute is_anomalous and severity
    result_df["is_anomalous"] = result_df[flag_columns].any(axis=1)
    result_df["anomaly_severity"] = result_df[flag_columns].astype(int).sum(axis=1)

    return result_df


def _extract_numeric_values(values: List[Any]) -> List[float]:
    """Extract numeric values from a list that may contain numbers or dictionaries.

    Args:
        values: List that may contain numbers or dictionaries with 'value' key.

    Returns:
        List of numeric values.
    """
    numeric_values = []
    for item in values:
        if isinstance(item, (int, float)):
            numeric_values.append(float(item))
        elif isinstance(item, dict):
            # Try common keys for value
            value = item.get("value") or item.get("val") or item.get("data")
            if isinstance(value, (int, float)):
                numeric_values.append(float(value))
    return numeric_values


def extract_metrics_from_raw(
    raw_data: Dict[str, Any], target_date: date
) -> Dict[str, Any]:
    """Extract structured metrics from raw Ultrahuman API response.

    Expected structure:
    {
        "status": "success",
        "data": {
            "metric_data": [
                {"type": "hrv", "object": {"values": [...]}},
                {"type": "night_rhr", "object": {"values": [...]}},
                {"type": "sleep_rhr", "object": {"values": [...]}},
                {"type": "steps", "object": {"values": [...]}},
                {"type": "Sleep", "object": {"sleep_score": {"score": 80}}},
                {"type": "movement_index", "object": {"value": 73}},
                {"type": "recovery_index", "object": {"value": 65}},
            ]
        }
    }

    Args:
        raw_data: Raw JSON data from Ultrahuman API.
        target_date: Target date for the metrics.

    Returns:
        Dictionary with extracted metrics.
    """
    metrics = {
        "date": str(target_date),
        "hrv": None,
        "resting_hr": None,
        "sleep_rhr": None,
        "sleep_score": None,
        "steps": None,
        "recovery_index": None,
        "movement_index": None,
    }

    # Extract metric_data array
    metric_data = raw_data.get("data", {}).get("metric_data", [])

    for metric_item in metric_data:
        metric_type = metric_item.get("type")
        metric_object = metric_item.get("object", {})

        if metric_type == "hrv":
            # Extract HRV - average of values array
            values = metric_object.get("values", [])
            if values:
                numeric_values = _extract_numeric_values(values)
                if numeric_values:
                    metrics["hrv"] = sum(numeric_values) / len(numeric_values)

        elif metric_type == "night_rhr":
            # Extract night resting heart rate - average of values array
            values = metric_object.get("values", [])
            if values:
                numeric_values = _extract_numeric_values(values)
                if numeric_values:
                    metrics["resting_hr"] = sum(numeric_values) / len(numeric_values)

        elif metric_type == "sleep_rhr":
            # Extract sleep resting heart rate
            values = metric_object.get("values", [])
            if values:
                numeric_values = _extract_numeric_values(values)
                if numeric_values:
                    metrics["sleep_rhr"] = sum(numeric_values) / len(numeric_values)
            # Use sleep_rhr as resting_hr if night_rhr not available
            if metrics["resting_hr"] is None and metrics["sleep_rhr"] is not None:
                metrics["resting_hr"] = metrics["sleep_rhr"]

        elif metric_type == "steps":
            # Extract steps - sum of values array
            values = metric_object.get("values", [])
            if values:
                numeric_values = _extract_numeric_values(values)
                if numeric_values:
                    metrics["steps"] = sum(numeric_values)

        elif metric_type == "Sleep":
            # Extract sleep score
            sleep_score_obj = metric_object.get("sleep_score", {})
            if isinstance(sleep_score_obj, dict):
                metrics["sleep_score"] = sleep_score_obj.get("score")

        elif metric_type == "movement_index":
            # Extract movement index value
            metrics["movement_index"] = metric_object.get("value")

        elif metric_type == "recovery_index":
            # Extract recovery index value
            metrics["recovery_index"] = metric_object.get("value")

    # Keep raw_data for reference
    metrics["raw_data"] = raw_data

    return metrics


def load_recent_history(
    patient_id: str, target_date: date, window_days: int = 30
) -> List[Dict[str, Any]]:
    """Load recent processed metrics history from S3.

    Args:
        patient_id: Patient identifier.
        target_date: Target date (will load days before this date).
        window_days: Number of days to look back (default: 30).

    Returns:
        List of metric dictionaries, sorted by date ascending.
    """
    history = []

    # Load data for each day from target_date - 1 back to target_date - (window_days - 1)
    for i in range(1, window_days):
        history_date = target_date - timedelta(days=i)
        s3_key = get_s3_key_for_date(patient_id, history_date)
        processed_data = download_json_from_s3(s3_key, bucket_type="processed")

        if processed_data:
            # Extract relevant fields
            record = {
                "date": processed_data.get("date") or str(history_date),
                "hrv": processed_data.get("hrv"),
                "resting_hr": processed_data.get("resting_hr"),
                "sleep_score": processed_data.get("sleep_score"),
                "steps": processed_data.get("steps"),
                "recovery_index": processed_data.get("recovery_index"),
                "movement_index": processed_data.get("movement_index"),
            }
            history.append(record)

    # Sort by date ascending
    history.sort(key=lambda x: x["date"])

    logger.info(f"Loaded {len(history)} historical records for {patient_id}")
    return history


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda handler for processing metrics and detecting anomalies.

    Expected event structure:
    {
        "patient_id": "patient123",
        "date": "2024-01-15"  # Optional, defaults to yesterday
    }

    Args:
        event: Lambda event dictionary.
        context: Lambda context object.

    Returns:
        Dictionary with status and metadata.
    """
    try:
        # Extract parameters from event
        patient_id = event.get("patient_id") or settings.ULTRAHUMAN_PATIENT_ID
        if not patient_id:
            raise ValueError(
                "patient_id must be provided in event or environment variables"
            )

        date_str = event.get("date")
        if date_str:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        else:
            target_date = date.today() - timedelta(days=1)  # Default to yesterday

        logger.info(f"Processing metrics for patient {patient_id} on {target_date}")

        # Download raw data from S3
        raw_s3_key = get_s3_key_for_date(patient_id, target_date)
        raw_data = download_json_from_s3(raw_s3_key, bucket_type="raw")

        if raw_data is None:
            logger.warning(
                f"No raw data found at s3://{settings.RAW_DATA_BUCKET_NAME}/{raw_s3_key}"
            )
            return {
                "statusCode": 404,
                "body": json.dumps(
                    {
                        "status": "not_found",
                        "patient_id": patient_id,
                        "date": str(target_date),
                        "message": "Raw data not found in S3",
                    }
                ),
            }

        # Extract metrics from raw data
        metrics = extract_metrics_from_raw(raw_data, target_date)

        # Load recent history for anomaly detection (30 days)
        history = load_recent_history(patient_id, target_date, window_days=30)

        # Create DataFrame with history + current metrics
        all_metrics = history + [metrics]
        df = pd.DataFrame(all_metrics)

        # Detect anomalies (will compute baselines using historical data)
        enriched_df = detect_anomalies(df)

        # Extract the current date's row (last row, since history is sorted ascending + current appended)
        # detect_anomalies converts date column to date type, so compare directly
        # Convert target_date to string for comparison to avoid pandas boolean array ambiguity
        target_date_str = str(target_date)
        date_mask = enriched_df["date"].astype(str) == target_date_str
        current_row = enriched_df[date_mask]
        if len(current_row) == 0:
            # Fallback to last row if date filter doesn't match
            processed_data = enriched_df.iloc[-1].to_dict()
        else:
            processed_data = current_row.iloc[0].to_dict()

        # Clean NaN values and convert numpy types to Python types
        processed_data = clean_nan_values(processed_data)

        # Add metadata
        processed_data["_metadata"] = {
            "patient_id": patient_id,
            "date": str(target_date),
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "source": "lambda_process_metrics",
        }

        # Upload processed data to S3
        processed_s3_key = get_s3_key_for_date(patient_id, target_date)
        upload_json_to_s3(
            data=processed_data,
            key=processed_s3_key,
            bucket_type="processed",
            metadata={
                "patient_id": patient_id,
                "date": str(target_date),
                "is_anomalous": str(processed_data.get("is_anomalous", False)),
            },
        )

        logger.info(
            f"Successfully saved processed data to s3://{settings.PROCESSED_DATA_BUCKET_NAME}/{processed_s3_key}"
        )

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "status": "success",
                    "patient_id": patient_id,
                    "date": str(target_date),
                    "s3_key": processed_s3_key,
                    "s3_bucket": settings.PROCESSED_DATA_BUCKET_NAME,
                    "is_anomalous": processed_data.get("is_anomalous", False),
                    "anomaly_severity": processed_data.get("anomaly_severity", 0),
                }
            ),
        }

    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return {
            "statusCode": 400,
            "body": json.dumps(
                {
                    "status": "error",
                    "error": str(e),
                }
            ),
        }
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps(
                {
                    "status": "error",
                    "error": str(e),
                }
            ),
        }
