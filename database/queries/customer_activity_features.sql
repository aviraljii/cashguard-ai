CREATE OR REPLACE VIEW customer_activity_features AS
SELECT c.id AS customer_id,
 COALESCE(COUNT(s.id) / NULLIF(GREATEST(DATEDIFF(CURRENT_DATE, MIN(s.sale_date)) / 30.0, 1), 0), 0) AS order_frequency,
 COALESCE(DATEDIFF(CURRENT_DATE, MAX(s.sale_date)), 9999) AS recency,
 COALESCE(SUM(s.total_amount), 0) AS monetary_value, COALESCE(AVG(s.total_amount), 0) AS average_order_value,
 SUM(CASE WHEN s.sale_date >= CURRENT_DATE - INTERVAL 90 DAY THEN 1 ELSE 0 END) AS recent_order_count
FROM customers c LEFT JOIN sales s ON s.customer_id=c.id AND s.status='completed' GROUP BY c.id;
