const axios = require('axios')

// Composio new REST API base
const COMPOSIO_BASE = 'https://api.composio.dev'
const API_KEY = process.env.COMPOSIO_API_KEY

const composioClient = axios.create({
  baseURL: COMPOSIO_BASE,
  headers: {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 20000,
})

// ─── Check connected accounts (new API) ──────────────────────────────────────
async function getConnectedAccounts() {
  try {
    const res = await composioClient.get('/api/v3/connected_accounts')
    return res.data.items || res.data.connected_accounts || []
  } catch (e) {
    // Try fallback endpoint
    try {
      const res2 = await axios.get('https://backend.composio.dev/api/v2/connectedAccounts', {
        headers: { 'x-api-key': API_KEY },
        timeout: 10000,
      })
      return res2.data.items || []
    } catch {
      return []
    }
  }
}

// ─── Execute tool via Composio ────────────────────────────────────────────────
async function executeTool(toolName, params = {}) {
  try {
    const res = await composioClient.post('/api/v3/actions/execute', {
      action: toolName,
      input: params,
    })
    return { success: true, data: res.data }
  } catch (e) {
    return { success: false, error: e.response?.data?.message || e.message }
  }
}

// ─── Send email via Gmail through Composio ────────────────────────────────────
async function sendGmailEmail({ to, subject, body }) {
  // Try Composio Gmail action
  const result = await executeTool('GMAIL_SEND_EMAIL', {
    recipient_email: to,
    subject: subject,
    body: body,
  })

  if (!result.success) {
    console.log('Composio Gmail send failed:', result.error)
    // Return success: false so caller can handle
    return { success: false, error: result.error }
  }

  return { success: true }
}

// ─── Get Gmail emails for a contact ──────────────────────────────────────────
async function getGmailEmails(contactEmail, maxResults = 5) {
  const result = await executeTool('GMAIL_FETCH_EMAILS', {
    query: `from:${contactEmail} OR to:${contactEmail}`,
    max_results: maxResults,
  })

  if (!result.success) return []
  return result.data?.response_data?.messages || result.data?.messages || []
}

// ─── Derive email signal from Gmail data ─────────────────────────────────────
async function getEmailSignal(contactEmail) {
  if (!contactEmail) {
    return { lastEmailDays: 999, replied: false, unansweredCount: 0, lastSubject: '' }
  }

  const emails = await getGmailEmails(contactEmail, 5)

  if (!emails || emails.length === 0) {
    return { lastEmailDays: 90, replied: false, unansweredCount: 0, lastSubject: '' }
  }

  const sorted = [...emails].sort((a, b) =>
    new Date(b.internalDate || b.date || 0) - new Date(a.internalDate || a.date || 0)
  )

  const latest = sorted[0]
  const latestDate = new Date(latest.internalDate || latest.date || Date.now())
  const daysSince = Math.max(0, Math.floor((Date.now() - latestDate) / (1000 * 60 * 60 * 24)))

  const replied = emails.some(e => {
    const from = (e.from || e.sender || '').toLowerCase()
    return from.includes(contactEmail.toLowerCase())
  })

  const unanswered = emails.filter(e => {
    const to = (e.to || e.recipient || '').toLowerCase()
    return to.includes(contactEmail.toLowerCase())
  }).length

  return {
    lastEmailDays: daysSince,
    replied,
    unansweredCount: unanswered,
    lastSubject: latest.subject || '',
  }
}

// ─── Check if Gmail is connected ─────────────────────────────────────────────
async function checkGmailConnected() {
  if (!API_KEY) return { connected: false, email: 'No API key' }

  const accounts = await getConnectedAccounts()
  const gmail = accounts.find(a =>
    (a.appName || a.toolkit || '').toLowerCase().includes('gmail')
  )

  return {
    connected: !!gmail,
    accountId: gmail?.id || gmail?.nanoid || null,
    email: gmail?.metadata?.email || gmail?.userEmail || 'Connected',
  }
}

module.exports = {
  getConnectedAccounts,
  executeTool,
  sendGmailEmail,
  getEmailSignal,
  checkGmailConnected,
}
