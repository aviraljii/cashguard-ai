# Inventory Intelligence Engine

## Purpose and architecture

The Inventory Intelligence Engine is a read-only, deterministic product-intelligence layer. It combines product demand, product movement, and inventory-transaction ledger data into one response. No new ML model is used: the available history supports transparent statistical and business rules without adding a model that cannot be validated or maintained.

## Actual data sources

The engine uses only these schema columns:

- `products`: `id`, `name`, `category`, `status`
- `sales`: `id`, `sale_date`, `status`
- `sale_items`: `sale_id`, `product_id`, `quantity`
- `inventory_transactions`: `product_id`, `transaction_date`, `quantity_change`

`inventory_intelligence.sql` includes only active products and excludes future sales and ledger transactions. Product demand is calculated from `sale_items.quantity` joined to completed sales. It does not sum sales-header values, so product demand cannot multiply sales revenue.

## Data measures

The query returns historical and 7/30/90-day sold units, the prior 30-day units, average daily demand from first sale through today, last sale date, days since last sale, ledger transaction count, and a derived balance (`SUM(quantity_change)`).

## Business rules

### Demand trend

The engine compares recent 30-day units with the immediately previous 30 days:

- `No Recent Demand`: recent units = 0
- `Increasing`: prior units = 0 and recent units > 0, or change is at least +25%
- `Decreasing`: change is at most -25%
- `Stable`: all other cases

`change = (recent_30 - previous_30) / previous_30` when prior demand is positive.

### Movement

Movement is based on positive 90-day units sold across the active product portfolio:

- `No Movement`: no 90-day units sold
- `Slow Moving`: at or below the 25th percentile
- `Fast Moving`: at or above the 75th percentile
- `Normal Moving`: between those thresholds

### Stock availability and risks

A balance is available only when the product has ledger activity and its transaction sum is non-negative. The reported quantity is explicitly `derived_from_inventory_transaction_ledger`; it assumes the ledger is complete because the schema contains no separate opening-balance field.

Demand used for stock coverage is `max(historical average daily demand, recent_30_day_units / 30)`. This protects against a rising recent run rate. `estimated_days_of_stock = current_quantity / demand_rate` when demand is positive.

Stock-out categories are Critical at ≤7 days, High at ≤14, Medium at ≤30, and Low above 30 days. With no demand the risk is Low. Overstock is Critical for a positive balance with no movement, or more than 180 days of coverage for slow/no-movement products; High at more than 120 days combined with slow movement or declining demand; Medium at more than 90 days; otherwise Low.

### Reorder recommendation

Supplier lead time is not stored. The engine never invents it or an order quantity. It returns a review recommendation when coverage is ≤30 days, otherwise no-reorder-needed based on observed demand; every quantity is `null`. If balance data is unavailable, it returns `insufficient_inventory_balance_data`.

## Signals

Signals are deterministic and emitted only when supported: increasing/decreasing/no recent demand, fast movement, high/critical stock-out risk, and high/critical overstock risk.

## Example output

```json
{
  "product_id": "...",
  "product": {"name": "Example", "category": "Staples"},
  "demand": {"average_daily_demand": 1.2, "recent_30_day_demand": 40, "trend": "Increasing"},
  "movement": {"category": "Fast Moving"},
  "stock": {
    "status": "derived_from_inventory_transaction_ledger",
    "current_quantity": 20,
    "estimated_days_of_stock": 16.67,
    "stockout_risk": {"score": 45, "category": "Medium"},
    "overstock_risk": {"score": 10, "category": "Low"}
  },
  "reorder": {"status": "review_reorder_without_lead_time", "recommended_order_quantity": null},
  "signals": ["Demand is increasing", "Product is fast moving"]
}
```

## Limitations

The engine is not an ML forecast. Current quantity depends on complete historical inventory-transaction recording; without activity or with a negative derived balance it is unavailable. It has no supplier lead time, safety-stock policy, stock reservation, opening balance, or sale-time cost allocation, so it does not produce reorder quantities or profitability/cost claims.
