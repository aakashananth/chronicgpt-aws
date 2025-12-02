"""S3 utilities for storing and retrieving health metrics data."""

import json
from datetime import date
from typing import Any, Dict, List, Literal, Optional

import boto3
from botocore.exceptions import ClientError

from .config import settings
from .logging_utils import setup_logger

logger = setup_logger(__name__)

# Initialize S3 client
s3_client = boto3.client("s3")

# Bucket type for type hints
BucketType = Literal["raw", "processed", "explanations"]


def _get_bucket_name(bucket_type: BucketType) -> str:
    """Get the bucket name for a given bucket type.

    Args:
        bucket_type: Type of bucket ('raw', 'processed', or 'explanations').

    Returns:
        Bucket name from settings.

    Raises:
        ValueError: If bucket type is invalid or bucket name is not set.
    """
    bucket_map = {
        "raw": settings.RAW_DATA_BUCKET_NAME,
        "processed": settings.PROCESSED_DATA_BUCKET_NAME,
        "explanations": settings.EXPLANATIONS_BUCKET_NAME,
    }

    if bucket_type not in bucket_map:
        raise ValueError(
            f"Invalid bucket type: {bucket_type}. Must be one of: raw, processed, explanations"
        )

    bucket_name = bucket_map[bucket_type]
    if not bucket_name:
        raise ValueError(
            f"{bucket_type.upper()}_DATA_BUCKET_NAME must be set in environment variables"
        )

    return bucket_name


def upload_json_to_s3(
    data: Dict[str, Any],
    key: str,
    bucket_type: BucketType,
    metadata: Optional[Dict[str, str]] = None,
) -> str:
    """Upload JSON data to S3.

    Args:
        data: Dictionary to upload as JSON.
        key: S3 object key (path).
        bucket_type: Type of bucket ('raw', 'processed', or 'explanations').
        metadata: Optional metadata to attach to the object.

    Returns:
        S3 object key.

    Raises:
        ClientError: If S3 upload fails.
        ValueError: If bucket type is invalid or bucket name is not set.
    """
    bucket = _get_bucket_name(bucket_type)

    try:
        body = json.dumps(data, default=str, indent=2)
        extra_args = {}
        if metadata:
            extra_args["Metadata"] = {k: str(v) for k, v in metadata.items()}

        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType="application/json",
            **extra_args,
        )

        logger.info(f"Uploaded JSON to s3://{bucket}/{key}")
        return key
    except ClientError as e:
        logger.error(f"Failed to upload to S3: {e}")
        raise


def download_json_from_s3(key: str, bucket_type: BucketType) -> Optional[Dict[str, Any]]:
    """Download JSON data from S3.

    Args:
        key: S3 object key (path).
        bucket_type: Type of bucket ('raw', 'processed', or 'explanations').

    Returns:
        Parsed JSON dictionary, or None if not found.

    Raises:
        ValueError: If bucket type is invalid or bucket name is not set.
    """
    bucket = _get_bucket_name(bucket_type)

    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        body = response["Body"].read().decode("utf-8")
        return json.loads(body)
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            logger.debug(f"Key not found in S3: s3://{bucket}/{key}")
            return None
        logger.error(f"Failed to download from S3: {e}")
        return None


def list_s3_objects(
    prefix: str,
    bucket_type: BucketType,
    max_keys: int = 1000,
) -> List[str]:
    """List S3 object keys with a given prefix.

    Args:
        prefix: S3 key prefix to filter by.
        bucket_type: Type of bucket ('raw', 'processed', or 'explanations').
        max_keys: Maximum number of keys to return.

    Returns:
        List of S3 object keys.

    Raises:
        ValueError: If bucket type is invalid or bucket name is not set.
    """
    bucket = _get_bucket_name(bucket_type)

    try:
        response = s3_client.list_objects_v2(
            Bucket=bucket,
            Prefix=prefix,
            MaxKeys=max_keys,
        )

        if "Contents" not in response:
            return []

        return [obj["Key"] for obj in response["Contents"]]
    except ClientError as e:
        logger.error(f"Failed to list S3 objects: {e}")
        return []


def get_s3_key_for_date(patient_id: str, date_obj: date, suffix: str = ".json") -> str:
    """Generate S3 key path for a given patient and date.

    Args:
        patient_id: Patient identifier.
        date_obj: Date to generate path for.
        suffix: File suffix (default: '.json').

    Returns:
        S3 key path in format: patient_id/YYYY-MM-DD.json
    """
    date_str = date_obj.strftime("%Y-%m-%d")
    return f"{patient_id}/{date_str}{suffix}"

