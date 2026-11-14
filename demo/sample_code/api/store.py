"""User and session storage (stand-in for the Oracle schema)."""

USERS = {"alice": {"password_hash": "5e884898da", "accounts": ["ACC-1", "ACC-2"]}}
SESSIONS: dict[str, str] = {}


def find_user(username: str) -> dict | None:
    return USERS.get(username)


def save_session(token: str, username: str) -> None:
    SESSIONS[token] = username
