import React, { useEffect, useState } from 'react'
import axios from 'axios'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from 'recharts'
import {
  Users, ShieldAlert, DollarSign, Calendar, ArrowUpRight, ArrowDownRight,
  TrendingUp, CheckCircle, XCircle, Zap, ChevronRight, Bot
} from 'lucide-react'
import RiskBadge from '../components/RiskBadge'

const API = 'http://localhost:4000/api'

const RISK_COLORS = { 'High Risk': '#ef4444', 'Medium Risk': '#f59e0b', 'Low Risk': '#22c55e' }
const CONFIDENCE_COLORS = { High: 'text-green-400', Medium: 'text-yellow-400', Low: 'text-red-400' }

export default function Dashboard({ onSelectCustomer }) {
  const [stats, setStats] = useState(null)
  const [customers, setCustomers] = useState([])
  const [riskTrend, setRiskTrend] = useState([])
  const [revenueExposure, setRevenueExposure] = useState([])
  const [signalCoverage, setSignalCoverage] = useState(null)
  const [opportunities, setOpportunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = () => {
    return Promise.all([
      axios.get(`${API}/stats`),
      axios.get(`${API}/customers`),
      axios.get(`${API}/risk-trend`),
      axios.get(`${API}/revenue-exposure`),
      axios.get(`${API}/signal-coverage`),
      axios.get(`${API}/opportunities`),
    ]).then(([s, c, rt, re, sc, op]) => {
      setStats(s.data)
      setCustomers(c.data)
      setRiskTrend(rt.data)
      setRevenueExposure(re.data)
      setSignalCoverage(sc.data)
      setOpportunities(op.data)
    })
  }

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
  }, [])

  // Listen for CRM sync events from SignalsIntegrations
  useEffect(() => {
    const handleCrmSynced = () => {
      setRefreshing(true)
      fetchData().finally(() => setRefreshing(false))
    }
    window.addEventListener('crm-synced', handleCrmSynced)
    return () => window.removeEventListener('crm-synced', handleCrmSynced)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData().finally(() => setRefreshing(false))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-slate-400 animate-pulse text-sm">Loading dashboard...</div>
    </div>
  )

  if (!stats) return null

  const trendData = riskTrend.filter((_, i) => i % 3 === 0)

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Good Morning, Rahul! 👋</h1>
          <p className="text-sm text-slate-400 mt-1">Here's your revenue health overview and key actions for today.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-[#112240] border border-[#1e2d3d] hover:border-blue-500/40 rounded-lg px-3 py-2 transition-all disabled:opacity-50"
        >
          <Bot size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} iconBg="bg-blue-600" title="Total Accounts" value={stats.totalAccounts} change={stats.totalAccountsChange} up subtitle="vs. last 30 days" />
        <StatCard icon={ShieldAlert} iconBg="bg-red-600" title="High Risk" value={stats.highRisk} change={stats.highRiskChange} up={false} subtitle="needs attention" />
        <StatCard icon={DollarSign} iconBg="bg-orange-500" title="Revenue at Risk" value={stats.revenueAtRisk} change={stats.revenueAtRiskChange} up={false} subtitle="from high risk accounts" />
        <StatCard icon={Calendar} iconBg="bg-purple-600" title="Renewals in 30 Days" value={stats.renewalsIn30Days} subtitle="upcoming" extra={`${stats.pendingApprovals} pending approvals`} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk Trend */}
        <div className="lg:col-span-2 bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Risk Trend</h3>
              <p className="text-xs text-slate-500">Last 30 Days</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0d1b2a', border: '1px solid #1e2d3d', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="highRisk" name="High Risk" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="mediumRisk" name="Medium Risk" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="lowRisk" name="Low Risk" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue Exposure + Signal Coverage */}
        <div className="flex flex-col gap-4">
          {/* Revenue Exposure */}
          <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5 flex-1">
            <h3 className="text-sm font-semibold text-white mb-3">Revenue Exposure</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <PieChart width={90} height={90}>
                  <Pie data={revenueExposure} cx={40} cy={40} innerRadius={28} outerRadius={42} dataKey="value" startAngle={90} endAngle={-270}>
                    {revenueExposure.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-xs font-bold text-white">$480K</div>
                    <div className="text-[9px] text-slate-400">at risk</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1 flex-1">
                {revenueExposure.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                      <span className="text-slate-400">{item.name}</span>
                    </div>
                    <span className="text-white font-medium">${item.value}K ({item.percent}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Signal Coverage */}
          {signalCoverage && (
            <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5 flex-1">
              <h3 className="text-sm font-semibold text-white mb-3">Signal Coverage</h3>
              <div className="flex items-start gap-3">
                <div className="relative flex-shrink-0">
                  <PieChart width={70} height={70}>
                    <Pie data={[{ value: signalCoverage.percentage }, { value: 100 - signalCoverage.percentage }]} cx={30} cy={30} innerRadius={22} outerRadius={32} dataKey="value" startAngle={90} endAngle={-270}>
                      <Cell fill="#3b82f6" />
                      <Cell fill="#1e2d3d" />
                    </Pie>
                  </PieChart>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{signalCoverage.percentage}%</span>
                  </div>
                </div>
                <div className="space-y-1 flex-1">
                  {signalCoverage.signals.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      {s.status === 'Connected'
                        ? <CheckCircle size={11} className="text-green-400 flex-shrink-0" />
                        : <XCircle size={11} className="text-yellow-400 flex-shrink-0" />}
                      <span className={s.status === 'Connected' ? 'text-slate-300' : 'text-yellow-400'}>{s.name}</span>
                      <span className={`ml-auto text-[10px] ${s.status === 'Connected' ? 'text-green-400' : 'text-yellow-400'}`}>{s.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Customer Risk Overview */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d3d]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users size={15} className="text-blue-400" /> Customer Risk Overview
          </h3>
          <button className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">Export <ChevronRight size={12} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2d3d] text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Risk Score ↑</th>
                <th className="px-4 py-3 text-left">Renewal</th>
                <th className="px-4 py-3 text-left">Usage Trend</th>
                <th className="px-4 py-3 text-left">Evidence</th>
                <th className="px-4 py-3 text-left">Next Action</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                      <Users size={32} className="opacity-30" />
                      <p className="text-sm font-medium text-slate-400">No customers yet</p>
                      <p className="text-xs">Connect Salesforce or HubSpot in <span className="text-blue-400">Signals &amp; Integrations</span> to populate data</p>
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => onSelectCustomer(c.id)}
                    className={`border-b border-[#1e2d3d] hover:bg-[#1a2942] cursor-pointer transition-colors ${i === 0 ? 'bg-blue-900/10' : ''}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {c.name[0]}
                        </div>
                        <span className="text-white font-medium text-xs">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.owner}</td>
                    <td className="px-4 py-3">
                      <RiskScore score={c.riskScore} level={c.riskLevel} />
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{c.renewal}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium flex items-center gap-1 ${c.usageChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {c.usageChange >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {Math.abs(c.usageChange)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.evidence}</td>
                    <td className="px-4 py-3 text-blue-400 text-xs">{c.nextAction}</td>
                    <td className="px-4 py-3"><RiskBadge level={c.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Revenue Opportunities */}
        <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp size={15} className="text-green-400" /> Top Revenue Opportunities
            </h3>
            <button className="text-xs text-blue-400 hover:text-blue-300">View All</button>
          </div>
          <div className="space-y-3">
            {opportunities.map(op => (
              <div key={op.id} className="flex items-center justify-between py-2 border-b border-[#1e2d3d] last:border-0">
                <div>
                  <div className="text-xs font-medium text-white">{op.company}</div>
                  <div className="text-[11px] text-slate-400">{op.type}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-white">${op.value.toLocaleString()}</div>
                  <div className={`text-[11px] font-medium ${CONFIDENCE_COLORS[op.confidence]}`}>{op.confidence}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <Zap size={15} className="text-yellow-400" /> Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Create Follow-up Task', icon: '✅', color: 'blue' },
              { label: 'Generate Email Draft', icon: '📧', color: 'purple' },
              { label: 'Check Renewal Calendar', icon: '📅', color: 'indigo' },
              { label: 'Run Risk Analysis', icon: '🔍', color: 'orange' },
              { label: 'Export Report', icon: '📊', color: 'teal' },
              { label: 'Sync CRM Data', icon: '🔄', color: 'cyan' },
            ].map((action, i) => (
              <button key={i} className="flex items-center gap-2 bg-[#1a2942] hover:bg-[#1e3358] border border-[#1e2d3d] hover:border-blue-500/50 rounded-lg px-3 py-2.5 text-xs text-slate-300 hover:text-white transition-all text-left">
                <span className="text-base">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, iconBg, title, value, change, up, subtitle, extra }) {
  return (
    <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d] hover:border-blue-500/40 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon size={16} className="text-white" />
        </div>
        {change && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>
            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {change}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mt-2">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{title}</div>
      {subtitle && <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div>}
      {extra && <div className="text-[11px] text-slate-500 mt-0.5">{extra}</div>}
    </div>
  )
}

function RiskScore({ score, level }) {
  const color = level === 'High' ? 'text-red-400' : level === 'Medium' ? 'text-yellow-400' : 'text-green-400'
  return (
    <span className={`font-bold text-xs ${color}`}>{score}</span>
  )
}
