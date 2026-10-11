import React from 'react'
import { Activity, CheckCircle2, RefreshCw, ShieldCheck, UserPlus, Zap } from 'lucide-react'

const events = [
  { time: 'Today, 10:42 AM', title: 'Risk analysis completed', detail: '8 customer accounts scored from the latest CRM signals.', icon: ShieldCheck, tone: 'indigo' },
  { time: 'Today, 9:18 AM', title: 'CRM data synchronized', detail: 'Contacts, renewal dates and account activity were updated.', icon: RefreshCw, tone: 'emerald' },
  { time: 'Yesterday, 4:36 PM', title: 'Follow-up task created', detail: 'A renewal check-in was created for TechNova Inc.', icon: CheckCircle2, tone: 'amber' },
  { time: 'Yesterday, 2:10 PM', title: 'Customer profile opened', detail: 'Rahul Sharma viewed the RetailEdge account details.', icon: UserPlus, tone: 'violet' },
  { time: 'Apr 27, 2025', title: 'Signal monitoring enabled', detail: 'Email, usage and support signals are being monitored.', icon: Zap, tone: 'sky' },
]

const toneClasses = {
  indigo: 'bg-indigo-100 text-indigo-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  violet: 'bg-violet-100 text-violet-700',
  sky: 'bg-sky-100 text-sky-700',
}

export default function ActivityLog() {
  return (
    <div className="space-y-7 max-w-5xl">
      <div>
        <div className="flex items-center gap-3">
          <div className="page-icon"><Activity size={20} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Activity &amp; Audit Log</h1>
            <p className="text-sm text-slate-500 mt-1">A clear record of workspace actions, syncs and automated decisions.</p>
          </div>
        </div>
      </div>

      <section className="dashboard-panel rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
            <p className="text-sm text-slate-500 mt-1">Latest events across your revenue workspace</p>
          </div>
          <span className="activity-status"><span /> Live log</span>
        </div>
        <div className="relative ml-2">
          <div className="activity-line" />
          <div className="space-y-6">
            {events.map(({ time, title, detail, icon: Icon, tone }) => (
              <div key={`${time}-${title}`} className="relative flex gap-4">
                <div className={`activity-icon ${toneClasses[tone]}`}><Icon size={16} /></div>
                <div className="pt-0.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                    <time className="text-xs text-slate-400">{time}</time>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

