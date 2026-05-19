from fastapi import APIRouter, Depends, HTTPException

from app.database import get_connection
from app.deps.auth import get_current_user

router = APIRouter(prefix="/api/repositories", tags=["repositories"])

REPOS_QUERY = """
    SELECT
        r.id,
        r.name,
        r.url,
        r.created_at AS repo_created_at,
        COUNT(DISTINCT s.id) AS total_findings,
        MAX(sr.started_at) AS last_scan_time,
        (
            SELECT status FROM scan_runs
            WHERE repo_id = r.id
            ORDER BY started_at DESC
            LIMIT 1
        ) AS last_scan_status,
        (
            SELECT id FROM scan_runs
            WHERE repo_id = r.id
            ORDER BY started_at DESC
            LIMIT 1
        ) AS last_scan_run_id
    FROM repositories r
    LEFT JOIN secrets s ON s.repo_id = r.id
        AND replace(s.file_path, E'\\\\', '/') !~ '(^|/)\\.git(/|$)'
    LEFT JOIN scan_runs sr ON sr.repo_id = r.id
    GROUP BY r.id, r.name, r.url, r.created_at
    ORDER BY last_scan_time DESC NULLS LAST
"""


@router.get("", dependencies=[Depends(get_current_user)])
def list_repositories():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(REPOS_QUERY)
                rows = cur.fetchall()

        return [
            {
                "id": item["id"],
                "name": item["name"],
                "url": item["url"],
                "totalFindings": int(item["total_findings"] or 0),
                "lastScanTime": item["last_scan_time"].isoformat()
                if item["last_scan_time"]
                else None,
                "lastScanStatus": item["last_scan_status"] or "unknown",
                "lastScanRunId": item["last_scan_run_id"],
                "createdAt": item["repo_created_at"].isoformat()
                if item["repo_created_at"]
                else None,
            }
            for item in rows
        ]
    except Exception as exc:
        print("Error fetching repositories:", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch repositories") from exc
