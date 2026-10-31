# Hermes Shim

FastAPI sidecar that fronts Hermes runtime calls for Prisma.

## Endpoints

- `POST /chat`:
  - Input: `{ baseUrl, apiKey, requestBody }`
  - Behavior: forwards request body to `<baseUrl>/v1/responses`, preserves SSE
    stream when upstream is event-stream.
- `POST /delegate`:
  - Lightweight placeholder endpoint used by `peer_delegate` bridging.
- `POST /cronjob/create`:
  - Lightweight placeholder endpoint used by `automation_schedule`.

## Local Run

```bash
cd services/hermes-shim
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8091 --reload
```

## Environment

- `PRISMA_HERMES_SHIM_SHARED_SECRET` (optional): when set, incoming requests
  must include header `x-prisma-shim-secret` with this value.
- `PRISMA_HERMES_HOME_ROOT` (optional): root path used for per-workspace
  Hermes home provisioning metadata files.
