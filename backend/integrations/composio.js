// Composio Integration — Gmail email signals via Composio toolset
// Uses Composio to fetch recent Gmail threads for customer engagement signals

const { Composio } = require('@composio/core')

let composioClient = null

function getComposio() {
  if (!composioClient) {
    composioClient = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
  }
  return composioClient
}

// ─── Fetch Gmail signals for a company ───────────────────────────────────────
async function fetchGmailSignals(companyName, contactEmail) {
  try {
    const composio = getComposio()

    // Get Gmail toolset
    const toolset = await composio.toolsets.getToolset({ appName: 'gmail' })

    // Search for emails from/to this company
    const searchQuery = contactEmail
      ? `from:${contactEmail} OR to:${contactEmail}`
      : `"${companyName}"`

    const result = await toolset.executeAction('GMAIL_LIST_THREADS', {
      query: searchQuery,
      max_results: 10,
    })

    if (!result?.threads || result.threads.length === 0) {
      return { lastEmailDays: null, unansweredEmails: 0, lastEmailSubject: null }
    }

    // Analyze threads for signals
    const now = Date.now()
    let latestDate = null
    let unansweredCount = 0
    let lastSubject = null

    for (const thread of result.threads.slice(0, 5)) {
      const threadDetail = await toolset.executeAction('GMAIL_GET_THREAD', {
        thread_id: thread.id,
      })

      const messages = threadDetail?.messages || []
      if (messages.length === 0) continue

      const lastMsg = messages[messages.length - 1]
      const msgDate = new Date(parseInt(lastMsg.internalDate)).getTime()
      if (!latestDate || msgDate > latestDate) {
        latestDate = msgDate
        lastSubject = lastMsg.subject || 'No subject'
      }

      // Check if last message is from us (unanswered) or from customer
      const lastFrom = lastMsg.from || ''
      const isFromUs = !lastFrom.includes(contactEmail?.split('@')[1] || '__never__')
      if (isFromUs) unansweredCount++
    }

    return {
      lastEmailDays: latestDate ? Math.floor((now - latestDate) / 86400000) : null,
      unansweredEmails: unansweredCount,
      lastEmailSubject: lastSubject,
    }
  } catch (err) {
    console.log(`⚠️  Composio Gmail error for ${companyName}:`, err.message)
    return { lastEmailDays: null, unansweredEmails: 0, lastEmailSubject: null }
  }
}

// ─── Check if Composio Gmail is connected ────────────────────────────────────
async function checkComposioStatus() {
  try {
    const composio = getComposio()
    const connections = await composio.connections.list()
    const gmailConnected = connections?.items?.some(c => c.appName?.toLowerCase() === 'gmail' && c.status === 'ACTIVE')
    return { connected: !!gmailConnected, connections: connections?.items?.length || 0 }
  } catch (err) {
    return { connected: false, error: err.message }
  }
}

// ─── Send email via Composio Gmail (for approved actions) ────────────────────
async function sendEmailViaComposio(to, subject, body, from) {
  try {
    const composio = getComposio()
    const toolset = await composio.toolsets.getToolset({ appName: 'gmail' })

    const result = await toolset.executeAction('GMAIL_SEND_EMAIL', {
      to,
      subject,
      body,
    })

    return { success: true, messageId: result?.id }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { fetchGmailSignals, checkComposioStatus, sendEmailViaComposio }
