// Real HubSpot CRM Integration
// Fetches contacts, companies, deals, engagements using HubSpot Private App API

const axios = require('axios')

const HS_BASE = 'https://api.hubapi.com'

function hsClient() {
  return axios.create({
    baseURL: HS_BASE,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  })
}

// ─── Fetch all companies ──────────────────────────────────────────────────────
async function fetchCompanies() {
  const client = hsClient()
  const res = await client.get('/crm/v3/objects/companies', {
    params: {
      limit: 50,
      properties: [
        'name', 'domain', 'industry', 'annualrevenue',
        'hubspot_owner_id', 'hs_lastmodifieddate',
        'lifecyclestage', 'hs_lead_status', 'numberofemployees'
      ].join(','),
    }
  })
  return res.data.results || []
}

// ─── Fetch all contacts ───────────────────────────────────────────────────────
async function fetchContacts() {
  const client = hsClient()
  const res = await client.get('/crm/v3/objects/contacts', {
    params: {
      limit: 100,
      properties: [
        'firstname', 'lastname', 'email', 'company',
        'jobtitle', 'hs_email_last_replied', 'notes_last_contacted',
        'num_contacted_notes', 'hs_email_open', 'associatedcompanyid'
      ].join(','),
    }
  })
  return res.data.results || []
}

// ─── Fetch all deals ──────────────────────────────────────────────────────────
async function fetchDeals() {
  const client = hsClient()
  const res = await client.get('/crm/v3/objects/deals', {
    params: {
      limit: 100,
      properties: [
        'dealname', 'dealstage', 'amount', 'closedate',
        'hubspot_owner_id', 'hs_deal_stage_probability',
        'associated_company', 'hs_lastmodifieddate'
      ].join(','),
    }
  })
  return res.data.results || []
}

// ─── Fetch owners (account managers) ─────────────────────────────────────────
async function fetchOwners() {
  const client = hsClient()
  const res = await client.get('/crm/v3/owners', { params: { limit: 100 } })
  const ownerMap = {}
  ;(res.data.results || []).forEach(o => {
    ownerMap[o.id] = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email
  })
  return ownerMap
}

// ─── Fetch engagements (emails, calls, meetings) for a company ───────────────
async function fetchEngagementsForCompany(companyId) {
  const client = hsClient()
  try {
    // Get associated contacts first
    const assocRes = await client.get(`/crm/v3/objects/companies/${companyId}/associations/contacts`)
    const contactIds = (assocRes.data.results || []).map(r => r.id)
    if (contactIds.length === 0) return { lastEmailDays: null, emailOpens: 0, lastMeetingDays: null }

    // Get engagements for first contact
    const engRes = await client.get('/crm/v3/objects/engagements', {
      params: {
        limit: 20,
        properties: 'hs_engagement_type,hs_createdate,hs_email_subject',
        filterGroups: JSON.stringify([{
          filters: [{ propertyName: 'associations.contact', operator: 'EQ', value: contactIds[0] }]
        }])
      }
    })
    const engs = engRes.data.results || []

    const emails = engs.filter(e => e.properties?.hs_engagement_type === 'EMAIL')
    const meetings = engs.filter(e => e.properties?.hs_engagement_type === 'MEETING')
    const now = Date.now()

    const lastEmailDate = emails.length > 0
      ? Math.max(...emails.map(e => new Date(e.properties.hs_createdate).getTime()))
      : null
    const lastMeetingDate = meetings.length > 0
      ? Math.max(...meetings.map(e => new Date(e.properties.hs_createdate).getTime()))
      : null

    return {
      lastEmailDays: lastEmailDate ? Math.floor((now - lastEmailDate) / 86400000) : null,
      emailOpens: emails.length,
      lastMeetingDays: lastMeetingDate ? Math.floor((now - lastMeetingDate) / 86400000) : null,
    }
  } catch {
    return { lastEmailDays: null, emailOpens: 0, lastMeetingDays: null }
  }
}

