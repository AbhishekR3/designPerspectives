"""Reset Password Controller."""

import secrets

from .email_sender import send
from .security import hash_password
from .store import find_user


def request_reset(username: str, email: str) -> str:
    if find_user(username) is None:
        return ""
    token = secrets.token_urlsafe(12)
    send(email, "Reset your password", f"Use https://bigbank.example/reset/{token}")
    return token


def apply_reset(username: str, new_password: str) -> str:
    return hash_password(new_password)
