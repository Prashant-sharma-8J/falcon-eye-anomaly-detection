import json
import os

import numpy as np
from sklearn.preprocessing import StandardScaler

try:
    from tensorflow.keras.callbacks import EarlyStopping
except ModuleNotFoundError:
    from keras.callbacks import EarlyStopping

from app.core.config import settings
from app.db.connection import get_connection
from app.db.repository import get_training_data
from app.ml.features import featurize_transactions
from app.ml.model import build_autoencoder
from app.ml.thresholds import build_user_thresholds, mean_plus_k_std


def train_model_from_database() -> dict:
    os.makedirs(settings.model_dir, exist_ok=True)
    conn = get_connection()
    try:
        df = get_training_data(conn)
    finally:
        conn.close()

    if df.empty:
        raise ValueError("No training data found")

    if df.shape[0] < 50:
        print(f"Warning: very small training set ({df.shape[0]} rows). Add more historical data.")

    features, feature_cols = featurize_transactions(df)
    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(features.values)

    latent_dim = min(16, max(1, scaled_features.shape[1] // 2))
    model = build_autoencoder(input_dim=scaled_features.shape[1], latent_dim=latent_dim)
    early_stopping = EarlyStopping(monitor="loss", patience=5, restore_best_weights=True)
    model.fit(
        scaled_features,
        scaled_features,
        epochs=200,
        batch_size=64,
        callbacks=[early_stopping],
        verbose=1,
    )

    reconstructed = model.predict(scaled_features)
    reconstruction_errors = np.mean(np.square(scaled_features - reconstructed), axis=1)

    global_threshold = mean_plus_k_std(reconstruction_errors, settings.threshold_k)
    user_thresholds = build_user_thresholds(
        df,
        reconstruction_errors,
        k=settings.threshold_k,
        min_samples=settings.min_user_threshold_samples,
    )

    model.save(settings.model_path)
    np.save(
        settings.scaler_path,
        {"mean": scaler.mean_, "scale": scaler.scale_, "columns": feature_cols},
        allow_pickle=True,
    )

    metadata = {
        "global_threshold": global_threshold,
        "threshold": global_threshold,
        "method": "mean+k*std",
        "k": settings.threshold_k,
        "min_user_threshold_samples": settings.min_user_threshold_samples,
        "feature_cols": feature_cols,
        "training_rows": int(df.shape[0]),
        "user_threshold_count": len(user_thresholds),
        "user_thresholds": user_thresholds,
    }

    with open(settings.threshold_path, "w", encoding="utf-8") as file:
        json.dump(metadata, file, indent=2)

    print("Training done. Model saved:", settings.model_path)
    print("Global fallback threshold:", global_threshold)
    print("Per-user thresholds:", len(user_thresholds))
    return metadata
