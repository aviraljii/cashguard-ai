# Cash-flow forecasting engine

## Cash-flow source of truth

`bank_transactions` is the only financial-event source used by the forecasting engine. A bank-ledger `credit` is daily cash inflow and a `debit` is daily cash outflow. This includes invoice receipts, expense payments, supplier payments, and independent bank activity exactly once. The engine does not separately add `invoice_payments`, `expenses`, `purchases`, or `sales`, because doing so would double-count cash movements already recorded in the bank ledger.

Daily net cash flow is `cash_inflow - cash_outflow`. The query creates explicit zero-flow dates between the first and last bank transaction and excludes future-dated ledger rows, so only movements known at forecast time are used. It does not derive or invent an opening or current cash balance.

## Modelling and leakage control

The target is the current day's `net_cash_flow`. Every rolling feature is shifted one day before calculating its 7- or 30-day value, and lag features use only prior days. Calendar features and a `days_since_series_start` trend feature are known before the target date. Data is split chronologically 60%/20%/20% into train, validation, and test sets. A seven-day seasonal-naive baseline is compared against XGBoost using MAE, RMSE, and R². The persisted model is selected by validation RMSE and refit on train plus validation data.

The predictor supports 7, 30, 60, and 90-day recursive net-cash-flow forecasts. It returns `predicted_inflow` and `predicted_outflow` as `null`: there is no independently trained component model, so inventing components would be misleading. Inflow/outflow rolling inputs remain based on actual observed cash history while net-flow lags update from earlier forecasts.

## Cash shortage limitation

Cash shortage detection is deliberately out of scope for this model. The schema does not supply a verified current cash balance or a minimum-cash threshold, so neither an opening balance nor a shortage threshold is fabricated. A future balance-reconciliation and policy step must supply both inputs before shortage detection can be added.
