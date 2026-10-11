import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Database, CheckCircle, XCircle, Bot, Users, Loader, Zap,
  ChevronDown, ChevronUp, AlertTriangle, TrendingDown, TrendingUp,
  RefreshCw, GitMerge, Activity, Calendar
} from 'lucide-react'

const API = 'http://localhost:4000/api'

// ─── Every company exists in BOTH Salesforce AND HubSpot ─────────────────────
// SF = CRM signals (activity, health, support, usage drop)
// HS = Marketing signals (email opens, NPS, deal stage, usage score)
// Backend merges them by company name → one unified record per customer
const SALESFORCE_RAW = [
  {
    sfId: 'SF-001', name: 'Zomato Business', owner: 'Priya Mehta', industry: 'Food & Logistics',
    arr: 180000, daysToRenewal: 21, renewal: 'May 8, 2025',
    lastActivityDays: 26, openOpportunities: 0, stage: 'Renewal',
    contact: { name: 'Aditya Ghosh', title: 'VP Operations', lastEmailDays: 22, replied: false },
    caseCount: 4, health: 'Critical', usageDrop: -38,
  },
  {
    sfId: 'SF-002', name: 'Razorpay Enterprises', owner: 'Rahul Sharma', industry: 'Finance & Payments',
    arr: 240000, daysToRenewal: 58, renewal: 'Jun 25, 2025',
    lastActivityDays: 11, openOpportunities: 2, stage: 'Renewal',
    contact: { name: 'Shashank Kumar', title: 'CTO', lastEmailDays: 8, replied: true },
    caseCount: 2, health: 'At Risk', usageDrop: -17,
  },
  {
    sfId: 'SF-003', name: 'Meesho Seller Platform', owner: 'Amit Verma', industry: 'E-Commerce',
    arr: 95000, daysToRenewal: 9, renewal: 'Apr 25, 2025',
    lastActivityDays: 35, openOpportunities: 0, stage: 'Renewal',
    contact: { name: 'Vidit Aatrey', title: 'CEO', lastEmailDays: 31, replied: false },
    caseCount: 5, health: 'Critical', usageDrop: -44,
  },
  {
    sfId: 'SF-004', name: 'HDFC Securities', owner: 'Sneha Rao', industry: 'Finance',
    arr: 320000, daysToRenewal: 95, renewal: 'Jul 30, 2025',
    lastActivityDays: 4, openOpportunities: 3, stage: 'Upsell',
    contact: { name: 'Dhiraj Relli', title: 'MD & CEO', lastEmailDays: 3, replied: true },
    caseCount: 0, health: 'Healthy', usageDrop: 22,
  },
  {
    sfId: 'SF-005', name: 'Apollo Hospitals Digital', owner: 'Vikram Nair', industry: 'Healthcare',
    arr: 145000, daysToRenewal: 44, renewal: 'Jun 10, 2025',
    lastActivityDays: 19, openOpportunities: 1, stage: 'Renewal',
    contact: { name: 'Dr. Sangita Reddy', title: 'Joint MD', lastEmailDays: 16, replied: false },
    caseCount: 3, health: 'At Risk', usageDrop: -21,
  },
  {
    sfId: 'SF-006', name: 'Delhivery Logistics', owner: 'Karan Mehta', industry: 'Logistics',
    arr: 112000, daysToRenewal: 72, renewal: 'Jul 12, 2025',
    lastActivityDays: 5, openOpportunities: 2, stage: 'Expansion',
    contact: { name: 'Sahil Barua', title: 'CEO', lastEmailDays: 4, replied: true },
    caseCount: 1, health: 'Healthy', usageDrop: 15,
  },
  {
    sfId: 'SF-007', name: 'Nykaa Fashion', owner: 'Anjali Desai', industry: 'Retail & E-Commerce',
    arr: 68000, daysToRenewal: 18, renewal: 'May 5, 2025',
    lastActivityDays: 20, openOpportunities: 0, stage: 'Renewal',
    contact: { name: 'Falguni Nayar', title: 'CEO', lastEmailDays: 18, replied: false },
    caseCount: 2, health: 'At Risk', usageDrop: -28,
  },
  {
    sfId: 'SF-008', name: 'Zepto Quick Commerce', owner: 'Sandeep Yadav', industry: 'Quick Commerce',
    arr: 52000, daysToRenewal: 120, renewal: 'Aug 28, 2025',
    lastActivityDays: 3, openOpportunities: 2, stage: 'Expansion',
    contact: { name: 'Aadit Palicha', title: 'CEO', lastEmailDays: 2, replied: true },
    caseCount: 0, health: 'Healthy', usageDrop: 28,
  },
]

