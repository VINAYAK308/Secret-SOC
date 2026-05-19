from urllib.parse import urlparse

from app.database import get_connection


def repo_name_from_url(repo_url: str) -> str:
    url = repo_url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    path = urlparse(url).path.strip("/")
    if path:
        return path.split("/")[-1]
    parts = url.split("/")
    return parts[-1] if parts else "repository"


def get_or_create_repository(repo_url: str) -> int:
    name = repo_name_from_url(repo_url)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO repositories (name, url)
                VALUES (%s, %s)
                ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name
                RETURNING id
                """,
                (name, repo_url),
            )
            row = cur.fetchone()
        conn.commit()
    return row["id"]


def create_scan_run(repo_id: int, scanners_used: list[str] | None = None) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO scan_runs (repo_id, status, scanners_used)
                VALUES (%s, 'running', %s)
                RETURNING id
                """,
                (repo_id, scanners_used or ["gitleaks"]),
            )
            row = cur.fetchone()
        conn.commit()
    return row["id"]


def finish_scan_run(scan_run_id: int, *, success: bool) -> None:
    status = "completed" if success else "failed"
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE scan_runs
                SET status = %s, completed_at = NOW()
                WHERE id = %s
                """,
                (status, scan_run_id),
            )
        conn.commit()


def get_scan_run(scan_run_id: int) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sr.id, sr.repo_id, sr.status, sr.started_at, sr.completed_at,
                       sr.scanners_used, r.name AS repo_name, r.url AS repo_url
                FROM scan_runs sr
                JOIN repositories r ON r.id = sr.repo_id
                WHERE sr.id = %s
                """,
                (scan_run_id,),
            )
            return cur.fetchone()
