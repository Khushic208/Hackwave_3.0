import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, TrendingUp, DollarSign, Calendar, ChevronRight, Shield } from 'lucide-react'

const API = 'http://localhost:4000/api'

export default function RiskOpportunities() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/customers`)
      .then(res => setCustomers(res.data))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 animate-pulse text-sm">Loading risk data...</div>
      </div>
    )
  }

  const highRisk = customers
    .filter(c => c.riskLevel === 'High')
    .sort((a, b) => b.riskScore - a.riskScore)

  const expansionCandidates = customers.filter(
    c => c.riskLevel === 'Low' || (c.expansionOpportunity && c.expansionOpportunity !== 'None at this time' && c.expansionOpportunity !== 'None identified')
  )

  const totalArrAtRisk = highRisk.reduce((sum, c) => sum + (c.arr || 0), 0)
  const avgRiskScore = highRisk.length > 0
    ? Math.round(highRisk.reduce((sum, c) => sum + c.riskScore, 0) / highRisk.length)
    : 0
  const renewalsUnder30 = customers.filter(c => c.daysToRenewal <= 30).length

  const formatArr = v => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <AlertTriangle size={20} className="text-red-400" /> Risk &amp; Opportunities
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Monitor high-risk accounts and identify revenue expansion opportunities.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={AlertTriangle}
          iconBg="bg-red-600"
          title="High Risk Accounts"
          value={highRisk.length}
          subtitle="need immediate attention"
        />
        <StatCard
          icon={DollarSign}
          iconBg="bg-orange-500"
          title="ARR at Risk"
          value={formatArr(totalArrAtRisk)}
          subtitle="from high risk accounts"
        />
        <StatCard
          icon={Shield}
          iconBg="bg-yellow-600"
          title="Avg Risk Score"
          value={avgRiskScore > 0 ? avgRiskScore : '—'}
          subtitle="across high risk accounts"
        />
        <StatCard
          icon={Calendar}
          iconBg="bg-purple-600"
          title="Renewals &lt;30 Days"
          value={renewalsUnder30}
          subtitle="urgent renewal window"
        />
      </div>

      {/* High Risk Accounts Table */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d3d]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-400" /> High Risk Accounts
          </h3>
          <span className="text-xs text-slate-500">{highRisk.length} accounts</span>
        </div>

        {highRisk.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Shield size={36} className="mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-400">No high risk accounts</p>
            <p className="text-xs mt-1">All accounts are in good health</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2d3d] text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Owner</th>
                  <th className="px-4 py-3 text-left">Risk Score</th>
                  <th className="px-4 py-3 text-left">Renewal</th>
                  <th className="px-4 py-3 text-left">ARR</th>
                  <th className="px-4 py-3 text-left">Top Signal</th>
                  <th className="px-4 py-3 text-left">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {highRisk.map((c, i) => (
                  <tr
                    key={c.id}
                    className={`border-b border-[#1e2d3d] hover:bg-[#1a2942] transition-colors ${i === 0 ? 'bg-red-900/10' : ''}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {c.name[0]}
                        </div>
                        <span className="text-white font-medium text-xs">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.owner}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-[#1e2d3d] rounded-full h-1.5">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: `${c.riskScore}%` }}
                          />
                        </div>
                        <span className="text-red-400 font-bold text-xs">{c.riskScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${c.daysToRenewal <= 14 ? 'text-red-400' : c.daysToRenewal <= 30 ? 'text-orange-400' : 'text-slate-300'}`}>
                        {c.daysToRenewal}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs font-medium">{formatArr(c.arr || 0)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[180px]">
                      <span className="truncate block">{c.signals?.[0] || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <UrgencyBadge urgency={c.urgency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expansion Opportunities */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d3d]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp size={15} className="text-green-400" /> Expansion Opportunities
          </h3>
          <span className="text-xs text-slate-500">{expansionCandidates.length} accounts</span>
        </div>

        {expansionCandidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <TrendingUp size={36} className="mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-400">No expansion opportunities yet</p>
            <p className="text-xs mt-1">Sync your CRM data to identify upsell candidates</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e2d3d]">
            {expansionCandidates.map(c => {
              const hasOpportunity = c.expansionOpportunity &&
                c.expansionOpportunity !== 'None at this time' &&
                c.expansionOpportunity !== 'None identified'
              const confidenceLevel = c.riskLevel === 'Low' ? 'High' : 'Medium'
              return (
                <div key={c.id} className="flex items-start justify-between px-5 py-4 hover:bg-[#1a2942] transition-colors">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">
                      {c.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{c.name}</span>
                        <span className="text-[10px] text-slate-500">{c.industry}</span>
                      </div>
                      {hasOpportunity ? (
                        <p className="text-xs text-green-300 mt-0.5 line-clamp-2">{c.expansionOpportunity}</p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-0.5">Healthy account — ideal renewal candidate</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <div className="text-right">
                      <div className="text-xs font-semibold text-white">{formatArr(c.arr || 0)}</div>
                      <div className="text-[10px] text-slate-500">ARR</div>
                    </div>
                    <ConfidenceBadge level={confidenceLevel} />
                    <ChevronRight size={14} className="text-slate-600" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Empty state if no customers at all */}
      {customers.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-[#112240] rounded-xl border border-[#1e2d3d] text-slate-500">
          <AlertTriangle size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium text-slate-400">No customer data available</p>
          <p className="text-xs mt-1">Connect Salesforce or HubSpot in Signals &amp; Integrations to populate data</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, iconBg, title, value, subtitle }) {
  return (
    <div className="bg-[#112240] rounded-xl p-4 border border-[#1e2d3d] hover:border-blue-500/40 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon size={16} className="text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white mt-2">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{title}</div>
      {subtitle && <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div>}
    </div>
  )
}

function UrgencyBadge({ urgency }) {
  const styles = {
    'Immediate': 'bg-red-500/20 text-red-400 border-red-500/30',
    'This Week': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'This Month': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  }
  const style = styles[urgency] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${style}`}>
      {urgency || 'Unknown'}
    </span>
  )
}

function ConfidenceBadge({ level }) {
  const styles = {
    'High': 'bg-green-500/20 text-green-400 border-green-500/30',
    'Medium': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'Low': 'bg-red-500/20 text-red-400 border-red-500/30',
  }
  const style = styles[level] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${style}`}>
      {level} Confidence
    </span>
  )
}
