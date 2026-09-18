# CashGuard AI database foundation

This MySQL 8.0 database is the historical financial system of record for one MSME and provides clean, relational inputs for future CashGuard AI models. Money is stored as `DECIMAL(14,2)` and all identifiers are UUID strings.

## Tables and relationships

`businesses` owns customers, suppliers, products, sales, purchases, invoices, expenses, bank transactions, and inventory transactions. A customer has sales and invoices; a sale has `sale_items`; an invoice can have several `invoice_payments`. A supplier has purchases, each with `purchase_items`. Products participate in sale/purchase lines and inventory movements. Bank transactions can reference a customer, supplier, invoice payment, or expense where that link is known.

## Business rules

Invoice due dates cannot precede invoice dates, paid amounts cannot exceed invoice totals, and all transaction amounts are positive with debit/credit determining direction. Customer risk segments are seed-only behavioural labels used to create credible payment history; they are not a future model input at prediction time. The seed keeps some invoices unpaid and records split payments so outstanding and delay features remain meaningful.

## ML-ready datasets

`customer_payment_features` aggregates invoice/payment history for payment-delay and churn work. `daily_cash_flow` provides daily inflow, outflow, net flow, and cumulative balance for cash forecasting and shortage risk. `customer_activity_features` is RFM-style purchase activity for churn. `transaction_anomaly_features` calculates category/type rolling baseline deviations for anomaly detection. Sales, sale items, and inventory history provide daily product demand and replenishment signals.
