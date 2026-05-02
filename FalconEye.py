import os
import json
import numpy as np
import pandas as pd
import mysql.connector
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.models import Model, load_model
from tensorflow.keras.layers import Input, Dense
from tensorflow.keras.callbacks import EarlyStopping

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME'),
}

MODEL_DIR = 'models'
os.makedirs(MODEL_DIR, exist_ok=True)

MODEL_PATH = os.path.join(MODEL_DIR, 'autoencoder.keras')   
SCALER_PATH = os.path.join(MODEL_DIR, 'scaler.npy')
THRESH_PATH = os.path.join(MODEL_DIR, 'threshold.json')

def get_training_data(conn):
    query = """
      SELECT t.txn_id, t.user_id, t.amount, t.txn_type, t.channel,
             COALESCE(u.avg_amount_30d, 0) AS avg_amount_30d,
             COALESCE(u.txn_count_30d, 0) AS txn_count_30d
      FROM transactions t
      LEFT JOIN user_features_cache u ON t.user_id = u.user_id
      WHERE t.created_at <= NOW() - INTERVAL 1 DAY
      ORDER BY t.created_at ASC
    """
    df = pd.read_sql(query, conn)
    return df

def featurize(df):
    X_num = pd.DataFrame()
    X_num['amount'] = df['amount'].astype(float)
    X_num['avg_amount_30d'] = df['avg_amount_30d'].astype(float)
    X_num['amount_div_avg'] = X_num['amount'] / (X_num['avg_amount_30d'] + 1e-6)
    X_num['txn_count_30d'] = df['txn_count_30d'].astype(float)
    txntype_dummies = pd.get_dummies(df['txn_type'].fillna('unknown'), prefix='type')
    channel_dummies = pd.get_dummies(df['channel'].fillna('unknown'), prefix='chan')
    X = pd.concat([X_num, txntype_dummies, channel_dummies], axis=1)
    return X, X.columns.tolist()

def build_autoencoder(input_dim, latent_dim=8):
    inp = Input(shape=(input_dim,))
    x = Dense(int(input_dim*0.75), activation='relu')(inp)
    x = Dense(int(input_dim*0.5), activation='relu')(x)
    latent = Dense(latent_dim, activation='relu')(x)
    x = Dense(int(input_dim*0.5), activation='relu')(latent)
    x = Dense(int(input_dim*0.75), activation='relu')(x)
    out = Dense(input_dim, activation='linear')(x)
    model = Model(inputs=inp, outputs=out)
    model.compile(optimizer='adam', loss='mse')
    return model

def main():
    conn = mysql.connector.connect(**DB_CONFIG)
    df = get_training_data(conn)
    if df.shape[0] < 50:
        print("Warning: very small training set ({} rows). Add more historical data.".format(df.shape[0]))

    X, feature_cols = featurize(df)
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X.values)

    model = build_autoencoder(input_dim=Xs.shape[1], latent_dim=min(16, Xs.shape[1]//2))
    early = EarlyStopping(monitor='loss', patience=5, restore_best_weights=True)
    model.fit(Xs, Xs, epochs=200, batch_size=64, callbacks=[early], verbose=1)
    recon = model.predict(Xs)
    mse = np.mean(np.square(Xs - recon), axis=1)
    thresh_p99 = float(np.percentile(mse, 99))
    thresh_mean3 = float(np.mean(mse) + 3*np.std(mse))
    threshold = max(thresh_p99, thresh_mean3)
    model.save("models/autoencoder.keras", save_format="keras")
    np.save(SCALER_PATH, {'mean': scaler.mean_, 'scale': scaler.scale_, 'columns': feature_cols}, allow_pickle=True)
    with open(THRESH_PATH, 'w') as f:
        json.dump({'threshold': threshold, 'method':'max(p99,mean+3std)', 'feature_cols': feature_cols}, f)
    print("Training done. Model saved:", MODEL_PATH)
    print("Threshold:", threshold)
    conn.close()

if __name__ == '__main__':
    main()