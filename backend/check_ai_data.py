import pymysql

BUSINESS_ID = "9ae1ca9a-c01b-423f-8f5c-7af4a702a6f1"

conn = pymysql.connect(
    host="127.0.0.1",
    port=3406,
    user="root",
    password="Mumma@5417",
    database="cashguard_ai",
    cursorclass=pymysql.cursors.DictCursor,
)

cur = conn.cursor()

print("\n=== EXPENSES ===")
cur.execute("""
    SELECT
        COUNT(*) AS total,
        MIN(expense_date) AS first_date,
        MAX(expense_date) AS last_date,
        COALESCE(SUM(amount), 0) AS total_amount
    FROM expenses
    WHERE business_id = %s
""", (BUSINESS_ID,))
print(cur.fetchone())

print("\n=== INVOICES ===")
cur.execute("""
    SELECT
        COUNT(*) AS total,
        MIN(invoice_date) AS first_date,
        MAX(invoice_date) AS last_date,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        COALESCE(SUM(amount_paid), 0) AS amount_paid,
        COALESCE(
            SUM(GREATEST(total_amount - amount_paid, 0)),
            0
        ) AS outstanding
    FROM invoices
    WHERE business_id = %s
""", (BUSINESS_ID,))
print(cur.fetchone())

print("\n=== PAYMENTS FOR BUSINESS ===")
cur.execute("""
    SELECT
        COUNT(*) AS total,
        MIN(p.created_at) AS first_date,
        MAX(p.created_at) AS last_date,
        COALESCE(SUM(p.amount), 0) AS total_amount
    FROM payments p
    INNER JOIN invoices i
        ON p.invoice_id = i.id
    WHERE i.business_id = %s
""", (BUSINESS_ID,))
print(cur.fetchone())

print("\n=== RISK RESULTS FOR BUSINESS ===")
cur.execute("""
    SELECT
        r.id,
        r.payment_id,
        r.risk_score,
        r.risk_level,
        r.probability,
        r.model_version,
        r.prediction_source,
        r.signals,
        r.created_at,
        p.amount AS payment_amount,
        p.invoice_id,
        i.invoice_number,
        i.business_id
    FROM risk_results r
    INNER JOIN payments p
        ON r.payment_id = p.id
    INNER JOIN invoices i
        ON p.invoice_id = i.id
    WHERE i.business_id = %s
    ORDER BY r.created_at DESC
""", (BUSINESS_ID,))

rows = cur.fetchall()

for row in rows:
    print(row)

conn.close()
