import React, { useState } from 'react'
import { Settings as SettingsIcon, Database, Mail, Calendar, Activity, Headphones, CheckCircle, XCircle, Save, RefreshCw } from 'lucide-react'

const integrations = [
  { id: 'crm', label: 'CRM', icon: Database, connected: true, description: 'Salesforce / HubSpot', lastSync: 'Apr 27, 2025' },
  { id: 'email', label: 'Email', icon: Mail, connected: true, description: 'Gmail / Outlook', lastSync: 'Apr 27, 2025' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, connected: true, description: 'Google Calendar', lastSync: 'Apr 27, 2025' },
  { id: 'usage', label: 'Product Usage', icon: Activity, connected: true, description: 'Amplitude / Mixpanel', lastSync: 'Apr 26, 2025' },
  { id: 'support', label: 'Support', icon: Headphones, connected: false, description: 'Zendesk / Intercom', lastSync: null },
]

export default function Settings() {
  const [saved, setSaved] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [autoApprove, setAutoApprove] = useState(false)
  const [riskThreshold, setRiskThreshold] = useState(70)
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [connectedList, setConnectedList] = useState(integrations)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const toggleConnection = (id) => {
    setConnectedList(prev => prev.map(i => i.id === id ? { ...i, connected: !i.connected, lastSync: !i.connected ? 'Just now' : null } : i))
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <SettingsIcon size={18} className="text-slate-400" /> Settings
        </h1>
        <p className="text-sm text-slate-400">Configure integrations, AI behavior, and notifications</p>
      </div>

      {/* Integrations */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Data Integrations</h3>
        <div className="space-y-3">
          {connectedList.map(intg => (
            <div key={intg.id} className="flex items-center justify-between p-3 bg-[#1a2942] rounded-lg border border-[#1e2d3d]">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${intg.connected ? 'bg-green-600/20' : 'bg-slate-600/20'}`}>
                  <intg.icon size={14} className={intg.connected ? 'text-green-400' : 'text-slate-400'} />
                </div>
                <div>
                  <div className="text-xs font-medium text-white">{intg.label}</div>
                  <div className="text-[10px] text-slate-400">{intg.description}</div>
                  {intg.lastSync && <div className="text-[10px] text-slate-500">Last sync: {intg.lastSync}</div>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1 text-xs ${intg.connected ? 'text-green-400' : 'text-slate-500'}`}>
                  {intg.connected ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {intg.connected ? 'Connected' : 'Not connected'}
                </div>
                <button
                  onClick={() => toggleConnection(intg.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    intg.connected
                      ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                      : 'border-blue-500/30 text-blue-400 hover:bg-blue-500/10'
                  }`}
                >
                  {intg.connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Settings */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
        <h3 className="text-sm font-semibold text-white mb-4">AI Agent Configuration</h3>
        <div className="space-y-4">
          <ToggleSetting
            label="Enable AI Risk Analysis"
            description="Automatically analyze customer health and generate risk scores"
            value={aiEnabled}
            onChange={setAiEnabled}
          />
          <ToggleSetting
            label="Auto-approve Low Priority Actions"
            description="Allow the AI agent to auto-execute low-risk actions without manual approval"
            value={autoApprove}
            onChange={setAutoApprove}
          />
          <div className="flex items-center justify-between py-3 border-t border-[#1e2d3d]">
            <div>
              <div className="text-xs font-medium text-white">High Risk Threshold</div>
              <div className="text-[10px] text-slate-400">Accounts above this score are flagged as High Risk</div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50"
                max="90"
                value={riskThreshold}
                onChange={e => setRiskThreshold(Number(e.target.value))}
                className="w-24 accent-blue-500"
              />
              <span className="text-sm font-bold text-red-400 w-6">{riskThreshold}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Notifications</h3>
        <ToggleSetting
          label="Email Notifications"
          description="Receive daily digest of high-risk accounts and pending actions"
          value={emailNotifications}
          onChange={setEmailNotifications}
        />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <Save size={14} />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[#1a2942] border border-[#1e2d3d] hover:border-blue-500 text-slate-300 text-sm rounded-lg transition-colors">
          <RefreshCw size={14} />
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}

function ToggleSetting({ label, description, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1e2d3d] last:border-0">
      <div>
        <div className="text-xs font-medium text-white">{label}</div>
        <div className="text-[10px] text-slate-400">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-[#1e2d3d]'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
