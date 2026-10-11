import React, { useState } from 'react'
import { Search, Bell, Calendar, ChevronDown } from 'lucide-react'

export default function Header() {
  const [searchVal, setSearchVal] = useState('')

  return (
    <header className="bg-[#0d1117] border-b border-[#1e2d3d] px-6 py-3 flex items-center gap-4 flex-shrink-0">
      {/* Search */}
      <div className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
        <input
          type="text"
          placeholder="Search customers, companies, emails, meetings..."
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
          className="w-full bg-[#1a2942] border border-[#1e2d3d] rounded-lg pl-9 pr-4 py-2 text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Date Range */}
        <button className="flex items-center gap-2 bg-[#1a2942] border border-[#1e2d3d] rounded-lg px-3 py-2 text-sm text-slate-300 hover:border-blue-500 transition-colors">
          <Calendar size={14} className="text-slate-400" />
          <span>Apr 1, 2025 – Apr 27, 2025</span>
          <ChevronDown size={14} className="text-slate-500" />
        </button>

        {/* Notifications */}
        <button className="relative p-2 bg-[#1a2942] border border-[#1e2d3d] rounded-lg hover:border-blue-500 transition-colors">
          <Bell size={16} className="text-slate-400" />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">3</span>
        </button>

        {/* User */}
        <div className="flex items-center gap-2 bg-[#1a2942] border border-[#1e2d3d] rounded-lg px-3 py-2">
          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white">RS</div>
          <div className="text-right">
            <div className="text-sm text-white font-medium">Rahul Sharma</div>
            <div className="text-[10px] text-slate-400">Account Manager</div>
          </div>
        </div>
      </div>
    </header>
  )
}
