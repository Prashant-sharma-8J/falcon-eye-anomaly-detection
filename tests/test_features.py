import pandas as pd

from app.ml.features import featurize_transactions


def test_featurize_uses_training_columns_for_inference():
    training = pd.DataFrame(
        [
            {
                "amount": 100,
                "avg_amount_30d": 50,
                "txn_count_30d": 3,
                "txn_type": "debit",
                "channel": "online",
            }
        ]
    )
    _, columns = featurize_transactions(training)

    inference = pd.DataFrame(
        [
            {
                "amount": 250,
                "avg_amount_30d": 100,
                "txn_count_30d": 5,
                "txn_type": "credit",
                "channel": "atm",
            }
        ]
    )
    features, _ = featurize_transactions(inference, columns)

    assert features.columns.tolist() == columns
    assert features.iloc[0]["type_debit"] == 0
    assert features.iloc[0]["chan_online"] == 0
