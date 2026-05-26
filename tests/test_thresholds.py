import pandas as pd

from app.ml.thresholds import build_user_thresholds, mean_plus_k_std


def test_mean_plus_k_std():
    assert mean_plus_k_std([1, 2, 3], k=2) == 2 + 2 * (2 / 3) ** 0.5


def test_build_user_thresholds_requires_min_samples():
    df = pd.DataFrame({"user_id": [1, 1, 1, 2]})
    thresholds = build_user_thresholds(df, [1.0, 2.0, 3.0, 50.0], k=3, min_samples=2)

    assert "1" in thresholds
    assert "2" not in thresholds
    assert thresholds["1"]["method"] == "mean+k*std"
