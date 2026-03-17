from __future__ import annotations

import os
from pathlib import Path
from threading import RLock
from typing import Callable, TypeVar

from models import AppState

T = TypeVar("T")


def default_store_path() -> Path:
    configured = os.getenv("MEETING_STORE_PATH")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent / "data" / "meeting_store.json"


class JsonStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or default_store_path()
        self.lock = RLock()
        self._ensure_file()

    def _ensure_file(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text(AppState().model_dump_json(indent=2), encoding="utf-8")

    def load(self) -> AppState:
        with self.lock:
            raw = self.path.read_text(encoding="utf-8").strip()
            if not raw:
                return AppState()
            return AppState.model_validate_json(raw)

    def save(self, state: AppState) -> None:
        with self.lock:
            payload = state.model_dump_json(indent=2)
            self.path.write_text(payload, encoding="utf-8")

    def transaction(self, handler: Callable[[AppState], T]) -> T:
        with self.lock:
            state = self.load()
            result = handler(state)
            self.save(state)
            return result
