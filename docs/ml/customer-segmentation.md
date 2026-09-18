# Customer segmentation

Completed sales headers are aggregated to one current customer profile; sale items are not joined, preventing duplicated revenue. Features cover value, order volume, frequency, recency, age, active months, recent 30/90-day activity, order gaps, and sales growth. Customer ID is never a clustering feature.

K-Means uses log1p plus standard scaling for non-negative value/frequency features and standard scaling for growth. K=2–8 were evaluated by inertia and silhouette score. K=2 was selected: its silhouette is 0.3271, versus 0.2795–0.2889 at larger K, and it avoids small clusters.

The clusters are High Value Loyal (279, 55.8%; average revenue 77,938.10, 29.76 orders, 10.11 recency days) and At Risk (221, 44.2%; average revenue 19,930.86, 7.68 orders, 61.16 recency days). Names follow their actual profiles, not arbitrary cluster IDs. The segment score is distance-based membership closeness, not a probability.

Limitations: modest separation, behavior is based only on completed sales, and no churn/payment labels are used in clustering or current profiles. Future versions can add customer feedback, product mix, channels, and post-cluster outcome monitoring.
