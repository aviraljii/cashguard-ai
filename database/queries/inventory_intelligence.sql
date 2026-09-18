-- Product-level inventory intelligence. Demand uses completed-sale line quantities;
-- sales-header amounts are intentionally not selected or summed here.
WITH sales_demand AS (
    SELECT
        si.product_id,
        SUM(si.quantity) AS total_units_sold,
        SUM(CASE WHEN s.sale_date >= CURDATE() - INTERVAL 7 DAY THEN si.quantity ELSE 0 END)
            AS recent_7_day_units_sold,
        SUM(CASE WHEN s.sale_date >= CURDATE() - INTERVAL 30 DAY THEN si.quantity ELSE 0 END)
            AS recent_30_day_units_sold,
        SUM(CASE WHEN s.sale_date >= CURDATE() - INTERVAL 90 DAY THEN si.quantity ELSE 0 END)
            AS recent_90_day_units_sold,
        SUM(CASE
            WHEN s.sale_date >= CURDATE() - INTERVAL 60 DAY
             AND s.sale_date < CURDATE() - INTERVAL 30 DAY
            THEN si.quantity ELSE 0
        END) AS previous_30_day_units_sold,
        MIN(s.sale_date) AS first_sale_date,
        MAX(s.sale_date) AS last_sale_date,
        COUNT(DISTINCT s.id) AS completed_sale_count
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.status = 'completed'
      AND s.sale_date <= CURDATE()
    GROUP BY si.product_id
),
inventory_ledger AS (
    SELECT
        product_id,
        SUM(quantity_change) AS derived_current_quantity,
        COUNT(*) AS inventory_transaction_count,
        MAX(transaction_date) AS last_inventory_transaction_date
    FROM inventory_transactions
    WHERE transaction_date <= CURDATE()
    GROUP BY product_id
)
SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.category,
    sd.total_units_sold,
    sd.recent_7_day_units_sold,
    sd.recent_30_day_units_sold,
    sd.recent_90_day_units_sold,
    sd.previous_30_day_units_sold,
    sd.completed_sale_count,
    sd.first_sale_date,
    sd.last_sale_date,
    CASE WHEN sd.first_sale_date IS NULL THEN NULL
         ELSE DATEDIFF(CURDATE(), sd.last_sale_date) END AS days_since_last_sale,
    CASE WHEN sd.first_sale_date IS NULL THEN 0
         ELSE sd.total_units_sold / GREATEST(DATEDIFF(CURDATE(), sd.first_sale_date), 1) END
        AS average_daily_demand,
    il.derived_current_quantity,
    il.inventory_transaction_count,
    il.last_inventory_transaction_date
FROM products p
LEFT JOIN sales_demand sd ON sd.product_id = p.id
LEFT JOIN inventory_ledger il ON il.product_id = p.id
WHERE p.status = 'active';
