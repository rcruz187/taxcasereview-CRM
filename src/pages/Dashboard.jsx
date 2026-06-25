import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, role, employeeName, can } = useApp()
  const [metrics, setMetrics] = useState({})
  const [recentCases, setRecentCases] = useState([])
  const [tasks, setTasks] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [recentClients, setRecentClients] = useState([])
  const [recentLeads, setRecentLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState(new Date())
  const [tasFeeds, setTasFeeds] = useState([])

  useEffect(() => { load() }, [])
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  async function load() {
    const [
      { data: leads }, { data: clients }, { data: cases },
      { data: tasks }, { data: invoices }, { data: payments },
      { data: deadlines }, { data: arScheduled },
    ] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('cases').select('*').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('id,total,status,clientName'),
      supabase.from('payments').select('id,amount,status,created_at,source,enrolled_by'),
      supabase.from('deadlines').select('*').order('dueDate', { ascending: true }),
      supabase.from('payments').select('amount,payment_status,scheduled_date').eq('payment_status', 'Scheduled'),
    ])

    const now = new Date()
    const thisMonth = now.toISOString().slice(0, 7)

    // 1st trade = the Tax Investigation Fee. This is collected externally via
    // LeadFlow before a lead ever reaches the CRM, so it's never written to
    // the payments table — leads.taxFee (set when the lead is qualified) is
    // the only record of it we have. MTD = leads created this month.
    // 2nd trade = the Resolution Fee, charged in-app once IRS results are
    // back and the addendum is signed — these DO hit payments, tagged
    // source:'resolution_fee' by stripe-resolution-fee-confirm.
    const mtd1stTrades   = (leads || [])
      .filter(l => l.created_at?.startsWith(thisMonth))
      .reduce((s, l) => s + parseFloat(l.taxFee || 0), 0)
    const total1stTrades = (leads || []).reduce((s, l) => s + parseFloat(l.taxFee || 0), 0)
    const mtd2ndTrades   = (payments || [])
      .filter(p => p.source === 'resolution_fee' && p.created_at?.startsWith(thisMonth))
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0)
    const total2ndTrades = (payments || [])
      .filter(p => p.source === 'resolution_fee')
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0)

    // Role-scoped numbers — Tax Advisor (sales rep) only sees their own
    // leads/1st-trade, Tax Associate/Manager only sees their own 2nd-trade
    // (commission credit, via enrolled_by — see ChargeResolutionFeeModal /
    // stripe-resolution-fee-confirm). "Closed" = no longer open, matching
    // Open Leads' own status list, just inverted.
    const CLOSED_STATUSES = ['Converted to Client', 'Dead', 'Do Not Contact']
    const myLeads = (leads || []).filter(l => l.assignedTo === employeeName)
    const myOpenLeads   = myLeads.filter(l => !CLOSED_STATUSES.includes(l.status)).length
    const myClosedLeads = myLeads.filter(l => CLOSED_STATUSES.includes(l.status)).length
    const closedLeads   = (leads || []).filter(l => CLOSED_STATUSES.includes(l.status)).length
    const my1stTradeMtd = myLeads
      .filter(l => l.created_at?.startsWith(thisMonth))
      .reduce((s, l) => s + parseFloat(l.taxFee || 0), 0)
    const my2ndTradeMtd = (payments || [])
      .filter(p => p.source === 'resolution_fee' && p.enrolled_by === employeeName && p.created_at?.startsWith(thisMonth))
      .reduce((s, p) => s + parseFloat(p.amount || 0), 0)

    const arOutstanding = (arScheduled || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)

    setMetrics({
      activeCases: (cases || []).filter(c => ['Open', 'Pending IRS', 'Active Plan', 'Under Review'].includes(c.status)).length,
      openLeads: (leads || []).filter(l => !['Converted to Client', 'Dead', 'Do Not Contact'].includes(l.status)).length,
      totalClients: (clients || []).length,
      mtd1stTrades, total1stTrades, mtd2ndTrades, total2ndTrades,
      closedLeads, myOpenLeads, myClosedLeads, my1stTradeMtd, my2ndTradeMtd,
      arOutstanding,
      unpaidInvoices: (invoices || []).filter(i => i.status === 'Unpaid' || i.status === 'Overdue').length,
      unpaidAmt: (invoices || []).filter(i => i.status === 'Unpaid' || i.status === 'Overdue').reduce((s, i) => s + parseFloat(i.total || 0), 0),
      openTasks: (tasks || []).filter(t => !t.done).length,
      overdueTasks: (tasks || []).filter(t => !t.done && t.dueDate && new Date(t.dueDate) < now).length,
      upcomingDl: (deadlines || []).filter(d => new Date(d.dueDate) >= now && d.status !== 'Completed').length,
      overdueDl: (deadlines || []).filter(d => new Date(d.dueDate) < now && d.status !== 'Completed').length,
    })

    setRecentCases((cases || []).slice(0, 6))
    setTasks((tasks || []).filter(t => !t.done).slice(0, 8))
    setDeadlines((deadlines || []).filter(d => d.status !== 'Completed').slice(0, 8))
    setRecentClients((clients || []).slice(0, 5))
    setRecentLeads((leads || []).filter(l => !['Converted to Client', 'Dead'].includes(l.status)).slice(0, 5))
    setLoading(false)
  }

  // Fetch TAS blog feed — try multiple proxies, fallback to hardcoded recent posts
  useEffect(() => {
    const TAS_FALLBACK = [
      { title: 'NTA Blog: Understanding Your Rights as a Taxpayer', link: 'https://www.taxpayeradvocate.irs.gov/blog/', pubDate: new Date().toISOString() },
      { title: 'TAS Tax Tips: What to Do When the IRS Contacts You', link: 'https://www.taxpayeradvocate.irs.gov/blog/', pubDate: new Date(Date.now() - 86400000 * 3).toISOString() },
      { title: 'Know Your Rights: Free Tax Help Available Nationwide', link: 'https://www.taxpayeradvocate.irs.gov/blog/', pubDate: new Date(Date.now() - 86400000 * 7).toISOString() },
    ]

    async function fetchFeed() {
      const TAS_RSS = encodeURIComponent('https://www.taxpayeradvocate.irs.gov/feed/')
      const proxies = [
        `https://api.rss2json.com/v1/api.json?rss_url=${TAS_RSS}&count=3`,
        `https://api.allorigins.win/get?url=${TAS_RSS}`,
      ]
      for (const url of proxies) {
        try {
          const r = await fetch(url)
          const d = await r.json()
          // rss2json format
          if (d.status === 'ok' && d.items?.length) { setTasFeeds(d.items.slice(0,3)); return }
          // allorigins format — parse XML manually
          if (d.contents) {
            const parser = new DOMParser()
            const xml = parser.parseFromString(d.contents, 'text/xml')
            const items = [...xml.querySelectorAll('item')].slice(0,3).map(el => ({
              title: el.querySelector('title')?.textContent || '',
              link:  el.querySelector('link')?.textContent || 'https://www.taxpayeradvocate.irs.gov/blog/',
              pubDate: el.querySelector('pubDate')?.textContent || '',
            }))
            if (items.length) { setTasFeeds(items); return }
          }
        } catch {}
      }
      // All proxies failed — show hardcoded fallback so widget is never empty
      setTasFeeds(TAS_FALLBACK)
    }

    fetchFeed()
    // Refresh every 4 hours
    const interval = setInterval(fetchFeed, 4 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Drag state — use refs for drag tracking (not state) to avoid re-render freeze
  const [cardOrder, setCardOrder]       = useState(null)
  const [saveIndicator, setSaveIndicator] = useState(false)
  const dragIdx  = useRef(null)
  const dragOver = useRef(null)

  // Load saved layout from employees table on mount
  useEffect(() => {
    if (!user?.email) return
    supabase.from('employees').select('dashboard_layout').eq('email', user.email).maybeSingle()
      .then(({ data }) => {
        if (data?.dashboard_layout?.length) setCardOrder(data.dashboard_layout)
      })
  }, [user?.email])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--t3)', fontSize: 14 }}>
      Loading dashboard…
    </div>
  )

  const greeting = () => {
    const h = time.getHours()
    const rawName = user?.user_metadata?.name?.split(' ')[0] || user?.email?.split('@')[0]?.split('.')[0] || 'there'
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1)
    return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${name} 👋`
  }

  const fmtTime = t => t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  const fmtDate = t => t.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const daysLeft = d => Math.ceil((new Date(d.dueDate) - new Date()) / 86400000)

  // US time zones shown on the dashboard clock -- continental US plus
  // Alaska and Hawaii. Each computed independently via Intl with an
  // explicit IANA zone (not a manual UTC offset), so DST is handled
  // automatically for the zones that observe it, same approach as the
  // business-hours check in receive-call.
  const US_TIMEZONES = [
    { label: 'Eastern',  zone: 'America/New_York' },
    { label: 'Central',  zone: 'America/Chicago' },
    { label: 'Mountain', zone: 'America/Denver' },
    { label: 'Pacific',  zone: 'America/Los_Angeles' },
    { label: 'Alaska',   zone: 'America/Anchorage' },
    { label: 'Hawaii',   zone: 'Pacific/Honolulu' },
  ]
  const fmtZoneTime = (t, zone) => t.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true })

  const isTaxAdvisor  = role === 'Tax Advisor'
  const isTaxAssociate = role === 'Tax Associate'
  const isManager     = role === 'Manager'
  // Tax Associate/Manager work client files day-to-day, so "recent" should
  // surface clients, not leads. Tax Advisor never sees Clients at all.
  const showRecentClients = isTaxAssociate || isManager

  // ── Drag-and-drop dashboard layout ──────────────────────────────────────────

  const CARD_COLORS = {
    'Active Cases':        '#f59e0b',
    'Open Leads':          '#a855f7',
    'Clients':             '#3b82f6',
    'MTD 1st Trades':      '#22c55e',
    'MTD 2nd Trades':      '#22c55e',
    'AR Outstanding':      '#ef4444',
    'Unpaid Invoices':     '#a855f7',
    'Open Tasks':          '#1A7FD4',
    'Upcoming DL':         '#f59e0b',
    'Overdue DL':          '#ef4444',
    'Closed Leads':        '#a855f7',
    'Team MTD 1st Trades': '#3b82f6',
  }

  // All cards available per role — label is the unique key
  const ALL_ROLE_CARDS = isTaxAdvisor ? [
    { label: 'Open Leads',           val: metrics.myOpenLeads,   color: 'var(--warn)', to: '/leads',     icon: '👤', sub: 'Assigned to you' },
    { label: 'Closed Leads',         val: metrics.myClosedLeads, color: 'var(--ok)',   to: '/leads',     icon: '🏁', sub: 'Assigned to you' },
    { label: 'MTD 1st Trades',       val: '$' + Math.round(metrics.my1stTradeMtd || 0).toLocaleString(), color: 'var(--ok)', icon: '💰', sub: 'Your enrollments' },
    { label: 'Team MTD 1st Trades',  val: '$' + Math.round(metrics.mtd1stTrades  || 0).toLocaleString(), color: 'var(--blue)', icon: '👥', sub: 'Whole sales team' },
  ] : isTaxAssociate ? [
    { label: 'Active Cases',   val: metrics.activeCases,   color: 'var(--blue)', to: '/cases',     icon: '📁' },
    { label: 'Open Leads',     val: metrics.openLeads,     color: 'var(--warn)', to: '/leads',     icon: '👤' },
    { label: 'Clients',        val: metrics.totalClients,  color: 'var(--ok)',   to: '/clients',   icon: '🏢' },
    { label: 'MTD 2nd Trades', val: '$' + Math.round(metrics.my2ndTradeMtd || 0).toLocaleString(), color: 'var(--ok)', icon: '💵', sub: 'Your enrollments' },
    { label: 'AR Outstanding', val: '$' + Math.round(metrics.arOutstanding  || 0).toLocaleString(), color: '#ef4444', to: '/ar', icon: '💳', sub: 'Scheduled installments' },
    { label: 'Unpaid Invoices',val: metrics.unpaidInvoices, color: '#a855f7', to: '/invoices', icon: '🧾', sub: metrics.unpaidAmt > 0 ? '$' + Math.round(metrics.unpaidAmt).toLocaleString() + ' outstanding' : 'All paid' },
    { label: 'Open Tasks',     val: metrics.openTasks,     color: '#1A7FD4',  to: '/tasks',     icon: '✅', sub: metrics.overdueTasks > 0 ? `${metrics.overdueTasks} overdue` : 'On track' },
    { label: 'Upcoming DL',   val: metrics.upcomingDl,    color: 'var(--warn)', to: '/deadlines', icon: '⏰' },
    { label: 'Overdue DL',    val: metrics.overdueDl,     color: metrics.overdueDl > 0 ? 'var(--bad)' : 'var(--ok)', to: '/deadlines', icon: '🚨' },
  ] : isManager ? [
    { label: 'Active Cases',   val: metrics.activeCases,   color: 'var(--blue)', to: '/cases',     icon: '📁' },
    { label: 'Open Leads',     val: metrics.openLeads,     color: 'var(--warn)', to: '/leads',     icon: '👤' },
    { label: 'Closed Leads',   val: metrics.closedLeads,   color: 'var(--ok)',   to: '/leads',     icon: '🏁' },
    { label: 'Clients',        val: metrics.totalClients,  color: 'var(--ok)',   to: '/clients',   icon: '🏢' },
    { label: 'MTD 1st Trades', val: '$' + Math.round(metrics.my1stTradeMtd || 0).toLocaleString(), color: 'var(--ok)', icon: '💰', sub: 'Team: $' + Math.round(metrics.mtd1stTrades || 0).toLocaleString() },
    { label: 'MTD 2nd Trades', val: '$' + Math.round(metrics.my2ndTradeMtd || 0).toLocaleString(), color: 'var(--ok)', icon: '💵', sub: 'Team: $' + Math.round(metrics.mtd2ndTrades || 0).toLocaleString() },
    { label: 'AR Outstanding', val: '$' + Math.round(metrics.arOutstanding  || 0).toLocaleString(), color: '#ef4444', to: '/ar', icon: '💳', sub: 'Scheduled installments' },
    { label: 'Unpaid Invoices',val: metrics.unpaidInvoices, color: '#a855f7', to: '/invoices', icon: '🧾', sub: metrics.unpaidAmt > 0 ? '$' + Math.round(metrics.unpaidAmt).toLocaleString() + ' outstanding' : 'All paid' },
    { label: 'Open Tasks',     val: metrics.openTasks,     color: '#1A7FD4',  to: '/tasks',     icon: '✅', sub: metrics.overdueTasks > 0 ? `${metrics.overdueTasks} overdue` : 'On track' },
    { label: 'Upcoming DL',   val: metrics.upcomingDl,    color: 'var(--warn)', to: '/deadlines', icon: '⏰' },
    { label: 'Overdue DL',    val: metrics.overdueDl,     color: metrics.overdueDl > 0 ? 'var(--bad)' : 'var(--ok)', to: '/deadlines', icon: '🚨' },
  ] : [
    { label: 'Open Leads',     val: metrics.openLeads,     color: 'var(--warn)', to: '/leads',     icon: '👤' },
    { label: 'Clients',        val: metrics.totalClients,  color: 'var(--ok)',   to: '/clients',   icon: '🏢' },
    { label: 'Active Cases',   val: metrics.activeCases,   color: 'var(--blue)', to: '/cases',     icon: '📁' },
    { label: 'MTD 1st Trades', val: '$' + Math.round(metrics.mtd1stTrades  || 0).toLocaleString(), color: 'var(--ok)', icon: '💰', sub: 'Total: $' + Math.round(metrics.total1stTrades || 0).toLocaleString() },
    { label: 'MTD 2nd Trades', val: '$' + Math.round(metrics.mtd2ndTrades  || 0).toLocaleString(), color: 'var(--ok)', icon: '💵', sub: 'Total: $' + Math.round(metrics.total2ndTrades || 0).toLocaleString() },
    { label: 'Unpaid Invoices',val: metrics.unpaidInvoices, color: '#a855f7', to: '/invoices', icon: '🧾', sub: metrics.unpaidAmt > 0 ? '$' + Math.round(metrics.unpaidAmt).toLocaleString() + ' outstanding' : 'All paid' },
    { label: 'Open Tasks',     val: metrics.openTasks,     color: '#1A7FD4',  to: '/tasks',     icon: '✅', sub: metrics.overdueTasks > 0 ? `${metrics.overdueTasks} overdue` : 'On track' },
    { label: 'Upcoming DL',   val: metrics.upcomingDl,    color: 'var(--warn)', to: '/deadlines', icon: '⏰' },
    { label: 'Overdue DL',    val: metrics.overdueDl,     color: metrics.overdueDl > 0 ? 'var(--bad)' : 'var(--ok)', to: '/deadlines', icon: '🚨' },
    { label: 'AR Outstanding', val: '$' + Math.round(metrics.arOutstanding || 0).toLocaleString(), color: '#ef4444', to: '/ar', icon: '💳', sub: 'Scheduled installments' },
  ]

  // Ordered cards: apply saved order or use default
  const defaultOrder = ALL_ROLE_CARDS.map(c => c.label)
  const orderedLabels = cardOrder
    ? cardOrder.filter(l => defaultOrder.includes(l)).concat(defaultOrder.filter(l => !cardOrder.includes(l)))
    : defaultOrder
  const orderedCards = orderedLabels.map(l => ALL_ROLE_CARDS.find(c => c.label === l)).filter(Boolean)

  async function saveLayout(newOrder) {
    if (!user?.email) return
    await supabase.from('employees').update({ dashboard_layout: newOrder }).eq('email', user.email)
    setSaveIndicator(true)
    setTimeout(() => setSaveIndicator(false), 1500)
  }

  function onDragStart(e, idx) {
    dragIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOver.current = idx
    // Highlight drop target visually via DOM directly (no state re-render)
    document.querySelectorAll('[data-card-idx]').forEach(el => {
      el.style.outline = el.dataset.cardIdx === String(idx) && idx !== dragIdx.current
        ? '2px dashed var(--blue)' : ''
    })
  }
  function onDrop(e, idx) {
    e.preventDefault()
    document.querySelectorAll('[data-card-idx]').forEach(el => { el.style.outline = '' })
    if (dragIdx.current === null || dragIdx.current === idx) { dragIdx.current = null; dragOver.current = null; return }
    const next = [...orderedLabels]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(idx, 0, moved)
    dragIdx.current = null
    dragOver.current = null
    setCardOrder(next)
    saveLayout(next)
  }
  function onDragEnd() {
    document.querySelectorAll('[data-card-idx]').forEach(el => { el.style.outline = '' })
    dragIdx.current = null
    dragOver.current = null
  }

  const StatCard = ({ card, idx }) => {
    const { label, val, sub, color, to, icon } = card
    const borderColor = CARD_COLORS[label] || 'var(--blue)'
    return (
      <div
        draggable
        data-card-idx={idx}
        onDragStart={e => { e.currentTarget.style.opacity = '0.4'; onDragStart(e, idx) }}
        onDragOver={e => onDragOver(e, idx)}
        onDrop={e => { e.currentTarget.style.opacity = '1'; onDrop(e, idx) }}
        onDragEnd={e => { e.currentTarget.style.opacity = '1'; onDragEnd() }}
        onClick={() => to && dragIdx.current === null && navigate(to)}
        title="Drag to rearrange"
        style={{
          background: 'var(--sf)',
          border: '1px solid var(--br)',
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          padding: '18px 20px',
          cursor: 'grab',
          transition: 'transform .15s, box-shadow .15s',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 100,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          userSelect: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 24px ${borderColor}40` }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
      >
        {/* Thick colored top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: borderColor }}/>
        {/* Drag handle hint */}
        <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, color: 'var(--t3)', opacity: 0.5, lineHeight: 1, letterSpacing: 1 }}>⠿</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: color || 'var(--tx)', lineHeight: 1 }}>{val ?? '—'}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>{sub}</div>}
          </div>
          {icon && <div style={{ fontSize: 28, opacity: .15, flexShrink: 0 }}>{icon}</div>}
        </div>
      </div>
    )
  }

  // TAS widget (extracted so it renders in sidebar)
  const TASWidget = () => (
    <div style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header — name only, no box */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#1A7FD4,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>⚖️</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9' }}>Taxpayer Advocate</div>
          <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>● IRS.gov Updates</div>
        </div>
      </div>
      {/* Bubbles — no container, just flowing */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tasFeeds.length === 0 ? (
          [1,2,3].map(i => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ background: '#1e293b', borderRadius: '4px 14px 14px 14px', padding: '10px 13px', width: '88%' }}>
                <div style={{ width: '80%', height: 10, background: 'var(--br)', borderRadius: 4, marginBottom: 6 }}/>
                <div style={{ width: '55%', height: 8, background: 'var(--br)', borderRadius: 4 }}/>
              </div>
            </div>
          ))
        ) : tasFeeds.map((item, i) => {
          const date = item.pubDate ? new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
              <a href={item.link || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', maxWidth: '92%' }}>
                <div style={{ background: '#1e3a5f', borderRadius: '4px 14px 14px 14px', padding: '10px 13px', cursor: 'pointer', transition: 'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#1e3a6e'}
                  onMouseLeave={e => e.currentTarget.style.background='#1e3a5f'}
                >
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.45, marginBottom: 5 }}>{item.title}</div>
                  <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 700 }}>Read more →</div>
                </div>
              </a>
              <div style={{ fontSize: 10, color: 'var(--t3)', paddingLeft: 2 }}>{date}</div>
            </div>
          )
        })}
        <a href="https://www.taxpayeradvocate.irs.gov/blog/" target="_blank" rel="noreferrer"
          style={{ fontSize: 10, color: 'var(--t3)', textDecoration: 'none', fontWeight: 600, paddingLeft: 2 }}>
          taxpayeradvocate.irs.gov →
        </a>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', padding: '20px 24px' }}>
      {/* Main dashboard content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Greeting + clock */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)' }}>{greeting()}</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>{fmtDate(time)}</div>
        </div>
        <div style={{ background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {US_TIMEZONES.map(z => (
              <div key={z.zone} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{z.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600, color: 'var(--t2)', marginTop: 2 }}>{fmtZoneTime(time, z.zone)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards — drag to rearrange, auto-saves per employee */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          {orderedCards.map((card, idx) => (
            <StatCard key={card.label} card={card} idx={idx} />
          ))}
        </div>
        {saveIndicator && (
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--ok)', marginTop: 6, fontWeight: 600 }}>
            ✅ Layout saved
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="detail-2col" style={{ display: 'grid', gridTemplateColumns: isTaxAdvisor ? '1fr' : '1fr 1fr', gap: 14 }}>


        {!isTaxAdvisor && (
        <>
        {/* Active Cases */}
        <div className="card">
          <div className="ch">
            <span className="ct">🗂 Active Cases</span>
            <button className="btn sm" onClick={() => navigate('/cases')}>View All →</button>
          </div>
          {recentCases.length === 0
            ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No cases yet</div>
            : recentCases.map(c => (
              <div key={c.id} onClick={() => navigate('/cases')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--br)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.clientName}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{c.caseType} {c.irsBalance ? '· $' + Number(c.irsBalance).toLocaleString() : ''}</div>
                </div>
                <span className={`bdg ${c.status === 'Open' ? 'bb' : c.status === 'Resolved' ? 'bg' : 'ba'}`} style={{ fontSize: 10, flexShrink: 0 }}>{c.status}</span>
              </div>
            ))
          }
        </div>

        {/* Open Tasks */}
        <div className="card">
          <div className="ch">
            <span className="ct">✅ Open Tasks</span>
            <button className="btn sm" onClick={() => navigate('/tasks')}>All Tasks →</button>
          </div>
          {tasks.length === 0
            ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No open tasks</div>
            : tasks.map(t => {
              const overdue = t.dueDate && new Date(t.dueDate) < new Date()
              return (
                <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--br)' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid var(--blue)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: overdue ? 'var(--bad)' : 'var(--t3)' }}>
                      {t.clientName && `${t.clientName} · `}{t.dueDate ? (overdue ? '⚠ ' : '') + t.dueDate : ''}
                    </div>
                  </div>
                  <span className={`bdg ${t.priority === 'High' ? 'br' : t.priority === 'Low' ? 'bn' : 'ba'}`} style={{ fontSize: 10, flexShrink: 0 }}>{t.priority || 'Normal'}</span>
                </div>
              )
            })
          }
        </div>

        {/* IRS Deadlines */}
        <div className="card">
          <div className="ch">
            <span className="ct">⏰ IRS Deadlines</span>
            <button className="btn sm" onClick={() => navigate('/deadlines')}>All →</button>
          </div>
          {deadlines.length === 0
            ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No upcoming deadlines</div>
            : deadlines.map(d => {
              const dl = daysLeft(d)
              const overdue = dl < 0, urgent = dl >= 0 && dl <= 7
              return (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--br)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || d.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{d.clientName || d.client || ''} · {d.dueDate}</div>
                  </div>
                  <span className={`bdg ${overdue ? 'br' : urgent ? 'ba' : 'bg'}`} style={{ fontSize: 10, flexShrink: 0, marginLeft: 8 }}>
                    {overdue ? 'OVERDUE' : dl === 0 ? 'TODAY' : dl + 'd'}
                  </span>
                </div>
              )
            })
          }
        </div>
        </>
        )}

        {showRecentClients ? (
          /* Recent Clients — Tax Associate / Manager work client files day-to-day */
          <div className="card">
            <div className="ch">
              <span className="ct">🏢 Recent Clients</span>
              <button className="btn sm" onClick={() => navigate('/clients')}>All Clients →</button>
            </div>
            {recentClients.length === 0
              ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No clients yet</div>
              : recentClients.map(c => (
                <div key={c.id} onClick={() => navigate('/clients')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--br)', cursor: 'pointer' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {(c.name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{c.issueType || ''} {c.irsBalance ? '· $' + Number(c.irsBalance).toLocaleString() : ''}</div>
                  </div>
                </div>
              ))
            }
          </div>
        ) : (
          /* Recent Leads — Tax Advisor sees only their own assigned leads */
          <div className="card">
            <div className="ch">
              <span className="ct">👤 Recent Leads{isTaxAdvisor ? ' — Yours' : ''}</span>
              <button className="btn sm" onClick={() => navigate('/leads')}>All Leads →</button>
            </div>
            {(isTaxAdvisor ? recentLeads.filter(l => l.assignedTo === employeeName) : recentLeads).length === 0
              ? <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>No leads yet</div>
              : (isTaxAdvisor ? recentLeads.filter(l => l.assignedTo === employeeName) : recentLeads).map(l => (
                <div key={l.id} onClick={() => navigate('/leads')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--br)', cursor: 'pointer' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {(l.name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{l.issueType || l.source || ''} {l.irsBalance ? '· ~' + l.irsBalance : ''}</div>
                  </div>
                  <span className="bdg bb" style={{ fontSize: 10, flexShrink: 0 }}>{l.status}</span>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="ch"><span className="ct">⚡ Quick Actions</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {[
            ['👤 New Lead', '/leads', 'leads'], ['🏢 New Client', '/clients', 'clients'],
            ['📁 New Case', '/cases', 'cases'], ['✅ New Task', '/tasks', 'tasks'],
            ['🧾 New Invoice', '/invoices', 'invoices'], ['⏰ Add Deadline', '/deadlines', 'deadlines'],
            ['📅 Schedule', '/calendar', 'calendar'], ['💬 Team Chat', '/chat', 'chat'],
          ].filter(([, , section]) => can('edit', section)).map(([label, to]) => (
            <button key={label} className="btn" style={{ justifyContent: 'flex-start', fontSize: 13, padding: '9px 12px' }} onClick={() => navigate(to)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* TAS Sidebar — right side, Admin/SuperAdmin only */}
      {!isTaxAdvisor && !isTaxAssociate && !isManager && <TASWidget />}
    </div>
  )
}

