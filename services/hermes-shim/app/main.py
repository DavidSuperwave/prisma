from __future__ import annotations

import asyncio
import hashlib
import json
import os
import pathlib
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, Optional

import httpx
import yaml
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

app = FastAPI(title="prisma-hermes-shim", version="0.1.0")


def _require_shared_secret(header_value: Optional[str]) -> None:
    expected = os.getenv("PRISMA_HERMES_SHIM_SHARED_SECRET", "").strip()
    if not expected:
        return
    if (header_value or "").strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid shim secret.")


class ChatRequest(BaseModel):
    baseUrl: str = Field(min_length=1)
    apiKey: str = Field(min_length=1)
    requestBody: Dict[str, Any]
    workspaceId: Optional[str] = None
    agentId: Optional[str] = None


class DelegateRequest(BaseModel):
    workspaceId: str = Field(min_length=1)
    sourceAgentId: Optional[str] = None
    targetAgentId: str = Field(min_length=1)
    goal: str = Field(min_length=1)
    context: Dict[str, Any] = Field(default_factory=dict)


class CronCreateRequest(BaseModel):
    workspaceId: str = Field(min_length=1)
    targetAgentId: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    cron: str = Field(min_length=1)
    attachedSkills: list[str] = Field(default_factory=list)
    deliverTo: Optional[str] = None


class ExpectedFile(BaseModel):
    relativePath: str = Field(min_length=1)
    required: bool = True
    sha256: Optional[str] = None


class WorkspaceStatusRequest(BaseModel):
    workspaceId: str = Field(min_length=1)
    agentId: Optional[str] = None
    expectedFiles: list[ExpectedFile] = Field(default_factory=list)


def _workspace_home(workspace_id: str) -> pathlib.Path:
    root = os.getenv("PRISMA_HERMES_HOME_ROOT", "").strip()
    if root:
        return pathlib.Path(root) / workspace_id
    return pathlib.Path.home() / ".hermes-prisma" / workspace_id


def _write_base_config(workspace_id: str) -> pathlib.Path:
    home = _workspace_home(workspace_id)
    home.mkdir(parents=True, exist_ok=True)
    (home / "skills").mkdir(exist_ok=True)
    (home / "skills" / "external" / "prisma").mkdir(parents=True, exist_ok=True)
    (home / "skills" / "external" / "prisma-promoted").mkdir(parents=True, exist_ok=True)
    (home / "memories").mkdir(exist_ok=True)
    (home / "cron").mkdir(exist_ok=True)

    config_path = home / "config.yaml"
    if not config_path.exists():
        config = {
            "memory": {
                "provider": "honcho",
                "workspace": workspace_id,
                "member_peer": "user-peer",
                "agent_peer": "AI-peer",
            },
            "display": {"tool_progress": "all"},
            "mcp_servers": {},
            "skills": {
                "external_dirs": [
                    "./skills",
                    "./skills/external/prisma",
                    "./skills/external/prisma-promoted",
                ]
            },
        }
        config_path.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
    return config_path


def _ensure_workspace_home(workspace_id: Optional[str]) -> None:
    if not workspace_id:
        return
    _write_base_config(workspace_id)


def _hash_file(file_path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        while True:
            chunk = handle.read(65536)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


async def _post_with_retry(url: str, headers: dict[str, str], payload: dict[str, Any]) -> httpx.Response:
    timeout_first = float(os.getenv("HERMES_CONNECT_TIMEOUT_MS", "90000")) / 1000.0
    timeout_retry = float(os.getenv("HERMES_RETRY_TIMEOUT_MS", "120000")) / 1000.0
    last_error: Exception | None = None

    for attempt in range(1, 4):
        timeout = timeout_first if attempt == 1 else timeout_retry
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, headers=headers, json=payload)
                return response
        except Exception as exc:  # noqa: BLE001 - we convert to HTTP error below
            last_error = exc
            if attempt < 3:
                await asyncio.sleep(float(attempt))
    detail = str(last_error) if last_error else "Unknown upstream failure."
    raise HTTPException(status_code=502, detail=f"Hermes upstream failure: {detail}")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "prisma-hermes-shim", "time": datetime.now(timezone.utc).isoformat()}


