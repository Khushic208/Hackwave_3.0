const mysql = require('mysql2/promise')

let pool = null

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'revops_ai',
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
    })
  }
  return pool
}

// ── Save or update a customer ─────────────────────────────────────────────────
async function upsertCustomer(c) {
  const db = getPool()
  const sql = `
    INSERT INTO customers (
      crm_id, source, name, email, company, job_title, owner, industry,
      arr, mrr, renewal_date, days_to_renewal,
      risk_score, risk_level, ai_confidence, ai_reasoning,
      next_action, email_draft, expansion_opportunity, predicted_outcome, urgency,
      usage_change, unanswered_emails, no_next_step, last_meeting, evidence, deal_stage,
      signals, risk_drivers, action_plan, risk_breakdown, crm_status, email_status, recent_activity
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      source=VALUES(source), name=VALUES(name), email=VALUES(email),
      company=VALUES(company), job_title=VALUES(job_title), owner=VALUES(owner),
      industry=VALUES(industry), arr=VALUES(arr), mrr=VALUES(mrr),
      renewal_date=VALUES(renewal_date), days_to_renewal=VALUES(days_to_renewal),
      risk_score=VALUES(risk_score), risk_level=VALUES(risk_level),
      ai_confidence=VALUES(ai_confidence), ai_reasoning=VALUES(ai_reasoning),
      next_action=VALUES(next_action), email_draft=VALUES(email_draft),
      expansion_opportunity=VALUES(expansion_opportunity), predicted_outcome=VALUES(predicted_outcome),
      urgency=VALUES(urgency), usage_change=VALUES(usage_change),
      unanswered_emails=VALUES(unanswered_emails), no_next_step=VALUES(no_next_step),
      last_meeting=VALUES(last_meeting), evidence=VALUES(evidence), deal_stage=VALUES(deal_stage),
      signals=VALUES(signals), risk_drivers=VALUES(risk_drivers), action_plan=VALUES(action_plan),
      risk_breakdown=VALUES(risk_breakdown), crm_status=VALUES(crm_status),
      email_status=VALUES(email_status), recent_activity=VALUES(recent_activity),
      updated_at=CURRENT_TIMESTAMP
  `
  const [result] = await db.execute(sql, [
    c._crmId || c.crm_id || null,
    c._source || c.source || 'HubSpot Live',
    c.name, c.email || null, c.company || null, c.jobTitle || null,
    c.owner, c.industry,
    c.arr || 0, c.mrr || 0,
    c.renewal || null, c.daysToRenewal || 90,
    c.riskScore || 0, c.riskLevel || 'Low',
    c.aiConfidence || 0, c.aiReasoning || null,
    c.nextAction || null, c.emailDraft || null,
    c.expansionOpportunity || null, c.predictedOutcome || null, c.urgency || null,
    c.usageChange || 0, c.unansweredEmails || 0,
    c.noNextStep ? 1 : 0, c.lastMeeting || null, c.evidence || 0, c.dealStage || null,
    JSON.stringify(c.signals || []),
    JSON.stringify(c.riskDrivers || []),
    JSON.stringify(c.actionPlan || []),
    JSON.stringify(c.riskBreakdown || []),
    JSON.stringify(c.crm || {}),
    JSON.stringify(c.email || {}),
    JSON.stringify(c.recentActivity || []),
  ])
  return result.insertId || result.affectedRows
}

// ── Load all customers ────────────────────────────────────────────────────────
async function getAllCustomers() {
  const db = getPool()
  const [rows] = await db.execute('SELECT * FROM customers ORDER BY risk_score DESC')
  return rows.map(rowToCustomer)
}

// ── Load single customer by id ────────────────────────────────────────────────
async function getCustomerById(id) {
  const db = getPool()
  const [rows] = await db.execute('SELECT * FROM customers WHERE id = ?', [id])
  return rows[0] ? rowToCustomer(rows[0]) : null
}

// ── Update customer ───────────────────────────────────────────────────────────
async function updateCustomer(id, fields) {
  const db = getPool()
  const allowed = ['risk_score','risk_level','next_action','urgency','no_next_step']
  const setClauses = []
  const values = []
  for (const [k,v] of Object.entries(fields)) {
    if (allowed.includes(k)) { setClauses.push(`${k}=?`); values.push(v) }
  }
  if (setClauses.length === 0) return
  values.push(id)
  await db.execute(`UPDATE customers SET ${setClauses.join(',')} WHERE id=?`, values)
}

