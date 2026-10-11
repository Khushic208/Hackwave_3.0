const mysql = require('mysql2/promise')

const databaseName = process.env.DB_NAME || 'envision'
if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
  throw new Error('DB_NAME may contain only letters, numbers, and underscores')
}

const connectionOptions = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
}

let pool

async function initializeDatabase() {
  const connection = await mysql.createConnection(connectionOptions)
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``)
  } finally {
    await connection.end()
  }

  pool = mysql.createPool({ ...connectionOptions, database: databaseName })
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT UNSIGNED NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner VARCHAR(255) NOT NULL,
      email VARCHAR(320) NULL,
      company VARCHAR(255) NULL,
      industry VARCHAR(255) NULL,
      arr DECIMAL(15, 2) NOT NULL DEFAULT 0,
      risk_score TINYINT UNSIGNED NULL,
      risk_level VARCHAR(20) NULL,
      renewal VARCHAR(100) NULL,
      customer_data JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS customer_tasks (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      customer_id INT UNSIGNED NULL,
      title VARCHAR(500) NOT NULL,
      customer VARCHAR(255) NOT NULL,
      assignee VARCHAR(255) NOT NULL,
      due_date VARCHAR(100) NOT NULL,
      priority VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Pending',
      generated_key TINYINT UNSIGNED NULL,
      action_key INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY customer_tasks_generated_unique (customer_id, generated_key),
      UNIQUE KEY customer_tasks_action_unique (action_key)
    )
  `)
}

async function loadCustomers() {
  const [rows] = await pool.execute('SELECT customer_data FROM customers ORDER BY id')
  return rows.map(row => typeof row.customer_data === 'string'
    ? JSON.parse(row.customer_data)
    : row.customer_data)
}

async function upsertCustomer(connection, customer) {
  const contactEmail = typeof customer.contactEmail === 'string'
    ? customer.contactEmail
    : typeof customer.email === 'string' ? customer.email : null
  await connection.execute(`
    INSERT INTO customers
      (id, name, owner, email, company, industry, arr, risk_score, risk_level, renewal, customer_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      owner = VALUES(owner),
      email = VALUES(email),
      company = VALUES(company),
      industry = VALUES(industry),
      arr = VALUES(arr),
      risk_score = VALUES(risk_score),
      risk_level = VALUES(risk_level),
      renewal = VALUES(renewal),
      customer_data = VALUES(customer_data)
  `, [
    customer.id,
    customer.name,
    customer.owner || '',
    contactEmail,
    customer.company || null,
    customer.industry || null,
    Number(customer.arr) || 0,
    Number.isFinite(Number(customer.riskScore)) ? Number(customer.riskScore) : null,
    customer.riskLevel || null,
    customer.renewal || null,
    JSON.stringify(customer),
  ])
}

function generatedTaskDueDate(customer) {
  const days = customer.urgency === 'Immediate' ? 1 : customer.urgency === 'This Week' ? 5 : 14
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function ensureGeneratedTask(customer) {
  const title = customer.nextAction || `Follow up with ${customer.name}`
  await pool.execute(`
    INSERT IGNORE INTO customer_tasks
      (customer_id, title, customer, assignee, due_date, priority, status, generated_key)
    VALUES (?, ?, ?, ?, ?, ?, 'Pending', 1)
  `, [
    customer.id,
    title,
    customer.name,
    customer.owner || '',
    generatedTaskDueDate(customer),
    customer.riskLevel || 'Medium',
  ])
}

async function saveCustomer(customer) {
  await upsertCustomer(pool, customer)
  await ensureGeneratedTask(customer)
}

async function createApprovedTask(customer, task) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute(`
      INSERT IGNORE INTO customer_tasks
        (customer_id, title, customer, assignee, due_date, priority, status, action_key)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
    `, [customer.id, task.title, customer.name, task.assignee, task.dueDate, task.priority, customer.id])

    const [rows] = await connection.execute(
      'SELECT id FROM customer_tasks WHERE action_key = ?',
      [customer.id]
    )
    customer._actions.approveTask.taskId = rows[0].id
    await upsertCustomer(connection, customer)
    await connection.commit()
    return rows[0].id
  } catch (err) {
    await connection.rollback()
    throw err
  } finally {
    connection.release()
  }
}

async function loadTasks() {
  const [rows] = await pool.execute(`
    SELECT id, customer_id AS customerId, title, customer, assignee,
           due_date AS dueDate, priority, status
    FROM customer_tasks
    ORDER BY id DESC
  `)
  return rows
}

async function createTask(task) {
  const [result] = await pool.execute(`
    INSERT INTO customer_tasks
      (customer_id, title, customer, assignee, due_date, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    task.customerId || null,
    task.title,
    task.customer,
    task.assignee,
    task.dueDate,
    task.priority,
    task.status || 'Pending',
  ])
  return result.insertId
}

async function updateTaskStatus(id, status) {
  const [result] = await pool.execute(
    'UPDATE customer_tasks SET status = ? WHERE id = ?',
    [status, id]
  )
  return result.affectedRows > 0
}

async function deleteCustomer(id) {
  await pool.execute('DELETE FROM customer_tasks WHERE customer_id = ?', [id])
  await pool.execute('DELETE FROM customers WHERE id = ?', [id])
}

module.exports = {
  initializeDatabase,
  loadCustomers,
  saveCustomer,
  createApprovedTask,
  loadTasks,
  createTask,
  updateTaskStatus,
  deleteCustomer,
}
