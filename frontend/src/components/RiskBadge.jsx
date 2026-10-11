import React from 'react'

export default function RiskBadge({ level }) {
  const colors = {
    High: 'bg-rose-50 text-rose-700 border border-rose-200',
    Medium: 'bg-amber-50 text-amber-700 border border-amber-200',
    Low: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[level] || colors.Low}`}>
      {level}
    </span>
  )
}

