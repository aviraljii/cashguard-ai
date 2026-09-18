USE cashguard_ai;

CREATE OR REPLACE VIEW customer_payment_features AS
WITH payment_totals AS (
    SELECT
        invoice_id,
        SUM(amount) AS paid_amount,
        MAX(payment_date) AS last_payment_date
    FROM invoice_payments
    GROUP BY invoice_id
),
base AS (
    SELECT
        i.*,
        COALESCE(p.paid_amount, 0) AS paid_amount,
        p.last_payment_date
    FROM invoices i
    LEFT JOIN payment_totals p
        ON p.invoice_id = i.id
)
SELECT
    c.id AS customer_id,

    COUNT(b.id) AS total_invoices,

    COUNT(DISTINCT b.sale_id) AS total_orders,

    COALESCE(SUM(b.total_amount), 0) AS total_invoice_value,

    COALESCE(AVG(b.total_amount), 0) AS average_invoice_amount,

    COALESCE(
        AVG(
            CASE
                WHEN b.last_payment_date IS NOT NULL
                     AND b.last_payment_date > b.due_date
                THEN DATEDIFF(b.last_payment_date, b.due_date)
                ELSE 0
            END
        ),
        0
    ) AS average_payment_delay_days,

    COALESCE(
        MAX(
            CASE
                WHEN b.last_payment_date IS NOT NULL
                     AND b.last_payment_date > b.due_date
                THEN DATEDIFF(b.last_payment_date, b.due_date)
                ELSE 0
            END
        ),
        0
    ) AS max_payment_delay_days,

    SUM(
        CASE
            WHEN b.last_payment_date > b.due_date
            THEN 1
            ELSE 0
        END
    ) AS late_payment_count,

    COALESCE(
        SUM(
            CASE
                WHEN b.last_payment_date > b.due_date
                THEN 1
                ELSE 0
            END
        )
        /
        NULLIF(
            SUM(
                CASE
                    WHEN b.last_payment_date IS NOT NULL
                    THEN 1
                    ELSE 0
                END
            ),
            0
        ),
        0
    ) AS late_payment_rate,

    COALESCE(
        SUM(
            GREATEST(
                b.total_amount - b.paid_amount,
                0
            )
        ),
        0
    ) AS outstanding_amount,

    COALESCE(
        SUM(
            GREATEST(
                b.total_amount - b.paid_amount,
                0
            )
        )
        /
        NULLIF(
            SUM(b.total_amount),
            0
        ),
        0
    ) AS outstanding_ratio,

    COALESCE(
        AVG(
            CASE
                WHEN b.last_payment_date IS NOT NULL
                THEN DATEDIFF(
                    b.last_payment_date,
                    b.invoice_date
                )
                ELSE NULL
            END
        ),
        0
    ) AS average_days_to_pay

FROM customers c
LEFT JOIN base b
    ON b.customer_id = c.id

GROUP BY c.id;
SELECT *
FROM customer_payment_features
LIMIT 10;