const HUBSPOT_RAW = [
  {
    hsId: 'HS-001', name: 'Zomato Business', owner: 'Priya Mehta', industry: 'Food & Logistics',
    arr: 180000, daysToRenewal: 21, renewal: 'May 8, 2025',
    lastEmailDays: 22, emailOpens: 0, meetingBooked: false,
    dealStage: 'Churn Risk', usageScore: 18, npsScore: 3,
  },
  {
    hsId: 'HS-002', name: 'Razorpay Enterprises', owner: 'Rahul Sharma', industry: 'Finance & Payments',
    arr: 240000, daysToRenewal: 58, renewal: 'Jun 25, 2025',
    lastEmailDays: 8, emailOpens: 3, meetingBooked: true,
    dealStage: 'Renewal Risk', usageScore: 42, npsScore: 6,
  },
  {
    hsId: 'HS-003', name: 'Meesho Seller Platform', owner: 'Amit Verma', industry: 'E-Commerce',
    arr: 95000, daysToRenewal: 9, renewal: 'Apr 25, 2025',
    lastEmailDays: 31, emailOpens: 0, meetingBooked: false,
    dealStage: 'Churn Risk', usageScore: 11, npsScore: 2,
  },
  {
    hsId: 'HS-004', name: 'HDFC Securities', owner: 'Sneha Rao', industry: 'Finance',
    arr: 320000, daysToRenewal: 95, renewal: 'Jul 30, 2025',
    lastEmailDays: 3, emailOpens: 7, meetingBooked: true,
    dealStage: 'Expansion', usageScore: 89, npsScore: 9,
  },
  {
    hsId: 'HS-005', name: 'Apollo Hospitals Digital', owner: 'Vikram Nair', industry: 'Healthcare',
    arr: 145000, daysToRenewal: 44, renewal: 'Jun 10, 2025',
    lastEmailDays: 16, emailOpens: 1, meetingBooked: false,
    dealStage: 'Renewal Risk', usageScore: 35, npsScore: 5,
  },
  {
    hsId: 'HS-006', name: 'Delhivery Logistics', owner: 'Karan Mehta', industry: 'Logistics',
    arr: 112000, daysToRenewal: 72, renewal: 'Jul 12, 2025',
    lastEmailDays: 4, emailOpens: 5, meetingBooked: true,
    dealStage: 'Active', usageScore: 84, npsScore: 8,
  },
  {
    hsId: 'HS-007', name: 'Nykaa Fashion', owner: 'Anjali Desai', industry: 'Retail & E-Commerce',
    arr: 68000, daysToRenewal: 18, renewal: 'May 5, 2025',
    lastEmailDays: 20, emailOpens: 1, meetingBooked: false,
    dealStage: 'Renewal Risk', usageScore: 31, npsScore: 5,
  },
  {
    hsId: 'HS-008', name: 'Zepto Quick Commerce', owner: 'Sandeep Yadav', industry: 'Quick Commerce',
    arr: 52000, daysToRenewal: 120, renewal: 'Aug 28, 2025',
    lastEmailDays: 2, emailOpens: 8, meetingBooked: true,
    dealStage: 'Expansion', usageScore: 91, npsScore: 9,
  },
]

