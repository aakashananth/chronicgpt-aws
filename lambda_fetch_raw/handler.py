"""Lambda handler for fetching raw Ultrahuman data."""

import json
from datetime import date, datetime, timedelta
from typing import Any, Dict

from common.config import settings
from common.logging_utils import setup_logger
from common.s3_utils import get_s3_key_for_date, upload_json_to_s3
from common.ultrahuman_client import UltrahumanClient

logger = setup_logger(__name__)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda handler for fetching raw Ultrahuman data.

    Expected event structure:
    {
        "patient_id": "patient123",
        "date": "2024-01-15"  # Optional, defaults to yesterday
    }

    Also supports API Gateway events where body is a JSON string.

    Args:
        event: Lambda event dictionary.
        context: Lambda context object.

    Returns:
        Dictionary with status and metadata.
    """
    try:
        # Handle API Gateway events (body is a JSON string)
        if isinstance(event.get("body"), str):
            try:
                event = json.loads(event["body"])
            except json.JSONDecodeError:
                pass  # Fall through to regular handling

        # Extract parameters from event
        patient_id = event.get("patient_id") or settings.ULTRAHUMAN_PATIENT_ID
        if not patient_id:
            error_msg = (
                "patient_id must be provided in event or as ULTRAHUMAN_PATIENT_ID environment variable. "
                f"Event keys: {list(event.keys())}, Env var set: {bool(settings.ULTRAHUMAN_PATIENT_ID)}"
            )
            raise ValueError(error_msg)

        date_str = event.get("date")
        if date_str:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        else:
            target_date = date.today() - timedelta(days=1)  # Default to yesterday

        logger.info(f"Fetching raw data for patient {patient_id} on {target_date}")

        # Initialize Ultrahuman client
        client = UltrahumanClient(patient_id=patient_id)

        # Fetch raw data from Ultrahuman API
        raw_data = client.fetch_metrics_for_date(target_date)

        if raw_data is None:
            logger.warning(f"No data found for {target_date}")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "not_found",
                    "patient_id": patient_id,
                    "date": str(target_date),
                    "message": "No data found for the specified date",
                }),
            }

        # Add metadata
        raw_data["_metadata"] = {
            "patient_id": patient_id,
            "date": str(target_date),
            "fetched_at": datetime.utcnow().isoformat(),
            "source": "ultrahuman_api",
        }

        # Upload to S3
        s3_key = get_s3_key_for_date(patient_id, target_date)
        upload_json_to_s3(
            data=raw_data,
            key=s3_key,
            bucket_type="raw",
            metadata={
                "patient_id": patient_id,
                "date": str(target_date),
            },
        )

        logger.info(f"Successfully saved raw data to s3://{settings.RAW_DATA_BUCKET_NAME}/{s3_key}")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "success",
                "patient_id": patient_id,
                "date": str(target_date),
                "s3_key": s3_key,
                "s3_bucket": settings.RAW_DATA_BUCKET_NAME,
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

