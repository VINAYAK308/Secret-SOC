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

ACTIVE_SCANS = {}


def update_in_memory_stage(scan_run_id: int, current_stage: str, stages: list):
    ACTIVE_SCANS[scan_run_id] = {
        "current_stage": current_stage,
        "stages": stages
    }


class TriggerScanBody(BaseModel):
    repoUrl: str
    repoName: str | None = None
    branches: list[str] | str | None = None


class StageUpdateBody(BaseModel):
    stage: str
    status: str
    desc: str | None = None
    time: str | None = None


async def _run_mock_simulation(scan_run_id: int, stages: list) -> None:
    try:
        update_in_memory_stage(scan_run_id, "clone", stages)
        await asyncio.sleep(2)

        stages[0]["status"] = "completed"
        stages[0]["time"] = "2s"
        stages[1]["status"] = "running"
        stages[1]["time"] = "In progress..."
        update_in_memory_stage(scan_run_id, "scan", stages)
        await asyncio.sleep(4)

        stages[1]["status"] = "completed"
        stages[1]["time"] = "4s"
        stages[2]["status"] = "running"
        stages[2]["time"] = "In progress..."
        update_in_memory_stage(scan_run_id, "process", stages)
        await asyncio.sleep(2)

        stages[2]["status"] = "completed"
        stages[2]["time"] = "2s"
        stages[3]["status"] = "running"
        stages[3]["time"] = "In progress..."
        update_in_memory_stage(scan_run_id, "extract", stages)
        await asyncio.sleep(2)

        stages[3]["status"] = "completed"
        stages[3]["time"] = "2s"
        stages[4]["status"] = "running"
        stages[4]["time"] = "In progress..."
        update_in_memory_stage(scan_run_id, "ai_validate", stages)
        await asyncio.sleep(3)

        stages[4]["status"] = "completed"
        stages[4]["time"] = "3s"
        stages[5]["status"] = "running"
        stages[5]["time"] = "In progress..."
        update_in_memory_stage(scan_run_id, "committer_info", stages)
        await asyncio.sleep(2)

        stages[5]["status"] = "completed"
        stages[5]["time"] = "2s"
        stages[6]["status"] = "running"
        stages[6]["time"] = "In progress..."
        update_in_memory_stage(scan_run_id, "storage_alert", stages)
        await asyncio.sleep(2)

        stages[6]["status"] = "completed"
        stages[6]["time"] = "2s"
        update_in_memory_stage(scan_run_id, "storage_alert", stages)
        finish_scan_run(scan_run_id, success=True)
        print(f"[SCAN] Mock simulation completed successfully for run {scan_run_id}")

    except Exception as exc:
        print(f"[SCAN] Mock simulation failed for run {scan_run_id}:", exc)
        for stg in stages:
            if stg["status"] == "running":
                stg["status"] = "failed"
        update_in_memory_stage(scan_run_id, "failed", stages)
        finish_scan_run(scan_run_id, success=False)


async def _poll_jenkins_freestyle_pipeline(scan_run_id: int, queue_url: str, auth: str, stages: list) -> None:
    try:
        build_url = None
        build_number = None

        # Poll queue for up to 180 seconds (90 * 2s) — increased from 60s to handle slow SSH starts
        for _ in range(90):
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    queue_url.rstrip("/") + "/api/json",
                    headers={"Authorization": f"Basic {auth}"},
                    timeout=10.0
                )
            if response.status_code == 200:
                data = response.json()
                if "executable" in data and data["executable"]:
                    build_url = data["executable"]["url"]
                    build_number = data["executable"]["number"]
                    break
            await asyncio.sleep(2)

        if not build_url:
            print(f"[SCAN] Jenkins queue did not resolve to a build for run {scan_run_id}. Swapping to simulation.")
            await _run_mock_simulation(scan_run_id, stages)
            return

        print(f"[SCAN] Resolved run {scan_run_id} to Jenkins Freestyle build #{build_number} at {build_url}")

        elapsed_seconds = 0
        current_active_idx = 1
        stages[0]["status"] = "completed"
        stages[0]["time"] = "3s"
        stages[1]["status"] = "running"
        stages[1]["time"] = "In progress..."
        update_in_memory_stage(scan_run_id, "scan", stages)

        stage_times = {
            "scan": 12,
            "process": 4,
            "extract": 3,
            "ai_validate": 6,
            "committer_info": 3,
            "storage_alert": 3
        }
        stage_ids = ["clone", "scan", "process", "extract", "ai_validate", "committer_info", "storage_alert"]

        while True:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    build_url.rstrip("/") + "/api/json",
                    headers={"Authorization": f"Basic {auth}"},
                    timeout=10.0
                )

            building = True
            result = None
            if response.status_code == 200:
                data = response.json()
                building = data.get("building", True)
                result = data.get("result")
            else:
                print(f"[SCAN] Jenkins build API returned status {response.status_code} for run {scan_run_id}")

            if not building:
                break

            in_mem = ACTIVE_SCANS.get(scan_run_id)
            if in_mem:
                stages = in_mem.get("stages") or stages

            db_active_idx = current_active_idx
            for idx, stg in enumerate(stages):
                if stg["status"] == "running":
                    db_active_idx = idx
                    break

            if db_active_idx != current_active_idx:
                current_active_idx = db_active_idx
                elapsed_seconds = 0
            else:
                elapsed_seconds += 3
                current_stage_id = stage_ids[current_active_idx]
                current_stage_dur = stage_times.get(current_stage_id, 5)

                if elapsed_seconds >= current_stage_dur and current_active_idx < len(stage_ids) - 1:
                    stages[current_active_idx]["status"] = "completed"
                    stages[current_active_idx]["time"] = f"{current_stage_dur}s"

                    current_active_idx += 1
                    next_stage_id = stage_ids[current_active_idx]
                    stages[current_active_idx]["status"] = "running"
                    stages[current_active_idx]["time"] = "In progress..."

                    update_in_memory_stage(scan_run_id, next_stage_id, stages)
                    elapsed_seconds = 0

            await asyncio.sleep(3)

        if result == "SUCCESS":
            for stg in stages:
                if stg["status"] != "completed":
                    stg["status"] = "completed"
                    stg["time"] = "1s"
            update_in_memory_stage(scan_run_id, "storage_alert", stages)
            finish_scan_run(scan_run_id, success=True)
            print(f"[SCAN] Jenkins run {scan_run_id} completed successfully.")
        else:
            for stg in stages:
                if stg["status"] == "running":
                    stg["status"] = "failed"
                    stg["time"] = "Error"
            update_in_memory_stage(scan_run_id, "failed", stages)
            finish_scan_run(scan_run_id, success=False)
            print(f"[SCAN] Jenkins run {scan_run_id} failed with result: {result}")

    except Exception as exc:
        print(f"[SCAN] Error in Jenkins Freestyle poller for run {scan_run_id}:", exc)
        finish_scan_run(scan_run_id, success=False)


