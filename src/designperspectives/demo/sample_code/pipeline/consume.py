"""Stage 1: read events from the Kafka topic."""


def read_batch(limit: int = 500) -> list[dict]:
    return [{"user": "alice", "email": "alice@example.com", "event": "sign_in"}][:limit]
