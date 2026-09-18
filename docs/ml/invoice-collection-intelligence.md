# Invoice & Collection Intelligence

## Data facts

The engine reads `invoices` (`id`, `customer_id`, `invoice_date`, `due_date`, `total_amount`, `status`), `invoice_payments` (`invoice_id`, `payment_date`, `amount`), and `customers` (`id`, `payment_terms_days`). Payments are aggregated before joining, avoiding duplicated amounts. Void and future invoices/payments are excluded.

## Business rules

Outstanding amount is `max(invoice_amount - total_paid, 0)`. Fully paid invoices are always `Paid`; remaining balances are `Not Due` (>7 days), `Due Soon` (0–7), `Overdue` (past due/unpaid), or `Partially Paid` (past due/partially settled). Historical behavior uses only earlier invoices for the same customer.

Collection priority is a 0–100 weighted score: normalized outstanding balance 35%, overdue days capped at 90 days 30%, existing payment-delay score 25%, and invoice age capped at 180 days 10%. If payment risk cannot be scored, the known 75% is rescaled rather than assigning zero risk. Categories are Low <25, Medium <50, High <75, Critical ≥75. Paid invoices need no action; overdue/priority states determine monitor, follow-up, urgent, or critical collection recommendations.

## Existing ML prediction

Only `PaymentDelayPredictor` and `payment_delay_risk_model.joblib` are reused. Its historical risk is distinct from the current overdue state. Unscorable invoices return `payment_risk.status = "unavailable"` with null probability and score.

## Limitations

No recovery prediction, customer contact history, promise-to-pay data, or collection lead time is stored. Recommendations are deterministic and do not guarantee payment recovery.
