-- Customer-level behavioral metrics from completed sales headers only.
-- sale_items is intentionally not joined: doing so would multiply sales-header revenue.
WITH completed_sales AS (
    SELECT id, customer_id, sale_date, total_amount
    FROM sales
    WHERE status = 'completed'
      AND sale_date <= CURDATE()
),
as_of AS (
    SELECT COALESCE(MAX(sale_date), CURDATE()) AS as_of_date
    FROM completed_sales
),
sales_with_previous AS (
    SELECT
        cs.*,
        LAG(cs.sale_date) OVER (
            PARTITION BY cs.customer_id
            ORDER BY cs.sale_date, cs.id
        ) AS previous_sale_date
    FROM completed_sales cs
)
SELECT
    c.id AS customer_id,
    a.as_of_date,
    COUNT(s.id) AS total_orders,
    COALESCE(SUM(s.total_amount), 0) AS total_sales_value,
    COALESCE(AVG(s.total_amount), 0) AS average_order_value,
    MIN(s.sale_date) AS first_purchase_date,
    MAX(s.sale_date) AS last_purchase_date,
    COALESCE(
        DATEDIFF(a.as_of_date, MAX(s.sale_date)),
        DATEDIFF(a.as_of_date, DATE(c.created_at))
    ) AS recency_days,
    COUNT(DISTINCT DATE_FORMAT(s.sale_date, '%Y-%m')) AS active_months,
    COUNT(s.id) / NULLIF(
        GREATEST(DATEDIFF(a.as_of_date, DATE(c.created_at)), 1) / 30.0,
        0
    ) AS purchase_frequency,
    COALESCE(
        AVG(
            CASE WHEN s.previous_sale_date IS NOT NULL
                THEN DATEDIFF(s.sale_date, s.previous_sale_date)
            END
        ),
        0
    ) AS average_days_between_orders,
    COALESCE(SUM(s.sale_date > a.as_of_date - INTERVAL 30 DAY), 0)
        AS recent_30_day_orders,
    COALESCE(SUM(
        CASE WHEN s.sale_date > a.as_of_date - INTERVAL 30 DAY
            THEN s.total_amount ELSE 0 END
    ), 0) AS recent_30_day_sales,
    COALESCE(SUM(s.sale_date > a.as_of_date - INTERVAL 90 DAY), 0)
        AS recent_90_day_orders,
    COALESCE(SUM(
        CASE WHEN s.sale_date > a.as_of_date - INTERVAL 90 DAY
            THEN s.total_amount ELSE 0 END
    ), 0) AS recent_90_day_sales,
    DATEDIFF(a.as_of_date, DATE(c.created_at)) AS customer_age_days
FROM customers c
CROSS JOIN as_of a
LEFT JOIN sales_with_previous s
    ON s.customer_id = c.id
WHERE c.id = %s
GROUP BY c.id, a.as_of_date, c.created_at;
