# CashGuard AI ML data contract

All model datasets are derived from MySQL and must use a time-based train/validation split. Monetary fields are INR amounts, dates are calendar dates, and no future event may be used when constructing a historical feature row.

| Future model | Primary source fields | Planned target |
|---|---|---|
| Payment delay | invoices, invoice_payments, customers, sales | `last_payment_date - due_date > 0`, or days late |
| Cash flow forecast | daily_cash_flow, bank_transactions, expenses | next-day / next-week net cash flow |
| Cash shortage risk | daily_cash_flow, invoices | balance below configured minimum in forecast horizon |
| Transaction anomaly | bank_transactions | anomaly label from reviewed transactions; interim unsupervised score |
| Demand forecast | sales, sale_items, products, inventory_transactions | product quantity for a future day/week |
| Customer churn | sales, invoices, customers | no completed order in a defined future inactivity window |

Key payment features are invoice amount, issue/due date, customer historical average delay, late-payment rate, outstanding ratio, payment terms, order frequency, recency, and monetary value. Cash-flow features include date, inflows, outflows, net flow, closing balance, expense category, and invoice receivables. Demand features include product/category, quantities, price, date, seasonality, and inventory movements. Transaction anomaly features use amount, debit/credit type, category, party references, rolling historical average, amount deviation, and z-score.

Assumptions: one business is seeded in Phase 1; bank transaction links are optional because statements may not reconcile perfectly; a production labelling workflow will be required before supervised anomaly training.
