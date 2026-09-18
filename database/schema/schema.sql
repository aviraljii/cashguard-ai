-- CashGuard AI
-- Phase 1 Database Foundation
-- MySQL 8.0+

USE cashguard_ai;

CREATE TABLE businesses (
    id CHAR(36) PRIMARY KEY,
    legal_name VARCHAR(200) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    gstin VARCHAR(15) UNIQUE,
    pan VARCHAR(10) UNIQUE,
    industry VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    opening_cash_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (opening_cash_balance >= 0)
);

CREATE TABLE customers (
    id CHAR(36) PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    customer_code VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(254),
    city VARCHAR(100),
    state VARCHAR(100),
    credit_limit DECIMAL(14,2) NOT NULL DEFAULT 0,
    payment_terms_days SMALLINT NOT NULL DEFAULT 30,
    risk_segment VARCHAR(20) NOT NULL DEFAULT 'moderate',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE (business_id, customer_code),

    CHECK (credit_limit >= 0),
    CHECK (payment_terms_days BETWEEN 0 AND 180),
    CHECK (risk_segment IN ('reliable','moderate','high_risk')),
    CHECK (status IN ('active','inactive')),

    CONSTRAINT fk_customers_business
        FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE
);

CREATE TABLE suppliers (
    id CHAR(36) PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    supplier_code VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(254),
    city VARCHAR(100),
    state VARCHAR(100),
    payment_terms_days SMALLINT NOT NULL DEFAULT 30,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE (business_id, supplier_code),

    CHECK (payment_terms_days BETWEEN 0 AND 180),
    CHECK (status IN ('active','inactive')),

    CONSTRAINT fk_suppliers_business
        FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE
);

CREATE TABLE products (
    id CHAR(36) PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    sku VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'piece',
    selling_price DECIMAL(14,2) NOT NULL,
    cost_price DECIMAL(14,2) NOT NULL DEFAULT 0,
    reorder_level INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE (business_id, sku),

    CHECK (selling_price > 0),
    CHECK (cost_price >= 0),
    CHECK (reorder_level >= 0),
    CHECK (status IN ('active','inactive')),

    CONSTRAINT fk_products_business
        FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE
);

CREATE TABLE sales (
    id CHAR(36) PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    customer_id CHAR(36) NOT NULL,
    sale_number VARCHAR(40) NOT NULL,
    sale_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (business_id, sale_number),

    CHECK (subtotal >= 0),
    CHECK (tax_amount >= 0),
    CHECK (total_amount >= 0),
    CHECK (status IN ('draft','completed','cancelled')),

    CONSTRAINT fk_sales_business
        FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_sales_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
);

