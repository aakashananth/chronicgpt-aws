"""Lambda handler for generating LLM explanations."""

import json
from datetime import date, datetime, timedelta
from typing import Any, Dict, Tuple

import boto3

from common.config import settings
from common.logging_utils import setup_logger
from common.s3_utils import (
    download_json_from_s3,
    get_s3_key_for_date,
    upload_json_to_s3,
)

logger = setup_logger(__name__)

lambda_client = boto3.client("lambda")

FALLBACK_MESSAGE = (
    "We couldn’t generate an AI explanation right now due to model limits. "
    "Your raw metrics have still been processed and saved."
)
FALLBACK_MODEL = "bedrock-claude-3-5-sonnet"
FALLBACK_USAGE = {"input_tokens": 0, "output_tokens": 0}
THROTTLE_KEYWORDS = [
    "throttlingexception",
    "too many requests",
    "timeout",
    "timed out",
    "rate exceeded",
]

SYSTEM_PROMPT = """
You are an AI assistant that explains wearable and lifestyle health metrics for a person with chronic health conditions.

Your job is to:
- EXPLAIN what the metrics might generally indicate in simple, friendly language.
- FOCUS on trends and patterns (better / worse / stable), not exact clinical thresholds.
- BE SUPPORTIVE, non-judgemental, and easy to understand.
- ALWAYS include a clear disclaimer that you are not a doctor and this is not medical advice.
- ENCOURAGE the person to speak with their healthcare professional for any decisions.

You will receive:
- Day-level metrics like HRV (heart rate variability), resting heart rate, sleep score, steps, recovery index, movement index.
- Flags like "is_anomalous" and an "anomaly_severity" from 0–something.
- Possibly some missing values (null) for some metrics.

STRICT RULES (VERY IMPORTANT):
1. DO NOT diagnose any disease or condition.
2. DO NOT prescribe, adjust, or recommend specific medications, dosages, supplements, or treatments.
3. DO NOT suggest starting, stopping, or changing any medication or treatment plan.
4. DO NOT give emergency instructions. If something sounds worrying, gently say that they should contact a doctor or emergency services if they feel unwell.
5. DO NOT make absolute claims (like "this means your heart is weak"). Use soft, probabilistic language like "can sometimes be related to", "might suggest", "could be associated with".
6. DO NOT reference internal system details like S3, AWS, metrics IDs, models, or any technical infrastructure.

WHAT TO DO INSTEAD:
- If metrics look good or stable: briefly explain what that generally means in positive, reassuring language.
- If anomaly flags are raised or anomaly_severity > 0: 
  - Explain in simple terms what areas may need attention (sleep, recovery, activity, stress, etc.).
  - Give gentle, generic lifestyle suggestions (e.g., rest, hydration, consistent sleep, light activity) WITHOUT tying them to a specific diagnosis.
  - Suggest discussing these patterns with their doctor, especially if changes persist or they feel unwell.
- If many metrics are missing:
  - Say that there is not enough data to provide a strong interpretation.
  - Encourage them to keep wearing/using their device and talk with their care team if they have concerns.

TONE:
- Warm, calm, and supportive (like a health coach, not a strict clinician).
- Avoid fear-based language.
- Keep the explanation focused on THIS person’s metrics and day, not on population statistics.

FORMAT:
- Start with a brief one-paragraph summary of how their day looks overall.
- Then add 3–6 short bullet points explaining key observations (sleep, HRV, resting heart rate, steps, recovery).
- End with a short disclaimer like:
  "This explanation is for general information only and is not a substitute for professional medical advice. Please talk to your doctor or healthcare team about any questions or concerns."
"""


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


def _matches_throttling_error(message: str) -> bool:
    lowered = message.lower()
    return any(keyword in lowered for keyword in THROTTLE_KEYWORDS)


def _fallback_response(reason: str) -> Tuple[str, Dict[str, Any]]:
    logger.warning("Bedrock explanation fallback triggered: %s", reason)
    return (
        FALLBACK_MESSAGE,
        {
            "model": FALLBACK_MODEL,
            "usage": FALLBACK_USAGE,
            "error": reason,
        },
    )


