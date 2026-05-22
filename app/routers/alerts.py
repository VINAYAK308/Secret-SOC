from fastapi import APIRouter, Depends, HTTPException

from app.database import get_connection
from app.deps.auth import get_current_user

router = APIRouter(
    prefix="/api/alerts",
    tags=["alerts"],
    dependencies=[Depends(get_current_user)],
)

QUEUE_QUERY = """
    SELECT
        secret_id,
        fingerprint,
        secret_status,
        is_active,
        tool,
        secret_type,
        file_path,
        line_number,
        repo_name,
        notify_email,
        alert_state,
        last_sent_at,
        alert_count,
        reasoning,
        author_name,
        committer_name,
        commit_hash
    FROM v_secrets_alert_queue
    WHERE alert_state IN ('needs_initial', 'needs_reminder')
    ORDER BY
        CASE alert_state
            WHEN 'needs_initial' THEN 0
            WHEN 'needs_reminder' THEN 1
            ELSE 2
        END,
        repo_name,
        secret_id
"""


def _format_queue_row(r: dict) -> dict:
    return {
        "secret_id": r["secret_id"],
        "fingerprint": r.get("fingerprint"),
        "secret_status": r.get("secret_status"),
        "is_active": r.get("is_active"),
        "tool": r.get("tool"),
        "secret_type": r.get("secret_type"),
        "file_path": r.get("file_path"),
        "line_number": r.get("line_number"),
        "repo_name": r.get("repo_name"),
        "notify_email": r.get("notify_email"),
        "alert_state": r.get("alert_state"),
        "last_sent_at": r["last_sent_at"].isoformat() if r.get("last_sent_at") else None,
        "alert_count": int(r["alert_count"]) if r.get("alert_count") is not None else None,
        "reasoning": r.get("reasoning"),
        "author_name": r.get("author_name"),
        "committer_name": r.get("committer_name"),
        "commit_hash": r.get("commit_hash"),
    }


@router.get("/queue")
def alert_queue():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(QUEUE_QUERY)
                rows = cur.fetchall()
        return [_format_queue_row(r) for r in rows]
    except Exception as exc:
        print("Error fetching alert queue:", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch alert queue") from exc


@router.get("/summary")
def alert_summary():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT alert_state, COUNT(*) AS count
                    FROM v_secrets_alert_queue
                    WHERE alert_state IN ('needs_initial', 'needs_reminder')
                    GROUP BY alert_state
                    """
                )
                rows = cur.fetchall()
        by_state = {r["alert_state"]: int(r["count"]) for r in rows}
        return {
            "needs_initial": by_state.get("needs_initial", 0),
            "needs_reminder": by_state.get("needs_reminder", 0),
        }
    except Exception as exc:
        print("Error fetching alert summary:", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch alert summary") from exc
