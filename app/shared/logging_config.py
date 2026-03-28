"""
JSON structured logging for production observability.

Logs output as JSON lines for easy parsing by Railway, Datadog, etc.
"""

import json
import logging
import sys


class JSONFormatter(logging.Formatter):
    """Format log records as JSON."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include exception info if present
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)

        # Include extra fields
        for key in ("request_id", "duration_ms", "user_id", "tenant_id"):
            if hasattr(record, key):
                log_obj[key] = getattr(record, key)

        return json.dumps(log_obj)


def setup_logging(level: int = logging.INFO) -> None:
    """Configure root logger with JSON output."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # Quiet noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
