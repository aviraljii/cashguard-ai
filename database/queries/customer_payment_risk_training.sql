-- One row per invoice that has completed a 30-day post-due observation
-- window. The prediction snapshot is invoice_date. Every feature event is
-- strictly before that snapshot. An invoice is late when it was not fully
-- settled by its due date, including invoices still unpaid after the window.
WITH payment_totals AS (
    SELECT invoice_id, SUM(amount) AS paid_amount, MAX(payment_date) AS last_payment_date
    FROM invoice_payments GROUP BY invoice_id
), labelled_invoices AS (
    SELECT i.id, i.customer_id, i.invoice_date AS as_of_date, i.due_date,
           i.total_amount AS invoice_amount, c.payment_terms_days,
           CASE
               WHEN COALESCE(p.paid_amount, 0) >= i.total_amount
                    AND p.last_payment_date <= i.due_date THEN 0
               ELSE 1
           END AS late_payment_target
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN payment_totals p ON p.invoice_id = i.id
    WHERE i.status <> 'void'
      AND i.due_date + INTERVAL 30 DAY <= CURRENT_DATE
), historical_invoices AS (
    SELECT li.id AS labelled_invoice_id, h.id AS historical_invoice_id,
           h.total_amount, h.due_date, hp.last_payment_date,
           COALESCE(SUM(ip.amount), 0) AS paid_before_snapshot
    FROM labelled_invoices li
    JOIN invoices h ON h.customer_id = li.customer_id
        AND h.invoice_date < li.as_of_date AND h.status <> 'void'
    LEFT JOIN payment_totals hp ON hp.invoice_id = h.id
    LEFT JOIN invoice_payments ip ON ip.invoice_id = h.id AND ip.payment_date < li.as_of_date
    GROUP BY li.id, h.id, h.total_amount, h.due_date, hp.last_payment_date
)
SELECT li.id AS invoice_id, li.customer_id, li.as_of_date,
       li.invoice_amount, li.payment_terms_days,
       COUNT(hi.historical_invoice_id) AS historical_invoice_count,
       COALESCE(SUM(hi.total_amount), 0) AS historical_total_invoice_value,
       COALESCE(AVG(hi.total_amount), 0) AS historical_average_invoice_amount,
       COALESCE(SUM(CASE WHEN hi.last_payment_date IS NOT NULL AND hi.last_payment_date < li.as_of_date THEN 1 ELSE 0 END), 0) AS historical_paid_invoice_count,
       COALESCE(SUM(CASE WHEN hi.last_payment_date < li.as_of_date AND hi.last_payment_date > hi.due_date THEN 1 ELSE 0 END), 0) AS historical_late_payment_count,
       COALESCE(SUM(CASE WHEN hi.last_payment_date < li.as_of_date AND hi.last_payment_date > hi.due_date THEN 1 ELSE 0 END) /
           NULLIF(SUM(CASE WHEN hi.last_payment_date IS NOT NULL AND hi.last_payment_date < li.as_of_date THEN 1 ELSE 0 END), 0), 0) AS historical_late_payment_rate,
       COALESCE(AVG(CASE WHEN hi.last_payment_date < li.as_of_date THEN GREATEST(DATEDIFF(hi.last_payment_date, hi.due_date), 0) END), 0) AS historical_average_payment_delay_days,
       COALESCE(MAX(CASE WHEN hi.last_payment_date < li.as_of_date THEN GREATEST(DATEDIFF(hi.last_payment_date, hi.due_date), 0) END), 0) AS historical_max_payment_delay_days,
       COALESCE(SUM(GREATEST(hi.total_amount - hi.paid_before_snapshot, 0)), 0) AS historical_outstanding_amount,
       COALESCE(SUM(GREATEST(hi.total_amount - hi.paid_before_snapshot, 0)) / NULLIF(SUM(hi.total_amount), 0), 0) AS historical_outstanding_ratio,
       li.late_payment_target
FROM labelled_invoices li
JOIN historical_invoices hi ON hi.labelled_invoice_id = li.id
GROUP BY li.id, li.customer_id, li.as_of_date, li.invoice_amount, li.due_date, li.payment_terms_days, li.late_payment_target
HAVING historical_invoice_count >= 3 AND historical_paid_invoice_count >= 2
ORDER BY li.as_of_date, li.id;
