from datetime import datetime

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import get_connection
from app.deps.auth import ROLE_ADMIN, ROLE_REVIEWER, require_admin

router = APIRouter(
    prefix="/api/users",
    tags=["users"],
    dependencies=[Depends(require_admin)],
)

VALID_ROLES = (ROLE_ADMIN, ROLE_REVIEWER)


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)
    role: str


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=128)
    password: str | None = Field(default=None, min_length=1, max_length=256)
    role: str | None = None


def _normalize_role(role: str) -> str:
    role = role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Role must be admin or reviewer")
    return role


def _row_to_user(row: dict) -> dict:
    created = row.get("created_at")
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "created_at": created.isoformat() if isinstance(created, datetime) else created,
    }


@router.get("")
def list_users():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, username, role, created_at
                FROM users
                ORDER BY username ASC
                """
            )
            rows = cur.fetchall()
    return [_row_to_user(r) for r in rows]


@router.post("", status_code=201)
def create_user(body: UserCreate, admin: dict = Depends(require_admin)):
    username = body.username.strip()
    password = body.password
    role = _normalize_role(body.role)
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (username, password, role)
                    VALUES (%s, %s, %s)
                    RETURNING id, username, role, created_at
                    """,
                    (username, password, role),
                )
                row = cur.fetchone()
            conn.commit()
        return _row_to_user(row)
    except psycopg.errors.UniqueViolation as exc:
        raise HTTPException(status_code=409, detail="Username already exists") from exc


@router.put("/{user_id}")
def update_user(user_id: int, body: UserUpdate, admin: dict = Depends(require_admin)):
    if body.username is None and body.password is None and body.role is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    role = _normalize_role(body.role) if body.role is not None else None
    username = body.username.strip() if body.username is not None else None
    if username is not None and not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, username, role FROM users WHERE id = %s", (user_id,))
                existing = cur.fetchone()
                if not existing:
                    raise HTTPException(status_code=404, detail="User not found")

                if role is not None:
                    _ensure_admin_remains(cur, user_id, role, existing["role"])

                sets = []
                params: list = []
                if username is not None:
                    sets.append("username = %s")
                    params.append(username)
                if body.password is not None:
                    sets.append("password = %s")
                    params.append(body.password)
                if role is not None:
                    sets.append("role = %s")
                    params.append(role)

                params.append(user_id)
                cur.execute(
                    f"""
                    UPDATE users SET {", ".join(sets)}
                    WHERE id = %s
                    RETURNING id, username, role, created_at
                    """,
                    params,
                )
                row = cur.fetchone()
            conn.commit()
        return _row_to_user(row)
    except psycopg.errors.UniqueViolation as exc:
        raise HTTPException(status_code=409, detail="Username already exists") from exc


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin.get("id"):
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, role FROM users WHERE id = %s", (user_id,))
            existing = cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="User not found")

            if existing["role"] == ROLE_ADMIN:
                cur.execute("SELECT COUNT(*) AS n FROM users WHERE role = %s", (ROLE_ADMIN,))
                admin_count = cur.fetchone()["n"]
                if admin_count <= 1:
                    raise HTTPException(
                        status_code=400,
                        detail="Cannot delete the last admin account",
                    )

            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()


def _ensure_admin_remains(cur, user_id: int, new_role: str, old_role: str) -> None:
    if old_role == ROLE_ADMIN and new_role != ROLE_ADMIN:
        cur.execute(
            "SELECT COUNT(*) AS n FROM users WHERE role = %s AND id != %s",
            (ROLE_ADMIN, user_id),
        )
        if cur.fetchone()["n"] < 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last admin account",
            )
