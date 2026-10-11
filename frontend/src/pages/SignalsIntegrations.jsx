import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Database, CheckCircle, Bot, Loader, Zap,
  ChevronDown, ChevronUp, AlertTriangle, TrendingDown, TrendingUp,
  RefreshCw, GitMerge, Activity, Shield, User
} from 'lucide-react'

const API = 'http://localhost:4000/api'

export default function SignalsIntegrations() {
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState(false)
  const [results, setResults] = useState([])
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null)
  const [syncLog, setSyncLog] = useState([])

  // Check integration status on load
  useEffect(() => {
    axios.get(`${API}/integrations/status`)
      .then(r => setStatus(r.data))
      .catch(() => {})
  }, [])

  const addLog = (msg) => setSyncLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg }])

  // ── Main sync function ──────────────────────────────────────────────────────
  const runSync = async () => {
    setSyncing(true)
    setSynced(false)
    setResults([])
    setError(null)
    setSyncLog([])

    try {
      addLog('Connecting to your data sources...')
      addLog('Fetching contacts, deals, and activity...')

      const res = await axios.post(`${API}/sync/hubspot`, {}, { timeout: 120000 })

      if (res.data.total === 0) {
        setError(res.data.message || 'No customer records found. Add customer records with names and email addresses, then try again.')
        setSyncing(false)
        return
      }

      addLog(`Fetched ${res.data.total} customer records`)
      if (res.data.gmailEnriched) addLog('Communication signals enriched')
      addLog('Running AI risk analysis on each customer...')
      addLog(`✅ Analysis complete — ${res.data.total} customers scored`)

      setResults(res.data.results || [])
      setSynced(true)
      window.dispatchEvent(new Event('crm-synced'))
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setError(`Sync failed: ${msg}`)
      addLog(`❌ Error: ${msg}`)
    }

    setSyncing(false)
  }

  const highCount = results.filter(r => r.riskLevel === 'High').length
  const medCount = results.filter(r => r.riskLevel === 'Medium').length
  const lowCount = results.filter(r => r.riskLevel === 'Low').length

  return (
    <div className="signals-page space-y-6">
      {/* Header */}
      <div className="signals-header">
        <h1 className="flex items-center gap-3">
          <span className="page-icon signals-page-icon"><Zap size={21} /></span>
          Signals &amp; Integrations
        </h1>
        <p className="text-base text-slate-500 mt-2 ml-14">
          Connect your real CRM data → AI calculates risk scores → Explains why each customer is at risk
        </p>
      </div>

      {/* Pipeline steps */}
      <div className="signals-steps grid grid-cols-4 gap-3">
        {[
          { step: '01', label: 'Fetch Customer Data', done: synced, icon: Database, color: 'bg-blue-600' },
          { step: '02', label: 'Extract Signals', done: synced, icon: Activity, color: 'bg-purple-600' },
          { step: '03', label: 'Calculate Risk Score', done: synced, icon: Shield, color: 'bg-orange-600' },
          { step: '04', label: 'AI Explanation', done: synced && results.length > 0, icon: Bot, color: 'bg-green-600' },
        ].map((s, i) => (
          <div key={i} className={`signal-step ${s.done ? 'is-done' : ''}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${s.done ? s.color : 'bg-[#1a2942]'}`}>
              <s.icon size={14} className={s.done ? 'text-white' : 'text-slate-600'} />
            </div>
            <div className={`text-[10px] font-bold mb-0.5 ${s.done ? 'text-blue-400' : 'text-slate-600'}`}>STEP {s.step}</div>
            <div className="text-xs font-medium text-white">{s.label}</div>
            {s.done && <div className="text-[10px] text-green-400 mt-1 flex items-center gap-1"><CheckCircle size={9}/> Done</div>}
          </div>
        ))}
      </div>

      {/* Main Sync Card */}
      <div className={`signal-sync-card ${synced ? 'is-synced' : ''}`}>
        <div className="signal-sync-layout flex items-start justify-between gap-4 flex-wrap">
          <div className="signal-connection flex items-center gap-4">
            {/* Connected data sources */}
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 bg-teal-600 rounded-xl flex items-center justify-center">
                <Database size={21} className="text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-white">Connected customer data</h3>
                {status && (status.hubspot?.connected || status.gmail?.connected) && (
                  <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle size={8}/> Sources connected
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Fetches customer contacts, deal stages, communication activity, and support data. AI analyzes all signals to calculate churn risk.
              </p>
              {/* What gets fetched */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['Contacts & Emails', 'Deal Stage & ARR', 'Last Activity', 'Email Activity', 'Support Tickets', 'Renewal Dates'].map(f => (
                  <span key={f} className="text-[10px] px-2 py-0.5 rounded-full border bg-blue-500/10 border-blue-500/20 text-blue-300">{f}</span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={runSync}
            disabled={syncing}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#FF7A59] hover:bg-[#e8684a] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0"
          >
            {syncing
              ? <><Loader size={14} className="animate-spin"/> Syncing...</>
              : <><RefreshCw size={14}/> {synced ? 'Re-sync & Analyze' : 'Sync & Analyze with AI'}</>}
          </button>
        </div>

        {/* Sync log */}
        {syncLog.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#1e2d3d] space-y-1">
            {syncLog.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-slate-600 text-[10px]">{l.time}</span>
                <span className={l.msg.startsWith('✅') ? 'text-green-400' : l.msg.startsWith('❌') ? 'text-red-400' : 'text-slate-300'}>{l.msg}</span>
              </div>
            ))}
            {syncing && <div className="flex items-center gap-2 text-xs text-blue-400 animate-pulse"><Loader size={10} className="animate-spin"/> Processing...</div>}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">{error}</div>
              {error.includes('No contacts') && (
                <div className="mt-1 text-red-400/70">
                  Add contacts with name and email address, then sync again.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {synced && results.length > 0 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="signals-results-summary flex items-center gap-4 flex-wrap">
              <h3 className="text-base font-semibold text-white">{results.length} customers analyzed</h3>
            <div className="flex items-center gap-2">
              {highCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">{highCount} High</span>}
              {medCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">{medCount} Medium</span>}
              {lowCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">{lowCount} Low</span>}
            </div>
            <span className="text-xs text-slate-500 ml-auto">Click any row to see AI reasoning</span>
          </div>

          {/* Customer result cards */}
          {results.map((r, i) => (
            <CustomerResultCard
              key={i}
              result={r}
              expanded={expandedIdx === i}
              onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!syncing && !synced && !error && (
        <div className="signals-empty">
          <div className="signals-empty-icon"><Database size={30}/></div>
          <p className="text-lg font-medium text-slate-700">Ready to sync real customer data</p>
          <p className="text-sm mt-1 text-slate-500">Click “Sync &amp; Analyze with AI” to fetch your customer records</p>
        </div>
      )}
    </div>
  )
}

// ─── Customer Result Card ──────────────────────────────────────────────────────
function CustomerResultCard({ result, expanded, onToggle }) {
  const level = result.riskLevel
  const score = result.riskScore

  const lc = level === 'High'
    ? { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', bar: 'bg-red-500' }
    : level === 'Medium'
    ? { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', bar: 'bg-yellow-500' }
    : { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', bar: 'bg-green-500' }

  return (
    <div className={`bg-[#112240] rounded-xl border overflow-hidden transition-all ${expanded ? lc.border : 'border-[#1e2d3d]'}`}>
      {/* Row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-indigo-50/60 transition-colors"
        onClick={onToggle}
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {result.name?.[0]?.toUpperCase() || '?'}
        </div>

        {/* Name + details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{result.name}</span>
            {result.company && result.company !== result.name && (
              <span className="text-[10px] text-slate-500 bg-[#1a2942] px-2 py-0.5 rounded-full border border-[#1e2d3d]">{result.company}</span>
            )}
            <span className={`text-[10px] flex items-center gap-0.5 ${
              result.source === 'Local demo data' ? 'text-slate-500' : 'text-teal-700'
            }`}>
              <Database size={8}/> {result.source === 'Local demo data' ? 'Demo data' : 'Live data'}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {result.email && <span className="mr-3">{result.email}</span>}
            {result.dealStage && <span className="mr-3">Deal: {result.dealStage}</span>}
            {result.arr > 0 && <span>ARR: ${result.arr.toLocaleString()}</span>}
          </div>
        </div>

        {/* Risk score */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden md:block text-right">
            <div className="text-[10px] text-slate-500 mb-1">Risk Score</div>
            <div className="flex items-center gap-2">
              <div className="w-20 bg-[#1e2d3d] rounded-full h-2">
                <div className={`h-full rounded-full ${lc.bar}`} style={{ width: `${score}%` }} />
              </div>
              <span className={`text-sm font-bold ${lc.text}`}>{score}</span>
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-lg font-semibold border ${lc.bg} ${lc.text} ${lc.border}`}>
            {level}
          </span>
          {expanded ? <ChevronUp size={14} className="text-slate-400"/> : <ChevronDown size={14} className="text-slate-400"/>}
        </div>
      </div>

      {/* Expanded: fetch customer detail from backend */}
      {expanded && (
        <ExpandedDetail result={result} lc={lc} />
      )}
    </div>
  )
}

// ─── Expanded Detail (fetches from /api/customers by name match) ──────────────
function ExpandedDetail({ result, lc }) {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    // Find the customer in backend by email or name
    axios.get(`${API}/customers`).then(res => {
      const found = res.data.find(c =>
        c.email === result.email || c.name === result.name
      )
      setDetail(found || null)
    }).catch(() => {})
  }, [result.name, result.email])

  if (!detail) return (
    <div className="border-t border-[#1e2d3d] px-5 py-4 bg-[#0d1417]">
      <div className="animate-pulse text-xs text-slate-500">Loading AI analysis...</div>
    </div>
  )

  return (
    <div className="border-t border-[#1e2d3d] px-5 py-4 bg-[#0d1417] space-y-4">

      {/* Score breakdown + AI reasoning */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Breakdown */}
        <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Risk Score Breakdown — {detail.riskScore}/100
          </div>
          <div className="space-y-2">
            {(detail.riskBreakdown || []).map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex-1">{b.factor}</span>
                <span className="text-slate-500 text-[10px] mx-2">{b.value}</span>
                <span className={`font-bold w-8 text-right ${b.points > 0 ? lc.text : 'text-green-400'}`}>
                  {b.points > 0 ? `+${b.points}` : b.points}
                </span>
              </div>
            ))}
            {(!detail.riskBreakdown || detail.riskBreakdown.length === 0) && (
              <p className="text-xs text-slate-500">No breakdown available</p>
            )}
          </div>
        </div>

        {/* AI Reasoning */}
        <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
          <div className="flex items-center gap-2 mb-3">
            <Bot size={13} className="text-blue-400"/>
            <div className="text-xs font-semibold text-white">AI Reasoning</div>
            <span className="text-[10px] text-slate-500 ml-auto">Confidence: {detail.aiConfidence}%</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{detail.aiReasoning}</p>
          {detail.predictedOutcome && (
            <div className="mt-3 pt-3 border-t border-[#1e2d3d]">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Predicted outcome:</div>
              <p className="text-xs text-red-300">{detail.predictedOutcome}</p>
            </div>
          )}
        </div>
      </div>

      {/* Risk Drivers */}
      {detail.riskDrivers?.length > 0 && (
        <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Risk Drivers</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {detail.riskDrivers.map((d, i) => (
              <div key={i} className={`rounded-lg p-3 border ${
                d.impact === 'High' ? 'bg-red-500/5 border-red-500/20' :
                d.impact === 'Medium' ? 'bg-yellow-500/5 border-yellow-500/20' :
                'bg-green-500/5 border-green-500/20'
              }`}>
                <div className={`text-[10px] font-semibold mb-1 ${
                  d.impact === 'High' ? 'text-red-400' : d.impact === 'Medium' ? 'text-yellow-400' : 'text-green-400'
                }`}>{d.impact} Impact</div>
                <div className="text-xs font-medium text-white mb-1">{d.driver}</div>
                <div className="text-[10px] text-slate-400">{d.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Plan */}
      {detail.actionPlan?.length > 0 && (
        <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">3-Month Action Plan</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {detail.actionPlan.map((a, i) => (
              <div key={i} className="bg-[#0d1b2a] rounded-lg p-3 border border-[#1e2d3d]">
                <div className="text-[10px] text-blue-400 font-semibold mb-1">{a.week}</div>
                <div className="text-xs text-white mb-1">{a.action}</div>
                <div className="text-[10px] text-slate-400">Goal: {a.goal}</div>
              </div>
            ))}
          </div>
          {detail.nextAction && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="text-[10px] text-red-400 font-semibold uppercase mb-1">⚡ Do Today</div>
              <p className="text-xs text-white">{detail.nextAction}</p>
            </div>
          )}
        </div>
      )}

      {/* Email Draft */}
      {detail.emailDraft && (
        <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">AI Email Draft</div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{detail.emailDraft}</pre>
          {detail.expansionOpportunity && detail.expansionOpportunity !== 'None at this time' && (
            <div className="mt-3 pt-3 border-t border-[#1e2d3d] text-xs text-green-400">
              💡 {detail.expansionOpportunity}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
