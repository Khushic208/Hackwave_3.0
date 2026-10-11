const axios = require('axios')

const HS_BASE = 'https://api.hubapi.com'
const TOKEN = process.env.HUBSPOT_API_KEY

const hs = axios.create({
  baseURL: HS_BASE,
  headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  timeout: 15000,
})

// ─── Fetch contacts with all key CRM properties ───────────────────────────────
async function fetchContacts() {
  const props = [
    'firstname', 'lastname', 'email', 'company',
    'jobtitle', 'phone',
    'hs_lead_status', 'lifecyclestage',
    'hs_last_email_date', 'hs_email_open', 'hs_email_replied',
    'hs_sales_email_last_replied', 'hs_email_last_send_date',
    'notes_last_updated', 'notes_last_contacted',
    'num_associated_deals', 'associatedcompanyid',
    'hubspot_owner_id',
    'hs_email_optout',
  ].join(',')

  let all = [], after
  do {
    const params = { limit: 100, properties: props }
    if (after) params.after = after
    const res = await hs.get('/crm/v3/objects/contacts', { params })
    all = all.concat(res.data.results || [])
    after = res.data.paging?.next?.after
  } while (after)

  return all
}

// ─── Fetch deals for ARR + renewal date + stage ───────────────────────────────
async function fetchDeals() {
  const props = [
    'dealname', 'dealstage', 'amount', 'closedate',
    'pipeline', 'hubspot_owner_id',
    'hs_lastmodifieddate', 'notes_last_updated',
    'hs_deal_stage_probability',
  ].join(',')

  let all = [], after
  do {
    const params = { limit: 100, properties: props }
    if (after) params.after = after
    const res = await hs.get('/crm/v3/objects/deals', { params })
    all = all.concat(res.data.results || [])
    after = res.data.paging?.next?.after
  } while (after)

  return all
}

// ─── Fetch support tickets ─────────────────────────────────────────────────────
async function fetchTickets() {
  try {
    const res = await hs.get('/crm/v3/objects/tickets', {
      params: {
        limit: 100,
        properties: 'subject,hs_pipeline_stage,hs_ticket_priority,hs_object_id',
      },
    })
    return res.data.results || []
  } catch { return [] }
}

// ─── Fetch owners ─────────────────────────────────────────────────────────────
async function fetchOwners() {
  try {
    const res = await hs.get('/crm/v3/owners/')
    return res.data.results || []
  } catch { return [] }
}

// ─── Associate deals with contacts ────────────────────────────────────────────
async function fetchDealContactAssociations(dealIds) {
  const map = {}
  for (const id of dealIds.slice(0, 50)) {
    try {
      const res = await hs.get(`/crm/v3/objects/deals/${id}/associations/contacts`)
      const contactId = res.data.results?.[0]?.id
      if (contactId) map[contactId] = id
    } catch { /* skip */ }
  }
  return map
}