def generate_explanation(processed_data: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """Generate an LLM explanation via the Bedrock proxy Lambda."""

    if not settings.BEDROCK_LAMBDA_NAME:
        raise RuntimeError("BEDROCK_LAMBDA_NAME environment variable must be set.")

    user_prompt = build_user_prompt(processed_data)
    full_prompt = f"{SYSTEM_PROMPT}\n\n{user_prompt}"
    payload = {"text": full_prompt}

    try:
        response = lambda_client.invoke(
            FunctionName=settings.BEDROCK_LAMBDA_NAME,
            InvocationType="RequestResponse",
            Payload=json.dumps(payload).encode("utf-8"),
        )
    except Exception as exc:
        # Treat Lambda/Bedrock runtime issues as fallback scenarios
        return _fallback_response(str(exc))

    raw_payload = response.get("Payload", b"")
    try:
        lambda_result = json.loads(raw_payload.read())
    except Exception as exc:
        # Invalid shape is considered a programming/config error
        raise RuntimeError(f"Invalid response from Bedrock lambda: {exc}") from exc

    status_code = lambda_result.get("statusCode", 500)
    if status_code != 200:
        return _fallback_response(f"Non-200 status code: {status_code}")

    body = lambda_result.get("body")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Invalid JSON body from Bedrock lambda: {exc}") from exc

    if not isinstance(body, dict):
        raise RuntimeError("Bedrock lambda response body must be a JSON object.")

    error_text = body.get("error", "")
    success_flag = body.get("success", True)

    # Fallback when success is explicitly false or error text indicates throttling
    if success_flag is False or (
        isinstance(error_text, str) and _matches_throttling_error(error_text)
    ):
        reason = error_text or "Bedrock lambda reported failure."
        return _fallback_response(reason)

    explanation = (body.get("explanation") or "").strip()
    DISCLAIMER = (
        "This explanation is for general information only and is not a substitute "
        "for professional medical advice, diagnosis, or treatment. "
        "Always talk to your doctor or healthcare team about any questions or concerns."
    )
    if explanation:
        if (
            "not a substitute for professional medical advice"
            not in explanation.lower()
        ):
            explanation = explanation.rstrip() + "\n\n" + DISCLAIMER
    else:
        explanation = (
            "I’m not able to interpret your health metrics right now. "
            "Please check back later, and reach out to your doctor or healthcare team "
            "if you have any concerns about your health.\n\n" + DISCLAIMER
        )
    if not explanation:
        raise RuntimeError("Bedrock lambda response did not include an explanation.")

    metadata = {
        "model": body.get("model") or FALLBACK_MODEL,
        "usage": body.get("usage", FALLBACK_USAGE),
    }

    return explanation, metadata


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda handler for generating LLM explanations.

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

        logger.info(f"Generating explanation for patient {patient_id} on {target_date}")

        # Download processed data from S3
        processed_s3_key = get_s3_key_for_date(patient_id, target_date)
        processed_data = download_json_from_s3(
            processed_s3_key, bucket_type="processed"
        )

        if processed_data is None:
            logger.warning(
                f"No processed data found at s3://{settings.PROCESSED_DATA_BUCKET_NAME}/{processed_s3_key}"
            )
            return {
                "statusCode": 404,
                "body": json.dumps(
                    {
                        "status": "not_found",
                        "patient_id": patient_id,
                        "date": str(target_date),
                        "message": "Processed data not found in S3",
                    }
                ),
            }

        # Generate explanation using LLM (real or fallback)
        explanation, generation_metadata = generate_explanation(processed_data)
        llm_status = "fallback" if generation_metadata.get("error") else "ok"

        # Prepare explanation result
        metadata = {
            "generated_at": datetime.utcnow().isoformat(),
            "source": "bedrock_claude-3-5-sonnet",
            "model": generation_metadata.get("model"),
            "usage": generation_metadata.get("usage"),
        }
        if generation_metadata.get("error"):
            metadata["error"] = generation_metadata["error"]

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
            "_metadata": metadata,
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
            "body": json.dumps(
                {
                    "status": "success",
                    "llm_status": llm_status,
                    "patient_id": patient_id,
                    "date": str(target_date),
                    "s3_key": explanation_s3_key,
                    "s3_bucket": settings.EXPLANATIONS_BUCKET_NAME,
                    "explanation_preview": (
                        explanation[:200] + "..."
                        if len(explanation) > 200
                        else explanation
                    ),
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
