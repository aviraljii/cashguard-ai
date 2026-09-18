"""Read-only MySQL database foundation checks."""
from __future__ import annotations

import os
import sys

import mysql.connector
from mysql.connector import Error

TABLES = [
    "businesses", "customers", "suppliers", "products", "sales", "sale_items",
    "purchases", "purchase_items", "invoices", "invoice_payments", "expenses",
    "bank_transactions", "inventory_transactions",
]


def connection_config() -> dict[str, object]:
    required = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError("Missing required database environment variables: " + ", ".join(missing))
    return {"host": os.environ["DB_HOST"], "port": int(os.environ["DB_PORT"]),
            "database": os.environ["DB_NAME"], "user": os.environ["DB_USER"],
            "password": os.environ["DB_PASSWORD"]}


def main() -> int:
    try:
        db = mysql.connector.connect(**connection_config())
    except (Error, RuntimeError) as error:
        print(f"FAIL: connection: {error}")
        return 1
    failed: list[str] = []
    try:
        with db.cursor() as cursor:
            cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()")
            actual = {row[0] for row in cursor}
            for table in TABLES:
                if table not in actual:
                    failed.append(f"missing table {table}")
                    continue
                cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
                print(f"{table:24} {cursor.fetchone()[0]:,}")
            checks = {
                "orphan sale items": "SELECT COUNT(*) FROM sale_items x LEFT JOIN sales p ON p.id=x.sale_id WHERE p.id IS NULL",
                "orphan payments": "SELECT COUNT(*) FROM invoice_payments x LEFT JOIN invoices p ON p.id=x.invoice_id WHERE p.id IS NULL",
                "invalid invoice paid amounts": "SELECT COUNT(*) FROM invoices WHERE amount_paid > total_amount OR amount_paid < 0",
                "duplicate invoice numbers": "SELECT COUNT(*) FROM (SELECT business_id, invoice_number FROM invoices GROUP BY business_id, invoice_number HAVING COUNT(*) > 1) q",
                "null required customer names": "SELECT COUNT(*) FROM customers WHERE name IS NULL OR customer_code IS NULL",
                "null bank amounts": "SELECT COUNT(*) FROM bank_transactions WHERE amount IS NULL OR running_balance IS NULL",
            }
            for name, sql in checks.items():
                cursor.execute(sql)
                count = cursor.fetchone()[0]
                print(f"{name}: {count}")
                if count:
                    failed.append(f"{name} ({count})")
    finally:
        db.close()
    print(("FAIL: " + "; ".join(failed)) if failed else "PASS: all required tables and integrity checks passed.")
    return int(bool(failed))


if __name__ == "__main__":
    sys.exit(main())
