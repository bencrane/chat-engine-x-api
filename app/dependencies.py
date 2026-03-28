"""
FastAPI dependency injection factories.

Usage:
    from app.dependencies import get_supabase_client

    @router.get("/items")
    async def get_items(supabase: Client = Depends(get_supabase_client)):
        ...
"""

from app.db.supabase import get_client


def get_supabase_client():
    """Get the Supabase client singleton."""
    return get_client()
