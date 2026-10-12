import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import AIActionCenter from './pages/AIActionCenter'
import TasksRenewals from './pages/TasksRenewals'
import Settings from './pages/Settings'
import SignalsIntegrations from './pages/SignalsIntegrations'
import RiskOpportunities from './pages/RiskOpportunities'
import ActivityLog from './pages/ActivityLog'

const API = 'http://localhost:4001/api'

export default function App() {
  const [activePage, setActivePage] = useState('overview')
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('pulsepilot-theme') === 'dark')

  // ── Global shared data ──────────────────────────────────────────────────────
  // One source of truth for all pages — updated on every sync
  const [customers, setCustomers] = useState([])
  const [stats, setStats] = useState(null)
  const [tasks, setTasks] = useState([])
  const [renewals, setRenewals] = useState([])
  const [opportunities, setOpportunities] = useState([])
  const [revenueExposure, setRevenueExposure] = useState([])
  const [signalCoverage, setSignalCoverage] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [lastSyncTime, setLastSyncTime] = useState(() => {
    try { return JSON.parse(localStorage.getItem('revops_sync_meta') || '{}').syncedAt || null }
    catch { return null }
  })

  // ── Fetch all data from backend ─────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    try {
      const [c, s, t, r, op, re, sc] = await Promise.all([
        axios.get(`${API}/customers`),
        axios.get(`${API}/stats`),
        axios.get(`${API}/tasks`),
        axios.get(`${API}/renewals`),
        axios.get(`${API}/opportunities`),
        axios.get(`${API}/revenue-exposure`),
        axios.get(`${API}/signal-coverage`),
      ])
      setCustomers(c.data)
      setStats(s.data)
      setTasks(t.data)
      setRenewals(r.data)
      setOpportunities(op.data)
      setRevenueExposure(re.data)
      setSignalCoverage(sc.data)
    } catch (e) {
      console.warn('refreshAll error:', e.message)
    }
  }, [])

  // Initial load
  useEffect(() => {
    refreshAll().finally(() => setDataLoading(false))
  }, [refreshAll])

  // Listen for sync events from SignalsIntegrations and refresh everything
  useEffect(() => {
    const onSynced = () => {
      const meta = (() => {
        try { return JSON.parse(localStorage.getItem('revops_sync_meta') || '{}') } catch { return {} }
      })()
      setLastSyncTime(meta.syncedAt || new Date().toLocaleString())
      refreshAll()
    }
    window.addEventListener('crm-synced', onSynced)
    return () => window.removeEventListener('crm-synced', onSynced)
  }, [refreshAll])

  const toggleDarkMode = () => {
    setDarkMode(prev => {
      const next = !prev
      localStorage.setItem('pulsepilot-theme', next ? 'dark' : 'light')
      return next
    })
  }

  const handleSelectCustomer = (id) => setSelectedCustomerId(id)

  const handlePageChange = (page) => {
    setActivePage(page)
    setSelectedCustomerId(null)
  }

  // Shared props passed to every page that needs data
  const sharedData = {
    customers,
    stats,
    tasks,
    setTasks,       // TasksRenewals can add/update tasks locally
    renewals,
    opportunities,
    revenueExposure,
    signalCoverage,
    dataLoading,
    lastSyncTime,
    refreshAll,
  }

  const showDetailPanel = (activePage === 'overview' || activePage === 'customers') && selectedCustomerId

  const renderPage = () => {
    switch (activePage) {
      case 'overview':    return <Dashboard onSelectCustomer={handleSelectCustomer} {...sharedData} />
      case 'customers':   return <Customers onSelectCustomer={handleSelectCustomer} {...sharedData} />
      case 'customer360': return <CustomerDetail customerId={selectedCustomerId} customers={customers} />
      case 'risk':        return <RiskOpportunities {...sharedData} />
      case 'signals':     return <SignalsIntegrations />
      case 'ai-action':   return <AIActionCenter {...sharedData} />
      case 'tasks':       return <TasksRenewals {...sharedData} />
      case 'activity':    return <ActivityLog customers={customers} lastSyncTime={lastSyncTime} />
      case 'settings':    return <Settings darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
      default:            return <Dashboard onSelectCustomer={handleSelectCustomer} {...sharedData} />
    }
  }

  return (
    <div className={`app-shell flex h-screen overflow-hidden bg-slate-50 ${darkMode ? 'dark' : ''}`}>
      <Sidebar activePage={activePage} setActivePage={handlePageChange} />
      <div className="app-workspace flex flex-col flex-1 overflow-hidden min-w-0">
        <Header darkMode={darkMode} onToggleDarkMode={toggleDarkMode} lastSyncTime={lastSyncTime} />
        <div className="flex flex-1 overflow-hidden">
          {/* Main Content */}
          <main key={activePage} className={`page-${activePage} flex-1 overflow-auto px-8 py-7 transition-all duration-300 ${showDetailPanel ? 'max-w-[60%]' : ''}`}>
            {renderPage()}
          </main>

          {/* Customer Detail Side Panel */}
          {showDetailPanel && (
            <aside className="w-[40%] min-w-[380px] border-l border-slate-200 overflow-auto p-5 bg-white flex-shrink-0">
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4"
              >
                ← Back to Customers
              </button>
              <CustomerDetail customerId={selectedCustomerId} customers={customers} />
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
