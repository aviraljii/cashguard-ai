# Customer Intelligence Engine

## Purpose and architecture

`CustomerIntelligenceService` is a read-only integration layer for one customer. It combines completed-sales behavior, the existing churn and segmentation models, and the existing invoice-level payment-delay model. It does not train, change, or replace any model and has no API endpoint in this phase.

## Data sources and behavioral metrics

`database/queries/customer_intelligence.sql` reads `customers` and completed `sales` headers only. It deliberately does not join `sale_items`, preventing duplicated sales-header revenue. It returns order count, sales value, average order value, first/last purchase dates, recency, active months, monthly purchase frequency, average days between orders, and 30/90-day order and sales windows.

The engine consults `invoices` only to select the newest invoice that the existing payment-delay predictor considers eligible. That predictor remains responsible for all invoice/payment feature engineering and reads `invoice_payments` itself.

## Reused ML predictions

- `customer_churn_model.joblib` through `CustomerChurnPredictor`
- `customer_segmentation_model.joblib` through `CustomerSegmentationPredictor`
- `payment_delay_risk_model.joblib` through `PaymentDelayPredictor`

Their existing scores and categories are returned unchanged. If no invoice is eligible for payment-delay scoring, `payment_risk.status` is `unavailable` and its score fields are `null`; unknown risk is never represented as low risk.

## Customer value estimate (business rule, not predicted CLV)

`estimated_customer_lifetime_value` is a transparent historical-behavior estimate:

`average_order_value × (total_orders / observed_lifetime_months) × observed_lifetime_months`

`observed_lifetime_months` is `max((last_purchase_date - first_purchase_date) / 30, 1)`. Algebraically this equals observed completed-sales revenue where orders exist. It is intentionally a stable summary of demonstrated customer value, not a future-value or predictive CLV claim.

## Profitability limitation

True customer profitability is not calculated. The schema provides current `products.cost_price`, but not a sale-time cost on `sale_items`; purchases also cannot reliably establish the cost allocated to each sale. Therefore every response reports `insufficient_cost_data` with `estimated_profit` and `margin` set to `null`.

## Priority score (business rule, not ML)

The score is a normalized weighted average on a 0–100 scale:

- churn score: 35%
- payment-delay risk score: 25%
- customer value: 20%, normalized against the current maximum completed-sales value in the portfolio
- recency: 10%, `min(recency_days / 90, 1) × 100`
- `At Risk` segment indicator: 10% (100 for that segment, otherwise 0)

If payment risk is unavailable, its 25% is excluded and the remaining weighted result is rescaled; no missing component receives an invented value. Categories are Low `<25`, Medium `25–<50`, High `50–<75`, and Critical `≥75`.

## Business signals

Signals are deterministic rules based on the returned values: elevated churn for high-priority value, payment-delay risk, `At Risk` plus 30+ day recency, and low-churn `High Value Loyal` customers. A routine-monitoring signal is used only when no higher-specificity rule applies.

## Example output

```json
{
  "customer_id": "customer-1",
  "churn": {"probability": 0.8, "score": 80.0, "risk_category": "High"},
  "segmentation": {"cluster_id": 1, "segment_name": "At Risk", "segment_score": 0.6},
  "payment_risk": {"status": "available", "probability": 0.7, "score": 70, "risk_category": "High"},
  "value": {"estimated_customer_lifetime_value": 24000.0},
  "profitability": {"status": "insufficient_cost_data", "estimated_profit": null, "margin": null},
  "priority": {"score": 72.61, "category": "High"},
  "business_signals": ["High-value customer with elevated churn risk", "Payment-delay risk requires collection attention"]
}
```

## Limitations

The value estimate is historical rather than forward-looking. Model availability and quality remain those of the reused models. Payment risk is invoice-level, so customers without an invoice that satisfies the model’s existing historical-data requirements cannot be scored for payment delay. Customer profitability requires sale-time cost or an explicit documented cost-allocation policy before it can be added.
