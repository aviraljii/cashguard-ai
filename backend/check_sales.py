import pymysql

conn = pymysql.connect(
    host="127.0.0.1",
    port=3406,
    user="root",
    password="Mumma@5417",
    database="cashguard_ai",
    cursorclass=pymysql.cursors.DictCursor,
)

cur = conn.cursor()

cur.execute("""
    SELECT
        COUNT(*) AS total,
        MIN(sale_date) AS first_date,
        MAX(sale_date) AS last_date,
        COUNT(DISTINCT business_id) AS businesses
    FROM sales
""")

print("\nTOTAL SALES:")
print(cur.fetchone())

cur.execute("""
    SELECT
        business_id,
        COUNT(*) AS total,
        MIN(sale_date) AS first_date,
        MAX(sale_date) AS last_date,
        COALESCE(SUM(total_amount), 0) AS amount
    FROM sales
    GROUP BY business_id
    ORDER BY total DESC
    LIMIT 10
""")

print("\nBUSINESS SALES:")
for row in cur.fetchall():
    print(row)

conn.close()