export default function SignalsIntegrations() {
  const [sfConnected, setSfConnected] = useState(false)
  const [hsConnected, setHsConnected] = useState(false)
  const [sfSyncing, setSfSyncing] = useState(false)
  const [hsSyncing, setHsSyncing] = useState(false)
  const [sfProgress, setSfProgress] = useState(0)
  const [hsProgress, setHsProgress] = useState(0)
  const [integrating, setIntegrating] = useState(false)
  const [results, setResults] = useState([])
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [integrated, setIntegrated] = useState(false)

  // ── Connect Salesforce ──────────────────────────────────────────────────
  const connectSF = async () => {
    setSfSyncing(true)
    for (let i = 1; i <= SALESFORCE_RAW.length; i++) {
      await delay(200); setSfProgress(i)
    }
    setSfConnected(true); setSfSyncing(false)
  }

  // ── Connect HubSpot ─────────────────────────────────────────────────────
  const connectHS = async () => {
    setHsSyncing(true)
    for (let i = 1; i <= HUBSPOT_RAW.length; i++) {
      await delay(200); setHsProgress(i)
    }
    setHsConnected(true); setHsSyncing(false)
  }

  // ── Integrate + Analyze ─────────────────────────────────────────────────
  const runIntegration = async () => {
    setIntegrating(true)
    setResults([])
    try {
      // Always send both sources together so companies are merged, not analyzed separately
      const payload = {
        salesforce: sfConnected ? SALESFORCE_RAW : [],
        hubspot: hsConnected ? HUBSPOT_RAW : [],
      }

      const res = await axios.post(`${API}/integrate-and-analyze`, payload)
      setResults(res.data.results)
      setIntegrated(true)
      window.dispatchEvent(new Event('crm-synced'))
    } catch (e) {
      console.error(e)
    }
    setIntegrating(false)
  }

  const totalSources = (sfConnected ? 1 : 0) + (hsConnected ? 1 : 0)
  const analyzed = results.filter(r => !r.llmError).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Zap size={20} className="text-yellow-400" /> Signals & Integrations
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Connect Salesforce & HubSpot → Merge data → Rule-based risk score → LLM explains risk & action plan
        </p>
      </div>

      {/* Pipeline Steps */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { step: '01', label: 'Connect Sources', done: totalSources > 0, icon: Database, color: 'blue' },
          { step: '02', label: 'Merge Signals', done: integrated, icon: GitMerge, color: 'purple' },
          { step: '03', label: 'Calculate Risk Score', done: integrated, icon: Activity, color: 'orange' },
          { step: '04', label: 'LLM Explanation', done: analyzed > 0, icon: Bot, color: 'green' },
        ].map((s, i) => (
          <div key={i} className={`bg-[#112240] rounded-xl border p-4 ${s.done ? 'border-blue-500/40' : 'border-[#1e2d3d]'}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${s.done ? `bg-${s.color}-600` : 'bg-[#1a2942]'}`}>
              <s.icon size={15} className={s.done ? 'text-white' : 'text-slate-600'} />
            </div>
            <div className={`text-[10px] font-bold mb-0.5 ${s.done ? 'text-blue-400' : 'text-slate-600'}`}>STEP {s.step}</div>
            <div className="text-xs font-medium text-white">{s.label}</div>
            {s.done && <div className="text-[10px] text-green-400 mt-1 flex items-center gap-1"><CheckCircle size={9}/> Done</div>}
          </div>
        ))}
      </div>

      {/* Connect Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CRMCard
          name="Salesforce" logo="SF" color="bg-[#00A1E0]"
          desc="Syncs: Account health, Opportunities, Contact emails, Support cases, Last activity"
          fields={['Account Health', 'Opportunities', 'Contact Email', 'Support Cases', 'Last Activity', 'Deal Stage']}
          connected={sfConnected} syncing={sfSyncing} progress={sfProgress} total={SALESFORCE_RAW.length}
          onConnect={connectSF}
        />
        <CRMCard
          name="HubSpot" logo="HS" color="bg-[#FF7A59]"
          desc="Syncs: Deal stage, Email opens, NPS score, Product usage score, Meeting status"
          fields={['Deal Stage', 'Email Opens', 'NPS Score', 'Usage Score', 'Meeting Booked']}
          connected={hsConnected} syncing={hsSyncing} progress={hsProgress} total={HUBSPOT_RAW.length}
          onConnect={connectHS}
        />
      </div>

      {/* Integrate Button */}
      {(sfConnected || hsConnected) && (
        <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <GitMerge size={15} className="text-purple-400"/> Merge & Analyze
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {sfConnected && hsConnected
                  ? `${SALESFORCE_RAW.length} companies — SF signals merged with HS signals → ${SALESFORCE_RAW.length} unified customer records`
                  : sfConnected ? `${SALESFORCE_RAW.length} Salesforce records ready`
                  : `${HUBSPOT_RAW.length} HubSpot records ready`}
                {' '}→ Rule-based score → Groq LLM explanation
              </p>
            </div>
            <button
              onClick={runIntegration}
              disabled={integrating}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {integrating
                ? <><Loader size={14} className="animate-spin"/> Analyzing {results.length} / {SALESFORCE_RAW.length}...</>
                : <><Bot size={14}/> {integrated ? 'Re-run Analysis' : 'Run Integration & AI Analysis'}</>}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">Analysis Results</h3>
            <span className="text-xs text-slate-400">{results.length} customers analyzed</span>
            <div className="flex items-center gap-2 ml-auto text-xs">
              {['High','Medium','Low'].map(l => (
                <span key={l} className={`px-2 py-0.5 rounded-full ${l==='High'?'bg-red-500/20 text-red-400':l==='Medium'?'bg-yellow-500/20 text-yellow-400':'bg-green-500/20 text-green-400'}`}>
                  {results.filter(r=>r.riskResult?.level===l).length} {l}
                </span>
              ))}
            </div>
          </div>

          {results.map((r, i) => (
            <ResultCard
              key={i} idx={i} result={r}
              expanded={expandedIdx === i}
              onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
          ))}
        </div>
      )}

      {!sfConnected && !hsConnected && (
        <div className="flex flex-col items-center justify-center py-20 bg-[#112240] rounded-xl border border-[#1e2d3d] text-slate-500">
          <Database size={40} className="mb-3 opacity-30"/>
          <p className="text-sm font-medium text-slate-400">Connect at least one CRM to begin</p>
          <p className="text-xs mt-1">Salesforce + HubSpot data will be merged and AI will analyze risk</p>
        </div>
      )}
    </div>
  )
}

