"""
Pytest configuration and fixtures.

Sets dummy environment variables BEFORE any app imports to ensure
tests run in isolation without requiring real credentials.
"""

import os

# Set dummy env vars before app.config imports
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-at-least-32-chars-long")
os.environ.setdefault("APP_ENV", "test")
