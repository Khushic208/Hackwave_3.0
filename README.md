# RevOps AI — Autonomous Revenue Operations Agent

> **Hackwave 3.0 Hackathon Project**
> Connect scattered customer signals → Explain revenue risk → Act autonomously

---

## 🧠 What It Does

RevOps AI is an autonomous agent that:
1. **Connects** real CRM data from HubSpot (and Salesforce-ready architecture)
2. **Merges** signals — email activity, deal stage, last meeting, support tickets
3. **Calculates** a transparent rule-based risk score (0–100) with full breakdown
4. **Explains** WHY each customer is at risk using Groq LLM (Llama 3.3)
5. **Recommends** a 3-month action plan and drafts follow-up emails
6. **Stores** everything in MySQL — customers, tasks, audit log
7. **Requires human approval** before any consequential action is taken

---

## 🏗️ Architecture

```
HubSpot API (real contacts/deals)
        ↓
   Gmail via Composio (email signals)
        ↓
   Merge + Extract Signals
        ↓
   Rule-based Risk Score (transparent, auditable)
        ↓
   Groq LLM (llama-3.3-70b) → Reasoning + Action Plan + Email Draft
        ↓
   MySQL Database (persist everything)
        ↓
   React Frontend (Dashboard, Customers, AI Action Center, Audit Log)
```

---

## 🗄️ Database Schema (MySQL)

Database: `revops_ai`

### Tables

#### `customers`
Stores all customer data synced from HubSpot + AI analysis results.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | Auto-increment ID |
| `crm_id` | VARCHAR | HubSpot contact ID (e.g. `HS-12345`) |
| `name` | VARCHAR | Customer full name |
| `owner` | VARCHAR | Account manager name |
| `email` | VARCHAR | Customer email |
| `company` | VARCHAR | Company name |
| `arr` | DECIMAL | Annual Recurring Revenue |
| `risk_score` | INT | AI risk score 0–100 |
| `risk_level` | ENUM | High / Medium / Low |
| `ai_reasoning` | TEXT | LLM-generated explanation |
| `signals` | JSON | Risk signals array |
| `risk_breakdown` | JSON | Point-by-point score breakdown |
| `action_plan` | JSON | 3-month action plan from LLM |
| `email_draft` | TEXT | AI-generated follow-up email |
| `created_at` | TIMESTAMP | When first synced |
| `updated_at` | TIMESTAMP | Last update time |

#### `tasks`
Follow-up tasks created from customer actions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | Auto-increment ID |
| `customer_id` | INT FK | Links to `customers.id` |
| `title` | VARCHAR | Task description |
| `assignee` | VARCHAR | Account owner |
| `due_date` | VARCHAR | Due date string |
| `priority` | ENUM | High / Medium / Low |
| `status` | ENUM | Pending / In Progress / Completed |

#### `audit_log`
Complete record of every action taken by the agent or user.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | Auto-increment ID |
| `customer_id` | INT | Related customer |
| `action_type` | VARCHAR | AI / Email / CRM / Task / Alert |
| `description` | TEXT | What happened |
| `performed_by` | VARCHAR | Agent or user name |
| `status` | VARCHAR | Completed / Pending / Rejected |
| `created_at` | TIMESTAMP | When it happened |

---

## 🔍 How to View Data in MySQL Workbench

### Connect to Database
1. Open **MySQL Workbench**
2. Click **"+"** → New Connection
3. Fill in:
   - Connection Name: `RevOps AI`
   - Hostname: `127.0.0.1`
   - Port: `3306`
   - Username: `root`
   - Password: `root`
4. Click **Test Connection** → OK
5. Double-click the connection to open

### View Customer Data
```sql
USE revops_ai;

-- See all customers with risk scores
SELECT id, name, company, email, risk_score, risk_level, arr, days_to_renewal, updated_at
FROM customers
ORDER BY risk_score DESC;

-- See only High risk customers
SELECT name, email, risk_score, ai_reasoning
FROM customers
WHERE risk_level = 'High'
ORDER BY risk_score DESC;

-- See full AI analysis for a customer
SELECT name, risk_score, risk_level, ai_reasoning, action_plan, email_draft
FROM customers
WHERE name LIKE '%Rahul%';
```

