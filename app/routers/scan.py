import asyncio
import base64
import re
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.database import get_connection
from app.deps.auth import get_current_user, require_admin
from app.services.scan_runs import (
    create_scan_run,
    finish_scan_run,
    get_or_create_repository,
    get_scan_run,
)

router = APIRouter(prefix="/api/scan", tags=["scan"])

URL_PATTERN = re.compile(
    r"^(https?://[^\s]+|git@[a-zA-Z0-9.-]+:[a-zA-Z0-9./-]+)$"
)


class TriggerScanBody(BaseModel):
    repoUrl: str
    branches: list[str] | str | None = None


async def _run_jenkins_or_mock(scan_run_id: int, repo_url: str, branch_names: str) -> None:
    settings = get_settings()
    try:
        if settings.jenkins_url and settings.jenkins_job_name:
            trigger_url = (
                f"{settings.jenkins_url}/job/{settings.jenkins_job_name}/buildWithParameters"
                f"?{settings.jenkins_param_repo}={quote(repo_url)}"
                f"&{settings.jenkins_param_branch}={quote(branch_names)}"
            )
            auth = base64.b64encode(
                f"{settings.jenkins_user}:{settings.jenkins_api_token}".encode()
            ).decode()
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    trigger_url,
                    headers={"Authorization": f"Basic {auth}"},
                    timeout=30.0,
                )
            if not response.is_success:
                finish_scan_run(scan_run_id, success=False)
                return
            # Pipeline should update scan_runs when finished; leave as running.
            return

        await asyncio.sleep(3)
        finish_scan_run(scan_run_id, success=True)
    except Exception as exc:
        print(f"[SCAN] run {scan_run_id} failed:", exc)
        finish_scan_run(scan_run_id, success=False)


@router.post("/trigger")
async def trigger_scan(
    body: TriggerScanBody,
    user: dict = Depends(require_admin),
):
    repo_url = (body.repoUrl or "").strip()
    if not repo_url:
        raise HTTPException(status_code=400, detail="Repository URL is required")

    if not URL_PATTERN.match(repo_url):
        raise HTTPException(
            status_code=400,
            detail="Invalid repository URL format. Must be a valid HTTP/HTTPS or SSH Git URL.",
        )

    branch_names = "main"
    if isinstance(body.branches, list) and body.branches:
        branch_names = ",".join(body.branches)
    elif isinstance(body.branches, str) and body.branches.strip():
        branch_names = body.branches.strip()

    try:
        repo_id = get_or_create_repository(repo_url)
        scan_run_id = create_scan_run(repo_id)
        asyncio.create_task(_run_jenkins_or_mock(scan_run_id, repo_url, branch_names))

        return {
            "success": True,
            "scanRunId": scan_run_id,
            "message": f"Scan started for {repo_url}",
            "triggeredBy": user.get("username"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        print("Error triggering scan:", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger scan: {exc}",
        ) from exc


@router.get("/runs/{scan_run_id}")
def get_run(scan_run_id: int, _user: dict = Depends(get_current_user)):
    row = get_scan_run(scan_run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Scan run not found")
    return {
        "id": row["id"],
        "repoId": row["repo_id"],
        "repoName": row["repo_name"],
        "repoUrl": row["repo_url"],
        "status": row["status"],
        "startedAt": row["started_at"].isoformat() if row["started_at"] else None,
        "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
        "scannersUsed": row["scanners_used"] or [],
    }


@router.get("/stats")
def get_scan_stats(_user: dict = Depends(get_current_user)):
    query = """
        SELECT 
            r.id,
            r.name,
            COUNT(sr.id) FILTER (WHERE sr.status = 'completed') AS completed_scans,
            COUNT(sr.id) FILTER (WHERE sr.status = 'failed') AS failed_scans,
            COUNT(sr.id) FILTER (WHERE sr.status = 'running') AS running_scans,
            COUNT(sr.id) AS total_scans
        FROM repositories r
        LEFT JOIN scan_runs sr ON sr.repo_id = r.id
        GROUP BY r.id, r.name
        ORDER BY total_scans DESC, r.name ASC
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()
        return [
            {
                "id": row["id"],
                "repoName": row["name"],
                "completed": int(row["completed_scans"] or 0),
                "failed": int(row["failed_scans"] or 0),
                "running": int(row["running_scans"] or 0),
                "total": int(row["total_scans"] or 0),
            }
            for row in rows
        ]
    except Exception as exc:
        print("Error fetching scan stats:", exc)
        raise HTTPException(
            status_code=500, detail="Failed to fetch scan stats"
        ) from exc
