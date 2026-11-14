"""Stage 2: remove personal data before it reaches the warehouse."""

PII_FIELDS = ("user", "email")


def mask(events: list[dict]) -> list[dict]:
    return [{k: ("***" if k in PII_FIELDS else v) for k, v in e.items()} for e in events]
