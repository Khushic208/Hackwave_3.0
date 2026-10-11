import React, { useState } from 'react'
import axios from 'axios'
import {
  Bot, User, Building, Mail, Calendar, Activity,
  Headphones, DollarSign, Clock, CheckCircle, AlertTriangle, Loader
} from 'lucide-react'

const API = 'http://localhost:4001/api'

export default function AddCustomer({ onCustomerAdded }) {
  const [form, setForm] = useState({
    name: '',
    owner: '',
    industry: '',
    arr: '',
    renewal: '',
    daysToRenewal: '',
    lastMeetingDaysAgo: '',
    unansweredEmails: '',
    noNextStep: false,
    productUsageTrend: '',
    supportTicketsOpen: '',
    emailSummary: '',
    lastMeetingNotes: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const payload = {
        ...form,
        arr: Number(form.arr) || 0,
        daysToRenewal: Number(form.daysToRenewal) || 90,
        lastMeetingDaysAgo: Number(form.lastMeetingDaysAgo) || 0,
        unansweredEmails: Number(form.unansweredEmails) || 0,
        productUsageTrend: Number(form.productUsageTrend) || 0,
        supportTicketsOpen: Number(form.supportTicketsOpen) || 0,
        noNextStep: form.noNextStep,
      }
      const res = await axios.post(`${API}/customers`, payload)
      setResult(res.data)
      if (onCustomerAdded) onCustomerAdded(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze. Check if backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const riskColor = {
    High: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-400', bar: 'bg-red-500' },
    Medium: { bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-400', bar: 'bg-yellow-500' },
    Low: { bg: 'bg-green-500/10 border-green-500/30', text: 'text-green-400', bar: 'bg-green-500' },
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Bot size={20} className="text-blue-400" /> Add Customer & Run AI Analysis
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Enter real customer signals — AI will analyze risk score, generate reasoning, and draft a follow-up email.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic Info */}
        <Section title="Customer Information" icon={User}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Customer Name *" icon={Building}>
              <input required value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Acme Technologies" className={inputCls} />
            </Field>
            <Field label="Account Owner *" icon={User}>
              <input required value={form.owner} onChange={e => set('owner', e.target.value)}
                placeholder="e.g. Rahul Sharma" className={inputCls} />
            </Field>
            <Field label="Industry" icon={Building}>
              <select value={form.industry} onChange={e => set('industry', e.target.value)} className={inputCls}>
                <option value="">Select industry</option>
                {['Software & Tech', 'Finance', 'Healthcare', 'Retail', 'Manufacturing', 'Consulting', 'IT Services', 'Research', 'Logistics', 'Energy', 'Other'].map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </Field>
            <Field label="Annual Recurring Revenue (ARR)" icon={DollarSign}>
              <input type="number" value={form.arr} onChange={e => set('arr', e.target.value)}
                placeholder="e.g. 120000" className={inputCls} />
            </Field>
            <Field label="Renewal Date" icon={Calendar}>
              <input type="date" value={form.renewal} onChange={e => set('renewal', e.target.value)}
                className={inputCls} />
            </Field>
            <Field label="Days Until Renewal" icon={Clock}>
              <input type="number" value={form.daysToRenewal} onChange={e => set('daysToRenewal', e.target.value)}
                placeholder="e.g. 43" className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* Engagement Signals */}
        <Section title="Engagement Signals" icon={Mail}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Last Meeting (days ago)" icon={Calendar}>
              <input type="number" value={form.lastMeetingDaysAgo} onChange={e => set('lastMeetingDaysAgo', e.target.value)}
                placeholder="e.g. 21" className={inputCls} />
            </Field>
            <Field label="Unanswered Emails from Customer" icon={Mail}>
              <input type="number" value={form.unansweredEmails} onChange={e => set('unansweredEmails', e.target.value)}
                placeholder="e.g. 2" className={inputCls} />
            </Field>
            <Field label="Product Usage Trend (% change last 30 days)" icon={Activity}>
              <input type="number" value={form.productUsageTrend} onChange={e => set('productUsageTrend', e.target.value)}
                placeholder="e.g. -35 (negative = decline)" className={inputCls} />
            </Field>
            <Field label="Open Support Tickets" icon={Headphones}>
              <input type="number" value={form.supportTicketsOpen} onChange={e => set('supportTicketsOpen', e.target.value)}
                placeholder="e.g. 3" className={inputCls} />
            </Field>
          </div>
          {/* CRM toggle */}
          <div className="flex items-center gap-3 mt-2 p-3 bg-[#1a2942] rounded-lg border border-[#1e2d3d]">
            <button
              type="button"
              onClick={() => set('noNextStep', !form.noNextStep)}
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${!form.noNextStep ? 'bg-blue-600' : 'bg-[#1e2d3d]'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${!form.noNextStep ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <div>
              <div className="text-xs font-medium text-white">Next step recorded in CRM</div>
              <div className="text-[10px] text-slate-400">{form.noNextStep ? 'No next step — risk signal' : 'Next step is recorded — good sign'}</div>
            </div>
          </div>
        </Section>

        {/* Context for AI */}
        <Section title="Context for AI (Optional but improves accuracy)" icon={Bot}>
          <Field label="Email Summary / Last Email from Customer">
            <textarea value={form.emailSummary} onChange={e => set('emailSummary', e.target.value)}
              rows={2} placeholder='e.g. "Customer said they are evaluating alternatives and need better pricing..."'
              className={`${inputCls} resize-none`} />
          </Field>
          <Field label="Last Meeting Notes">
            <textarea value={form.lastMeetingNotes} onChange={e => set('lastMeetingNotes', e.target.value)}
              rows={2} placeholder='e.g. "Champion is leaving the company, no sponsor identified yet..."'
              className={`${inputCls} resize-none`} />
          </Field>
        </Section>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-semibold rounded-xl transition-colors text-sm"
        >
          {loading
            ? <><Loader size={16} className="animate-spin" /> AI is analyzing customer risk...</>
            : <><Bot size={16} /> Analyze Risk with AI</>}
        </button>
      </form>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {/* AI Result */}
      {result && (
        <div className={`rounded-xl border p-5 space-y-4 ${riskColor[result.riskLevel]?.bg || 'bg-[#112240] border-[#1e2d3d]'}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Bot size={16} className="text-blue-400" />
                <h3 className="text-sm font-bold text-white">AI Risk Analysis — {result.name}</h3>
                {result.aiError && <span className="text-[10px] text-yellow-400">(fallback mode)</span>}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Confidence: {result.aiConfidence}%</p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${riskColor[result.riskLevel]?.text}`}>{result.riskScore}<span className="text-sm text-slate-400">/100</span></div>
              <div className={`text-xs font-semibold ${riskColor[result.riskLevel]?.text}`}>{result.riskLevel} Risk · {result.urgency}</div>
            </div>
          </div>

          {/* Risk bar */}
          <div className="w-full bg-[#1e2d3d] rounded-full h-2">
            <div className={`h-full rounded-full transition-all ${riskColor[result.riskLevel]?.bar}`} style={{ width: `${result.riskScore}%` }} />
          </div>

          {/* AI Reasoning */}
          <div className="bg-[#0d1b2a]/60 rounded-lg p-4 border border-[#1e2d3d]">
            <div className="text-xs font-semibold text-blue-400 mb-1 uppercase tracking-wide">AI Reasoning</div>
            <p className="text-sm text-slate-300 leading-relaxed">{result.aiReasoning}</p>
          </div>

          {/* Signals + Action */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0d1b2a]/60 rounded-lg p-4 border border-[#1e2d3d]">
              <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Top Signals</div>
              <div className="space-y-1">
                {(result.signals || []).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className={riskColor[result.riskLevel]?.text}>•</span> {s}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#0d1b2a]/60 rounded-lg p-4 border border-[#1e2d3d]">
              <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Recommended Action</div>
              <p className="text-xs text-slate-300">{result.nextAction}</p>
              {result.expansionOpportunity !== 'None identified' && (
                <div className="mt-2 text-xs text-green-400 border-t border-[#1e2d3d] pt-2">
                  💡 {result.expansionOpportunity}
                </div>
              )}
            </div>
          </div>

          {/* Email Draft */}
          <div className="bg-[#0d1b2a]/60 rounded-lg p-4 border border-[#1e2d3d]">
            <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">AI-Generated Email Draft</div>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{result.emailDraft}</pre>
          </div>

          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle size={13} />
            Customer saved. View in Customers tab.
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full bg-[#0d1b2a] border border-[#1e2d3d] rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors'

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <Icon size={14} className="text-blue-400" /> {title}
      </h3>
      {children}
    </div>
  )
}

function Field({ label, icon: Icon, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
        {Icon && <Icon size={11} />} {label}
      </label>
      {children}
    </div>
  )
}

