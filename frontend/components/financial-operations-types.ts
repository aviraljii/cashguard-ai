export type VerificationState = 'verified' | 'pending_verification' | 'unavailable' | 'demo_preview'
export type ReconciliationStatus = 'matched' | 'unmatched' | 'partially_matched' | 'under_review'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type PaymentMethod = 'upi' | 'neft' | 'imps' | 'bank_transfer' | 'card' | 'cash' | 'cheque' | 'payment_gateway' | 'other'

export interface BankAccount { id: string; bankName: string; maskedAccountNumber: string; accountType: string; currentBalance: number; availableBalance: number; lastSyncedAt?: string; connectionStatus: VerificationState }
export interface TransactionRisk { level: RiskLevel; riskScore?: number; anomalyScore?: number; classification: 'normal' | 'review_recommended' | 'potential_anomaly'; reason?: string }
export interface BankTransaction { id: string; occurredAt: string; accountId: string; type: 'credit' | 'debit'; counterparty?: string; description: string; amount: number; method: PaymentMethod; status: 'completed' | 'processing' | 'pending' | 'failed' | 'reversed' | 'refunded'; category?: string; reference?: string; reconciliationStatus: ReconciliationStatus; risk?: TransactionRisk; verification: VerificationState }
export interface TransactionDetails extends BankTransaction { bankReference?: string; createdAt?: string; updatedAt?: string; customerId?: string; billId?: string; paymentId?: string; receiptId?: string }
export interface InvoiceLineItem { description: string; hsnSac?: string; quantity: number; unit?: string; rate: number; discount?: number; taxableValue: number }
export interface GSTBreakdown { taxableValue: number; cgstRate?: number; cgstAmount?: number; sgstRate?: number; sgstAmount?: number; igstRate?: number; igstAmount?: number; totalTax?: number }
export interface Bill { id: string; billNumber: string; customerId: string; invoiceDate: string; dueDate: string; items: InvoiceLineItem[]; gst?: GSTBreakdown; grandTotal?: number; amountPaid?: number; status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue'; verification: VerificationState }
export interface Invoice extends Bill { sellerName?: string; sellerGstin?: string; buyerName?: string; placeOfSupply?: string; paymentTerms?: string; notes?: string }
export interface Payment { id: string; customerId?: string; billId?: string; amount: number; method: PaymentMethod; reference?: string; status: 'recorded' | 'pending' | 'received' | 'failed' | 'reversed'; settlementStatus?: 'settled' | 'pending' | 'failed' | 'reversed'; occurredAt: string; reconciliationStatus: ReconciliationStatus; verification: VerificationState }
export interface PaymentRequest { id: string; customerId: string; billId?: string; amount: number; dueDate?: string; paymentLink?: PaymentLink; status: 'draft' | 'sent' | 'paid' | 'expired' }
export interface PaymentLink { url?: string; expiresAt?: string; providerReference?: string; verification: VerificationState }
export interface QRPayment { id: string; amount: number; businessName?: string; invoiceNumber?: string; paymentReference?: string; paymentUri?: string; status: 'ready' | 'expired' | 'pending' | 'received' | 'failed'; verification: VerificationState }
export interface PaymentReceipt { id: string; paymentId: string; customerId?: string; billId?: string; amount: number; method: PaymentMethod; reference?: string; status: 'issued' | 'pending' | 'unavailable'; occurredAt: string; verification: VerificationState }
export interface ReconciliationRecord { id: string; transactionId: string; status: ReconciliationStatus; matchedAmount?: number; reviewedAt?: string; verification: VerificationState }

export const financeEndpoints = { accounts: '/banking/accounts', transactions: '/banking/transactions', transaction: (id: string) => `/banking/transactions/${id}`, bills: '/bills', invoices: '/invoices', payments: '/payments', paymentLink: '/payments/payment-link', qr: '/payments/qr', receipts: '/payment-receipts', reconciliation: '/reconciliation' } as const

export function formatINR(amount: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount) }
export function amountInWords(amount?: number) { return amount == null ? undefined : `Rupees ${amount.toLocaleString('en-IN')} Only` }

export type FinanceLoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'empty' } | { status: 'ready'; data: T }
export const previewNotice = 'Demo / Preview data — connect the financial API before treating records as verified.'
