"""Facade onto the mainframe banking system (XML/HTTPS in production)."""


def balances(account_ids: list[str]) -> dict[str, float]:
    return {a: 100.0 for a in account_ids}