// ─── Result Card ──────────────────────────────────────────────────────────────
function ResultCard({ result, expanded, onToggle }) {
  const { merged, riskResult, llmResult, llmError } = result
  if (!merged || !riskResult) return null

  const level = riskResult.level
  const score = riskResult.score
  const lc = level === 'High' ? { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', bar: 'bg-red-500' }
    : level === 'Medium' ? { text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', bar: 'bg-yellow-500' }
    : { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', bar: 'bg-green-500' }

  return (
    <div className={`bg-[#112240] rounded-xl border ${expanded ? lc.border : 'border-[#1e2d3d]'} overflow-hidden transition-all`}>
      {/* Summary row */}
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#1a2942] transition-colors" onClick={onToggle}>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {merged.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{merged.name}</span>
            {llmError && <span className="text-[10px] text-yellow-400">fallback</span>}
          </div>
          <div className="text-xs text-slate-400">{merged.industry} · {merged.owner} · ARR: ${merged.arr.toLocaleString()}</div>
        </div>

        {/* Score bar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden md:block">
            <div className="text-[10px] text-slate-500 mb-1">Risk Score</div>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-[#1e2d3d] rounded-full h-2">
                <div className={`h-full rounded-full transition-all ${lc.bar}`} style={{width:`${score}%`}}/>
              </div>
              <span className={`text-sm font-bold ${lc.text}`}>{score}</span>
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${lc.bg} ${lc.text} border ${lc.border}`}>
            {level} Risk
          </span>
          <div className="text-[10px] text-slate-500 text-right hidden md:block">
            <div>{riskResult.breakdown.length} signals</div>
            <div>{merged.daysToRenewal}d to renew</div>
          </div>
          {expanded ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && llmResult && (
        <div className="border-t border-[#1e2d3d] px-5 py-4 space-y-4 bg-[#0d1417]">

          {/* Score breakdown + Reasoning */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Breakdown */}
            <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Risk Score Breakdown</div>
              <div className="text-2xl font-bold mb-2 flex items-end gap-1">
                <span className={lc.text}>{score}</span>
                <span className="text-slate-500 text-sm">/100</span>
              </div>
              <div className="space-y-1.5">
                {riskResult.breakdown.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex-1">{b.factor}</span>
                    <span className="text-slate-500 text-[10px] mx-2">{b.value}</span>
                    <span className={`font-semibold w-10 text-right ${b.points > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {b.points > 0 ? `+${b.points}` : b.points}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* LLM Reasoning */}
            <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
              <div className="flex items-center gap-2 mb-3">
                <Bot size={13} className="text-blue-400"/>
                <div className="text-xs font-semibold text-white">AI Reasoning</div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{llmResult.reasoning}</p>
              {llmResult.predictedOutcome && (
                <div className="mt-3 pt-3 border-t border-[#1e2d3d]">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">If no action taken:</div>
                  <p className="text-xs text-red-300">{llmResult.predictedOutcome}</p>
                </div>
              )}
            </div>
          </div>

          {/* Risk drivers */}
          {llmResult.riskDrivers?.length > 0 && (
            <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Risk Drivers (LLM Analysis)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {llmResult.riskDrivers.map((d, i) => (
                  <div key={i} className={`rounded-lg p-3 border ${d.impact==='High'?'bg-red-500/5 border-red-500/20':d.impact==='Medium'?'bg-yellow-500/5 border-yellow-500/20':'bg-green-500/5 border-green-500/20'}`}>
                    <div className={`text-[10px] font-semibold mb-1 ${d.impact==='High'?'text-red-400':d.impact==='Medium'?'text-yellow-400':'text-green-400'}`}>
                      {d.impact} Impact
                    </div>
                    <div className="text-xs font-medium text-white mb-1">{d.driver}</div>
                    <div className="text-[10px] text-slate-400">{d.explanation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Plan */}
          {llmResult.actionPlan?.length > 0 && (
            <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                3-Month Action Plan to Reduce Risk
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {llmResult.actionPlan.map((a, i) => (
                  <div key={i} className="bg-[#0d1b2a] rounded-lg p-3 border border-[#1e2d3d]">
                    <div className="text-[10px] text-blue-400 font-semibold mb-1">{a.week}</div>
                    <div className="text-xs text-white mb-1">{a.action}</div>
                    <div className="text-[10px] text-slate-400">Goal: {a.goal}</div>
                  </div>
                ))}
              </div>
              {llmResult.immediateAction && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div className="text-[10px] text-red-400 font-semibold uppercase mb-1">⚡ Immediate Action (Today)</div>
                  <p className="text-xs text-white">{llmResult.immediateAction}</p>
                </div>
              )}
            </div>
          )}

          {/* Email Draft */}
          {llmResult.emailDraft && (
            <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d]">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">AI-Generated Email Draft</div>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{llmResult.emailDraft}</pre>
              {llmResult.expansionOpportunity && llmResult.expansionOpportunity !== 'None at this time' && (
                <div className="mt-3 pt-3 border-t border-[#1e2d3d] text-xs text-green-400">
                  💡 Expansion: {llmResult.expansionOpportunity}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── CRM Connection Card ──────────────────────────────────────────────────────
function CRMCard({ name, logo, color, desc, fields, connected, syncing, progress, total, onConnect }) {
  return (
    <div className={`bg-[#112240] rounded-xl border p-5 ${connected ? 'border-blue-500/30' : 'border-[#1e2d3d]'}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-11 h-11 ${color} rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>{logo}</div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">{name}</h3>
            {connected
              ? <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={8}/> {total} records</span>
              : <span className="text-[10px] text-slate-500 bg-[#1a2942] border border-[#1e2d3d] px-2 py-0.5 rounded-full">Not connected</span>}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {fields.map(f => (
          <span key={f} className={`text-[10px] px-2 py-0.5 rounded-full border ${connected ? 'bg-blue-500/10 border-blue-500/20 text-blue-300' : 'bg-[#1a2942] border-[#1e2d3d] text-slate-600'}`}>{f}</span>
        ))}
      </div>
      <button
        onClick={onConnect} disabled={connected || syncing}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${
          connected ? 'bg-green-600/10 border border-green-500/20 text-green-400 cursor-default'
          : syncing ? 'bg-blue-600/50 text-white cursor-not-allowed'
          : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
      >
        {syncing ? <><Loader size={12} className="animate-spin"/> Syncing {progress}/{total}...</>
         : connected ? <><CheckCircle size={12}/> Connected — {total} records synced</>
         : <><Database size={12}/> Connect {name}</>}
      </button>
    </div>
  )
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