// ─── MAIN: Build customer-level risk-ready records from real HubSpot data ─────
async function fetchHubSpotCustomers() {
  console.log('🔄 Fetching real HubSpot customer data...')

  const [contacts, deals, tickets, owners] = await Promise.all([
    fetchContacts(),
    fetchDeals(),
    fetchTickets(),
    fetchOwners(),
  ])

  // Owner lookup
  const ownerMap = {}
  owners.forEach(o => {
    ownerMap[o.id] = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email || 'Account Manager'
  })

  // Map deals by id
  const dealMap = {}
  deals.forEach(d => { dealMap[d.id] = d.properties })

  // Associate deals → contacts
  const dealIds = deals.map(d => d.id)
  const dealContactMap = await fetchDealContactAssociations(dealIds)
  // Invert: contactId → dealId
  const contactDealMap = {}
  Object.entries(dealContactMap).forEach(([contactId, dealId]) => {
    contactDealMap[contactId] = dealId
  })

  // Count tickets (approximate — HubSpot free doesn't always associate tickets to contacts)
  const totalTickets = tickets.length

  // Build one record per contact (if they have a name/company)
  const records = contacts
    .filter(c => {
      const p = c.properties
      return (p.firstname || p.lastname || p.company) // must have some identity
    })
    .map(contact => {
      const p = contact.properties
      const contactId = contact.id

      // Name
      const firstName = p.firstname || ''
      const lastName = p.lastname || ''
      const fullName = `${firstName} ${lastName}`.trim() || p.company || 'Unknown'
      const company = p.company || fullName

      // Owner
      const ownerName = ownerMap[p.hubspot_owner_id] || 'Account Manager'

      // Deal for this contact
      const dealId = contactDealMap[contactId]
      const deal = dealId ? dealMap[dealId] : null

      // ARR from deal amount
      const arr = deal?.amount ? parseFloat(deal.amount) : 0

      // Days to renewal from deal close date
      let daysToRenewal = 90
      let renewalDate = 'Not set'
      if (deal?.closedate) {
        const close = new Date(deal.closedate)
        daysToRenewal = Math.max(1, Math.floor((close - Date.now()) / (1000 * 60 * 60 * 24)))
        renewalDate = close.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }

      // Deal stage
      const rawStage = deal?.dealstage || 'unknown'
      const stageLabels = {
        appointmentscheduled: 'Meeting Scheduled',
        qualifiedtobuy: 'Qualified',
        presentationscheduled: 'Presentation',
        decisionmakerboughtin: 'Decision Maker',
        contractsent: 'Contract Sent',
        closedwon: 'Closed Won',
        closedlost: 'Churn Risk',
      }
      const dealStage = stageLabels[rawStage] || rawStage.replace(/_/g, ' ')

      // Email signals
      const lastEmailDate = p.hs_last_email_date || p.hs_email_last_send_date || p.notes_last_contacted
      const lastEmailDays = lastEmailDate
        ? Math.floor((Date.now() - new Date(lastEmailDate)) / (1000 * 60 * 60 * 24))
        : 999

      const emailReplied = p.hs_email_replied === 'true' || !!p.hs_sales_email_last_replied
      const emailOpens = parseInt(p.hs_email_open || '0', 10)

      // Last activity
      const lastActivity = p.notes_last_updated || p.notes_last_contacted
      const lastActivityDays = lastActivity
        ? Math.floor((Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24))
        : lastEmailDays

      // No next step = no deal or deal is stale
      const noNextStep = !deal || rawStage === 'closedlost'

      // Usage trend proxy from lifecycle stage
      const lifecycle = p.lifecyclestage || ''
      let usageTrend = 0
      if (lifecycle === 'customer') usageTrend = 5
      else if (lifecycle === 'evangelist') usageTrend = 15
      else if (lifecycle === 'other') usageTrend = -10

      // If deal lost, strong negative signal
      if (rawStage === 'closedlost') usageTrend = -40

      return {
        // Identity
        hsId: `HS-${contactId}`,
        contactId,
        name: fullName,          // customer person name
        company,                  // company they work at
        email: p.email || '',
        jobTitle: p.jobtitle || '',
        owner: ownerName,
        industry: 'Unknown',      // HubSpot contacts don't always have industry

        // Financial
        arr,
        daysToRenewal,
        renewal: renewalDate,

        // CRM signals
        dealStage,
        lifecycleStage: lifecycle,
        noNextStep,
        lastActivityDays,

        // Email signals
        lastEmailDays,
        emailOpens,
        emailReplied,
        unansweredEmails: emailReplied ? 0 : (lastEmailDays > 7 ? 2 : lastEmailDays > 3 ? 1 : 0),

        // Usage proxy
        usageTrend,

        // Support (approximate)
        supportTickets: 0, // HubSpot free doesn't easily associate tickets to contacts

        // Meta
        _source: 'HubSpot Live',
        _raw: true,
      }
    })

  // Filter out contacts with no meaningful data
  const meaningful = records.filter(r =>
    r.name !== 'Unknown' &&
    r.email !== ''
  )

  console.log(`✅ HubSpot: ${contacts.length} contacts → ${meaningful.length} customers with data`)
  return meaningful
}

module.exports = { fetchHubSpotCustomers }
