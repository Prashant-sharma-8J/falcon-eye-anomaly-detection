import numpy as np
import pandas as pd


def mean_plus_k_std(scores, k: float) -> float:
    values = np.asarray(scores, dtype=float)
    if values.size == 0:
        raise ValueError("Cannot compute threshold without scores")
    return float(np.mean(values) + k * np.std(values))


def build_user_thresholds(
    df: pd.DataFrame,
    scores,
    k: float,
    min_samples: int,
) -> dict[str, dict]:
    scored = pd.DataFrame({"user_id": df["user_id"].astype(str), "score": scores})
    thresholds = {}

    for user_id, group in scored.groupby("user_id"):
        if len(group) < min_samples:
            continue

        thresholds[user_id] = {
            "threshold": mean_plus_k_std(group["score"].to_numpy(), k),
            "mean": float(group["score"].mean()),
            "std": float(group["score"].std(ddof=0)),
            "sample_count": int(len(group)),
            "method": "mean+k*std",
            "k": float(k),
        }

    return thresholds
