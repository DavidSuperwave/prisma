# Hermes WhatsApp Pairing Runbook

This runbook is the operator checklist to pair WhatsApp against the active Hermes runtime and validate Prisma channel status.

## 1) Droplet Target

- Host: `157.245.116.140`
- Hermes API port: `8642`
- Expected health endpoint: `http://157.245.116.140:8642/health`

## 2) Required Environment Variables

Configure these in the Hermes service environment before pairing:

- `HERMES_API_KEY=<secure token>`
- `WHATSAPP_SESSION_PATH=/var/lib/hermes/whatsapp-session`
- `WHATSAPP_ALLOWED_USERS=<comma separated phone IDs>`
- `WHATSAPP_MODE=self-chat` (or `bot`)

Optional but recommended:

- `HERMES_MODEL=<default model>`
- `HERMES_LOG_LEVEL=info`

## 3) Pairing Command

Run pairing on the droplet where Hermes is installed:

```bash
hermes whatsapp pair --session-path "$WHATSAPP_SESSION_PATH"
```

Scan the QR with the target WhatsApp account.

## 4) Session Persistence Path

Persist this path across restarts/backups:

- `/var/lib/hermes/whatsapp-session`

## 5) Service Install / Restart

If using systemd:

```bash
sudo systemctl daemon-reload
sudo systemctl enable hermes
sudo systemctl restart hermes
```

If using Docker:

```bash
docker compose up -d hermes
```

## 6) Validation Steps

1. `curl -H "Authorization: Bearer <HERMES_API_KEY>" http://157.245.116.140:8642/health`
2. In Prisma, open `Canales` and run `Verificar conexión`.
3. Confirm runtime state is `reachable`.
4. Confirm gateway shows either:
   - `Emparejado` (paired), or
   - QR image present for pending pairing.
5. Send a test message in self-chat mode.
6. Verify last inbound/outbound timestamps update in Prisma channel status.
