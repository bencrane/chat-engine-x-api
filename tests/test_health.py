"""Health endpoint tests."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_live():
    """Liveness probe returns 200 OK."""
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_ready():
    """Readiness probe returns 200 OK."""
    response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_alias():
    """/health is an alias for /health/live."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_request_id_header():
    """Responses include X-Request-Id header."""
    response = client.get("/health")
    assert "X-Request-Id" in response.headers
    assert response.headers["X-Request-Id"].startswith("req_")