@app.post("/chat")
async def chat(
    body: ChatRequest,
    x_prisma_shim_secret: Optional[str] = Header(default=None),
):
    _require_shared_secret(x_prisma_shim_secret)
    _ensure_workspace_home(body.workspaceId)

    base_url = body.baseUrl.rstrip("/")
    upstream_url = f"{base_url}/v1/responses"
    headers = {
        "Authorization": f"Bearer {body.apiKey}",
        "Content-Type": "application/json",
    }
    response = await _post_with_retry(upstream_url, headers, body.requestBody)
    content_type = response.headers.get("content-type", "")

    if "text/event-stream" not in content_type:
        try:
            payload = response.json()
        except Exception:  # noqa: BLE001
            payload = {"raw": response.text}
        return JSONResponse(status_code=response.status_code, content=payload)

    async def event_stream() -> AsyncIterator[bytes]:
        async for chunk in response.aiter_bytes():
            yield chunk

    return StreamingResponse(
        event_stream(),
        status_code=response.status_code,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    )


@app.post("/delegate")
async def delegate(
    body: DelegateRequest,
    x_prisma_shim_secret: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    _require_shared_secret(x_prisma_shim_secret)
    _ensure_workspace_home(body.workspaceId)
    return {
        "ok": True,
        "status": "queued",
        "workspaceId": body.workspaceId,
        "sourceAgentId": body.sourceAgentId,
        "targetAgentId": body.targetAgentId,
        "summary": f"Delegation queued for {body.targetAgentId}: {body.goal[:140]}",
        "context": body.context,
    }


@app.post("/cronjob/create")
async def create_cronjob(
    body: CronCreateRequest,
    x_prisma_shim_secret: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    _require_shared_secret(x_prisma_shim_secret)
    _ensure_workspace_home(body.workspaceId)
    job_id = f"cron_{body.workspaceId[:8]}_{body.targetAgentId[:8]}_{int(datetime.now(tz=timezone.utc).timestamp())}"
    return {
        "ok": True,
        "jobId": job_id,
        "workspaceId": body.workspaceId,
        "targetAgentId": body.targetAgentId,
        "cron": body.cron,
        "prompt": body.prompt,
        "attachedSkills": body.attachedSkills,
        "deliverTo": body.deliverTo,
    }


@app.post("/workspace/status")
async def workspace_status(
    body: WorkspaceStatusRequest,
    x_prisma_shim_secret: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    _require_shared_secret(x_prisma_shim_secret)
    _ensure_workspace_home(body.workspaceId)

    home = _workspace_home(body.workspaceId)
    files: dict[str, dict[str, Any]] = {}
    missing_required: list[str] = []
    mismatched: list[str] = []

    for expected in body.expectedFiles:
        file_path = home / expected.relativePath
        exists = file_path.exists()
        sha256 = None
        size = None
        modified_at = None
        matches_expected = True

        if exists and file_path.is_file():
            stat_result = file_path.stat()
            sha256 = _hash_file(file_path)
            size = stat_result.st_size
            modified_at = datetime.fromtimestamp(stat_result.st_mtime, tz=timezone.utc).isoformat()
            if expected.sha256 and sha256 != expected.sha256:
                matches_expected = False
                mismatched.append(expected.relativePath)
        elif expected.required:
            matches_expected = False
            missing_required.append(expected.relativePath)

        files[expected.relativePath] = {
            "exists": exists,
            "sha256": sha256,
            "size": size,
            "modifiedAt": modified_at,
            "matchesExpected": matches_expected,
        }

    ok = len(missing_required) == 0 and len(mismatched) == 0
    return {
        "ok": ok,
        "workspaceId": body.workspaceId,
        "agentId": body.agentId,
        "homePath": str(home),
        "missingRequired": missing_required,
        "mismatched": mismatched,
        "files": files,
    }
