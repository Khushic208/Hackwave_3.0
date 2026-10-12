/**
 * Auto-initializes the MySQL database and required tables.
 * Called at server startup — safe to call multiple times (IF NOT EXISTS).
 */
const mysql = require('mysql2/promise')

async function initDb() {
  const dbName = process.env.DB_NAME || 'revops_ai'

  // Create database if it doesn't exist
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    connectTimeout: 5000,
  })

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``)
  await conn.end()

  // Create tables
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: dbName,
    connectTimeout: 5000,
  })

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      crm_id VARCHAR(255) NULL,
      source VARCHAR(100) NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(320) NULL,
      company VARCHAR(255) NULL,
      job_title VARCHAR(255) NULL,
      owner VARCHAR(255) NOT NULL DEFAULT '',
      industry VARCHAR(255) NULL,
      arr DECIMAL(15,2) NOT NULL DEFAULT 0,
      mrr DECIMAL(15,2) NOT NULL DEFAULT 0,
      renewal_date VARCHAR(100) NULL,
      days_to_renewal INT NULL,
      risk_score TINYINT UNSIGNED NULL,
      risk_level VARCHAR(20) NULL,
      ai_confidence TINYINT UNSIGNED NULL,
      ai_reasoning TEXT NULL,
      next_action TEXT NULL,
      email_draft TEXT NULL,
      expansion_opportunity TEXT NULL,
      predicted_outcome TEXT NULL,
      urgency VARCHAR(50) NULL,
      usage_change INT NULL DEFAULT 0,
      unanswered_emails INT NULL DEFAULT 0,
      no_next_step TINYINT(1) NULL DEFAULT 0,
      last_meeting VARCHAR(100) NULL,
      evidence INT NULL DEFAULT 0,
      deal_stage VARCHAR(100) NULL,
      signals JSON NULL,
      risk_drivers JSON NULL,
      action_plan JSON NULL,
      risk_breakdown JSON NULL,
      crm_status JSON NULL,
      email_status JSON NULL,
      recent_activity JSON NULL,
      synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_crm_id (crm_id)
    )
  `)

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      customer_id INT UNSIGNED NULL,
      customer_name VARCHAR(255) NOT NULL,
      title VARCHAR(500) NOT NULL,
      assignee VARCHAR(255) NOT NULL DEFAULT '',
      due_date VARCHAR(100) NOT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
      status VARCHAR(20) NOT NULL DEFAULT 'Pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      customer_name VARCHAR(255) NULL,
      action_type VARCHAR(100) NOT NULL DEFAULT 'System',
      action_desc TEXT NOT NULL,
      performed_by VARCHAR(255) NOT NULL DEFAULT 'Agent',
      status VARCHAR(50) NOT NULL DEFAULT 'Completed',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await pool.end()
  console.log('✅ MySQL database initialized (revops_ai)')
}

module.exports = { initDb }
