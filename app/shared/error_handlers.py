"""
FastAPI exception handlers for consistent error response format.

All errors return:
{
    "error": {
        "type": "not_found",
        "message": "User not found",
        "request_id": "req_abc123..."
    }
}
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.shared.errors import StructuredHTTPException

logger = logging.getLogger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the FastAPI app."""

    @app.exception_handler(StructuredHTTPException)
    async def structured_error_handler(
        request: Request, exc: StructuredHTTPException
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "type": exc.error_type,
                    "message": exc.detail,
                    "request_id": request_id,
                }
            },
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.exception("Unhandled exception", extra={"request_id": request_id})
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "type": "internal_error",
                    "message": "An unexpected error occurred.",
                    "request_id": request_id,
                }
            },
        )