CREATE TABLE sale_items (
    id CHAR(36) PRIMARY KEY,
    sale_id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    quantity DECIMAL(12,2) NOT NULL,
    unit_price DECIMAL(14,2) NOT NULL,
    discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    line_total DECIMAL(14,2) NOT NULL,

    CHECK (quantity > 0),
    CHECK (unit_price >= 0),
    CHECK (discount_amount >= 0),
    CHECK (tax_amount >= 0),
    CHECK (line_total >= 0),

    CONSTRAINT fk_sale_items_sale
        FOREIGN KEY (sale_id)
        REFERENCES sales(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_sale_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(id)
);

CREATE TABLE purchases (
    id CHAR(36) PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    supplier_id CHAR(36) NOT NULL,
    purchase_number VARCHAR(40) NOT NULL,
    purchase_date DATE NOT NULL,
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'received',
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (business_id, purchase_number),

    CHECK (subtotal >= 0),
    CHECK (tax_amount >= 0),
    CHECK (total_amount >= 0),
    CHECK (status IN ('draft','ordered','received','cancelled')),

    CONSTRAINT fk_purchases_business
        FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_purchases_supplier
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(id)
);

CREATE TABLE purchase_items (
    id CHAR(36) PRIMARY KEY,
    purchase_id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    quantity DECIMAL(12,2) NOT NULL,
    unit_cost DECIMAL(14,2) NOT NULL,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    line_total DECIMAL(14,2) NOT NULL,

    CHECK (quantity > 0),
    CHECK (unit_cost >= 0),
    CHECK (tax_amount >= 0),
    CHECK (line_total >= 0),

    CONSTRAINT fk_purchase_items_purchase
        FOREIGN KEY (purchase_id)
        REFERENCES purchases(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_purchase_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(id)
);

CREATE TABLE invoices (
    id CHAR(36) PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    customer_id CHAR(36) NOT NULL,
    sale_id CHAR(36),
    invoice_number VARCHAR(40) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE (business_id, invoice_number),

    CHECK (due_date >= invoice_date),
    CHECK (subtotal >= 0),
    CHECK (tax_amount >= 0),
    CHECK (total_amount >= 0),
    CHECK (amount_paid >= 0),
    CHECK (amount_paid <= total_amount),
    CHECK (status IN ('draft','issued','partially_paid','paid','overdue','void')),

    CONSTRAINT fk_invoices_business
        FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_invoices_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id),

    CONSTRAINT fk_invoices_sale
        FOREIGN KEY (sale_id)
        REFERENCES sales(id)
);

CREATE TABLE invoice_payments (
    id CHAR(36) PRIMARY KEY,
    invoice_id CHAR(36) NOT NULL,
    payment_date DATE NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    payment_method VARCHAR(30) NOT NULL,
    reference_number VARCHAR(80),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (amount > 0),

    CONSTRAINT fk_invoice_payments_invoice
        FOREIGN KEY (invoice_id)
        REFERENCES invoices(id)
        ON DELETE CASCADE
);

CREATE TABLE expenses (
    id CHAR(36) PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    expense_date DATE NOT NULL,
    category VARCHAR(80) NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    payment_method VARCHAR(30) NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (amount > 0),

    CONSTRAINT fk_expenses_business
        FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE
);

CREATE TABLE bank_transactions (
    id CHAR(36) PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    category VARCHAR(80) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    running_balance DECIMAL(14,2) NOT NULL,
    description VARCHAR(255) NOT NULL,
    reference_number VARCHAR(80),
    customer_id CHAR(36),
    supplier_id CHAR(36),
    invoice_payment_id CHAR(36),
    expense_id CHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (transaction_type IN ('credit','debit')),
    CHECK (amount > 0),

    CONSTRAINT fk_bank_business
        FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_bank_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id),

    CONSTRAINT fk_bank_supplier
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(id),

    CONSTRAINT fk_bank_invoice_payment
        FOREIGN KEY (invoice_payment_id)
        REFERENCES invoice_payments(id),

    CONSTRAINT fk_bank_expense
        FOREIGN KEY (expense_id)
        REFERENCES expenses(id)
);

CREATE TABLE inventory_transactions (
    id CHAR(36) PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(30) NOT NULL,
    quantity_change DECIMAL(12,2) NOT NULL,
    unit_cost DECIMAL(14,2),
    reference_type VARCHAR(30),
    reference_id CHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (quantity_change <> 0),
    CHECK (transaction_type IN ('purchase_receipt','sale','adjustment','return')),

    CONSTRAINT fk_inventory_business
        FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_inventory_product
        FOREIGN KEY (product_id)
        REFERENCES products(id)
);

-- Indexes

CREATE INDEX idx_customers_business_status
ON customers(business_id, status);

CREATE INDEX idx_sales_customer_date
ON sales(customer_id, sale_date);

CREATE INDEX idx_sale_items_product
ON sale_items(product_id);

CREATE INDEX idx_purchases_supplier_date
ON purchases(supplier_id, purchase_date);

CREATE INDEX idx_invoices_customer_dates
ON invoices(customer_id, invoice_date, due_date);

CREATE INDEX idx_invoices_status_due
ON invoices(business_id, status, due_date);

CREATE INDEX idx_invoice_payments_invoice_date
ON invoice_payments(invoice_id, payment_date);

CREATE INDEX idx_expenses_business_date
ON expenses(business_id, expense_date);

CREATE INDEX idx_bank_transactions_business_date
ON bank_transactions(business_id, transaction_date);

CREATE INDEX idx_bank_transactions_party
ON bank_transactions(customer_id, supplier_id);

CREATE INDEX idx_inventory_product_date
ON inventory_transactions(product_id, transaction_date);