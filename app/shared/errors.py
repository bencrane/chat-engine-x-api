"""
Structured exception hierarchy for consistent API error responses.

Usage:
    from app.shared.errors import NotFoundError, BadRequestError

    raise NotFoundError("User not found")
    raise BadRequestError("Invalid email format")
"""

from fastapi import HTTPException


class StructuredHTTPException(HTTPException):
    """Base class for structured API errors."""

    def __init__(self, status_code: int, error_type: str, detail: str):
        super().__init__(status_code=status_code, detail=detail)
        self.error_type = error_type


class BadRequestError(StructuredHTTPException):
    """400 Bad Request — invalid input or malformed request."""

    def __init__(self, detail: str = "Bad request"):
        super().__init__(400, "bad_request", detail)


class UnauthorizedError(StructuredHTTPException):
    """401 Unauthorized — missing or invalid authentication."""

    def __init__(self, detail: str = "Unauthorized"):
        super().__init__(401, "unauthorized", detail)


class ForbiddenError(StructuredHTTPException):
    """403 Forbidden — authenticated but not allowed."""

    def __init__(self, detail: str = "Forbidden"):
        super().__init__(403, "forbidden", detail)


class NotFoundError(StructuredHTTPException):
    """404 Not Found — resource doesn't exist."""

    def __init__(self, detail: str = "Not found"):
        super().__init__(404, "not_found", detail)


class ConflictError(StructuredHTTPException):
    """409 Conflict — resource already exists or state conflict."""

    def __init__(self, detail: str = "Conflict"):
        super().__init__(409, "conflict", detail)


class UnprocessableError(StructuredHTTPException):
    """422 Unprocessable Entity — validation failed."""

    def __init__(self, detail: str = "Unprocessable entity"):
        super().__init__(422, "unprocessable_entity", detail)


class RateLimitError(StructuredHTTPException):
    """429 Too Many Requests — rate limit exceeded."""

    def __init__(self, detail: str = "Rate limit exceeded"):
        super().__init__(429, "rate_limit_exceeded", detail)


class InternalError(StructuredHTTPException):
    """500 Internal Server Error — unexpected failure."""

    def __init__(self, detail: str = "Internal server error"):
        super().__init__(500, "internal_error", detail)
