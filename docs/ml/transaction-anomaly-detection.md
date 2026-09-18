# Transaction anomaly detection engine

## Problem and data source

This first unsupervised detector scores unusual actual cash movements from `bank_transactions`. A bank-ledger row has a transaction date, debit/credit direction, category, amount, and sometimes supplier context. `expenses`, `invoice_payments`, and `sales` are not combined: they are business records that can relate to a bank movement and would create double-counting risk.

Future-dated ledger rows are excluded. A transaction’s historical features use the preceding 30 complete calendar days only, never its own date or later dates.

## Features

The model uses log amount; debit/credit direction; supplier-context indicator; day of week, day of month, and month; historical category-and-direction count; 30-day historical amount mean and standard deviation; amount-to-history ratio; historical amount z-score; transaction frequency; category share within its direction; category and direction themselves; and an indicator that historical data exists.

No labels identify trusted fraud or error events, so anomaly classification quality metrics such as accuracy, precision, recall, and F1 are intentionally not reported.

## Detection methods and scores

The statistical baseline flags a transaction only when there are at least 10 comparable historical transactions and its absolute historical amount z-score is at least 3. It is a review aid, not ground truth.

Isolation Forest is trained with 300 trees and contamination 0.03. It is fitted on the first chronological 80% of the usable ledger and assessed on the final 20%; the persisted production model is then refitted on all usable current data. Its anomaly score is the negative `score_samples` value: higher means more unusual. It is not a probability.

Risk categories are score bands based on the production score distribution: Normal below the 80th percentile, Low from the 80th, Medium from the 90th, and High at or above the Isolation Forest anomaly threshold (the 97th-percentile contamination boundary).

## Example review observations

The training report records the exact top-scoring rows. In the current seed data, several High findings are supplier-payment debits around 114k–130k, roughly 2.9x–3.4x their preceding 30-day supplier-payment average; one 129,726.60 payment was 3.1 standard deviations above that history. A credit transfer of 3,636.84 scored highly because it was 6.2x a sparse prior category/direction average. These are review priorities, not confirmed errors or fraud.

## Output and limitations

`TransactionAnomalyPredictor.predict(transaction_id)` returns the score, anomaly decision, risk category, and evidence grounded in the transaction’s amount, prior category/direction history, and category frequency. It supports only transactions on or before the current date.

The seed ledger uses dates rather than timestamps, so within-day sequence is unavailable; the engine deliberately excludes the entire current date from all historical aggregates. An anomaly score is a prioritization signal, not evidence of fraud. It cannot identify issues that are normal in the historical data, and it does not yet use payee names, transaction descriptions, account balances, approvals, or verified investigation labels.
