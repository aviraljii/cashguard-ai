'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Bot,
  Building2, Check, ChevronDown, CircleHelp, CreditCard, FileText, LayoutDashboard,
  Menu, MoreHorizontal, Search, Settings, ShieldCheck, Sparkles, Wallet, X,
} from 'lucide-react'

const nav = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Cash Flow', href: '/cash-flow', icon: Activity },
  { label: 'Banking', href: '/banking', icon: Building2 },
  { label: 'Payments', href: '/payments', icon: CreditCard },
  { label: 'Reconciliation', href: '/reconciliation', icon: Check },
  { label: 'Risk Intelligence', href: '/risk', icon: ShieldCheck },
  { label: 'Alerts', href: '/alerts', icon: AlertTriangle },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Invoices', href: '/invoices', icon: FileText },
  { label: 'ERP / Customers', href: '/customers', icon: Wallet },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'AI Insights', href: '/ai-insights', icon: Bot },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const pageCopy: Record<string, { title: string; description: string }> = {
  '/': { title: 'Good morning, Alex', description: 'Here is your financial operations overview for today.' },
  '/cash-flow': { title: 'Cash Flow', description: 'Understand your liquidity and forecast what is next.' },
  '/banking': { title: 'Banking', description: 'Connected accounts and recent bank activity.' },
  '/payments': { title: 'Payments', description: 'Track incoming and outgoing payment activity.' },
  '/reconciliation': { title: 'Reconciliation', description: 'Match transactions and keep your books accurate.' },
  '/risk': { title: 'Risk Intelligence', description: 'Monitor payment behavior and exposure across your business.' },
  '/alerts': { title: 'Alerts', description: 'Prioritized events that need your attention.' },
  '/notifications': { title: 'Notifications', description: 'Your latest CashGuard-AI activity.' },
  '/invoices': { title: 'Invoices', description: 'Invoice status, collections, and intelligence.' },
  '/customers': { title: 'ERP / Customers', description: 'Customer health, balances, and payment history.' },
  '/analytics': { title: 'Analytics', description: 'Explore performance trends across your financial operations.' },
  '/ai-insights': { title: 'AI Insights', description: 'Actionable recommendations generated from your financial data.' },
  '/settings': { title: 'Settings', description: 'Manage your workspace, alerts, integrations, and team.' },
}

