import React from 'react'
import {
  LayoutDashboard, Users, UserCircle, AlertTriangle,
  Zap, Brain, CheckSquare, Activity, Settings
} from 'lucide-react'

const navItems = [
  { id: 'overview',    label: 'Overview',              icon: LayoutDashboard },
  { id: 'customers',   label: 'Customers',              icon: Users },
  { id: 'add-customer',label: 'Add Customer',            icon: UserCircle },
  { id: 'risk',        label: 'Risk & Opportunities',   icon: AlertTriangle },
  { id: 'signals',     label: 'Signals & Integrations', icon: Zap },
  { id: 'ai-action',   label: 'AI Action Center',       icon: Brain, badge: 2 },
  { id: 'tasks',       label: 'Tasks & Renewals',       icon: CheckSquare, badge: 5 },
  { id: 'activity',    label: 'Activity & Audit Log',   icon: Activity },
  { id: 'settings',    label: 'Settings',               icon: Settings },
]

export default function Sidebar({ activePage, setActivePage }) {
  return (
    <div className="w-64 bg-[#0d1117] flex flex-col h-full border-r border-[#1e2d3d] flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#1e2d3d]">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-lg">R</div>
        <div>
          <div className="font-bold text-white text-sm">RevOps AI</div>
          <div className="text-[10px] text-slate-400">Autonomous RevOps Agent</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setActivePage(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              activePage === id
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-400 hover:bg-[#1a2942] hover:text-white'
            }`}
          >
            <Icon size={16} />
            <span className="flex-1 text-left">{label}</span>
            {badge && (
              <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[#1e2d3d]">
        <div className="text-xs text-slate-500 leading-relaxed">
          <div className="font-medium text-slate-400 mb-1">✨ Smarter insights.</div>
          <div>Stronger relationships.</div>
          <div>Higher revenue.</div>
        </div>
      </div>
    </div>
  )
}
