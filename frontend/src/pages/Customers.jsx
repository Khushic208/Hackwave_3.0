import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Search, Filter, ArrowUpRight, ArrowDownRight, ChevronRight, Users } from 'lucide-react'
import RiskBadge from '../components/RiskBadge'

const API = 'http://localhost:4000/api'

export default function Customers({ onSelectCustomer }) {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/customers`).then(r => setCustomers(r.data)).finally(() => setLoading(false))
  }, [])

  const filtered = customers.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.owner.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'All' || c.riskLevel === filter
    return matchSearch && matchFilter
  })

  if (loading) return <div className="text-slate-400 text-sm animate-pulse">Loading customers...</div>

  if (filtered.length === 0) return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Customers</h1>
        <p className="text-sm text-slate-400">Manage and monitor all customer accounts</p>
      </div>
      <div className="flex flex-col items-center justify-center py-20 bg-[#112240] rounded-xl border border-[#1e2d3d] text-slate-500">
        <Users size={36} className="mb-3 opacity-30" />
        <p className="text-sm">No customers found</p>
        <p className="text-xs mt-1">Go to Signals & Integrations to sync from Salesforce or HubSpot</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Customers</h1>
        <p className="text-sm text-slate-400">Manage and monitor all customer accounts</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#1a2942] border border-[#1e2d3d] rounded-lg pl-9 pr-4 py-2 text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          {['All', 'High', 'Medium', 'Low'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filter === f
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-[#1a2942] text-slate-400 border-[#1e2d3d] hover:border-blue-500'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 ml-auto">
          <Filter size={13} />
          <span>{filtered.length} accounts</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e2d3d] text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Industry</th>
              <th className="px-4 py-3 text-left">Owner</th>
              <th className="px-4 py-3 text-left">Risk Score</th>
              <th className="px-4 py-3 text-left">Renewal</th>
              <th className="px-4 py-3 text-left">Usage</th>
              <th className="px-4 py-3 text-left">ARR</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Next Action</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr
                key={c.id}
                onClick={() => onSelectCustomer(c.id)}
                className="border-b border-slate-100 hover:bg-indigo-50/60 cursor-pointer transition-colors"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {c.name[0]}
                    </div>
                    <div>
                      <div className="text-white font-medium text-xs">{c.name}</div>
                      <div className="text-[10px] text-slate-500">{c.riskLevel} Risk</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">{c.industry}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{c.owner}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 bg-[#1e2d3d] rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.riskLevel === 'High' ? 'bg-red-500' : c.riskLevel === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${c.riskScore}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold ${c.riskLevel === 'High' ? 'text-red-400' : c.riskLevel === 'Medium' ? 'text-yellow-400' : 'text-green-400'}`}>
                      {c.riskScore}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300 text-xs">{c.renewal}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${c.usageChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {c.usageChange >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {Math.abs(c.usageChange)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300 text-xs">${c.arr?.toLocaleString() || 'N/A'}</td>
                <td className="px-4 py-3"><RiskBadge level={c.status} /></td>
                <td className="px-4 py-3 text-blue-400 text-xs">{c.nextAction}</td>
                <td className="px-4 py-3">
                  <ChevronRight size={14} className="text-slate-600" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
