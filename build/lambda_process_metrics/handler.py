"""Lambda handler for processing metrics and detecting anomalies."""

import json
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

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
    result_df["high_rhr_flag"] = (
        result_df["resting_hr"] > (result_df["rhr_baseline"] * 1.15)
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
        result_df["low_steps_flag"] = result_df["steps"] < (result_df["steps_baseline"] * 0.6)
        flag_columns.append("low_steps_flag")

    # Compute is_anomalous and severity
    result_df["is_anomalous"] = result_df[flag_columns].any(axis=1)
    result_df["anomaly_severity"] = (
        result_df[flag_columns].astype(int).sum(axis=1)
    )

    return result_df


def extract_metrics_from_raw(raw_data: Dict[str, Any], target_date: date) -> Dict[str, Any]:
    """Extract structured metrics from raw Ultrahuman API response.

    Args:
        raw_data: Raw JSON data from Ultrahuman API.
        target_date: Target date for the metrics.

    Returns:
        Dictionary with extracted metrics.
    """
    # Extract metrics from raw data structure
    # Adjust this based on actual Ultrahuman API response structure
    metrics = {
        "date": str(target_date),
        "hrv": raw_data.get("hrv") or raw_data.get("heart_rate_variability"),
        "resting_hr": raw_data.get("resting_hr") or raw_data.get("resting_heart_rate"),
        "sleep_score": raw_data.get("sleep_score") or raw_data.get("sleep_quality"),
        "steps": raw_data.get("steps") or raw_data.get("step_count"),
        "recovery_index": raw_data.get("recovery_index"),
        "movement_index": raw_data.get("movement_index"),
        "raw_data": raw_data,
    }

    return metrics


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda handler for processing metrics and detecting anomalies.

    Expected event structure:
    {
        "patient_id": "patient123",
        "date": "2024-01-15"  # Optional, defaults to today
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
            raise ValueError("patient_id must be provided in event or environment variables")

        date_str = event.get("date")
        if date_str:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        else:
            target_date = date.today()

        logger.info(f"Processing metrics for patient {patient_id} on {target_date}")

        # Download raw data from S3
        raw_s3_key = get_s3_key_for_date(patient_id, target_date)
        raw_data = download_json_from_s3(raw_s3_key, bucket_type="raw")

        if raw_data is None:
            logger.warning(f"No raw data found at s3://{settings.RAW_DATA_BUCKET_NAME}/{raw_s3_key}")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "not_found",
                    "patient_id": patient_id,
                    "date": str(target_date),
                    "message": "Raw data not found in S3",
                }),
            }

        # Extract metrics from raw data
        metrics = extract_metrics_from_raw(raw_data, target_date)

        # Create DataFrame for anomaly detection
        # We need historical data for baseline calculation, so fetch recent data
        # For now, we'll process just the single date but note that baselines need history
        df = pd.DataFrame([metrics])

        # Detect anomalies (will compute baselines if we have historical data)
        enriched_df = detect_anomalies(df)

        # Convert to dictionary
        processed_data = enriched_df.iloc[0].to_dict()

        # Add metadata
        processed_data["_metadata"] = {
            "patient_id": patient_id,
            "date": str(target_date),
            "processed_at": datetime.utcnow().isoformat(),
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
            "body": json.dumps({
                "status": "success",
                "patient_id": patient_id,
                "date": str(target_date),
                "s3_key": processed_s3_key,
                "s3_bucket": settings.PROCESSED_DATA_BUCKET_NAME,
                "is_anomalous": processed_data.get("is_anomalous", False),
                "anomaly_severity": processed_data.get("anomaly_severity", 0),
            }),
        }

    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return {
            "statusCode": 400,
            "body": json.dumps({
                "status": "error",
                "error": str(e),
            }),
        }
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "error": str(e),
            }),
        }

