import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

export default function StatCard({ title, value, change, changeType, icon: Icon, iconBg, subtitle }) {
  const isPositive = changeType === 'up'

  return (
    <div className="bg-[#112240] rounded-xl p-5 border border-[#1e2d3d] hover:border-blue-500/40 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon size={18} className="text-white" />
        </div>
        {change && (
          <span className={`flex items-center gap-1 text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-slate-400">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  )
}
