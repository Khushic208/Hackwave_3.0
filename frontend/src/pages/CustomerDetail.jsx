import React, { useEffect, useState } from 'react'
import axios from 'axios'
import {
  ArrowLeft, CheckCircle, XCircle, AlertCircle, Copy, Bot,
  Calendar, Mail, Phone, Database, Activity, Headphones,
  TrendingDown, TrendingUp, Clock, ChevronRight, Edit3, ExternalLink
} from 'lucide-react'
import RiskBadge from '../components/RiskBadge'
import {
  RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer
} from 'recharts'

const API = 'http://localhost:4001/api'

const TABS = ['Overview', 'Signals', 'AI Analysis', 'Actions', 'History']

export default function CustomerDetail({ customerId, onBack, customers = [] }) {
  const [customer, setCustomer] = useState(null)
  const [tab, setTab] = useState('Overview')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [actionStatus, setActionStatus] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!customerId) return
    setLoading(true)

    // First try to find in the already-loaded customers list (no extra API call)
    const fromStore = customers.find(c => c.id === customerId || c.id === parseInt(customerId))
    if (fromStore) {
      setCustomer(fromStore)
      setLoading(false)
      return
    }

    // Fallback: fetch individually from backend
    axios.get(`${API}/customers/${customerId}`)
      .then(r => setCustomer(r.data))
      .finally(() => setLoading(false))
  }, [customerId, customers])

  const handleCopyEmail = () => {
    if (customer?.emailDraft) {
      navigator.clipboard.writeText(customer.emailDraft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCustomerAction = async action => {
    setActionLoading(true)
    setActionError('')
    try {
      const response = await axios.post(`${API}/customers/${customerId}/actions`, { action })
      setCustomer(response.data.customer)
      setActionStatus({
        message: action === 'approve-task'
          ? 'Task approved and added to Tasks & Renewals'
          : action === 'approve-crm-update'
            ? 'CRM update approved and saved to this customer record'
            : 'Proposed CRM update rejected',
        rejected: action === 'reject',
      })
    } catch (err) {
      setActionError(err.response?.data?.error || 'Action failed. Check that the backend and database are running.')
    } finally {
      setActionLoading(false)
    }
  }

  if (!customerId) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Bot size={40} className="mb-3 opacity-40" />
      <p className="text-sm">Select a customer to view their 360° profile</p>
    </div>
  )

  if (loading) return (
    <div className="text-slate-400 text-sm animate-pulse p-6">Loading customer details...</div>
  )

  if (!customer) return (
    <div className="text-red-400 text-sm p-6">Customer not found.</div>
  )

  const riskColor = customer.riskLevel === 'High' ? '#ef4444' : customer.riskLevel === 'Medium' ? '#f59e0b' : '#22c55e'
  const gaugeData = [{ value: customer.riskScore, fill: riskColor }]

  return (
    <div className="flex flex-col h-full space-y-0">
      {/* Header */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5 mb-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-lg font-bold text-white flex-shrink-0">
            {customer.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white">{customer.name}</h2>
              <RiskBadge level={customer.riskLevel} />
            </div>
            <p className="text-xs text-slate-400">{customer.industry} · Owner: {customer.owner}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 border-b border-[#1e2d3d]">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'text-blue-400 border-blue-500'
                  : 'text-slate-400 border-transparent hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'Overview' && <OverviewTab customer={customer} riskColor={riskColor} gaugeData={gaugeData} />}
      {tab === 'Signals' && <SignalsTab customer={customer} />}
      {tab === 'AI Analysis' && <AIAnalysisTab customer={customer} onCopyEmail={handleCopyEmail} copied={copied} />}
      {tab === 'Actions' && (
        <ActionsTab
          customer={customer}
          actionStatus={actionStatus}
          actionError={actionError}
          actionLoading={actionLoading}
          onAction={handleCustomerAction}
        />
      )}
      {tab === 'History' && <HistoryTab customer={customer} />}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ customer, riskColor, gaugeData }) {
  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Risk Score" value={
          <div className="flex items-center gap-2">
            <div className="relative w-14 h-14">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="60%" outerRadius="100%" data={gaugeData} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background={{ fill: '#1e2d3d' }} dataKey="value" angleAxisId={0} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold" style={{ color: riskColor }}>{customer.riskScore}</span>
              </div>
            </div>
            <span className="text-xs text-slate-400">/100</span>
          </div>
        } />
        <MetricCard label="Renewal Date" value={
          <div>
            <div className="text-sm font-bold text-white">{customer.renewal}</div>
            <div className="text-xs text-slate-400">{customer.daysToRenewal} days left</div>
          </div>
        } />
        <MetricCard label="Usage Change" value={
          <div className={`flex items-center gap-1 text-sm font-bold ${customer.usageChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {customer.usageChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {customer.usageChange}%
            <div className="text-xs text-slate-400 mt-0.5 block">last 30 days</div>
          </div>
        } />
        <MetricCard label="ARR" value={
          <div>
            <div className="text-sm font-bold text-white">${customer.arr?.toLocaleString()}</div>
            <div className="text-xs text-slate-400">${customer.mrr?.toLocaleString()}/mo</div>
          </div>
        } />
      </div>

      {/* Engagement Summary */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-4">
        <h3 className="text-xs font-semibold text-white mb-3 uppercase tracking-wider">Engagement Summary</h3>
        <div className="grid grid-cols-3 gap-4">
          <EngCard icon={Calendar} color="blue" label="Last Meeting" value={customer.lastMeeting} warn={customer.lastMeeting !== '1 day ago' && customer.lastMeeting !== '2 days ago'} />
          <EngCard icon={Mail} color="yellow" label="Unanswered Emails" value={`${customer.unansweredEmails} pending`} warn={customer.unansweredEmails > 0} />
          <EngCard icon={CheckCircle} color={customer.noNextStep ? 'red' : 'green'} label="Next Step in CRM" value={customer.noNextStep ? 'Not Recorded' : 'Recorded'} warn={customer.noNextStep} />
        </div>
      </div>

      {/* Data Sources */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-4">
        <h3 className="text-xs font-semibold text-white mb-3 uppercase tracking-wider">Data Sources & Freshness</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'CRM', data: customer.crm, icon: Database },
            { label: 'Calendar', data: customer.calendar, icon: Calendar },
            { label: 'Email', data: customer.email, icon: Mail },
            { label: 'Product Usage', data: customer.productUsage, icon: Activity },
            { label: 'Support', data: customer.support, icon: Headphones },
          ].map(({ label, data, icon: Icon }) => (
            <div key={label} className={`rounded-lg p-3 border ${data?.status === 'Connected' ? 'bg-green-500/5 border-green-500/20' : 'bg-yellow-500/5 border-yellow-500/30'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} className={data?.status === 'Connected' ? 'text-green-400' : 'text-yellow-400'} />
                <span className="text-xs font-medium text-white">{label}</span>
              </div>
              <div className="text-[10px] text-slate-400">{data?.lastSync || 'Not connected'}</div>
              {data?.status !== 'Connected' && (
                <div className="text-[10px] text-yellow-400 mt-0.5">Missing data: {label} not connected</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Signals Tab ─────────────────────────────────────────────────────────────
function SignalsTab({ customer }) {
  return (
    <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">Risk Signals</h3>
      <div className="space-y-2">
        {(customer.signals || []).map((s, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-[#1a2942] rounded-lg border border-[#1e2d3d]">
            <AlertCircle size={14} className={customer.riskLevel === 'High' ? 'text-red-400' : customer.riskLevel === 'Medium' ? 'text-yellow-400' : 'text-green-400'} />
            <span className="text-sm text-slate-300">{s}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-[#1e2d3d]">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Signal Coverage</h4>
        {[
          { label: 'CRM Data', status: customer.crm?.status },
          { label: 'Email Activity', status: customer.email?.status },
          { label: 'Calendar Events', status: customer.calendar?.status },
          { label: 'Product Usage', status: customer.productUsage?.status },
          { label: 'Support Tickets', status: customer.support?.status },
        ].map(({ label, status }) => (
          <div key={label} className="flex items-center justify-between py-2 border-b border-[#1e2d3d] last:border-0">
            <span className="text-xs text-slate-400">{label}</span>
            <div className={`flex items-center gap-1.5 text-xs ${status === 'Connected' ? 'text-green-400' : 'text-yellow-400'}`}>
              {status === 'Connected' ? <CheckCircle size={11} /> : <XCircle size={11} />}
              {status}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AI Analysis Tab ──────────────────────────────────────────────────────────
function AIAnalysisTab({ customer, onCopyEmail, copied }) {
  return (
    <div className="space-y-4">
      {/* AI Reasoning */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
              <Bot size={13} className="text-white" />
            </div>
            <h3 className="text-sm font-semibold text-white">Evidence-backed AI Reasoning</h3>
          </div>
          <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5">
            Confidence: {customer.aiConfidence}%
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{customer.aiReasoning}</p>
      </div>

      {/* Recommended Next Action */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-purple-600 rounded-lg flex items-center justify-center">
            <ChevronRight size={13} className="text-white" />
          </div>
          <h3 className="text-sm font-semibold text-white">Recommended Next Action</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{customer.nextAction}</p>
      </div>

      {/* Action Plan */}
      {customer.actionPlan?.length > 0 && (
        <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">3-Month Action Plan</h3>
          <div className="space-y-2">
            {customer.actionPlan.map((a, i) => (
              <div key={i} className="p-3 bg-[#0d1b2a] rounded-lg border border-[#1e2d3d]">
                <div className="text-[10px] text-blue-400 font-semibold mb-0.5">{a.week}</div>
                <div className="text-xs text-white">{a.action}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Goal: {a.goal}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Draft */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Email Draft <span className="text-xs text-slate-500 font-normal">(Editable)</span></h3>
          </div>
          <button onClick={onCopyEmail} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <Copy size={11} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans bg-[#0d1b2a] rounded-lg p-4 border border-[#1e2d3d]">
          {customer.emailDraft}
        </pre>
      </div>

      {/* Expansion Opportunity */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-green-400" />
          <h3 className="text-sm font-semibold text-white">Expansion Opportunities</h3>
        </div>
        <p className="text-xs text-slate-300">{customer.expansionOpportunity}</p>
        <button className="mt-3 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
          View Details <ExternalLink size={11} />
        </button>
      </div>
    </div>
  )
}

// ─── Actions Tab ─────────────────────────────────────────────────────────────
function ActionsTab({ customer, actionStatus, actionError, actionLoading, onAction }) {
  const actions = [
    { id: 'approve-task', stateKey: 'approveTask', label: 'Approve & Create Task', color: 'bg-green-600 hover:bg-green-700', icon: CheckCircle },
    { id: 'approve-crm-update', stateKey: 'approveCrmUpdate', label: 'Approve CRM Update', color: 'bg-blue-600 hover:bg-blue-700', icon: Database },
    { id: 'reject', stateKey: 'reject', label: 'Reject', color: 'bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400', icon: XCircle },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Approval & Execution</h3>
        {actionStatus && (
          <div className={`flex items-center gap-2 text-sm mb-3 ${actionStatus.rejected ? 'text-red-400' : 'text-green-400'}`}>
            {actionStatus.rejected ? <XCircle size={15} /> : <CheckCircle size={15} />}
            {actionStatus.message}
          </div>
        )}
        {actionError && (
          <div role="alert" className="mb-3 text-sm text-red-400">{actionError}</div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          {actions.map(a => (
            <button
              key={a.id}
              onClick={() => onAction(a.id)}
              disabled={actionLoading || Boolean(customer._actions?.[a.stateKey]) ||
                (a.id === 'approve-crm-update' && Boolean(customer._actions?.reject)) ||
                (a.id === 'reject' && Boolean(customer._actions?.approveCrmUpdate))}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${a.color}`}
            >
              <a.icon size={13} />
              {customer._actions?.[a.stateKey]
                ? a.id === 'reject' ? 'Rejected' : 'Approved'
                : actionLoading ? 'Saving...' : a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Edit3 size={14} className="text-blue-400" /> Proposed CRM Update
        </h3>
        <div className="space-y-2 text-xs text-slate-300">
          <div className="flex items-center justify-between py-2 border-b border-[#1e2d3d]">
            <span className="text-slate-500">Status</span>
            <span className="text-yellow-400">{customer.crmUpdate?.status || `${customer.riskLevel} Risk`}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[#1e2d3d]">
            <span className="text-slate-500">Assigned To</span>
            <span className="text-white">{customer.crmUpdate?.assignedTo || customer.owner}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-500">Due Date</span>
            <span className="text-white">{customer.crmUpdate?.dueDate || customer.renewal || 'Not set'}</span>
          </div>
        </div>
        {customer.crmUpdate?.approvalStatus && (
          <p className={`text-xs mt-3 ${customer.crmUpdate.approvalStatus === 'Rejected' ? 'text-red-400' : 'text-green-400'}`}>
            {customer.crmUpdate.approvalStatus}
          </p>
        )}
        <p className="text-[11px] text-slate-500 mt-3">
          Approval is saved to this app and its database; no external CRM is connected for updates.
        </p>
      </div>
    </div>
  )
}

// ─── History Tab ─────────────────────────────────────────────────────────────
function HistoryTab({ customer }) {
  return (
    <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Recent Activity</h3>
      <div className="space-y-3">
        {(customer.recentActivity || []).map((act, i) => (
          <div key={i} className="flex items-start gap-3 pb-3 border-b border-[#1e2d3d] last:border-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${act.type === 'AI' ? 'bg-blue-600/30' : 'bg-purple-600/30'}`}>
              {act.type === 'AI' ? <Bot size={11} className="text-blue-400" /> : <Database size={11} className="text-purple-400" />}
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-300">{act.desc}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Clock size={10} className="text-slate-500" />
                <span className="text-[10px] text-slate-500">{act.time}</span>
                <span className="text-[10px] text-slate-600">·</span>
                <span className={`text-[10px] font-medium ${act.type === 'AI' ? 'text-blue-400' : 'text-purple-400'}`}>{act.by}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function MetricCard({ label, value }) {
  return (
    <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-4">
      <div className="text-xs text-slate-400 mb-2">{label}</div>
      {value}
    </div>
  )
}

function EngCard({ icon: Icon, color, label, value, warn }) {
  const colors = { blue: 'text-blue-400', yellow: 'text-yellow-400', red: 'text-red-400', green: 'text-green-400' }
  return (
    <div className={`p-3 rounded-lg border ${warn ? 'bg-red-500/5 border-red-500/20' : 'bg-[#1a2942] border-[#1e2d3d]'}`}>
      <Icon size={14} className={colors[color]} />
      <div className="text-xs font-medium text-white mt-1.5">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  )
}
