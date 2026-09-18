"""
CashGuard AI - Realistic Indian MSME Training Data
MySQL 8.0+

Run only after:
1. cashguard_ai database exists
2. database/schema/schema.sql has been applied
"""

import os
import random
import uuid
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

import mysql.connector
from mysql.connector import Error


# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------

R = random.Random(20260812)

TODAY = date.today()
START = TODAY - timedelta(days=730)
LABEL_OBSERVATION_DAYS = 30


# ---------------------------------------------------------
# HELPERS
# ---------------------------------------------------------

def money(value):
    return Decimal(str(value)).quantize(
        Decimal(".01"),
        rounding=ROUND_HALF_UP
    )


def env(name, default=None):
    return os.getenv(name, default)


def uid():
    return str(uuid.uuid4())


def connect_db():
    """
    Connect to CashGuard AI MySQL database.
    """

    return mysql.connector.connect(
        host=env("DB_HOST", "127.0.0.1"),
        port=int(env("DB_PORT", "3406")),
        database=env("DB_NAME", "cashguard_ai"),
        user=env("DB_USER", "root"),
        password=env("DB_PASSWORD", "")
    )


def dt(index):
    return START + timedelta(days=index)


def choose_day():
    days = (TODAY - START).days

    return dt(
        int(
            R.triangular(
                0,
                days,
                days
            )
        )
    )


def insert_rows(cursor, table, columns, rows, batch_size=1000):
    """
    Bulk insert using MySQL executemany().
    """

    if not rows:
        return

    column_sql = ",".join(columns)
    placeholders = ",".join(["%s"] * len(columns))

    query = f"""
        INSERT INTO {table}
        ({column_sql})
        VALUES ({placeholders})
    """

    for start in range(0, len(rows), batch_size):
        batch = rows[start:start + batch_size]
        cursor.executemany(query, batch)


# ---------------------------------------------------------
# MAIN SEED FUNCTION
# ---------------------------------------------------------

