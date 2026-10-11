import React from 'react'

export default function RiskBadge({ level }) {
  const colors = {
    High: 'bg-red-500/20 text-red-400 border border-red-500/30',
    Medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    Low: 'bg-green-500/20 text-green-400 border border-green-500/30',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[level] || colors.Low}`}>
      {level}
    </span>
  )
}
