# Hermes WhatsApp Sidecar

A small Node service that exposes WhatsApp pairing over HTTP so the Prisma
admin dashboard can render the QR code and pair a number without SSH.

## Why this exists

Hermes' built-in API server does not expose the WhatsApp bridge state. The
QR only ever appears in the terminal where `hermes whatsapp` is invoked.
This sidecar opens a Baileys socket directly, renders the QR as a PNG data
URL, and writes the resulting auth files into the shared Hermes session
directory. Hermes' own gateway picks the session up on restart.

## Endpoints

All endpoints require `Authorization: Bearer $API_SERVER_KEY` or `x-api-key`.

- `GET /health` - liveness probe, no auth.
- `GET /v1/channels/whatsapp/status` - returns
  `{ status, paired, qr, lastSeen, lastError }`. `qr` is a `data:image/png;base64,...`
  string while pairing is in progress, `null` otherwise.
- `POST /v1/channels/whatsapp/pair?force=true` - stops the Hermes gateway,
  opens a Baileys socket, starts emitting QR updates via `status`.
- `POST /v1/channels/whatsapp/logout` - wipes the shared session directory
  and stops the gateway; forces a fresh re-pair next time.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `API_SERVER_KEY` | _required_ | Shared with Hermes; bearer token for all sidecar endpoints. |
| `SIDECAR_PORT` | `8643` | HTTP port. |
| `SIDECAR_HOST` | `0.0.0.0` | Bind address. |
| `WHATSAPP_SESSION_PATH` | `/var/lib/hermes/whatsapp-session` | Shared with Hermes' Baileys bridge. |
| `SIDECAR_PAIRING_TIMEOUT_MS` | `120000` | Abort pairing if no QR scan within this window. |
| `SIDECAR_LOG_LEVEL` | `info` | `trace` \| `debug` \| `info` \| `warn` \| `error`. |
| `HERMES_BINARY` | `hermes` | Override if the CLI is at a non-standard path. |
| `HERMES_HOME` | (inherited) | Forwarded to `hermes` child processes so multiple profiles work. |
| `SIDECAR_MANAGE_GATEWAY` | `true` | When `false`, the sidecar will not try to stop/start `hermes gateway` around pairing. |

## Build & run

```bash
cd hermes-sidecar
npm install
npm run build
node dist/server.js
```

The sidecar is normally baked into the Hermes container; see the
`Dockerfile` at the root of this package.
