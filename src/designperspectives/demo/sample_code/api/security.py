"""Signing in and password changes."""

import hashlib
import secrets

from .store import find_user, save_session


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()[:10]


def authenticate(username: str, password: str) -> str | None:
    user = find_user(username)
    if user is None or user["password_hash"] != hash_password(password):
        return None
    token = secrets.token_hex(8)
    save_session(token, username)
    return token
