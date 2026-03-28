"""
Request ID middleware for tracing requests across logs.

Generates a unique ID for each request and adds it to:
- request.state.request_id (for use in handlers)
- X-Request-Id response header (for client correlation)
"""

import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to each request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate unique ID
        request_id = f"req_{secrets.token_hex(12)}"

        # Attach to request state for handlers/logging
        request.state.request_id = request_id

        # Process request
        response: Response = await call_next(request)

        # Add to response headers for client correlation
        response.headers["X-Request-Id"] = request_id

        return response
