# Sales forecasting engine

## Data source and target

The daily series is derived only from the `sales` header table. Completed sales with `sale_date <= CURDATE()` are grouped by date: `SUM(total_amount)` is `daily_sales_amount` and `COUNT(*)` is `daily_order_count`. The model's target is next daily `daily_sales_amount`.

`sale_items` and `products` are not joined because a header sale may have several item rows. Summing a header's `total_amount` after that join would multiply revenue. Non-completed and future-dated sales are excluded. The SQL expands the observed date range into a complete calendar, filling genuine no-sale days with zero.

## Features and leakage control

Features are `sales_lag_1`, `sales_lag_7`, `sales_lag_14`, `sales_lag_30`; 7/14/30-day prior sales averages; 7/30-day prior order-count averages; day of week, day of month, month, and `days_since_series_start`. Every rolling feature first shifts the series by one day, so it contains no target-day sales or orders.

Daily aggregation is retained because the live data has a dense daily order history. A weekly model is therefore unnecessary at present.

## Model and evaluation

Data is ordered by date and split 60%/20%/20% into train, validation, and test sets. The weekly seasonal-naive baseline (sales from seven days earlier) and XGBoost regression are evaluated with MAE, RMSE, R², and MAPE. MAPE is calculated only for non-zero actual-sales rows, and the number of excluded zero rows is recorded.

The saved model is selected solely by validation RMSE and refit using training plus validation rows. The detailed quality report, split dates, metrics, and sample forecast are stored in `ml/evaluation/sales_forecast/` after training.

## Prediction use and limitations

`SalesForecastPredictor` supports 7, 30, 60, and 90-day recursive forecasts. Each item contains `forecast_date`, `predicted_sales`, and `predicted_orders`. `predicted_orders` is `null`: order count is used as an observed-history feature but has no independently trained forecast model.

Longer forecasts compound prediction error because prior predicted sales become future lag inputs. The model reflects only patterns present in completed sales; it does not know planned promotions, stockouts, new customers, pricing changes, returns, or future orders.
