from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.middleware.auth import decode_token

ROLE_ADMIN = "admin"
ROLE_REVIEWER = "reviewer"


def get_token_from_header(authorization: str | None = Header(default=None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="No token provided")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="No token provided")
    return parts[1]


def get_current_user(
    token: Annotated[str, Depends(get_token_from_header)],
) -> dict:
    payload = decode_token(token)
    role = payload.get("role")
    if role not in (ROLE_ADMIN, ROLE_REVIEWER):
        raise HTTPException(status_code=403, detail="Invalid role")
    return {
        "id": payload.get("id"),
        "username": payload.get("username"),
        "role": role,
    }


def require_admin(user: Annotated[dict, Depends(get_current_user)]) -> dict:
    if user["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_reviewer_or_admin(
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    return user
