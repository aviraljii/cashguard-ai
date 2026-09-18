-- CashGuard daily cash-flow source of truth (MySQL 8.0+).
--
-- Each bank_transactions row is one actual cash movement. Invoice payments,
-- expenses, purchases, and sales are intentionally not unioned here because
-- their settled cash movements are already represented in the bank ledger.
-- This read-only query returns a continuous calendar for every business with
-- bank activity, including zero-flow dates. Future-dated ledger rows are
-- excluded: forecasts may only learn from cash movements known as of today.
WITH RECURSIVE date_bounds AS (
    SELECT
        business_id,
        MIN(transaction_date) AS first_date,
        MAX(transaction_date) AS last_date
    FROM bank_transactions
    WHERE transaction_date <= CURDATE()
    GROUP BY business_id
), calendar AS (
    SELECT business_id, first_date AS date, last_date
    FROM date_bounds

    UNION ALL

    SELECT business_id, date + INTERVAL 1 DAY, last_date
    FROM calendar
    WHERE date < last_date
), daily_ledger AS (
    SELECT
        business_id,
        transaction_date AS date,
        SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END) AS daily_inflow,
        SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END) AS daily_outflow
    FROM bank_transactions
    WHERE transaction_date <= CURDATE()
    GROUP BY business_id, transaction_date
)
SELECT
    c.business_id,
    c.date,
    COALESCE(l.daily_inflow, 0) AS cash_inflow,
    COALESCE(l.daily_outflow, 0) AS cash_outflow,
    COALESCE(l.daily_inflow, 0) - COALESCE(l.daily_outflow, 0) AS net_cash_flow
FROM calendar c
LEFT JOIN daily_ledger l
    ON l.business_id = c.business_id
   AND l.date = c.date
ORDER BY c.business_id, c.date;
