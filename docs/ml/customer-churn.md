# Customer churn prediction

## Churn definition and snapshots

Churn is a point-in-time label: `churn_target = 1` when a customer has no completed sale strictly after a prediction snapshot during the following 90 days. Snapshots whose entire 90-day observation period is not available are excluded. This avoids defining older training labels from today's customer activity.

The dataset uses regular 30-day snapshot dates, beginning after 90 days of sales history. Only customers with at least one completed sale on or before the snapshot are included. Sales headers provide customer, date, and revenue. `sale_items` is not joined because it can multiply a sale header's `total_amount`; invoices and payments are not needed for purchase activity.

## Features and leakage prevention

Features are recency, monthly purchase frequency, total orders and sales value, average order value, 30/90-day order and sales activity, customer age, average days between orders, amount of an actual order on the latest purchase date, 30-day sales growth, and 30-day order-frequency trend. Each feature reads sales on or before the snapshot only. Historical gaps are derived from prior orders, never future orders.

At prediction time, the same feature contract is rebuilt at the latest completed-sales date. The result is a current churn-risk score, not a retrospective label.

## Models, split, and selection

Logistic Regression with balanced classes is the baseline. XGBoost uses `scale_pos_weight` derived from the chronological training split. Entire snapshot dates are split 60%/20%/20% into train, validation, and test, preventing snapshots from a single date appearing in more than one split.

Models are compared by validation ROC-AUC, then recall only on an exact ROC-AUC tie. Reported outputs include accuracy, precision, recall, F1, ROC-AUC, confusion matrix, and churn rate; no metric is adjusted after evaluation.

## Prediction interpretation and limitations

`CustomerChurnPredictor.predict(customer_id)` returns a model `predict_proba` output and score (probability × 100). The output has not been calibrated, so it is an uncalibrated model probability rather than an assured real-world likelihood. Risk mapping is deterministic: Low below 0.34, Medium from 0.34 to below 0.67, High at or above 0.67.

The seed data contains simulated historical behavior and only completed sales. The model cannot see future promotions, sales opportunities, service issues, product availability, refunds, customer communications, or an explicit account-closure label. A customer with no sales history is not eligible for this purchase-behavior predictor.