def main():

    db = None
    cursor = None

    try:

        print("Connecting to MySQL...")

        db = connect_db()
        cursor = db.cursor()

        print("Connected to MySQL successfully.")
        print("Database: cashguard_ai")

        # -------------------------------------------------
        # CHECK DATABASE
        # -------------------------------------------------

        cursor.execute("SELECT COUNT(*) FROM businesses")

        if cursor.fetchone()[0]:
            raise RuntimeError(
                "Database is not empty. "
                "Use a newly created database for this seed."
            )

        # -------------------------------------------------
        # BUSINESS
        # -------------------------------------------------

        print("Creating business...")

        business_id = uid()

        insert_rows(
            cursor,
            "businesses",
            [
                "id",
                "legal_name",
                "display_name",
                "gstin",
                "pan",
                "industry",
                "city",
                "state",
                "opening_cash_balance"
            ],
            [
                (
                    business_id,
                    "CashGuard Demo Traders Private Limited",
                    "CashGuard Demo Traders",
                    "27AACCC1234A1Z5",
                    "AACCC1234A",
                    "FMCG wholesale",
                    "Pune",
                    "Maharashtra",
                    money(750000)
                )
            ]
        )

        # -------------------------------------------------
        # CUSTOMERS
        # -------------------------------------------------

        print("Creating 500 customers...")

        first_names = [
            "Aarav",
            "Vivaan",
            "Aditya",
            "Arjun",
            "Sai",
            "Rohan",
            "Ananya",
            "Priya",
            "Kavya",
            "Ishita"
        ]

        towns = [
            "Pune",
            "Mumbai",
            "Nashik",
            "Nagpur",
            "Thane",
            "Ahmedabad",
            "Surat",
            "Indore"
        ]

        customers = []

        for n in range(500):

            if n < 250:
                segment = "reliable"
            elif n < 425:
                segment = "moderate"
            else:
                segment = "high_risk"

            customer_id = uid()

            customers.append(
                (customer_id, segment)
            )

        customer_rows = []

        customer_payment_terms = {}

        for n, (customer_id, segment) in enumerate(customers):

            # Customers must exist before any generated sales or invoices.
            # The earliest invoice can be on START, so backdate account
            # creation beyond that point for a point-in-time-valid age.
            created_at = START - timedelta(days=R.randint(90, 730))
            payment_terms_days = R.choice([15, 30, 30, 45])
            customer_payment_terms[customer_id] = payment_terms_days

            customer_rows.append(
                (
                    customer_id,
                    business_id,
                    f"C{n + 1:04}",
                    f'{first_names[n % len(first_names)]} '
                    f'{"Enterprises" if n % 3 else "Stores"}',
                    f'9{R.randrange(100000000, 999999999)}',
                    f"customer{n + 1}@example.in",
                    towns[n % len(towns)],
                    "Maharashtra",
                    money(
                        R.choice(
                            [
                                50000,
                                100000,
                                200000,
                                500000
                            ]
                        )
                    ),
                    payment_terms_days,
                    segment,
                    created_at,
                )
            )

        insert_rows(
            cursor,
            "customers",
            [
                "id",
                "business_id",
                "customer_code",
                "name",
                "phone",
                "email",
                "city",
                "state",
                "credit_limit",
                "payment_terms_days",
                "risk_segment",
                "created_at",
            ],
            customer_rows
        )

        # -------------------------------------------------
        # SUPPLIERS
        # -------------------------------------------------

        print("Creating 50 suppliers...")

        suppliers = [
            uid()
            for _ in range(50)
        ]

        supplier_rows = []

        supplier_names = [
            "Shree",
            "Om",
            "Sai",
            "Bharat",
            "Mahalaxmi"
        ]

        for n, supplier_id in enumerate(suppliers):

            supplier_rows.append(
                (
                    supplier_id,
                    business_id,
                    f"S{n + 1:03}",
                    f"{supplier_names[n % 5]} Supplies {n + 1}",
                    f'9{R.randrange(100000000, 999999999)}',
                    f"supplier{n + 1}@example.in",
                    towns[n % len(towns)],
                    "Maharashtra",
                    R.choice([15, 30, 45])
                )
            )

        insert_rows(
            cursor,
            "suppliers",
            [
                "id",
                "business_id",
                "supplier_code",
                "name",
                "phone",
                "email",
                "city",
                "state",
                "payment_terms_days"
            ],
            supplier_rows
        )

        # -------------------------------------------------
        # PRODUCTS
        # -------------------------------------------------

        print("Creating 100 products...")

        categories = [
            "Staples",
            "Beverages",
            "Personal Care",
            "Household",
            "Snacks"
        ]

        products = []

        for n in range(100):

            cost = money(
                R.uniform(35, 900)
            )

            selling_price = money(
                cost * Decimal(
                    str(
                        R.uniform(1.15, 1.45)
                    )
                )
            )

            products.append(
                (
                    uid(),
                    categories[n % 5],
                    cost,
                    selling_price
                )
            )

        product_rows = []

        for n, (
            product_id,
            category,
            cost,
            selling_price
        ) in enumerate(products):

            product_rows.append(
                (
                    product_id,
                    business_id,
                    f"SKU-{n + 1:03}",
                    f"{category} Product {n + 1}",
                    category,
                    "piece",
                    selling_price,
                    cost,
                    R.randrange(10, 80)
                )
            )

        insert_rows(
            cursor,
            "products",
            [
                "id",
                "business_id",
                "sku",
                "name",
                "category",
                "unit",
                "selling_price",
                "cost_price",
                "reorder_level"
            ],
            product_rows
        )

        # -------------------------------------------------
        # SALES
        # -------------------------------------------------

        print("Creating 10,000 sales...")

        sales = []
        sale_items = []
        inventory_transactions = []

        # Frequently buying customers
        weighted_customers = []

        for index, customer in enumerate(customers):

            if index < 75:
                weight = 8
            elif index < 300:
                weight = 3
            else:
                weight = 1

            weighted_customers.extend(
                [customer] * weight
            )

        for n in range(10000):

            sale_id = uid()

            customer_id, _ = R.choice(
                weighted_customers
            )

            sale_date = choose_day()

            seasonal = (
                1.35
                if sale_date.month in (10, 11, 12)
                else 1.15
                if sale_date.month in (5, 6)
                else 1
            )

            product_id, _, cost, selling_price = R.choice(
                products
            )

            quantity = R.randint(
                1,
                8 if seasonal > 1 else 5
            )

            subtotal = money(
                quantity
                * selling_price
                * Decimal(str(seasonal))
            )

            tax = money(
                subtotal * Decimal(".05")
            )

            total = subtotal + tax

            sales.append(
                (
                    sale_id,
                    business_id,
                    customer_id,
                    f"SAL-{n + 1:06}",
                    sale_date,
                    "completed",
                    subtotal,
                    tax,
                    total
                )
            )

            sale_items.append(
                (
                    uid(),
                    sale_id,
                    product_id,
                    quantity,
                    selling_price,
                    0,
                    tax,
                    total
                )
            )

            inventory_transactions.append(
                (
                    uid(),
                    business_id,
                    product_id,
                    sale_date,
                    "sale",
                    -quantity,
                    cost,
                    "sale",
                    sale_id
                )
            )

        insert_rows(
            cursor,
            "sales",
            [
                "id",
                "business_id",
                "customer_id",
                "sale_number",
                "sale_date",
                "status",
                "subtotal",
                "tax_amount",
                "total_amount"
            ],
            sales
        )

        insert_rows(
            cursor,
            "sale_items",
            [
                "id",
                "sale_id",
                "product_id",
                "quantity",
                "unit_price",
                "discount_amount",
                "tax_amount",
                "line_total"
            ],
            sale_items
        )

        # -------------------------------------------------
        # INVOICES
        # -------------------------------------------------

        print("Creating 5,000 invoices...")

        customer_segments = dict(customers)

        invoices = []
        invoice_info = []

        for n, sale in enumerate(sales[::2]):

            invoice_id = uid()

            customer_id = sale[2]

            segment = customer_segments[
                customer_id
            ]

            terms = customer_payment_terms[customer_id]

            invoice_date = sale[4]

            due_date = (
                invoice_date
                + timedelta(days=terms)
            )

            invoices.append(
                (
                    invoice_id,
                    business_id,
                    customer_id,
                    sale[0],
                    f"INV-{n + 1:06}",
                    invoice_date,
                    due_date,
                    "issued",
                    sale[6],
                    sale[7],
                    sale[8],
                    0
                )
            )

            invoice_info.append(
                (
                    invoice_id,
                    customer_id,
                    segment,
                    invoice_date,
                    due_date,
                    sale[8]
                )
            )

        insert_rows(
            cursor,
            "invoices",
            [
                "id",
                "business_id",
                "customer_id",
                "sale_id",
                "invoice_number",
                "invoice_date",
                "due_date",
                "status",
                "subtotal",
                "tax_amount",
                "total_amount",
                "amount_paid"
            ],
            invoices
        )

        # -------------------------------------------------
        # INVOICE PAYMENTS
        # -------------------------------------------------

        print("Creating invoice payments...")

        payments = []
        paid_amounts = {}

        # Candidate payment outcomes are generated only when their final
        # payment date has occurred by TODAY. Later outcomes remain unpaid
        # at the seed snapshot and are handled by the label observation rule.

        for n, (
            invoice_id,
            customer_id,
            segment,
            issued,
            due,
            total
        ) in enumerate(invoice_info[:4400]):

            if segment == "reliable":

                delay = R.randint(-5, 3)

            elif segment == "moderate":

                delay = R.randint(-3, 18)

            else:

                delay = R.randint(10, 75)

            payment_date = max(
                issued,
                due + timedelta(days=delay),
            )

            if n < 600:

                final_payment_date = payment_date + timedelta(
                    days=R.randint(1, 14)
                )

                if final_payment_date > TODAY:
                    continue

                first_amount = money(
                    total * Decimal(".55")
                )

                second_amount = total - first_amount

                payments.append(
                    (
                        uid(),
                        invoice_id,
                        payment_date,
                        first_amount,
                        "UPI"
                        if n % 3
                        else "bank_transfer",
                        f"REC-{n + 1:06}"
                    )
                )

                payments.append(
                    (
                        uid(),
                        invoice_id,
                        final_payment_date,
                        second_amount,
                        "bank_transfer",
                        f"REC-{n + 1:06}-B"
                    )
                )

                paid_amounts[invoice_id] = total

            elif payment_date <= TODAY:

                payments.append(
                    (
                        uid(),
                        invoice_id,
                        payment_date,
                        total,
                        "UPI"
                        if n % 3
                        else "bank_transfer",
                        f"REC-{n + 1:06}"
                    )
                )

                paid_amounts[invoice_id] = total

        insert_rows(
            cursor,
            "invoice_payments",
            [
                "id",
                "invoice_id",
                "payment_date",
                "amount",
                "payment_method",
                "reference_number"
            ],
            payments
        )

        # Update paid invoices
        for invoice_id, amount in paid_amounts.items():

            cursor.execute(
                """
                UPDATE invoices
                SET amount_paid = %s,
                    status = 'paid'
                WHERE id = %s
                """,
                (
                    amount,
                    invoice_id
                )
            )

        # Mark unpaid overdue invoices
        cursor.execute(
            """
            UPDATE invoices
            SET status = 'overdue'
            WHERE due_date < CURRENT_DATE
              AND amount_paid = 0
            """
        )

        # -------------------------------------------------
        # PURCHASES
        # -------------------------------------------------

        print("Creating 2,000 purchases...")

        purchases = []
        purchase_items = []

        for n in range(2000):

            purchase_id = uid()

            product_id, _, cost, _ = R.choice(
                products
            )

            quantity = R.randint(20, 150)

            purchase_date = choose_day()

            base_amount = money(
                quantity * cost
            )

            tax = money(
                base_amount * Decimal(".05")
            )

            total = base_amount + tax

            supplier_id = R.choice(
                suppliers
            )

            due_date = (
                purchase_date
                + timedelta(days=30)
            )

            purchases.append(
                (
                    purchase_id,
                    business_id,
                    supplier_id,
                    f"PUR-{n + 1:05}",
                    purchase_date,
                    due_date,
                    "received",
                    base_amount,
                    tax,
                    total
                )
            )

            purchase_items.append(
                (
                    uid(),
                    purchase_id,
                    product_id,
                    quantity,
                    cost,
                    tax,
                    total
                )
            )

            inventory_transactions.append(
                (
                    uid(),
                    business_id,
                    product_id,
                    purchase_date,
                    "purchase_receipt",
                    quantity,
                    cost,
                    "purchase",
                    purchase_id
                )
            )

        insert_rows(
            cursor,
            "purchases",
            [
                "id",
                "business_id",
                "supplier_id",
                "purchase_number",
                "purchase_date",
                "due_date",
                "status",
                "subtotal",
                "tax_amount",
                "total_amount"
            ],
            purchases
        )

        insert_rows(
            cursor,
            "purchase_items",
            [
                "id",
                "purchase_id",
                "product_id",
                "quantity",
                "unit_cost",
                "tax_amount",
                "line_total"
            ],
            purchase_items
        )

        # -------------------------------------------------
        # INVENTORY TRANSACTIONS
        # -------------------------------------------------

        print("Creating inventory transactions...")

        insert_rows(
            cursor,
            "inventory_transactions",
            [
                "id",
                "business_id",
                "product_id",
                "transaction_date",
                "transaction_type",
                "quantity_change",
                "unit_cost",
                "reference_type",
                "reference_id"
            ],
            inventory_transactions
        )

        # -------------------------------------------------
        # EXPENSES
        # -------------------------------------------------

        print("Creating 5,000 expenses...")

        recurring_categories = [
            "Rent",
            "Salaries",
            "Utilities",
            "Software/services"
        ]

        one_time_categories = [
            "Marketing",
            "Travel",
            "Office expenses",
            "Inventory-related expenses"
        ]

        expenses = []

        for n in range(5000):

            expense_date = dt(
                R.randrange(
                    (TODAY - START).days
                )
            )

            if n < 1200:

                category = (
                    recurring_categories[
                        n % len(recurring_categories)
                    ]
                )

            else:

                category = R.choice(
                    one_time_categories
                )

            if category in (
                "Rent",
                "Salaries"
            ):

                amount = money(
                    R.uniform(
                        18000,
                        55000
                    )
                )

            else:

                amount = money(
                    R.uniform(
                        500,
                        18000
                    )
                )

            expenses.append(
                (
                    uid(),
                    business_id,
                    expense_date,
                    category,
                    f"{category} payment",
                    amount,
                    "bank_transfer"
                    if n % 2
                    else "UPI",
                    n < 1200
                )
            )

        insert_rows(
            cursor,
            "expenses",
            [
                "id",
                "business_id",
                "expense_date",
                "category",
                "description",
                "amount",
                "payment_method",
                "is_recurring"
            ],
            expenses
        )

        # -------------------------------------------------
        # BANK TRANSACTIONS
        # -------------------------------------------------

        print("Creating 10,000 bank transactions...")

        transactions = []

        balance = money(750000)

        def add_transaction(
            transaction_date,
            transaction_type,
            category,
            amount,
            description,
            customer_id=None,
            supplier_id=None
        ):

            nonlocal balance

            if transaction_type == "credit":

                balance += amount

            else:

                balance -= amount

            transactions.append(
                (
                    uid(),
                    business_id,
                    transaction_date,
                    transaction_type,
                    category,
                    amount,
                    balance,
                    description,
                    f"BNK-{len(transactions) + 1:06}",
                    customer_id,
                    supplier_id,
                    None,
                    None
                )
            )

        # Customer receipts
        for payment in payments:

            add_transaction(
                payment[2],
                "credit",
                "Customer receipt",
                payment[3],
                "Invoice receipt"
            )

        # Expenses
        for expense in expenses[:3000]:

            add_transaction(
                expense[2],
                "debit",
                expense[3],
                expense[5],
                expense[4]
            )

        # Supplier payments
        for purchase in purchases[:1200]:

            payment_date = (
                purchase[4]
                + timedelta(
                    days=R.randint(10, 45)
                )
            )

            add_transaction(
                payment_date,
                "debit",
                "Supplier payment",
                purchase[9],
                f"Payment {purchase[3]}",
                None,
                purchase[2]
            )

        # Additional transactions
        while len(transactions) < 10000:

            transaction_date = choose_day()

            transaction_type = (
                "debit"
                if len(transactions) % 3
                else "credit"
            )

            category = R.choice(
                [
                    "Bank charges",
                    "Transfer",
                    "Miscellaneous"
                ]
            )

            amount = money(
                R.uniform(50, 5000)
            )

            add_transaction(
                transaction_date,
                transaction_type,
                category,
                amount,
                category
            )

        insert_rows(
            cursor,
            "bank_transactions",
            [
                "id",
                "business_id",
                "transaction_date",
                "transaction_type",
                "category",
                "amount",
                "running_balance",
                "description",
                "reference_number",
                "customer_id",
                "supplier_id",
                "invoice_payment_id",
                "expense_id"
            ],
            transactions
        )

        # -------------------------------------------------
        # COMMIT
        # -------------------------------------------------

        db.commit()

        print()
        print("=" * 60)
        print("CashGuard AI Seed Completed Successfully")
        print("=" * 60)

        print(
            {
                "customers": 500,
                "suppliers": 50,
                "products": 100,
                "sales": 10000,
                "invoices": 5000,
                "invoice_payments": 5000,
                "purchases": 2000,
                "expenses": 5000,
                "bank_transactions": 10000,
            }
        )

        print("=" * 60)

    except Error as error:

        if db:
            db.rollback()

        print()
        print("MYSQL ERROR:")
        print(error)
        raise

    except Exception as error:

        if db:
            db.rollback()

        print()
        print("SEED ERROR:")
        print(error)
        raise

    finally:

        if cursor:
            cursor.close()

        if db and db.is_connected():
            db.close()

            print()
            print("MySQL connection closed.")


# ---------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------

if __name__ == "__main__":
    main()
