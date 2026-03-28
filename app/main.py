from fastapi import FastAPI

from app.shared.error_handlers import register_error_handlers
from app.shared.logging_config import setup_logging
from app.shared.request_id import RequestIDMiddleware

setup_logging()

app = FastAPI(
    title="chat-engine-x-api",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Middleware (order matters — outermost first)
app.add_middleware(RequestIDMiddleware)

# Error handlers
register_error_handlers(app)


# Health checks
@app.get("/health", tags=["health"])
@app.get("/health/live", tags=["health"])
async def health_live():
    """Liveness probe — is the process running?"""
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
async def health_ready():
    """Readiness probe — can the service handle requests?"""
    # Add dependency checks here (DB ping, external APIs, etc.)
    return {"status": "ok"}


# Register routers below
# from app.my_feature.router import router as my_feature_router
# app.include_router(my_feature_router, prefix="/my-feature", tags=["my_feature"])
