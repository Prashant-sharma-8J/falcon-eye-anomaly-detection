CREATE TABLE IF NOT EXISTS transactions (
  txn_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  txn_type VARCHAR(32) NOT NULL,
  channel VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transactions_user_created (user_id, created_at),
  INDEX idx_transactions_created (created_at)
);

CREATE TABLE IF NOT EXISTS user_features_cache (
  user_id BIGINT PRIMARY KEY,
  avg_amount_30d DECIMAL(12, 2) NOT NULL DEFAULT 0,
  txn_count_30d INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_jobs (
  job_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  txn_id BIGINT NOT NULL,
  status ENUM('pending', 'processing', 'done', 'error') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pending_jobs_status_created (status, created_at),
  CONSTRAINT fk_pending_jobs_transaction
    FOREIGN KEY (txn_id) REFERENCES transactions(txn_id)
);

CREATE TABLE IF NOT EXISTS anomalies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  txn_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  error_score DOUBLE NOT NULL,
  is_anomaly BOOLEAN NOT NULL,
  details JSON NULL,
  flagged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_anomalies_txn (txn_id),
  INDEX idx_anomalies_user_flagged (user_id, flagged_at),
  CONSTRAINT fk_anomalies_transaction
    FOREIGN KEY (txn_id) REFERENCES transactions(txn_id)
);

DROP PROCEDURE IF EXISTS mark_anomaly;

DELIMITER //
CREATE PROCEDURE mark_anomaly(
  IN p_txn_id BIGINT,
  IN p_error_score DOUBLE,
  IN p_is_anomaly BOOLEAN
)
BEGIN
  IF p_is_anomaly THEN
    INSERT INTO anomalies (txn_id, user_id, amount, error_score, is_anomaly, details)
    SELECT
      txn_id,
      user_id,
      amount,
      p_error_score,
      p_is_anomaly,
      JSON_OBJECT('decision', 'flagged')
    FROM transactions
    WHERE txn_id = p_txn_id;
  END IF;
END //
DELIMITER ;
