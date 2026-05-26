import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    db_host: str = os.getenv("DB_HOST", "localhost")
    db_port: int = int(os.getenv("DB_PORT", "3306"))
    db_user: str = os.getenv("DB_USER", "")
    db_password: str = os.getenv("DB_PASSWORD", "")
    db_name: str = os.getenv("DB_NAME", "bank_anom")
    model_dir: str = os.getenv("MODEL_DIR", "models")
    poll_interval_seconds: int = int(os.getenv("POLL_INTERVAL_SECONDS", "3"))
    threshold_k: float = float(os.getenv("THRESHOLD_K", "3.0"))
    min_user_threshold_samples: int = int(os.getenv("MIN_USER_THRESHOLD_SAMPLES", "10"))

    @property
    def model_path(self) -> str:
        return str(self._model_dir_path / "autoencoder.keras")

    @property
    def scaler_path(self) -> str:
        return str(self._model_dir_path / "scaler.npy")

    @property
    def threshold_path(self) -> str:
        return str(self._model_dir_path / "threshold.json")

    @property
    def _model_dir_path(self) -> Path:
        path = Path(self.model_dir)
        if path.is_absolute():
            return path
        return PROJECT_ROOT / path

    @property
    def db_config(self) -> dict:
        return {
            "host": self.db_host,
            "port": self.db_port,
            "user": self.db_user,
            "password": self.db_password,
            "database": self.db_name,
        }


settings = Settings()
