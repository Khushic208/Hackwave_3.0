# Hackwave_3.0

## MySQL customer database

The backend creates the `envision` database and its `customers` table at startup, loads saved customers from MySQL, and persists new, updated, analyzed, and CRM-synced customer records. When the database is empty, it inserts the demo customers once.

### Configure and start

1. Install and start MySQL Server. Create or use a MySQL account that can create a database and tables.
2. If `backend/.env` does not exist, copy `backend/.env.example` to `backend/.env`. If it already exists, keep its current API keys and add/update only `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. Set `DB_PASSWORD` to the password for that MySQL account; the account must be allowed to create the database and table. Keep `DB_NAME=envision`, or choose another database name.
3. In a terminal, run:

   ```powershell
   cd backend
   npm install
   npm run dev
   ```

   If port `4001` is already in use, the backend tries the next port; make sure the frontend API URL matches the port printed in the terminal.

### View customer records in MySQL Workbench

1. Open MySQL Workbench and connect to the same local MySQL server configured in `backend/.env` (commonly `127.0.0.1`, port `3306`).
2. In **SCHEMAS**, click refresh and expand **envision** → **Tables** → **customers**.
3. Right-click **customers** and choose **Select Rows - Limit 1000**, or open a SQL tab and run:

   ```sql
   USE envision;
   SELECT id, name, owner, email, company, industry, arr, risk_score, risk_level, renewal, customer_data
   FROM customers
   ORDER BY id;
   ```

The `customer_data` JSON column contains the complete customer record, including its AI analysis and activity history; the other columns make common fields easy to browse and query. Tasks (including tasks created from an approved customer action) are saved separately in the `customer_tasks` table. Completing a task updates its database record.

The customer **Actions** tab saves task approvals, CRM-update approvals, and rejections to the customer record and activity history. A CRM approval here updates this app's customer record only; connect a CRM write integration separately to apply changes in an external CRM.