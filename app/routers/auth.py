from datetime import datetime, timedelta, timezone

import jwt
import psycopg
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.database import get_connection
from app.middleware.auth import decode_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginBody):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Username and password required")

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, username, password, role FROM users WHERE username = %s",
                    (body.username,),
                )
                row = cur.fetchone()
    except psycopg.OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Check local Postgres is running and .env (PG_HOST, PG_PORT, PG_USER, PG_DATABASE).",
        ) from exc
    except psycopg.Error as exc:
        err = str(exc).lower()
        if "users" in err and ("does not exist" in err or "undefined_table" in err):
            raise HTTPException(
                status_code=503,
                detail="Users table missing. Run seed_users.sql against secrets_db.",
            ) from exc
        raise HTTPException(status_code=500, detail="Database error during login") from exc

    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if body.password != row["password"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    settings = get_settings()
    token = jwt.encode(
        {
            "id": row["id"],
            "username": row["username"],
            "role": row["role"],
            "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )

    return {
        "token": token,
        "user": {"id": row["id"], "username": row["username"], "role": row["role"]},
    }


@router.post("/verify")
def verify(authorization: str | None = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No token provided")
    parts = authorization.split(" ", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=401, detail="No token provided")
    try:
        decoded = decode_token(parts[1])
        return {"valid": True, "user": decoded}
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid token") from None
