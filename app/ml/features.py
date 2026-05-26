import pandas as pd


def featurize_transactions(df: pd.DataFrame, feature_cols: list[str] | None = None) -> tuple[pd.DataFrame, list[str]]:
    X_num = pd.DataFrame(index=df.index)
    X_num["amount"] = df["amount"].astype(float)
    X_num["avg_amount_30d"] = df["avg_amount_30d"].astype(float)
    X_num["amount_div_avg"] = X_num["amount"] / (X_num["avg_amount_30d"] + 1e-6)
    X_num["txn_count_30d"] = df["txn_count_30d"].astype(float)

    txn_type_dummies = pd.get_dummies(df["txn_type"].fillna("unknown"), prefix="type")
    channel_dummies = pd.get_dummies(df["channel"].fillna("unknown"), prefix="chan")
    features = pd.concat([X_num, txn_type_dummies, channel_dummies], axis=1)

    if feature_cols is None:
        columns = features.columns.tolist()
        return features, columns

    for column in feature_cols:
        if column not in features.columns:
            features[column] = 0.0

    return features[feature_cols], feature_cols
