#!/usr/bin/env bash
# Runs the Hermes gateway and the WhatsApp sidecar side by side under tini.
# tini acts as PID 1; this script keeps the two children synchronised so that
# the container restarts cleanly if either one exits.

set -euo pipefail

MODE="${1:-both}"

if [[ -z "${API_SERVER_KEY:-}" ]]; then
  echo "[entrypoint] API_SERVER_KEY is required; refusing to start." >&2
  exit 1
fi

start_gateway() {
  echo "[entrypoint] starting hermes gateway"
  hermes gateway &
  GATEWAY_PID=$!
}

start_sidecar() {
  echo "[entrypoint] starting whatsapp sidecar"
  node /opt/hermes-sidecar/dist/server.js &
  SIDECAR_PID=$!
}

stop_all() {
  echo "[entrypoint] stopping children"
  [[ -n "${GATEWAY_PID:-}" ]] && kill -TERM "${GATEWAY_PID}" 2>/dev/null || true
  [[ -n "${SIDECAR_PID:-}" ]] && kill -TERM "${SIDECAR_PID}" 2>/dev/null || true
  wait || true
}

trap stop_all TERM INT

case "${MODE}" in
  gateway)
    start_gateway
    wait "${GATEWAY_PID}"
    ;;
  sidecar)
    start_sidecar
    wait "${SIDECAR_PID}"
    ;;
  both)
    start_gateway
    start_sidecar
    # Exit when either child exits so the container orchestrator restarts cleanly.
    set +e
    wait -n "${GATEWAY_PID}" "${SIDECAR_PID}"
    EXIT_CODE=$?
    set -e
    echo "[entrypoint] child exited with ${EXIT_CODE}, shutting down"
    stop_all
    exit "${EXIT_CODE}"
    ;;
  *)
    echo "[entrypoint] unknown mode: ${MODE}" >&2
    exit 64
    ;;
esac
