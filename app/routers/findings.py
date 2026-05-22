from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app.deps.auth import get_current_user
from app.utils.severity import get_severity

router = APIRouter(prefix="/api/findings", tags=["findings"])

FINDINGS_QUERY = """
    SELECT
        s.id,
        s.tool,
        s.secret_type,
        s.file_path,
        s.line_number,
        s.source_url,
        s.created_at,
        s.is_active,
        s.secret_status,
        r.name AS repo_name,
        gm.author_name,
        gm.author_email,
        gm.committer_name,
        gm.committer_email,
        gm.branch_name,
        gm.commit_hash,
        sv.verdict,
        sv.confidence,
        sv.risk_score,
        sv.reasoning,
        sv.evidence
    FROM secrets s
    LEFT JOIN repositories r ON s.repo_id = r.id
    LEFT JOIN secret_git_metadata gm ON gm.secret_id = s.id
    LEFT JOIN secret_validations sv ON sv.secret_id = s.id
    WHERE replace(s.file_path, E'\\\\', '/') !~ '(^|/)\\.git(/|$)'
    ORDER BY s.created_at DESC
"""


def _format_finding(item: dict) -> dict:
    return {
        "id": item["id"],
        "tool": item.get("tool"),
        "secretType": item.get("secret_type"),
        "repo": item.get("repo_name"),
        "severity": get_severity(item["risk_score"]),
        "riskScore": item.get("risk_score"),
        "status": item.get("secret_status"),
        "time": item["created_at"].isoformat() if item.get("created_at") else None,
        "authorName": item.get("author_name"),
        "authorEmail": item.get("author_email"),
        "committerName": item.get("committer_name"),
        "committerEmail": item.get("committer_email"),
        "branchName": item.get("branch_name"),
        "commitHash": item.get("commit_hash"),
        "confidence": item.get("confidence"),
        "filePath": item.get("file_path"),
        "lineNumber": item.get("line_number"),
        "sourceUrl": item.get("source_url"),
        "reasoning": item.get("reasoning"),
        "evidence": item.get("evidence"),
        "verdict": item.get("verdict"),
        "isActive": item.get("is_active"),
    }


@router.get("", dependencies=[Depends(get_current_user)])
def list_findings():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(FINDINGS_QUERY)
                rows = cur.fetchall()
        return [_format_finding(row) for row in rows]
    except Exception as exc:
        print(exc)
        raise HTTPException(status_code=500, detail="Failed to fetch findings") from exc


