-- Point-in-time customer churn training data (MySQL 8.0+).
-- Target: churned = 1 when the customer has no completed sale in the 90 days
-- strictly after a snapshot. Features include only sales on/before the snapshot.
WITH RECURSIVE completed_sales AS (
    SELECT id, business_id, customer_id, sale_date, total_amount
    FROM sales WHERE status = 'completed' AND sale_date <= CURDATE()
), bounds AS (
    SELECT MIN(sale_date) AS first_sale_date, MAX(sale_date) AS last_sale_date FROM completed_sales
), snapshot_calendar AS (
    SELECT first_sale_date + INTERVAL 90 DAY AS snapshot_date, last_sale_date FROM bounds
    UNION ALL
    SELECT snapshot_date + INTERVAL 30 DAY, last_sale_date FROM snapshot_calendar
    WHERE snapshot_date + INTERVAL 30 DAY <= last_sale_date - INTERVAL 90 DAY
), sales_with_previous AS (
    SELECT cs.*, LAG(sale_date) OVER (PARTITION BY customer_id ORDER BY sale_date, id) AS previous_sale_date
    FROM completed_sales cs
), snapshot_aggregates AS (
    SELECT c.id AS customer_id, sc.snapshot_date, c.created_at,
           MAX(h.sale_date) AS last_purchase_date,
           COUNT(h.id) AS total_orders,
           COALESCE(SUM(h.total_amount), 0) AS total_sales_value,
           COALESCE(AVG(h.total_amount), 0) AS average_order_value,
           COALESCE(SUM(h.sale_date > sc.snapshot_date - INTERVAL 30 DAY), 0) AS recent_30_day_orders,
           COALESCE(SUM(CASE WHEN h.sale_date > sc.snapshot_date - INTERVAL 30 DAY THEN h.total_amount ELSE 0 END), 0) AS recent_30_day_sales,
           COALESCE(SUM(h.sale_date > sc.snapshot_date - INTERVAL 90 DAY), 0) AS recent_90_day_orders,
           COALESCE(SUM(CASE WHEN h.sale_date > sc.snapshot_date - INTERVAL 90 DAY THEN h.total_amount ELSE 0 END), 0) AS recent_90_day_sales,
           COALESCE(SUM(h.sale_date > sc.snapshot_date - INTERVAL 60 DAY AND h.sale_date <= sc.snapshot_date - INTERVAL 30 DAY), 0) AS prior_30_day_orders,
           COALESCE(SUM(CASE WHEN h.sale_date > sc.snapshot_date - INTERVAL 60 DAY AND h.sale_date <= sc.snapshot_date - INTERVAL 30 DAY THEN h.total_amount ELSE 0 END), 0) AS prior_30_day_sales,
           AVG(CASE WHEN h.previous_sale_date IS NOT NULL THEN DATEDIFF(h.sale_date, h.previous_sale_date) END) AS average_days_between_orders,
           CAST(SUBSTRING_INDEX(GROUP_CONCAT(h.total_amount ORDER BY h.sale_date DESC, h.id DESC SEPARATOR ','), ',', 1) AS DECIMAL(14,2)) AS last_purchase_amount
    FROM customers c JOIN snapshot_calendar sc ON c.created_at <= sc.snapshot_date
    JOIN sales_with_previous h ON h.customer_id = c.id AND h.sale_date <= sc.snapshot_date
    GROUP BY c.id, sc.snapshot_date, c.created_at
)
SELECT a.customer_id, a.snapshot_date,
       DATEDIFF(a.snapshot_date, a.last_purchase_date) AS recency_days,
       a.total_orders / NULLIF(GREATEST(DATEDIFF(a.snapshot_date, a.created_at), 1) / 30.0, 0) AS purchase_frequency,
       a.total_orders, a.total_sales_value, a.average_order_value,
       a.recent_30_day_orders, a.recent_30_day_sales, a.recent_90_day_orders, a.recent_90_day_sales,
       DATEDIFF(a.snapshot_date, a.created_at) AS historical_customer_age_days,
       COALESCE(a.average_days_between_orders, 0) AS average_days_between_orders,
       a.last_purchase_amount,
       (a.recent_30_day_sales - a.prior_30_day_sales) / NULLIF(a.prior_30_day_sales, 0) AS sales_growth_rate,
       (a.recent_30_day_orders - a.prior_30_day_orders) / NULLIF(a.prior_30_day_orders, 0) AS order_frequency_trend,
       CASE WHEN EXISTS (
           SELECT 1 FROM completed_sales f WHERE f.customer_id = a.customer_id
             AND f.sale_date > a.snapshot_date AND f.sale_date <= a.snapshot_date + INTERVAL 90 DAY
       ) THEN 0 ELSE 1 END AS churn_target
FROM snapshot_aggregates a
ORDER BY a.snapshot_date, a.customer_id;
