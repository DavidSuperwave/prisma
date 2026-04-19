# Hermes WhatsApp Pairing Runbook

This runbook is the operator checklist to pair WhatsApp against the active
Hermes runtime and validate Prisma channel status. Pairing is now driven from
the dashboard; the old SSH + `hermes whatsapp pair` flow is only used as a
fallback if the sidecar is unreachable.

## 1) Droplet target

- Host: `157.245.116.140`
- Hermes API port: `8642`
- WhatsApp sidecar port: `8643`
- Expected health endpoint: `http://157.245.116.140:8642/health`
- Sidecar health endpoint (no auth): `http://157.245.116.140:8643/health`

## 2) Required environment variables

Configure these in the Hermes + sidecar service environment before pairing:

- `API_SERVER_KEY=<shared bearer; the sidecar rejects requests without it>`
- `HERMES_API_KEY=<alias, must match API_SERVER_KEY so Prisma can call both>`
- `WHATSAPP_SESSION_PATH=/var/lib/hermes/whatsapp-session`
- `WHATSAPP_ALLOWED_USERS=<comma separated phone IDs>`
- `WHATSAPP_MODE=self-chat` (or `bot`)
- `SIDECAR_PORT=8643` (default)
- `SIDECAR_MANAGE_GATEWAY=true` (let the sidecar stop/start `hermes gateway` around pairing)

Optional but recommended:

- `HERMES_MODEL=<default model>`
- `HERMES_LOG_LEVEL=info`
- `SIDECAR_LOG_LEVEL=info`
- `SIDECAR_PAIRING_TIMEOUT_MS=120000`

On the Prisma side, only the `api_endpoint` and `api_key` stored on the
`channel` agent are required. The sidecar URL is derived by substituting
`:8642` with `:8643`. If your deployment exposes the sidecar on a different
host, set `channel_config.whatsapp.sidecarUrl` on the agent row (PATCH the
agent via the admin API).

## 3) Pair from the dashboard (primary flow)

1. Open `Workspaces → Canales`.
2. Select the WhatsApp channel agent.
3. Click **Emparejar WhatsApp**. The panel starts polling every 3 s.
4. When the QR appears, open WhatsApp on your phone → **Dispositivos
   vinculados → Vincular un dispositivo** and scan it.
5. The dashboard flips to **Emparejado** once Baileys reports
   `connection: "open"`. The sidecar then restarts `hermes gateway`
   automatically so the bot picks up the freshly written session.

The button label becomes **Re-emparejar WhatsApp** after a successful
pairing. Clicking it wipes the session directory and generates a new QR.
A **Desvincular** button next to it calls `DELETE /whatsapp/pair` which
stops the gateway and deletes the auth files.

## 4) Fallback: CLI pairing (only if the sidecar is unreachable)

Only use this when the sidecar is down or `SIDECAR_MANAGE_GATEWAY=false`.

```bash
hermes whatsapp pair --session-path "$WHATSAPP_SESSION_PATH"
```

Scan the QR with the target WhatsApp account, then restart Hermes.

## 5) Session persistence path

Persist this path across restarts/backups; both Hermes and the sidecar
read/write here:

- `/var/lib/hermes/whatsapp-session`

In docker-compose, mount it as a named volume so image rebuilds do not
wipe the session:

```yaml
services:
  hermes-bbc-whatsapp:
    image: prisma/hermes:whatsapp-sidecar
    ports:
      - "8642:8642"
      - "8643:8643"
    environment:
      - API_SERVER_KEY=${BBC_WHATSAPP_API_KEY}
      - WHATSAPP_SESSION_PATH=/var/lib/hermes/whatsapp-session
      - SIDECAR_PORT=8643
      - SIDECAR_MANAGE_GATEWAY=true
      - WHATSAPP_ENABLED=true
      - WHATSAPP_MODE=bot
    volumes:
      - bbc-whatsapp-data:/var/lib/hermes/whatsapp-session

volumes:
  bbc-whatsapp-data:
```

## 6) Service install / restart

If using systemd on a bare host:

```bash
sudo systemctl daemon-reload
sudo systemctl enable hermes
sudo systemctl restart hermes
```

If using Docker (preferred):

```bash
docker compose up -d hermes-bbc-whatsapp
```

## 7) Validation steps

1. `curl http://157.245.116.140:8643/health` → `{"status":"ok"}` (no auth).
2. `curl -H "Authorization: Bearer $BBC_WHATSAPP_API_KEY" \
      http://157.245.116.140:8643/v1/channels/whatsapp/status` → expect
   `{"status":"idle","paired":false,"qr":null}` before pairing.
3. `curl -H "Authorization: Bearer $HERMES_API_KEY" \
      http://157.245.116.140:8642/health`.
4. In Prisma, open `Canales` and click **Verificar conexión**.
5. Confirm runtime state is `reachable`.
6. Click **Emparejar WhatsApp**, scan the QR from the phone.
7. Confirm the gateway pill switches to `Emparejado` and `lastSeen` updates.
8. Send a test message in self-chat or bot mode.

## 8) Troubleshooting

- **QR never appears after `Emparejar WhatsApp`** — check the sidecar logs:
  `docker logs hermes-bbc-whatsapp | grep whatsapp-sidecar`. Most commonly
  Baileys cannot reach WhatsApp servers (firewall) or `API_SERVER_KEY` is
  mismatched between Prisma and the sidecar.
- **`409 Session already paired`** — click **Re-emparejar WhatsApp** or
  `POST /pair?force=true`. This wipes `WHATSAPP_SESSION_PATH/*` first.
- **Hermes keeps kicking the pairing session** — set
  `SIDECAR_MANAGE_GATEWAY=true` so the sidecar calls `hermes gateway stop`
  before opening its own Baileys socket. If `hermes` is not on PATH inside
  the container, override `HERMES_BINARY`.
- **Pairing succeeds but bot does not respond** — the sidecar restarts the
  gateway once connection opens; if that fails, the gateway must be
  restarted manually: `docker exec hermes-bbc-whatsapp hermes gateway start`.
