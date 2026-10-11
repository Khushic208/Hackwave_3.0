import React from 'react'
import { Moon, Sun } from 'lucide-react'

export default function Header({ darkMode, onToggleDarkMode }) {
  return (
    <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center flex-shrink-0">
      <div>
        <div className="header-context">
          <span className="header-context-icon">R</span>
          <span>Revenue workspace</span>
        </div>
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <button
          onClick={onToggleDarkMode}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="theme-toggle p-2.5 rounded-xl transition-all"
        >
          {darkMode ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5 pl-2">
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700">RS</div>
          <div className="text-right">
            <div className="text-sm text-slate-800 font-medium">Rahul Sharma</div>
            <div className="text-[10px] text-slate-500">Account Manager</div>
          </div>
        </div>
      </div>
    </header>
  )
}