### View Tasks
```sql
-- All pending tasks
SELECT t.title, t.assignee, t.due_date, t.priority, c.name as customer
FROM tasks t
LEFT JOIN customers c ON t.customer_id = c.id
WHERE t.status = 'Pending'
ORDER BY t.due_date;
```

### View Audit Log
```sql
-- Recent actions
SELECT action_type, description, customer_name, performed_by, status, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 50;
```

---

## 🚀 How to Run

### Prerequisites
- Node.js v18+
- MySQL 8.0 (running on port 3306)
- MySQL database `revops_ai` created

### 1. Create MySQL Database
```sql
CREATE DATABASE IF NOT EXISTS revops_ai;
```
(Tables are auto-created on first server start)

### 2. Configure Environment
Edit `backend/.env`:
```env
GROQ_API_KEY=your_groq_key
PORT=4001
HUBSPOT_API_KEY=your_hubspot_private_app_key
COMPOSIO_API_KEY=your_composio_key
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=revops_ai
```

### 3. Start Backend
```cmd
cd backend
node server.js
```
Expected output:
```
RevOps AI backend running on http://localhost:4001
AI Mode: ✅ Groq LLM enabled
✅ MySQL connected — database ready
✅ Seeded 8 demo customers
```

### 4. Start Frontend
```cmd
cd frontend
npm run dev
```
Open: **http://localhost:5173**

---

## 📊 How Data Flows Into MySQL

```
User clicks "Sync & Analyze" in Signals & Integrations
        ↓
Backend fetches real contacts from HubSpot API
        ↓
For each contact:
  - Extract: email signals, deal stage, last activity, ARR
  - Calculate: rule-based risk score (0–100) with breakdown
  - Call: Groq LLM → reasoning + action plan + email draft
  - Save: INSERT/UPDATE into MySQL customers table
        ↓
Dashboard/Customers page reads from MySQL via API
        ↓
User approves action in Customer Detail → Actions tab
  - "Create Task" → INSERT into MySQL tasks table
  - "Update CRM" → UPDATE customers table
  - All actions → INSERT into MySQL audit_log table
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express |
| AI/LLM | Groq API (llama-3.3-70b-versatile) |
| Database | MySQL 8.0 |
| CRM | HubSpot API (real contacts, deals, emails) |
| Email | Composio + Gmail API |
| Risk Engine | Rule-based scoring (transparent, auditable) |

---

## 🔑 API Keys Required

| Service | Where to Get | Used For |
|---------|-------------|---------|
| Groq | [console.groq.com](https://console.groq.com) | LLM risk reasoning |
| HubSpot | Settings → Private Apps | Real CRM data |
| Composio | [app.composio.dev](https://app.composio.dev) | Gmail integration |

---

## 📋 Key Features

- ✅ **Real HubSpot Integration** — fetches actual contacts, deals, email activity
- ✅ **AI Risk Scoring** — Groq LLM explains WHY each customer is at risk
- ✅ **MySQL Persistence** — all data survives server restarts
- ✅ **Human-in-the-loop** — approval required before tasks/emails execute
- ✅ **Audit Trail** — every action logged with timestamp
- ✅ **3-Month Action Plans** — AI generates specific weekly actions
- ✅ **Email Drafts** — personalized follow-up emails per customer
- ✅ **Safety by Design** — reject button with reason logging

---

## 🏆 Hackathon Challenge Requirements Met

| Requirement | Implementation |
|-------------|---------------|
| Connect scattered signals | HubSpot + Gmail via Composio |
| Identify revenue risk | Rule-based engine + LLM explanation |
| Explain evidence | AI reasoning with actual numbers |
| Recommend next action | 3-month plan + immediate action |
| Human approval | Approve/Reject buttons in UI |
| MCP/Composio integration | Composio for Gmail actions |
| Safety requirement | All actions logged, approval required |
