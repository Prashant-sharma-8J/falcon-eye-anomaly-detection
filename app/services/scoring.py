import json

import numpy as np

try:
    from tensorflow.keras.models import load_model
except ModuleNotFoundError:
    from keras.models import load_model

from app.core.config import settings
from app.db.connection import get_connection
from app.db.repository import get_transaction_with_features
from app.ml.features import featurize_transactions


class ScoringService:
    def __init__(self) -> None:
        self.model = load_model(settings.model_path)
        self.scaler_meta = np.load(settings.scaler_path, allow_pickle=True).item()
        with open(settings.threshold_path, "r", encoding="utf-8") as file:
            self.threshold_meta = json.load(file)

    @property
    def feature_cols(self) -> list[str]:
        return self.scaler_meta["columns"]

    def score_frame(self, df) -> dict:
        if df.empty:
            raise ValueError("Transaction not found")

        features, _ = featurize_transactions(df, self.feature_cols)
        mean = self.scaler_meta["mean"]
        scale = self.scaler_meta["scale"]
        scaled = (features.values.astype(float) - mean) / (scale + 1e-12)

        reconstructed = self.model.predict(scaled, verbose=0)
        error_score = float(np.mean(np.square(scaled - reconstructed), axis=1)[0])
        user_id = str(df.iloc[0]["user_id"])
        threshold_detail = self.threshold_meta.get("user_thresholds", {}).get(user_id)

        if threshold_detail:
            threshold = float(threshold_detail["threshold"])
            threshold_source = "user"
        else:
            threshold = float(self.threshold_meta.get("global_threshold", self.threshold_meta["threshold"]))
            threshold_source = "global"

        return {
            "txn_id": int(df.iloc[0]["txn_id"]),
            "user_id": int(df.iloc[0]["user_id"]),
            "amount": float(df.iloc[0]["amount"]),
            "txn_type": str(df.iloc[0]["txn_type"]),
            "channel": str(df.iloc[0]["channel"]),
            "error_score": error_score,
            "threshold": threshold,
            "threshold_source": threshold_source,
            "is_anomaly": error_score > threshold,
        }

    def score_transaction(self, txn_id: int) -> dict:
        conn = get_connection()
        try:
            df = get_transaction_with_features(conn, txn_id)
        finally:
            conn.close()
        return self.score_frame(df)
