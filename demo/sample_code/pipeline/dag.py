"""The Airflow DAG that chains the three stages."""

from .consume import read_batch
from .load_warehouse import load
from .mask_pii import mask


def run() -> int:
    return load(mask(read_batch()))
