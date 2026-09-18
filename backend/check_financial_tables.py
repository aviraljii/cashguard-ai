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

tables = [
    "payments",
    "expenses",
    "invoices",
    "risk_results",
]

for table in tables:
    print("\n" + "=" * 80)
    print(table.upper())
    print("=" * 80)

    try:
        cur.execute(f"DESCRIBE `{table}`")
        print("COLUMNS:")
        for row in cur.fetchall():
            print(row)

        cur.execute(f"SELECT COUNT(*) AS total FROM `{table}`")
        print("\nTOTAL:")
        print(cur.fetchone())

    except Exception as exc:
        print("ERROR:", exc)

conn.close()