// ─── MAIN: Build unified customer records from HubSpot ───────────────────────
async function fetchHubSpotCustomers() {
  console.log('🔄 Fetching real HubSpot data...')

  const [companies, contacts, deals, owners] = await Promise.all([
    fetchCompanies(),
    fetchContacts(),
    fetchDeals(),
    fetchOwners(),
  ])

  // Build contact map by associatedcompanyid
  const contactsByCompany = {}
  contacts.forEach(c => {
    const compId = c.properties?.associatedcompanyid
    if (compId) {
      if (!contactsByCompany[compId]) contactsByCompany[compId] = []
      contactsByCompany[compId].push(c)
    }
  })

  // Build deal map by company name
  const dealsByCompany = {}
  deals.forEach(d => {
    const name = d.properties?.dealname?.toLowerCase() || ''
    dealsByCompany[name] = d
  })

  const results = []

  for (const company of companies.slice(0, 15)) {
    const p = company.properties
    if (!p?.name) continue

    const companyId = company.id
    const companyContacts = contactsByCompany[companyId] || []
    const primaryContact = companyContacts[0]?.properties

    // Deal info
    const companyNameKey = p.name.toLowerCase()
    const matchedDeal = Object.keys(dealsByCompany).find(k => k.includes(companyNameKey) || companyNameKey.includes(k))
    const deal = matchedDeal ? dealsByCompany[matchedDeal] : null

    // Engagement data
    const eng = await fetchEngagementsForCompany(companyId)

    // Calculate days since last contact
    const lastContactedStr = primaryContact?.notes_last_contacted
    const lastContactedDays = lastContactedStr
      ? Math.floor((Date.now() - new Date(lastContactedStr).getTime()) / 86400000)
      : eng.lastEmailDays ?? 30

    // Email replied check
    const lastReplied = primaryContact?.hs_email_last_replied
    const daysSinceReply = lastReplied
      ? Math.floor((Date.now() - new Date(lastReplied).getTime()) / 86400000)
      : null
    const contactReplied = daysSinceReply !== null && daysSinceReply < 14

    // Deal stage mapping
    const dealStageRaw = deal?.properties?.dealstage || p.lifecyclestage || 'unknown'
    const dealStageMap = {
      'appointmentscheduled': 'Active',
      'qualifiedtobuy': 'Active',
      'presentationscheduled': 'Active',
      'decisionmakerboughtin': 'Renewal',
      'contractsent': 'Renewal',
      'closedwon': 'Active',
      'closedlost': 'Churn Risk',
      'customer': 'Active',
      'evangelist': 'Expansion',
      'lead': 'Renewal Risk',
      'subscriber': 'Renewal Risk',
    }
    const dealStage = dealStageMap[dealStageRaw?.toLowerCase()] || 'Active'

    // Close date → days to renewal
    const closeDate = deal?.properties?.closedate
    const daysToRenewal = closeDate
      ? Math.max(1, Math.floor((new Date(closeDate).getTime() - Date.now()) / 86400000))
      : 90

    // ARR from deal amount or company revenue
    const arr = parseInt(deal?.properties?.amount) ||
      parseInt(p.annualrevenue) || 0

    // Owner
    const ownerId = p.hubspot_owner_id || deal?.properties?.hubspot_owner_id
    const ownerName = owners[ownerId] || 'Account Manager'

    results.push({
      hsId: `HS-${companyId}`,
      name: p.name,
      owner: ownerName,
      industry: p.industry || 'Unknown',
      arr,
      daysToRenewal,
      renewal: closeDate ? new Date(closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : `In ${daysToRenewal} days`,
      lastEmailDays: eng.lastEmailDays ?? lastContactedDays,
      emailOpens: eng.emailOpens,
      meetingBooked: eng.lastMeetingDays !== null && eng.lastMeetingDays < 14,
      dealStage,
      // Use email opens as proxy for usage score (0-100)
      usageScore: Math.min(100, (eng.emailOpens || 0) * 15 + (contactReplied ? 30 : 0)),
      // NPS: derive from lifecycle stage
      npsScore: dealStage === 'Expansion' ? 8 : dealStage === 'Churn Risk' ? 3 : dealStage === 'Active' ? 6 : 5,
      // Contact info
      contactName: primaryContact ? `${primaryContact.firstname || ''} ${primaryContact.lastname || ''}`.trim() : 'Unknown',
      contactTitle: primaryContact?.jobtitle || '',
      contactEmail: primaryContact?.email || '',
      contactReplied,
      contactLastEmailDays: daysSinceReply ?? lastContactedDays,
    })
  }

  console.log(`✅ HubSpot: fetched ${results.length} real companies`)
  return results
}

module.exports = { fetchHubSpotCustomers }
