"""Logging utilities for AWS Lambda functions."""

import logging
import sys
from typing import Optional

from .config import settings


def setup_logger(name: Optional[str] = None, level: Optional[str] = None) -> logging.Logger:
    """Set up a logger with consistent formatting for Lambda functions.

    Args:
        name: Logger name (defaults to root logger).
        level: Log level (defaults to settings.LOG_LEVEL).

    Returns:
        Configured logger instance.
    """
    logger = logging.getLogger(name) if name else logging.getLogger()

    # Set log level
    log_level = level or settings.LOG_LEVEL
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove existing handlers to avoid duplicates
    logger.handlers.clear()

    # Create console handler with formatting
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)

    # Format: [LEVEL] timestamp - message
    formatter = logging.Formatter(
        "[%(levelname)s] %(asctime)s - %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    logger.addHandler(handler)
    logger.propagate = False

    return logger

