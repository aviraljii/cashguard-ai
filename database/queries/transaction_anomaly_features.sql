-- CashGuard transaction-level anomaly feature dataset (MySQL 8.0+).
-- bank_transactions is the sole source because each row is an actual ledger
-- movement. Related invoices, expenses, and sales are intentionally not
-- unioned: they can represent the same cash event. Historical statistics end
-- on the calendar day before the current transaction date, preventing leakage.
WITH RECURSIVE base AS (
    SELECT id AS transaction_id, business_id, transaction_date, transaction_type,
           category, amount, supplier_id
    FROM bank_transactions
    WHERE transaction_date <= CURDATE()
), bounds AS (
    SELECT business_id, MIN(transaction_date) AS first_date, MAX(transaction_date) AS last_date
    FROM base GROUP BY business_id
), calendar AS (
    SELECT business_id, first_date AS date, last_date FROM bounds
    UNION ALL
    SELECT business_id, date + INTERVAL 1 DAY, last_date FROM calendar WHERE date < last_date
), category_keys AS (
    SELECT DISTINCT business_id, transaction_type, category FROM base
), type_keys AS (
    SELECT DISTINCT business_id, transaction_type FROM base
), category_daily AS (
    SELECT business_id, transaction_date AS date, transaction_type, category,
           COUNT(*) AS transaction_count, SUM(amount) AS amount_sum,
           SUM(amount * amount) AS amount_sum_squares
    FROM base GROUP BY business_id, transaction_date, transaction_type, category
), type_daily AS (
    SELECT business_id, transaction_date AS date, transaction_type, COUNT(*) AS transaction_count
    FROM base GROUP BY business_id, transaction_date, transaction_type
), category_history AS (
    SELECT c.business_id, c.date, k.transaction_type, k.category,
           SUM(COALESCE(d.transaction_count, 0)) OVER (PARTITION BY c.business_id, k.transaction_type, k.category ORDER BY c.date ROWS BETWEEN 30 PRECEDING AND 1 PRECEDING) AS historical_transaction_count_30d,
           SUM(COALESCE(d.amount_sum, 0)) OVER (PARTITION BY c.business_id, k.transaction_type, k.category ORDER BY c.date ROWS BETWEEN 30 PRECEDING AND 1 PRECEDING) AS historical_amount_sum_30d,
           SUM(COALESCE(d.amount_sum_squares, 0)) OVER (PARTITION BY c.business_id, k.transaction_type, k.category ORDER BY c.date ROWS BETWEEN 30 PRECEDING AND 1 PRECEDING) AS historical_amount_sum_squares_30d
    FROM calendar c JOIN category_keys k ON k.business_id = c.business_id
    LEFT JOIN category_daily d ON d.business_id = c.business_id AND d.date = c.date
        AND d.transaction_type = k.transaction_type AND d.category = k.category
), type_history AS (
    SELECT c.business_id, c.date, k.transaction_type,
           SUM(COALESCE(d.transaction_count, 0)) OVER (PARTITION BY c.business_id, k.transaction_type ORDER BY c.date ROWS BETWEEN 30 PRECEDING AND 1 PRECEDING) AS type_transaction_count_30d
    FROM calendar c JOIN type_keys k ON k.business_id = c.business_id
    LEFT JOIN type_daily d ON d.business_id = c.business_id AND d.date = c.date AND d.transaction_type = k.transaction_type
), enriched AS (
    SELECT b.*, h.historical_transaction_count_30d, h.historical_amount_sum_30d,
           h.historical_amount_sum_squares_30d, t.type_transaction_count_30d,
           h.historical_amount_sum_30d / NULLIF(h.historical_transaction_count_30d, 0) AS rolling_average_amount_30d,
           CASE WHEN h.historical_transaction_count_30d > 1 THEN SQRT(GREATEST(
               (h.historical_amount_sum_squares_30d - POW(h.historical_amount_sum_30d, 2) / h.historical_transaction_count_30d) /
               (h.historical_transaction_count_30d - 1), 0
           )) END AS rolling_stddev_amount_30d
    FROM base b JOIN category_history h ON h.business_id = b.business_id AND h.date = b.transaction_date
        AND h.transaction_type = b.transaction_type AND h.category = b.category
    JOIN type_history t ON t.business_id = b.business_id AND t.date = b.transaction_date AND t.transaction_type = b.transaction_type
)
SELECT transaction_id, business_id, transaction_date, transaction_type, category, amount,
       CASE WHEN transaction_type = 'credit' THEN 1 ELSE 0 END AS is_credit,
       CASE WHEN supplier_id IS NOT NULL THEN 1 ELSE 0 END AS has_supplier_context,
       DAYOFWEEK(transaction_date) - 1 AS day_of_week, DAYOFMONTH(transaction_date) AS day_of_month,
       MONTH(transaction_date) AS month, LOG(1 + amount) AS log_amount,
       historical_transaction_count_30d, rolling_average_amount_30d, rolling_stddev_amount_30d,
       amount / NULLIF(rolling_average_amount_30d, 0) AS transaction_amount_relative_to_history,
       (amount - rolling_average_amount_30d) / NULLIF(rolling_stddev_amount_30d, 0) AS transaction_amount_zscore,
       historical_transaction_count_30d / 30.0 AS transaction_frequency_30d,
       historical_transaction_count_30d / NULLIF(type_transaction_count_30d, 0) AS category_share_of_type_30d
FROM enriched
ORDER BY transaction_date, transaction_id;
