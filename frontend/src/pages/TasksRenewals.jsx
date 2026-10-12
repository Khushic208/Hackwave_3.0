import React, { useState } from 'react'
import axios from 'axios'
import { CheckSquare, Calendar, AlertTriangle, Clock, CheckCircle, Plus, X, User, Building } from 'lucide-react'
import RiskBadge from '../components/RiskBadge'

const API = 'http://localhost:4001/api'

const EMPTY_TASK = {
  title: '',
  customer: '',
  assignee: '',
  dueDate: '',
  priority: 'Medium',
  status: 'Pending',
}

// Tasks & Renewals — receives tasks/renewals from App.jsx (central store)
export default function TasksRenewals({ tasks = [], setTasks, renewals = [], dataLoading }) {
  const [activeTab, setActiveTab] = useState('tasks')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_TASK)
  const [formError, setFormError] = useState('')
  const [pageError, setPageError] = useState('')
  const [savingTask, setSavingTask] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState(null)

  if (dataLoading) return <div className="text-slate-400 text-sm animate-pulse p-4">Loading tasks...</div>

  const completeTask = async id => {
    setUpdatingTaskId(id)
    setPageError('')
    try {
      await axios.patch(`${API}/tasks/${id}`, { status: 'Completed' })
      setTasks(prev => prev.map(task => task.id === id ? { ...task, status: 'Completed' } : task))
    } catch (err) {
      setPageError(err.response?.data?.error || 'Could not complete this task.')
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const openModal = () => { setForm(EMPTY_TASK); setFormError(''); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setFormError('') }

  const handleAddTask = async e => {
    e.preventDefault()
    if (!form.title.trim()) { setFormError('Task title is required'); return }
    if (!form.customer.trim()) { setFormError('Customer name is required'); return }
    if (!form.assignee.trim()) { setFormError('Assignee is required'); return }
    if (!form.dueDate) { setFormError('Due date is required'); return }

    setSavingTask(true)
    setFormError('')
    try {
      const payload = {
        ...form,
        dueDate: new Date(`${form.dueDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      }
      const response = await axios.post(`${API}/tasks`, payload)
      setTasks(prev => [response.data, ...prev])
      setShowModal(false)
      setActiveTab('tasks')
    } catch (err) {
      setFormError(err.response?.data?.error || 'Could not save this task. Check that the backend and database are running.')
    } finally {
      setSavingTask(false)
    }
  }

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const pendingCount = tasks.filter(t => t.status === 'Pending').length
  const highCount = tasks.filter(t => t.priority === 'High').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Tasks &amp; Renewals</h1>
          <p className="text-sm text-slate-400">Track action items and upcoming contract renewals</p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} /> Add Task
        </button>
      </div>

      {pageError && (
        <div role="alert" className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
          {pageError}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks',       value: tasks.length,    icon: CheckSquare, color: 'bg-blue-600' },
          { label: 'Pending',           value: pendingCount,    icon: Clock,       color: 'bg-yellow-600' },
          { label: 'High Priority',     value: highCount,       icon: AlertTriangle, color: 'bg-red-600' },
          { label: 'Upcoming Renewals', value: renewals.length, icon: Calendar,    color: 'bg-purple-600' },
        ].map((s, i) => (
          <div key={i} className="bg-[#112240] rounded-xl border border-[#1e2d3d] p-4">
            <div className={`w-9 h-9 ${s.color} rounded-lg flex items-center justify-center mb-3`}>
              <s.icon size={16} className="text-white" />
            </div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e2d3d]">
        {['tasks', 'renewals'].map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              activeTab === t ? 'text-blue-400 border-blue-500' : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            {t === 'tasks' ? `Tasks (${tasks.length})` : `Renewals (${renewals.length})`}
          </button>
        ))}
      </div>

      {/* Tasks Table */}
      {activeTab === 'tasks' && (
        tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-[#112240] rounded-xl border border-[#1e2d3d] text-slate-500">
            <CheckSquare size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No tasks yet</p>
            <button onClick={openModal} className="mt-3 text-xs text-blue-400 hover:text-blue-300">+ Add your first task</button>
          </div>
        ) : (
          <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2d3d] text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Task</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Assignee</th>
                  <th className="px-4 py-3 text-left">Due Date</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr
                    key={task.id}
                    className={`border-b border-[#1e2d3d] transition-colors ${
                      task.status === 'Completed' ? 'opacity-40' : 'hover:bg-indigo-50/60'
                    }`}
                  >
                    <td className="px-5 py-3 text-white text-xs font-medium max-w-[220px]">
                      <span className={task.status === 'Completed' ? 'line-through text-slate-500' : ''}>{task.title}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{task.customer}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{task.assignee}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{task.dueDate}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        task.priority === 'High'   ? 'bg-red-500/20 text-red-400' :
                        task.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                                     'bg-green-500/20 text-green-400'
                      }`}>{task.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        task.status === 'Completed'   ? 'bg-green-500/20 text-green-400' :
                        task.status === 'In Progress' ? 'bg-blue-500/20 text-blue-400' :
                                                        'bg-slate-500/20 text-slate-400'
                      }`}>{task.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {task.status !== 'Completed' && (
                        <button
                          onClick={() => completeTask(task.id)}
                          disabled={updatingTaskId === task.id}
                          className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50 flex items-center gap-1 border border-green-500/30 px-2 py-1 rounded transition-colors"
                        >
                          <CheckCircle size={10} /> {updatingTaskId === task.id ? 'Saving...' : 'Done'}
                        </button>
                      )}
                      {task.status === 'Completed' && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <CheckCircle size={11} /> Completed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Renewals Table */}
      {activeTab === 'renewals' && (
        renewals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-[#112240] rounded-xl border border-[#1e2d3d] text-slate-500">
            <Calendar size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No upcoming renewals within 90 days</p>
          </div>
        ) : (
          <div className="bg-[#112240] rounded-xl border border-[#1e2d3d] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2d3d] text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Owner</th>
                  <th className="px-4 py-3 text-left">Renewal Date</th>
                  <th className="px-4 py-3 text-left">ARR</th>
                  <th className="px-4 py-3 text-left">Risk</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {renewals.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-indigo-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                          {r.customer[0]}
                        </div>
                        <span className="text-white text-xs font-medium">{r.customer}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{r.owner}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{r.renewalDate}</td>
                    <td className="px-4 py-3 text-white text-xs font-medium">${r.arr.toLocaleString()}</td>
                    <td className="px-4 py-3"><RiskBadge level={r.riskLevel} /></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === 'Action Required' ? 'bg-red-500/20 text-red-400' :
                        r.status === 'In Review'       ? 'bg-yellow-500/20 text-yellow-400' :
                                                         'bg-green-500/20 text-green-400'
                      }`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Add Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-[#112240] border border-[#1e2d3d] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2d3d]">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus size={15} className="text-blue-400" /> Add New Task
              </h2>
              <button onClick={closeModal} className="text-slate-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddTask} className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5">Task Title *</label>
                <input type="text" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Schedule renewal call with Acme" className={inputCls} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5 flex items-center gap-1"><Building size={10} /> Customer *</label>
                  <input type="text" value={form.customer} onChange={e => set('customer', e.target.value)} placeholder="e.g. Acme Technologies" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5 flex items-center gap-1"><User size={10} /> Assignee *</label>
                  <input type="text" value={form.assignee} onChange={e => set('assignee', e.target.value)} placeholder="e.g. Rahul Sharma" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5 flex items-center gap-1"><Calendar size={10} /> Due Date *</label>
                <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className={inputCls} min={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Priority</label>
                  <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                  </select>
                </div>
              </div>
              {formError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={savingTask} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                  <CheckCircle size={14} /> {savingTask ? 'Saving...' : 'Add Task'}
                </button>
                <button type="button" onClick={closeModal} className="px-4 py-2.5 bg-[#1a2942] border border-[#1e2d3d] hover:border-slate-500 text-slate-400 text-sm rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full bg-[#0d1b2a] border border-[#1e2d3d] rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors'
