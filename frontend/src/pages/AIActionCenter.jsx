import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Bot, Zap, CheckCircle, Clock, AlertTriangle, TrendingUp, Mail, Database, RefreshCw } from 'lucide-react'

const API = 'http://localhost:4000/api'

export default function AIActionCenter() {
  const [customers, setCustomers] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResults, setAnalysisResults] = useState([])
  const [completed, setCompleted] = useState([])

  useEffect(() => {
    axios.get(`${API}/customers`).then(r => setCustomers(r.data))
  }, [])

  const runAnalysis = async () => {
    setAnalyzing(true)
    setAnalysisResults([])
    const results = []
    const highRisk = customers.filter(c => c.riskLevel === 'High' || c.riskLevel === 'Medium')
    for (const c of highRisk.slice(0, 5)) {
      await new Promise(r => setTimeout(r, 400))
      try {
        const res = await axios.post(`${API}/analyze-risk`, {
          name: c.name,
          owner: c.owner,
          industry: c.industry,
          arr: c.arr,
          productUsageTrend: c.usageChange,
          lastMeetingDaysAgo: parseInt(c.lastMeeting) || 0,
          unansweredEmails: c.unansweredEmails,
          noNextStep: c.noNextStep,
          daysToRenewal: c.daysToRenewal,
          supportTicketsOpen: c.support?.pending || 0,
        })
        results.push({ customer: c, analysis: res.data })
      } catch (e) {
        results.push({ customer: c, analysis: { riskScore: c.riskScore, riskLevel: c.riskLevel, topSignals: c.signals || [] } })
      }
      setAnalysisResults([...results])
    }
    setAnalyzing(false)
  }

  const markDone = (id) => setCompleted(prev => [...prev, id])

  // Generate pending actions from real customers
  const pendingActions = customers.slice(0, 5).map((c, i) => ({
    id: i + 1,
    type: i % 5 === 0 ? 'email' : i % 5 === 1 ? 'task' : i % 5 === 2 ? 'analysis' : i % 5 === 3 ? 'meeting' : 'crm',
    customer: c.name,
    action: c.nextAction || `Follow up with ${c.name}`,
    priority: c.riskLevel === 'High' ? 'High' : 'Medium',
    agent: i % 5 === 0 ? 'Email Agent' : i % 5 === 1 ? 'CRM Agent' : i % 5 === 2 ? 'Risk Agent' : i % 5 === 3 ? 'Calendar Agent' : 'CRM Agent',
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot size={20} className="text-blue-400" /> AI Action Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">Autonomous agent actions and approvals</p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={analyzing || customers.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white text-sm rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={analyzing ? 'animate-spin' : ''} />
          {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending Actions', value: pendingActions.filter(a => !completed.includes(a.id)).length, icon: Clock, color: 'bg-yellow-600' },
          { label: 'Completed Today', value: completed.length + 3, icon: CheckCircle, color: 'bg-green-600' },
          { label: 'High Priority', value: pendingActions.filter(a => a.priority === 'High' && !completed.includes(a.id)).length, icon: AlertTriangle, color: 'bg-red-600' },
          { label: 'Agents Active', value: 4, icon: Bot, color: 'bg-blue-600' },
        ].map((s, i) => (
          <div key={i} className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-4">
            <div className={`w-9 h-9 ${s.color} rounded-lg flex items-center justify-center mb-3`}>
              <s.icon size={16} className="text-white" />
            </div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending Approvals */}
        <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Zap size={14} className="text-yellow-400" /> Pending Agent Actions
          </h3>
          {pendingActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Zap size={28} className="mb-2 opacity-30" />
              <p className="text-xs">No customers yet. Sync from Signals & Integrations first.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingActions.map(action => {
                const done = completed.includes(action.id)
                return (
                  <div key={action.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${done ? 'bg-green-500/5 border-green-500/20 opacity-60' : 'bg-[#1a2942] border-[#1e2d3d]'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      action.type === 'email' ? 'bg-blue-600/30' :
                      action.type === 'task' ? 'bg-purple-600/30' :
                      action.type === 'analysis' ? 'bg-orange-600/30' :
                      action.type === 'meeting' ? 'bg-cyan-600/30' : 'bg-green-600/30'
                    }`}>
                      {action.type === 'email' ? <Mail size={13} className="text-blue-400" /> :
                       action.type === 'task' ? <CheckCircle size={13} className="text-purple-400" /> :
                       action.type === 'analysis' ? <TrendingUp size={13} className="text-orange-400" /> :
                       action.type === 'meeting' ? <Clock size={13} className="text-cyan-400" /> :
                       <Database size={13} className="text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">{action.action}</div>
                      <div className="text-[10px] text-slate-400">{action.customer} · {action.agent}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${action.priority === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {action.priority}
                      </span>
                      {!done && (
                        <button onClick={() => markDone(action.id)} className="text-[10px] text-green-400 hover:text-green-300 border border-green-500/30 px-2 py-0.5 rounded">
                          Approve
                        </button>
                      )}
                      {done && <CheckCircle size={14} className="text-green-400" />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* AI Analysis Results */}
        <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Bot size={14} className="text-blue-400" /> AI Risk Analysis Results
          </h3>
          {analysisResults.length === 0 && !analyzing && (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Bot size={32} className="mb-2 opacity-30" />
              <p className="text-xs">Click "Run AI Analysis" to analyze high-risk accounts</p>
            </div>
          )}
          {analyzing && analysisResults.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-blue-400 animate-pulse">
              <RefreshCw size={14} className="animate-spin" />
              Initializing AI agents...
            </div>
          )}
          <div className="space-y-3">
            {analysisResults.map(({ customer: c, analysis }, i) => (
              <div key={i} className="p-3 bg-[#1a2942] rounded-lg border border-[#1e2d3d]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-white">{c.name}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    analysis.riskLevel === 'High' ? 'bg-red-500/20 text-red-400' :
                    analysis.riskLevel === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {analysis.riskLevel} Risk · {analysis.riskScore}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {(analysis.topSignals || []).slice(0, 3).map((f, j) => (
                    <div key={j} className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className="text-yellow-400">·</span> {f}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {analyzing && analysisResults.length > 0 && (
              <div className="text-xs text-blue-400 animate-pulse flex items-center gap-1">
                <RefreshCw size={11} className="animate-spin" /> Analyzing next account...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
