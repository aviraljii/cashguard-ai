# Customer Payment Delay Risk

The model predicts whether a newly issued invoice will be paid after its due date. Its target is `late_payment_target`: `1` when that invoice's final observed payment date is later than its due date, otherwise `0`.

Each training row is an invoice-time snapshot. The feature period ends strictly before `as_of_date` (the invoice issue date). A row is eligible only after a 30-day post-due observation window: invoices paid in full by their due date are labelled `0`; invoices paid late, partially paid, or still unpaid after that window are labelled `1`. This is business-valid because a finance team can know prior invoices, receipts, and outstanding exposure when issuing an invoice, but cannot know the new invoice's eventual payment date. Invoices still inside the observation window are excluded rather than assigned a premature final label.

Selected inputs are the current invoice amount/terms and customer history: invoice volume/value, historic late-payment rate and delay, historic paid count, outstanding amount/ratio, and account age. These variables measure exposure, demonstrated payment discipline, and existing receivables. Customer seed `risk_segment`, current invoice status, current/future payment dates, and target-period outstanding balances are intentionally excluded.

Rows are ordered by `as_of_date`; the oldest 80% train the models and the newest 20% test them. The logistic-regression baseline uses balanced class weights. XGBoost uses a training-set `scale_pos_weight`. The selected model is chosen by test ROC-AUC (then F1), not accuracy.

Run with the required `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` environment variables set:

```powershell
& .\ml\.venv\Scripts\python.exe .\ml\training\train_payment_delay.py
```

The generated model is `ml/models/payment_delay_risk_model.joblib`; its feature metadata and ranked importance are saved alongside it. `PaymentDelayPredictor` returns the probability, its 0–100 rounded score, and Low (<0.34), Medium (<0.67), or High category for a supplied feature record.