// ── Save task ─────────────────────────────────────────────────────────────────
async function saveTask(task) {
  const db = getPool()
  const [result] = await db.execute(
    'INSERT INTO tasks (customer_id, customer_name, title, assignee, due_date, priority, status) VALUES (?,?,?,?,?,?,?)',
    [task.customer_id || null, task.customer || task.customer_name, task.title, task.assignee, task.dueDate || task.due_date, task.priority, task.status || 'Pending']
  )
  return result.insertId
}

// ── Load all tasks ────────────────────────────────────────────────────────────
async function getAllTasks() {
  const db = getPool()
  const [rows] = await db.execute('SELECT * FROM tasks ORDER BY created_at DESC')
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    customer: r.customer_name,
    assignee: r.assignee,
    dueDate: r.due_date,
    priority: r.priority,
    status: r.status,
    createdAt: r.created_at,
  }))
}

// ── Update task status ────────────────────────────────────────────────────────
async function updateTaskStatus(id, status) {
  const db = getPool()
  await db.execute('UPDATE tasks SET status=? WHERE id=?', [status, id])
}

// ── Save audit log entry ──────────────────────────────────────────────────────
async function saveAuditEntry(entry) {
  const db = getPool()
  await db.execute(
    'INSERT INTO audit_log (customer_name, action_type, action_desc, performed_by, status) VALUES (?,?,?,?,?)',
    [entry.customer || null, entry.type || 'System', entry.action, entry.by || 'Agent', entry.status || 'Completed']
  )
}

// ── Load audit log ────────────────────────────────────────────────────────────
async function getAuditLog(limit = 200) {
  const db = getPool()
  const [rows] = await db.execute('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', [limit])
  return rows.map(r => ({
    id: r.id,
    time: new Date(r.created_at).toLocaleString(),
    type: r.action_type,
    action: r.action_desc,
    customer: r.customer_name,
    by: r.performed_by,
    status: r.status,
  }))
}

// ── Test connection ───────────────────────────────────────────────────────────
async function testConnection() {
  try {
    const db = getPool()
    await db.execute('SELECT 1')
    return true
  } catch (e) {
    console.error('MySQL connection failed:', e.message)
    return false
  }
}

// ── Convert DB row → app object ───────────────────────────────────────────────
function rowToCustomer(r) {
  const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v || [] } catch { return [] } }
  const parseObj = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v || {} } catch { return {} } }
  return {
    id: r.id,
    _crmId: r.crm_id,
    _source: r.source,
    name: r.name,
    email: r.email,
    company: r.company,
    jobTitle: r.job_title,
    owner: r.owner,
    industry: r.industry,
    arr: parseFloat(r.arr) || 0,
    mrr: parseFloat(r.mrr) || 0,
    renewal: r.renewal_date,
    daysToRenewal: r.days_to_renewal,
    riskScore: r.risk_score,
    riskLevel: r.risk_level,
    status: r.risk_level,
    aiConfidence: r.ai_confidence,
    aiReasoning: r.ai_reasoning,
    nextAction: r.next_action,
    emailDraft: r.email_draft,
    expansionOpportunity: r.expansion_opportunity,
    predictedOutcome: r.predicted_outcome,
    urgency: r.urgency,
    usageChange: r.usage_change,
    unansweredEmails: r.unanswered_emails,
    noNextStep: !!r.no_next_step,
    lastMeeting: r.last_meeting,
    evidence: r.evidence,
    dealStage: r.deal_stage,
    signals: parse(r.signals),
    riskDrivers: parse(r.risk_drivers),
    actionPlan: parse(r.action_plan),
    riskBreakdown: parse(r.risk_breakdown),
    crm: parseObj(r.crm_status),
    email: parseObj(r.email_status),
    recentActivity: parse(r.recent_activity),
    syncedAt: r.synced_at,
  }
}

module.exports = {
  getPool, upsertCustomer, getAllCustomers, getCustomerById,
  updateCustomer, saveTask, getAllTasks, updateTaskStatus,
  saveAuditEntry, getAuditLog, testConnection
}
