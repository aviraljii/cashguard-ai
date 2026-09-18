-- Invoice facts and payment aggregates; payment rows are aggregated before joining.
WITH payment_totals AS (
    SELECT invoice_id, SUM(amount) AS total_paid, MAX(payment_date) AS last_payment_date,
           COUNT(*) AS payment_count
    FROM invoice_payments WHERE payment_date <= CURDATE() GROUP BY invoice_id
),
invoice_base AS (
    SELECT i.id AS invoice_id, i.customer_id, i.invoice_date, i.due_date,
           i.total_amount AS invoice_amount, c.payment_terms_days,
           COALESCE(pt.total_paid, 0) AS total_paid, pt.last_payment_date,
           COALESCE(pt.payment_count, 0) AS payment_count
    FROM invoices i JOIN customers c ON c.id=i.customer_id
    LEFT JOIN payment_totals pt ON pt.invoice_id=i.id
    WHERE i.status <> 'void' AND i.invoice_date <= CURDATE()
)
SELECT b.*,
       GREATEST(b.invoice_amount-b.total_paid, 0) AS outstanding_amount,
       DATEDIFF(CURDATE(), b.due_date) AS days_until_due,
       AVG(CASE WHEN hp.last_payment_date > h.due_date THEN DATEDIFF(hp.last_payment_date,h.due_date) ELSE 0 END) AS historical_average_payment_delay,
       COALESCE(SUM(hp.last_payment_date > h.due_date) / NULLIF(SUM(hp.last_payment_date IS NOT NULL),0),0) AS historical_late_payment_rate,
       AVG(CASE WHEN hp.last_payment_date IS NOT NULL THEN DATEDIFF(hp.last_payment_date,h.invoice_date) END) AS average_settlement_time,
       COALESCE(SUM(hp.last_payment_date > h.due_date),0) AS previous_late_payment_count
FROM invoice_base b
LEFT JOIN invoices h ON h.customer_id=b.customer_id AND h.invoice_date < b.invoice_date AND h.status <> 'void'
LEFT JOIN payment_totals hp ON hp.invoice_id=h.id
GROUP BY b.invoice_id,b.customer_id,b.invoice_date,b.due_date,b.invoice_amount,b.payment_terms_days,b.total_paid,b.last_payment_date,b.payment_count;
