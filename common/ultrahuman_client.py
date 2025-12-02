"""Ultrahuman API client for fetching health metrics."""

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

from .config import settings
from .logging_utils import setup_logger

logger = setup_logger(__name__)


class UltrahumanClient:
    """Client for interacting with Ultrahuman API."""

    def __init__(
        self,
        api_base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        patient_id: Optional[str] = None,
    ):
        """Initialize Ultrahuman API client.

        Args:
            api_base_url: API base URL (defaults to settings.ULTRAHUMAN_API_BASE_URL).
                Should be: https://partner.ultrahuman.com/api/v1/metrics
            api_key: Authorization key (defaults to settings.ULTRAHUMAN_API_KEY).
            patient_id: User email (defaults to settings.ULTRAHUMAN_PATIENT_ID or ULTRAHUMAN_EMAIL).
                The API uses email as the identifier.
        """
        self.api_base_url = api_base_url or settings.ULTRAHUMAN_API_BASE_URL
        self.api_key = api_key or settings.ULTRAHUMAN_API_KEY
        # Use email as patient_id (API uses email to identify users)
        self.patient_id = patient_id or settings.ULTRAHUMAN_PATIENT_ID or settings.ULTRAHUMAN_EMAIL

        if not self.api_base_url or not self.api_key or not self.patient_id:
            raise ValueError(
                "ULTRAHUMAN_API_BASE_URL, ULTRAHUMAN_API_KEY, and ULTRAHUMAN_PATIENT_ID (or ULTRAHUMAN_EMAIL) must be set"
            )

        self.headers = {
            "Authorization": self.api_key,  # Authorization key (no "Bearer" prefix)
        }

    def fetch_metrics_for_date(self, target_date: date) -> Optional[Dict[str, Any]]:
        """Fetch health metrics for a specific date.

        According to Ultrahuman UltraSignal API documentation:
        - Endpoint: GET https://partner.ultrahuman.com/api/v1/metrics
        - Query params: email (user email), date (YYYY-MM-DD)
        - Header: Authorization (authorization key)

        Args:
            target_date: Date to fetch metrics for.

        Returns:
            Raw metrics dictionary, or None if not found/error.
        """
        try:
            # Format date as YYYY-MM-DD (ISO 8601 format)
            date_str = target_date.strftime("%Y-%m-%d")

            # API endpoint: https://partner.ultrahuman.com/api/v1/metrics
            # Query parameters: email and date
            url = self.api_base_url
            params = {
                "email": self.patient_id,  # API uses email to identify users
                "date": date_str,
            }

            logger.info(f"Fetching metrics for email {self.patient_id} on {date_str} from Ultrahuman API")

            response = requests.get(url, headers=self.headers, params=params, timeout=30)

            if response.status_code == 404:
                logger.warning(f"No metrics found for {date_str}")
                return None

            response.raise_for_status()
            data = response.json()

            logger.info(f"Successfully fetched metrics for {date_str}")
            return data

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch metrics for {target_date}: {e}")
            return None

    def fetch_metrics_for_date_range(
        self,
        start_date: date,
        end_date: date,
    ) -> List[Dict[str, Any]]:
        """Fetch health metrics for a date range.

        Args:
            start_date: Start date (inclusive).
            end_date: End date (inclusive).

        Returns:
            List of raw metrics dictionaries.
        """
        results = []
        current_date = start_date

        while current_date <= end_date:
            metrics = self.fetch_metrics_for_date(current_date)
            if metrics:
                results.append(metrics)
            current_date += timedelta(days=1)

        logger.info(f"Fetched {len(results)} metrics for date range {start_date} to {end_date}")
        return results