@router.get("/stats", dependencies=[Depends(get_current_user)])
def findings_stats():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*) AS count FROM secrets s
                    WHERE replace(s.file_path, E'\\\\', '/') !~ '(^|/)\\.git(/|$)'
                    """
                )
                total_secrets = cur.fetchone()["count"]

                cur.execute(
                    """
                    SELECT COUNT(*) AS count
                    FROM secret_validations sv
                    JOIN secrets s ON s.id = sv.secret_id
                    WHERE sv.risk_score >= 9
                      AND replace(s.file_path, E'\\\\', '/') !~ '(^|/)\\.git(/|$)'
                    """
                )
                critical_exposures = cur.fetchone()["count"]

                cur.execute("SELECT name FROM repositories ORDER BY name")
                scanned_repos_list = [r["name"] for r in cur.fetchall()]

                cur.execute(
                    """
                    SELECT COUNT(*) AS count FROM secrets s
                    WHERE s.secret_status IN ('OPEN', 'IN_PROGRESS')
                      AND replace(s.file_path, E'\\\\', '/') !~ '(^|/)\\.git(/|$)'
                    """
                )
                active_incidents = cur.fetchone()["count"]

        return {
            "totalSecrets": total_secrets,
            "criticalExposures": critical_exposures,
            "repositoriesScanned": len(scanned_repos_list),
            "scannedReposList": scanned_repos_list,
            "activeIncidents": active_incidents,
        }
    except Exception as exc:
        print(exc)
        raise HTTPException(status_code=500, detail="Failed to fetch stats") from exc


@router.get("/trend", dependencies=[Depends(get_current_user)])
def findings_trend():
    query = """
        SELECT
            DATE(s.created_at) AS date,
            COUNT(s.id) AS total,
            COUNT(CASE WHEN sv.risk_score >= 9 THEN 1 END) AS critical,
            COUNT(CASE WHEN sv.risk_score >= 7 AND sv.risk_score < 9 THEN 1 END) AS high,
            COUNT(CASE WHEN sv.risk_score >= 4 AND sv.risk_score < 7 THEN 1 END) AS medium,
            COUNT(CASE WHEN sv.risk_score IS NULL OR sv.risk_score < 4 THEN 1 END) AS low
        FROM secrets s
        LEFT JOIN secret_validations sv ON sv.secret_id = s.id
        WHERE replace(s.file_path, E'\\\\', '/') !~ '(^|/)\\.git(/|$)'
        GROUP BY DATE(s.created_at)
        ORDER BY date ASC
        LIMIT 30
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()

        formatted = []
        for row in rows:
            d = row["date"]
            formatted.append(
                {
                    "date": d.strftime("%b %d") if hasattr(d, "strftime") else str(d),
                    "total": int(row["total"] or 0),
                    "critical": int(row["critical"] or 0),
                    "high": int(row["high"] or 0),
                    "medium": int(row["medium"] or 0),
                    "low": int(row["low"] or 0),
                }
            )
        return formatted
    except Exception as exc:
        print("Error fetching trend:", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch trend data") from exc


@router.get("/risky-repos", dependencies=[Depends(get_current_user)])
def risky_repos():
    query = """
        SELECT
            r.name AS repo_name,
            COUNT(s.id) AS total,
            COUNT(CASE WHEN sv.risk_score >= 9 THEN 1 END) AS critical,
            COUNT(CASE WHEN sv.risk_score >= 7 AND sv.risk_score < 9 THEN 1 END) AS high,
            COUNT(CASE WHEN sv.risk_score >= 4 AND sv.risk_score < 7 THEN 1 END) AS medium,
            COUNT(CASE WHEN sv.risk_score IS NULL OR sv.risk_score < 4 THEN 1 END) AS low
        FROM repositories r
        JOIN secrets s ON s.repo_id = r.id
        LEFT JOIN secret_validations sv ON sv.secret_id = s.id
        WHERE s.secret_status IN ('OPEN', 'IN_PROGRESS')
          AND s.is_active = TRUE
          AND replace(s.file_path, E'\\\\', '/') !~ '(^|/)\\.git(/|$)'
        GROUP BY r.name
        ORDER BY total DESC
        LIMIT 5
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()

        return [
            {
                "repoName": r["repo_name"],
                "total": int(r["total"] or 0),
                "critical": int(r["critical"] or 0),
                "high": int(r["high"] or 0),
                "medium": int(r["medium"] or 0),
                "low": int(r["low"] or 0),
            }
            for r in rows
        ]
    except Exception as exc:
        print("Error fetching risky repositories:", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch risky repositories") from exc



@router.get("/{finding_id}/history", dependencies=[Depends(get_current_user)])
def finding_history(finding_id: int):
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM secrets WHERE id = %s", (finding_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Finding not found")

                cur.execute(
                    """
                    SELECT old_status, new_status, changed_by, change_reason, changed_at
                    FROM secret_status_history
                    WHERE secret_id = %s
                    ORDER BY changed_at DESC
                    """,
                    (finding_id,),
                )
                rows = cur.fetchall()

        return [
            {
                "oldStatus": r["old_status"],
                "newStatus": r["new_status"],
                "changedBy": r["changed_by"],
                "changeReason": r["change_reason"],
                "changedAt": r["changed_at"].isoformat() if r["changed_at"] else None,
            }
            for r in rows
        ]
    except HTTPException:
        raise
    except Exception as exc:
        print(exc)
        raise HTTPException(status_code=500, detail="Failed to fetch history") from exc


class StatusUpdate(BaseModel):
    status: str
    change_reason: str | None = None


@router.put("/{finding_id}/status", dependencies=[Depends(get_current_user)])
def update_status(finding_id: int, body: StatusUpdate):
    raise HTTPException(
        status_code=403,
        detail="Workflow status cannot be updated from the dashboard",
    )
