"""Sign In Controller."""

from .security import authenticate


def sign_in(username: str, password: str) -> dict:
    token = authenticate(username, password)
    return {"ok": token is not None, "token": token}
