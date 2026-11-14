"""Accounts Summary Controller."""

from .mainframe_facade import balances
from .store import find_user


def summary(username: str) -> dict:
    user = find_user(username) or {"accounts": []}
    return balances(user["accounts"])
