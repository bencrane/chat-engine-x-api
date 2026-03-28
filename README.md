# chat-engine-x-api

Backend chat orchestration API

## Stack

- **Runtime:** Python 3.12 + FastAPI
- **Database:** Supabase (Postgres)
- **Secrets:** Doppler
- **Deployment:** Railway (Docker)

## Local Development

```bash
# Install Doppler CLI (first time only)
brew install dopplerhq/cli/doppler

# Login and configure
doppler login
doppler setup  # Select this project + dev config

# Install dependencies
pip install -e ".[dev]"

# Run the server
doppler run -- uvicorn app.main:app --reload --port 8080

# Run tests
doppler run -- pytest tests/ -v

# Lint
ruff check .
ruff format .
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| GET | `/health/live` | Liveness check |
| GET | `/health/ready` | Readiness check |
| GET | `/docs` | OpenAPI docs |
| GET | `/redoc` | ReDoc docs |

## Deployment

Pushes to `main` auto-deploy via Railway.

### Required Setup

1. **Doppler:** Create project `chat-engine-x-api` with `prd` config containing all secrets
2. **Railway:** Add `DOPPLER_TOKEN` env var (service token from Doppler)

### Manual Deploy

```bash
git push origin main
```

## Project Structure

```
chat-engine-x-api/
├── app/
│   ├── main.py           # FastAPI app + routes
│   ├── config.py         # Pydantic settings
│   ├── dependencies.py   # DI factories
│   ├── db/
│   │   └── supabase.py   # DB client
│   └── shared/
│       ├── errors.py     # Exception classes
│       ├── error_handlers.py
│       ├── logging_config.py
│       └── request_id.py
├── tests/
├── Dockerfile
├── railway.toml
└── pyproject.toml
```

## Adding a New Feature

```bash
mkdir -p app/my_feature
touch app/my_feature/__init__.py
touch app/my_feature/router.py
touch app/my_feature/models.py
```

Register in `app/main.py`:

```python
from app.my_feature.router import router as my_feature_router
app.include_router(my_feature_router, prefix="/my-feature", tags=["my_feature"])
```