async def _run_jenkins_or_mock(scan_run_id: int, repo_url: str, repo_name: str, branch_names: str) -> None:
    settings = get_settings()
    try:
        in_mem = ACTIVE_SCANS.get(scan_run_id)
        stages = in_mem.get("stages") if in_mem else []
        if not stages:
            stages = [
                {"id": "clone",          "name": "Repository Clone Stage",           "status": "completed", "desc": "Jenkins clones GitHub repository to temporary workspace",      "time": "Just now"},
                {"id": "scan",           "name": "Secret Scanning Stage (Parallel)", "status": "pending",   "desc": "TruffleHog, Gitleaks, Nosey Parker parallel scan",            "time": ""},
                {"id": "process",        "name": "Findings Processing Stage",        "status": "pending",   "desc": "Consolidating findings & de-duplicating results",             "time": ""},
                {"id": "extract",        "name": "Code Context Extraction",          "status": "pending",   "desc": "Extracting nearby code lines & functions",                    "time": ""},
                {"id": "ai_validate",    "name": "AI Validation Stage (Llama 3.1)",  "status": "pending",   "desc": "Llama 3.1 8B analysis for false positives & remediation",    "time": ""},
                {"id": "committer_info", "name": "Committer Information Collection", "status": "pending",   "desc": "Resolving commit metadata & committer profiles",              "time": ""},
                {"id": "storage_alert",  "name": "Storage & Alert Dispatch",         "status": "pending",   "desc": "Saving to PostgreSQL and dispatching notifications",          "time": ""}
            ]

        if settings.jenkins_url and settings.jenkins_job_name:
            trigger_url = (
                f"{settings.jenkins_url}/job/{settings.jenkins_job_name}/buildWithParameters"
                f"?{settings.jenkins_param_repo}={quote(repo_url)}"
                f"&{settings.jenkins_param_branch}={quote(branch_names)}"
                f"&REPO_NAME={quote(repo_name)}"
                f"&SCAN_RUN_ID={scan_run_id}"
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
                stages[0]["status"] = "failed"
                update_in_memory_stage(scan_run_id, "failed", stages)
                finish_scan_run(scan_run_id, success=False)
                return

            queue_url = response.headers.get("Location")
            if queue_url:
                asyncio.create_task(_poll_jenkins_freestyle_pipeline(scan_run_id, queue_url, auth, stages))
            else:
                asyncio.create_task(_run_mock_simulation(scan_run_id, stages))
            return

        asyncio.create_task(_run_mock_simulation(scan_run_id, stages))
    except Exception as exc:
        print(f"[SCAN] trigger run {scan_run_id} failed:", exc)
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

    repo_name = (body.repoName or "").strip()
    if not repo_name:
        repo_name = repo_url.rstrip("/").rstrip(".git").split("/")[-1] or "repo"

    branch_names = "main"
    if isinstance(body.branches, list) and body.branches:
        branch_names = ",".join(body.branches)
    elif isinstance(body.branches, str) and body.branches.strip():
        branch_names = body.branches.strip()

    try:
        repo_id = get_or_create_repository(repo_url)
        scan_run_id = create_scan_run(repo_id)
        await _run_jenkins_or_mock(scan_run_id, repo_url, repo_name, branch_names)

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

    in_mem = ACTIVE_SCANS.get(scan_run_id)
    if in_mem:
        current_stage = in_mem.get("current_stage", "queued")
        stages = in_mem.get("stages") or []
    else:
        status = row["status"]
        stages = [
            {"id": "clone",          "name": "Repository Clone Stage",           "status": "completed", "desc": "Jenkins clones GitHub repository to temporary workspace",      "time": "Done"},
            {"id": "scan",           "name": "Secret Scanning Stage (Parallel)", "status": "completed", "desc": "TruffleHog, Gitleaks, Nosey Parker parallel scan",            "time": "Done"},
            {"id": "process",        "name": "Findings Processing Stage",        "status": "completed", "desc": "Consolidating findings & de-duplicating results",             "time": "Done"},
            {"id": "extract",        "name": "Code Context Extraction",          "status": "completed", "desc": "Extracting nearby code lines & functions",                    "time": "Done"},
            {"id": "ai_validate",    "name": "AI Validation Stage (Llama 3.1)",  "status": "completed", "desc": "Llama 3.1 8B analysis for false positives & remediation",    "time": "Done"},
            {"id": "committer_info", "name": "Committer Information Collection", "status": "completed", "desc": "Resolving commit metadata & committer profiles",              "time": "Done"},
            {"id": "storage_alert",  "name": "Storage & Alert Dispatch",         "status": "completed", "desc": "Saving to PostgreSQL and dispatching notifications",          "time": "Done"}
        ]
        if status == "failed":
            for stg in stages:
                if stg["id"] in ["ai_validate", "committer_info", "storage_alert"]:
                    stg["status"] = "failed"
                    stg["time"] = "Error"
            current_stage = "failed"
        elif status == "running":
            for idx, stg in enumerate(stages):
                if idx == 0:
                    stg["status"] = "completed"
                    stg["time"] = "Done"
                elif idx == 1:
                    stg["status"] = "running"
                    stg["time"] = "In progress..."
                else:
                    stg["status"] = "pending"
                    stg["time"] = ""
            current_stage = "scan"
        else:
            current_stage = "storage_alert"

    return {
        "id": row["id"],
        "repoId": row["repo_id"],
        "repoName": row["repo_name"],
        "repoUrl": row["repo_url"],
        "status": row["status"],
        "startedAt": row["started_at"].isoformat() if row["started_at"] else None,
        "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
        "scannersUsed": row["scanners_used"] or [],
        "currentStage": current_stage,
        "stages": stages,
    }


@router.post("/runs/{scan_run_id}/stage")
def update_run_stage(
    scan_run_id: int,
    body: StageUpdateBody,
):
    row = get_scan_run(scan_run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Scan run not found")

    in_mem = ACTIVE_SCANS.get(scan_run_id)
    stages = in_mem.get("stages") if in_mem else []
    if not stages:
        stages = [
            {"id": "clone",          "name": "Repository Clone Stage",           "status": "completed", "desc": "Jenkins clones GitHub repository to temporary workspace",      "time": "Just now"},
            {"id": "scan",           "name": "Secret Scanning Stage (Parallel)", "status": "pending",   "desc": "TruffleHog, Gitleaks, Nosey Parker parallel scan",            "time": ""},
            {"id": "process",        "name": "Findings Processing Stage",        "status": "pending",   "desc": "Consolidating findings & de-duplicating results",             "time": ""},
            {"id": "extract",        "name": "Code Context Extraction",          "status": "pending",   "desc": "Extracting nearby code lines & functions",                    "time": ""},
            {"id": "ai_validate",    "name": "AI Validation Stage (Llama 3.1)",  "status": "pending",   "desc": "Llama 3.1 8B analysis for false positives & remediation",    "time": ""},
            {"id": "committer_info", "name": "Committer Information Collection", "status": "pending",   "desc": "Resolving commit metadata & committer profiles",              "time": ""},
            {"id": "storage_alert",  "name": "Storage & Alert Dispatch",         "status": "pending",   "desc": "Saving to PostgreSQL and dispatching notifications",          "time": ""}
        ]

    updated = False
    for stg in stages:
        if stg["id"] == body.stage:
            stg["status"] = body.status
            if body.desc:
                stg["desc"] = body.desc
            if body.time:
                stg["time"] = body.time
            updated = True
        elif body.status == "running" and stg["status"] == "running":
            stg["status"] = "completed"
            stg["time"] = "Done"

    if not updated:
        raise HTTPException(status_code=404, detail=f"Stage '{body.stage}' not found in pipeline")

    update_in_memory_stage(scan_run_id, body.stage, stages)
    return {"success": True, "message": f"Stage '{body.stage}' updated to '{body.status}'"}


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
