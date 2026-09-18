-- CashGuard daily sales-revenue dataset (MySQL 8.0+).
--
-- Revenue comes directly from one completed sales row's total_amount. sale_items
-- is deliberately not joined: a sale can have multiple lines, which would
-- multiply its header total and double-count revenue. Future-dated rows and
-- non-completed sales are excluded because they are not realised sales.
WITH RECURSIVE date_bounds AS (
    SELECT
        business_id,
        MIN(sale_date) AS first_date,
        MAX(sale_date) AS last_date
    FROM sales
    WHERE status = 'completed'
      AND sale_date <= CURDATE()
    GROUP BY business_id
), calendar AS (
    SELECT business_id, first_date AS date, last_date
    FROM date_bounds

    UNION ALL

    SELECT business_id, date + INTERVAL 1 DAY, last_date
    FROM calendar
    WHERE date < last_date
), daily_sales AS (
    SELECT
        business_id,
        sale_date AS date,
        SUM(total_amount) AS daily_sales_amount,
        COUNT(*) AS daily_order_count
    FROM sales
    WHERE status = 'completed'
      AND sale_date <= CURDATE()
    GROUP BY business_id, sale_date
)
SELECT
    c.business_id,
    c.date,
    COALESCE(s.daily_sales_amount, 0) AS daily_sales_amount,
    COALESCE(s.daily_order_count, 0) AS daily_order_count
FROM calendar c
LEFT JOIN daily_sales s
    ON s.business_id = c.business_id
   AND s.date = c.date
ORDER BY c.business_id, c.date;
