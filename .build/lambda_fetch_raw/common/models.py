"""Data models for health metrics pipeline."""

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class HealthMetric(BaseModel):
    """Individual health metric data point."""

    date: date
    hrv: Optional[float] = None
    resting_hr: Optional[float] = None
    sleep_score: Optional[float] = None
    steps: Optional[int] = None
    recovery_index: Optional[float] = None
    movement_index: Optional[float] = None
    raw_data: Optional[Dict[str, Any]] = None


class EnrichedMetric(HealthMetric):
    """Health metric with anomaly detection and enrichment."""

    is_anomalous: bool = False
    anomaly_severity: int = Field(default=0, ge=0, le=3)
    anomaly_flags: List[str] = Field(default_factory=list)
    baseline_hrv: Optional[float] = None
    baseline_resting_hr: Optional[float] = None


class Anomaly(BaseModel):
    """Anomaly detection result."""

    date: date
    metric_name: str
    value: float
    baseline: float
    deviation: float
    severity: int = Field(ge=0, le=3)
    flag: str


class PipelineResult(BaseModel):
    """Result of a pipeline execution."""

    status: str
    dates_processed: List[date]
    metrics_count: int
    anomaly_count: int
    recent_anomalies: List[Anomaly]
    s3_path: Optional[str] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ExplanationResult(BaseModel):
    """LLM-generated explanation result."""

    date: date
    patient_id: str
    explanation: str
    anomalies_summary: List[Dict[str, Any]]
    generated_at: datetime = Field(default_factory=datetime.utcnow)