function StatCard({ label, value, change, tone = 'blue' }: { label: string; value: string; change: string; tone?: 'blue' | 'green' | 'amber' }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-dot ${tone}`} /></div><strong>{value}</strong><div className={change.startsWith('+') ? 'change positive' : 'change'}>{change} <span>vs last month</span></div></div>
}

function Chart({ compact = false }: { compact?: boolean }) {
  const bars = [46, 63, 52, 76, 68, 82, 74, 94, 80, 98, 88, 110, 103, 125, 116, 137, 128, 148]
  return <div className={`chart ${compact ? 'compact' : ''}`}><div className="chart-grid" /> <div className="bars">{bars.map((h, i) => <span key={i} style={{ height: `${h}px` }} className={i === 15 ? 'highlight' : ''} />)}</div><div className="chart-labels"><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Nov</span></div></div>
}

function Dashboard() {
  return <><div className="stats-grid"><StatCard label="Available cash" value="$284,920" change="+12.8%" tone="blue" /><StatCard label="Incoming this month" value="$128,450" change="+8.4%" tone="green" /><StatCard label="At risk" value="$18,240" change="-3.2%" tone="amber" /><StatCard label="Open invoices" value="$46,780" change="+5.1%" tone="blue" /></div><div className="content-grid"><section className="panel chart-panel"><div className="panel-head"><div><h2>Cash position</h2><p>Actual vs projected balance</p></div><button className="select">Last 12 months <ChevronDown size={14} /></button></div><div className="legend"><span><i className="legend-blue" /> Actual</span><span><i className="legend-light" /> Projected</span></div><Chart /></section><section className="panel"><div className="panel-head"><div><h2>Risk overview</h2><p>Payment risk by customer</p></div><Link href="/risk" className="text-link">View all</Link></div><div className="risk-list"><RiskRow name="Northstar Labs" amount="$12,400" score="High" tone="high" /><RiskRow name="Vertex Systems" amount="$8,920" score="Medium" tone="medium" /><RiskRow name="Luma Retail" amount="$4,260" score="Low" tone="low" /><RiskRow name="Acme Industries" amount="$2,840" score="Low" tone="low" /></div></section></div><div className="content-grid lower"><section className="panel"><div className="panel-head"><div><h2>Recent transactions</h2><p>Latest movement across connected accounts</p></div><Link href="/payments" className="text-link">View all</Link></div><TransactionTable /></section><section className="panel ai-panel"><div className="ai-kicker"><Sparkles size={15} /> AI INSIGHT</div><h2>Cash coverage looks healthy</h2><p>Your projected balance stays above the recommended reserve for the next 90 days. Two invoices may need follow-up this week.</p><button className="primary-button"><Bot size={16} /> Ask CashGuard</button></section></div></>
}

function RiskRow({ name, amount, score, tone }: { name: string; amount: string; score: string; tone: string }) { return <div className="risk-row"><div className="avatar">{name[0]}</div><div className="row-main"><strong>{name}</strong><span>{amount} exposure</span></div><span className={`badge ${tone}`}>{score}</span></div> }
function TransactionTable() { return <div className="transaction-list"><div className="transaction"><div className="transaction-icon in"><ArrowDownRight size={16} /></div><div><strong>Stripe payout</strong><span>Today, 10:24 AM</span></div><b className="amount positive">+$18,420</b></div><div className="transaction"><div className="transaction-icon out"><ArrowUpRight size={16} /></div><div><strong>Payroll · September</strong><span>Yesterday, 4:10 PM</span></div><b className="amount">-$42,800</b></div><div className="transaction"><div className="transaction-icon in"><ArrowDownRight size={16} /></div><div><strong>Northstar Labs invoice</strong><span>Sep 18, 2026</span></div><b className="amount positive">+$12,400</b></div></div> }

function GenericPage({ path }: { path: string }) {
  const copy = pageCopy[path] || pageCopy['/']
  const isTable = ['/payments', '/banking', '/invoices', '/customers', '/reconciliation', '/notifications'].includes(path)
  return <><div className="stats-grid compact-stats"><StatCard label="Total volume" value="$284,920" change="+12.8%" /><StatCard label="Healthy activity" value="86.4%" change="+4.2%" tone="green" /><StatCard label="Needs attention" value="12" change="-2.1%" tone="amber" /></div><section className="panel page-panel"><div className="panel-head"><div><h2>{isTable ? 'Latest activity' : 'Performance overview'}</h2><p>{isTable ? 'Synced with your connected financial systems' : 'A clear view of the signals behind your business.'}</p></div><button className="primary-button">{path === '/invoices' ? 'Create invoice' : 'Export report'}</button></div>{isTable ? <TransactionTable /> : <Chart compact />}</section><section className="content-grid"><section className="panel"><div className="panel-head"><div><h2>Recommended next steps</h2><p>Keep your operations moving forward.</p></div></div><div className="recommendations"><div><Sparkles size={17} /><span>Review 3 items flagged by CashGuard AI</span><ChevronDown size={16} /></div><div><ShieldCheck size={17} /><span>Connect one more account to improve coverage</span><ChevronDown size={16} /></div><div><Bell size={17} /><span>Configure your weekly finance digest</span><ChevronDown size={16} /></div></div></section><section className="panel"><div className="panel-head"><div><h2>Activity health</h2><p>Last synced moments ago</p></div></div><div className="health"><strong>92%</strong><div className="progress"><span /></div><p>Everything is running smoothly across your workspace.</p></div></section></div></>
}

export function CashGuardApp() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const copy = pageCopy[pathname] || pageCopy['/']
  const active = pathname === '/' ? '/' : nav.find((item) => pathname.startsWith(item.href) && item.href !== '/')?.href || '/'
  return <div className="app-shell"><aside className={`sidebar ${open ? 'open' : ''}`}><div className="brand"><div className="brand-mark"><span /></div><span>cashguard<span>-ai</span></span><button className="close-nav" onClick={() => setOpen(false)}><X size={18} /></button></div><nav>{nav.map(({ label, href, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={active === href ? 'active' : ''}><Icon size={17} /><span>{label}</span>{label === 'Alerts' && <em>3</em>}</Link>)}</nav><div className="sidebar-bottom"><Link href="/help"><CircleHelp size={17} /> Help center</Link><Link href="/settings"><Settings size={17} /> Settings</Link><div className="user-mini"><div className="avatar blue-avatar">AK</div><div><strong>Alex Kim</strong><span>Admin</span></div><MoreHorizontal size={17} /></div></div></aside><main className="main"><header><button className="menu-button" onClick={() => setOpen(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{copy.title.replace('Good morning, Alex', 'Dashboard')}</strong></div><div className="header-actions"><label className="search"><Search size={16} /><input placeholder="Search" /></label><button className="icon-button"><Bell size={18} /><i /></button><div className="header-avatar">AK</div></div></header><div className="page-wrap"><div className="page-title"><div><p className="eyebrow">MONDAY, SEPTEMBER 21, 2026</p><h1>{copy.title}</h1><p>{copy.description}</p></div><button className="secondary-button"><ArrowDownRight size={16} /> Add transaction</button></div>{pathname === '/' ? <Dashboard /> : <GenericPage path={pathname} />}</div></main></div>
}
