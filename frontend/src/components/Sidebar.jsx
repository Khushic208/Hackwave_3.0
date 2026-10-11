import React from 'react'
import {
  LayoutDashboard, Users, AlertTriangle,
  Zap, Brain, CheckSquare, Activity, Settings
} from 'lucide-react'

const navItems = [
  { id: 'overview',    label: 'Overview',              icon: LayoutDashboard },
  { id: 'customers',   label: 'Customers',              icon: Users },
  { id: 'risk',        label: 'Risk & Opportunities',   icon: AlertTriangle },
  { id: 'signals',     label: 'Signals & Integrations', icon: Zap },
  { id: 'ai-action',   label: 'AI Action Center',       icon: Brain, badge: 2 },
  { id: 'tasks',       label: 'Tasks & Renewals',       icon: CheckSquare, badge: 5 },
  { id: 'activity',    label: 'Activity & Audit Log',   icon: Activity },
  { id: 'settings',    label: 'Settings',               icon: Settings },
]

export default function Sidebar({ activePage, setActivePage }) {
  return (
    <div className="app-sidebar bg-white flex flex-col h-full border-r border-slate-200 flex-shrink-0">
      {/* Logo */}
      <div className="app-sidebar-brand flex items-center gap-3 px-5 py-5 border-b border-slate-200">
        <img className="sidebar-logo-mark" src="/revops-ai-mark.svg" alt="RevOps AI logo" />
        <div className="app-sidebar-brand-copy">
          <div className="font-bold text-slate-900 text-base tracking-tight">RevOps AI</div>
          <div className="text-xs text-slate-500">Autonomous RevOps Agent</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setActivePage(id)}
            title={label}
            className={`app-sidebar-nav w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              activePage === id
                ? 'bg-indigo-50 text-indigo-700 font-semibold'
                : 'sidebar-nav-item text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Icon size={16} />
            <span className="app-sidebar-label flex-1 text-left">{label}</span>
            {badge && (
              <span className="sidebar-badge bg-indigo-100 text-indigo-700 text-xs rounded-full px-1.5 py-0.5 leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="app-sidebar-footer px-5 py-4 border-t border-slate-200">
        <div className="text-xs text-slate-400 leading-relaxed">
          <div className="font-medium text-slate-500 mb-1">Built for better decisions.</div>
          <div>Clear signals. Faster action.</div>
        </div>
      </div>
    </div>
  )
}

