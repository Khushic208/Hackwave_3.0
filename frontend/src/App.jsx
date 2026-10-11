import React, { useState } from 'react'
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

export default function App() {
  const [activePage, setActivePage] = useState('overview')
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('pulsepilot-theme') === 'dark')

  const toggleDarkMode = () => {
    setDarkMode(prev => {
      const next = !prev
      localStorage.setItem('pulsepilot-theme', next ? 'dark' : 'light')
      return next
    })
  }

  const handleSelectCustomer = (id) => {
    setSelectedCustomerId(id)
  }

  const handlePageChange = (page) => {
    setActivePage(page)
    setSelectedCustomerId(null)
  }

  const showDetailPanel = (activePage === 'overview' || activePage === 'customers') && selectedCustomerId

  const renderPage = () => {
    switch (activePage) {
      case 'overview':    return <Dashboard onSelectCustomer={handleSelectCustomer} />
      case 'customers':   return <Customers onSelectCustomer={handleSelectCustomer} />
      case 'customer360': return <CustomerDetail customerId={selectedCustomerId} />
      case 'risk':        return <RiskOpportunities />
      case 'signals':     return <SignalsIntegrations />
      case 'ai-action':   return <AIActionCenter />
      case 'tasks':       return <TasksRenewals />
      case 'activity':    return <ActivityLog />
      case 'settings':    return <Settings darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
      default:            return <Dashboard onSelectCustomer={handleSelectCustomer} />
    }
  }

  return (
    <div className={`app-shell flex h-screen overflow-hidden bg-slate-50 ${darkMode ? 'dark' : ''}`}>
      <Sidebar activePage={activePage} setActivePage={handlePageChange} />
      <div className="app-workspace flex flex-col flex-1 overflow-hidden min-w-0">
        <Header darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
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
              <CustomerDetail customerId={selectedCustomerId} />
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

