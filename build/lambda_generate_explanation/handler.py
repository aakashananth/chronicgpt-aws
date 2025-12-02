"""Lambda handler for generating LLM explanations."""

import json
from datetime import date, datetime
from typing import Any, Dict, List

from openai import AzureOpenAI

from common.config import settings
from common.logging_utils import setup_logger
from common.s3_utils import (
    download_json_from_s3,
    get_s3_key_for_date,
    upload_json_to_s3,
)

logger = setup_logger(__name__)

# Initialize Azure OpenAI client
openai_client = AzureOpenAI(
    api_key=settings.AZURE_OPENAI_API_KEY,
    api_version=settings.AZURE_OPENAI_API_VERSION,
    azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
)

SYSTEM_PROMPT = """You are a health metrics explainer for wearable health devices. 
You help users understand their health data including HRV (Heart Rate Variability), 
resting heart rate, sleep quality, and step counts.

IMPORTANT DISCLAIMERS:
- You are NOT a doctor or medical professional.
- You must NOT provide medical diagnoses.
- You must NOT provide treatment recommendations.
- You should recommend consulting with a healthcare clinician for any health concerns.
- Your explanations are for informational purposes only and should not replace professional medical advice.

Your role is to:
- Explain what the health metrics mean in simple terms
- Identify patterns and potential implications
- Suggest general lifestyle adjustments (not medical treatments)
- Always emphasize the importance of consulting healthcare professionals for medical concerns."""


def build_user_prompt(processed_data: Dict[str, Any]) -> str:
    """Build a user prompt from processed metrics data.

    Args:
        processed_data: Dictionary containing processed metrics with anomaly flags.

    Returns:
        Formatted prompt string for the LLM.
    """
    date_str = processed_data.get("date", "Unknown date")
    hrv = processed_data.get("hrv", "N/A")
    resting_hr = processed_data.get("resting_hr", "N/A")
    sleep_score = processed_data.get("sleep_score", "N/A")
    steps = processed_data.get("steps", "N/A")

    # Collect active flags
    flags = []
    if processed_data.get("low_hrv_flag", False):
        flags.append("Low HRV")
    if processed_data.get("high_rhr_flag", False):
        flags.append("High Resting HR")
    if processed_data.get("low_sleep_flag", False):
        flags.append("Low Sleep Score")
    if processed_data.get("low_recovery_flag", False):
        flags.append("Low Recovery Index")
    if processed_data.get("low_movement_flag", False):
        flags.append("Low Movement Index")
    if processed_data.get("low_steps_flag", False):
        flags.append("Low Steps")

    flags_str = ", ".join(flags) if flags else "No specific flags"
    severity = processed_data.get("anomaly_severity", 0)
    is_anomalous = processed_data.get("is_anomalous", False)

    if not is_anomalous:
        return f"""Date: {date_str}

Health Metrics:
- HRV: {hrv}
- Resting HR: {resting_hr} bpm
- Sleep Score: {sleep_score}
- Steps: {steps}

No anomalies detected. Please provide a brief summary of these metrics and what they indicate about overall health."""

    prompt_parts = [
        f"Date: {date_str}",
        "",
        "Health Metrics:",
        f"- HRV: {hrv}",
        f"- Resting HR: {resting_hr} bpm",
        f"- Sleep Score: {sleep_score}",
        f"- Steps: {steps}",
        "",
        f"Anomaly Flags: {flags_str}",
        f"Severity: {severity}",
        "",
        "Please provide:",
        "1. A summary of what's going on with these health metrics",
        "2. Potential implications of these patterns",
        "3. 3-4 general lifestyle adjustment suggestions (not medical treatments)",
        "4. A reminder that this is not medical advice and to consult a healthcare professional",
    ]

    return "\n".join(prompt_parts)


def generate_explanation(processed_data: Dict[str, Any]) -> str:
    """Generate an LLM explanation for processed health metrics.

    Args:
        processed_data: Dictionary containing processed metrics.

    Returns:
        String containing the LLM-generated explanation.

    Raises:
        Exception: If the OpenAI API call fails.
    """
    user_prompt = build_user_prompt(processed_data)

    try:
        response = openai_client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=600,
        )

        explanation = response.choices[0].message.content
        return explanation.strip() if explanation else "Unable to generate explanation."

    except Exception as e:
        logger.error(f"Failed to generate LLM explanation: {e}", exc_info=True)
        raise RuntimeError(
            f"Failed to generate LLM explanation: {e}. "
            f"Check your Azure OpenAI configuration and API credentials."
        ) from e


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda handler for generating LLM explanations.

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

        logger.info(f"Generating explanation for patient {patient_id} on {target_date}")

        # Download processed data from S3
        processed_s3_key = get_s3_key_for_date(patient_id, target_date)
        processed_data = download_json_from_s3(processed_s3_key, bucket_type="processed")

        if processed_data is None:
            logger.warning(
                f"No processed data found at s3://{settings.PROCESSED_DATA_BUCKET_NAME}/{processed_s3_key}"
            )
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "not_found",
                    "patient_id": patient_id,
                    "date": str(target_date),
                    "message": "Processed data not found in S3",
                }),
            }

        # Generate explanation using LLM
        explanation = generate_explanation(processed_data)

        # Prepare explanation result
        explanation_result = {
            "patient_id": patient_id,
            "date": str(target_date),
            "explanation": explanation,
            "metrics_summary": {
                "hrv": processed_data.get("hrv"),
                "resting_hr": processed_data.get("resting_hr"),
                "sleep_score": processed_data.get("sleep_score"),
                "steps": processed_data.get("steps"),
                "is_anomalous": processed_data.get("is_anomalous", False),
                "anomaly_severity": processed_data.get("anomaly_severity", 0),
            },
            "_metadata": {
                "generated_at": datetime.utcnow().isoformat(),
                "source": "lambda_generate_explanation",
                "model": settings.AZURE_OPENAI_DEPLOYMENT,
            },
        }

        # Upload explanation to S3
        explanation_s3_key = get_s3_key_for_date(patient_id, target_date)
        upload_json_to_s3(
            data=explanation_result,
            key=explanation_s3_key,
            bucket_type="explanations",
            metadata={
                "patient_id": patient_id,
                "date": str(target_date),
            },
        )

        logger.info(
            f"Successfully saved explanation to s3://{settings.EXPLANATIONS_BUCKET_NAME}/{explanation_s3_key}"
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "success",
                "patient_id": patient_id,
                "date": str(target_date),
                "s3_key": explanation_s3_key,
                "s3_bucket": settings.EXPLANATIONS_BUCKET_NAME,
                "explanation_preview": explanation[:200] + "..." if len(explanation) > 200 else explanation,
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

