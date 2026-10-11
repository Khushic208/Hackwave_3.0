require('dotenv').config()
const express = require('express')
const cors = require('cors')
const Groq = require('groq-sdk')
const { fetchHubSpotCustomers } = require('./integrations/hubspot')
const { getEmailSignal, checkGmailConnected, sendGmailEmail } = require('./integrations/composio')

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

// ─── Groq LLM Client ──────────────────────────────────────────────────────────
const groq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here'
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null

// ─── In-memory customer store (real input from user) ─────────────────────────
let customers = []
let nextId = 1

// ─── AI Engine: calls Groq LLM to analyze customer risk ──────────────────────
async function analyzeWithAI(customerData) {
  const {
    name, owner, industry,
    lastMeetingDaysAgo, unansweredEmails, noNextStep,
    productUsageTrend, daysToRenewal, supportTicketsOpen,
    emailSummary, lastMeetingNotes, arr
  } = customerData

  const systemPrompt = `You are an expert Revenue Operations AI trained on real SaaS churn data and industry benchmarks.

You know these REAL churn patterns from SaaS industry research:
- 70%+ of churned customers showed product usage decline 60-90 days before renewal
- No meeting in 21+ days before renewal = 3x higher churn probability
- Champion silence (no email reply 14+ days) = strongest single churn predictor
- NPS below 6 = 5x more likely to churn than NPS 9+
- 3+ open support tickets unresolved = signals product-fit issues
- Companies with usage GROWTH of 10%+ almost never churn

INDUSTRY BENCHMARKS:
- SaaS average churn: 5-7% annually, 0.5% monthly
- Healthy product usage growth: +5 to +20% monthly
- Critical usage drop threshold: -20% or more in 30 days
- Renewal engagement window: 90 days before renewal date
- Average deal size by industry: Enterprise $100K+, Mid-market $20-100K, SMB <$20K

You must give ACCURATE, DATA-DRIVEN risk assessments — not generic advice.`

  const prompt = `Analyze this customer's churn risk based on real signals:

COMPANY: ${name}
INDUSTRY: ${industry}
ACCOUNT OWNER: ${owner}
ARR: $${(arr || 0).toLocaleString()}
MRR: $${Math.round((arr || 0) / 12).toLocaleString()}

SIGNALS (last 30 days):
- Last meeting with customer: ${lastMeetingDaysAgo} days ago
- Customer emails unanswered: ${unansweredEmails}
- Next step in CRM: ${noNextStep ? 'MISSING — no follow-up planned' : 'Recorded'}
- Product usage trend: ${productUsageTrend > 0 ? '+' : ''}${productUsageTrend}% (${productUsageTrend <= -30 ? 'CRITICAL DROP' : productUsageTrend <= -15 ? 'significant decline' : productUsageTrend <= -5 ? 'moderate decline' : productUsageTrend >= 10 ? 'healthy growth' : 'stable'})
- Days until contract renewal: ${daysToRenewal}
- Open support tickets: ${supportTicketsOpen || 0}
${emailSummary ? `- Last email from customer: "${emailSummary}"` : ''}
${lastMeetingNotes ? `- Last meeting notes: "${lastMeetingNotes}"` : ''}

Based on real SaaS churn patterns, give a precise risk assessment.

Respond in EXACT JSON (no markdown, no text outside JSON):
{
  "riskScore": <1-100, use full range — 85+ means almost certain churn, 60-84 high risk, 35-59 medium, below 35 low>,
  "riskLevel": "<High|Medium|Low>",
  "confidence": <60-95 based on how many signals you have>,
  "reasoning": "<3 sentences: what is the core story here? Connect the signals causally. Be specific with numbers. Sound like a senior analyst, not a bot.>",
  "topSignals": ["<most critical signal with specific number>", "<second signal>", "<third signal>"],
  "recommendedAction": "<the single most impactful action RIGHT NOW — be specific, not generic>",
  "emailDraft": "<professional email from ${owner} to ${name} — warm, specific to their situation, clear CTA, 3-4 sentences>",
  "expansionOpportunity": "<specific upsell based on their ARR/industry/usage, or 'None identified'>",
  "urgency": "<Immediate|This Week|This Month>"
}`

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 2048,
  })

  const raw = response.choices[0].message.content.trim()
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI did not return valid JSON')
  return JSON.parse(jsonMatch[0])
}

// ─── STEP 1: Merge Salesforce + HubSpot data for same company ────────────────
function mergeData(sfRecord, hsRecord) {
  // Both present — full merge
  if (sfRecord && hsRecord) {
    return {
      name: sfRecord.name,
      owner: sfRecord.owner,
      industry: sfRecord.industry,
      arr: sfRecord.arr || hsRecord.arr || 0,
      source: 'Salesforce + HubSpot',

      // From Salesforce
      lastActivityDays: sfRecord.lastActivityDays,
      openOpportunities: sfRecord.openOpportunities,
      crmStage: sfRecord.stage,
      accountHealth: sfRecord.health,
      supportCases: sfRecord.caseCount,
      usageDrop: sfRecord.usageDrop,
      contactName: sfRecord.contact?.name || 'Unknown',
      contactTitle: sfRecord.contact?.title || '',
      contactReplied: sfRecord.contact?.replied ?? true,
      contactLastEmailDays: sfRecord.contact?.lastEmailDays || 0,
      daysToRenewal: sfRecord.daysToRenewal,
      renewal: sfRecord.renewal,

      // From HubSpot
      emailOpens: hsRecord.emailOpens,
      meetingBooked: hsRecord.meetingBooked,
      dealStage: hsRecord.dealStage,
      usageScore: hsRecord.usageScore,
      npsScore: hsRecord.npsScore,
      lastEmailDays: hsRecord.lastEmailDays,
    }
  }

  // Only Salesforce
  if (sfRecord) {
    return {
      name: sfRecord.name, owner: sfRecord.owner, industry: sfRecord.industry,
      arr: sfRecord.arr || 0, source: 'Salesforce',
      lastActivityDays: sfRecord.lastActivityDays,
      openOpportunities: sfRecord.openOpportunities,
      crmStage: sfRecord.stage, accountHealth: sfRecord.health,
      supportCases: sfRecord.caseCount, usageDrop: sfRecord.usageDrop,
      contactName: sfRecord.contact?.name || 'Unknown',
      contactTitle: sfRecord.contact?.title || '',
      contactReplied: sfRecord.contact?.replied ?? true,
      contactLastEmailDays: sfRecord.contact?.lastEmailDays || 0,
      daysToRenewal: sfRecord.daysToRenewal, renewal: sfRecord.renewal,
      emailOpens: null, meetingBooked: null, dealStage: null,
      usageScore: null, npsScore: null, lastEmailDays: null,
    }
  }

  // Only HubSpot
  return {
    name: hsRecord.name, owner: hsRecord.owner, industry: hsRecord.industry,
    arr: hsRecord.arr || 0, source: 'HubSpot',
    lastActivityDays: hsRecord.lastEmailDays,
    openOpportunities: null, crmStage: null,
    accountHealth: null, supportCases: 0,
    usageDrop: hsRecord.usageScore >= 70 ? 10 : hsRecord.usageScore >= 40 ? -10 : -35,
    contactName: 'Unknown', contactTitle: '', contactReplied: hsRecord.emailOpens > 0,
    contactLastEmailDays: hsRecord.lastEmailDays,
    daysToRenewal: hsRecord.daysToRenewal, renewal: hsRecord.renewal,
    emailOpens: hsRecord.emailOpens, meetingBooked: hsRecord.meetingBooked,
    dealStage: hsRecord.dealStage, usageScore: hsRecord.usageScore,
    npsScore: hsRecord.npsScore, lastEmailDays: hsRecord.lastEmailDays,
  }
}

// ─── STEP 2: Rule-based risk score (deterministic, transparent) ───────────────
function calculateRiskScore(merged) {
  let score = 0
  const breakdown = []

  // 1. Product usage (max 25 pts)
  const usage = merged.usageDrop ?? (merged.usageScore != null ? (merged.usageScore >= 70 ? 10 : merged.usageScore >= 40 ? -10 : -35) : 0)
  if (usage <= -30)      { score += 25; breakdown.push({ factor: 'Critical product usage decline', points: 25, value: `${usage}%` }) }
  else if (usage <= -15) { score += 18; breakdown.push({ factor: 'Significant usage decline', points: 18, value: `${usage}%` }) }
  else if (usage <= -5)  { score += 10; breakdown.push({ factor: 'Moderate usage decline', points: 10, value: `${usage}%` }) }
  else if (usage >= 10)  { score -= 5;  breakdown.push({ factor: 'Positive usage growth', points: -5, value: `+${usage}%` }) }

  // 2. Renewal proximity (max 20 pts)
  if (merged.daysToRenewal <= 14)      { score += 20; breakdown.push({ factor: 'Renewal imminent (<14 days)', points: 20, value: `${merged.daysToRenewal} days` }) }
  else if (merged.daysToRenewal <= 30) { score += 15; breakdown.push({ factor: 'Renewal very soon (<30 days)', points: 15, value: `${merged.daysToRenewal} days` }) }
  else if (merged.daysToRenewal <= 60) { score += 8;  breakdown.push({ factor: 'Renewal approaching (<60 days)', points: 8, value: `${merged.daysToRenewal} days` }) }

  // 3. Engagement gap (max 20 pts)
  const engGap = merged.lastActivityDays ?? merged.lastEmailDays ?? 0
  if (engGap >= 30)      { score += 20; breakdown.push({ factor: 'No engagement in 30+ days', points: 20, value: `${engGap} days ago` }) }
  else if (engGap >= 14) { score += 12; breakdown.push({ factor: 'Engagement gap >14 days', points: 12, value: `${engGap} days ago` }) }
  else if (engGap >= 7)  { score += 5;  breakdown.push({ factor: 'Slight engagement gap', points: 5, value: `${engGap} days ago` }) }

  // 4. Email / contact signals (max 15 pts)
  if (merged.contactReplied === false && (merged.contactLastEmailDays >= 14 || merged.lastEmailDays >= 14)) {
    score += 15; breakdown.push({ factor: 'Champion not replying to emails', points: 15, value: `${merged.contactLastEmailDays || merged.lastEmailDays} days no reply` })
  } else if (merged.emailOpens === 0) {
    score += 8; breakdown.push({ factor: 'Zero email opens', points: 8, value: '0 opens' })
  }

  // 5. Support cases (max 10 pts)
  if (merged.supportCases >= 5)      { score += 10; breakdown.push({ factor: 'High support ticket volume', points: 10, value: `${merged.supportCases} cases` }) }
  else if (merged.supportCases >= 3) { score += 6;  breakdown.push({ factor: 'Multiple open support cases', points: 6, value: `${merged.supportCases} cases` }) }
  else if (merged.supportCases >= 1) { score += 3;  breakdown.push({ factor: 'Open support case', points: 3, value: `${merged.supportCases} case` }) }

  // 6. NPS score (max 10 pts)
  if (merged.npsScore != null) {
    if (merged.npsScore <= 3)      { score += 10; breakdown.push({ factor: 'Very low NPS score', points: 10, value: `${merged.npsScore}/10` }) }
    else if (merged.npsScore <= 5) { score += 6;  breakdown.push({ factor: 'Below-average NPS', points: 6, value: `${merged.npsScore}/10` }) }
    else if (merged.npsScore >= 9) { score -= 5;  breakdown.push({ factor: 'Excellent NPS (promoter)', points: -5, value: `${merged.npsScore}/10` }) }
  }

  // 7. CRM health signals (max 10 pts)
  if (merged.accountHealth === 'Critical')  { score += 10; breakdown.push({ factor: 'CRM account health: Critical', points: 10, value: 'Critical' }) }
  else if (merged.accountHealth === 'At Risk') { score += 6; breakdown.push({ factor: 'CRM account health: At Risk', points: 6, value: 'At Risk' }) }

  if (merged.dealStage === 'Churn Risk')   { score += 8; breakdown.push({ factor: 'HubSpot deal stage: Churn Risk', points: 8, value: 'Churn Risk' }) }
  else if (merged.dealStage === 'Renewal Risk') { score += 5; breakdown.push({ factor: 'HubSpot deal stage: Renewal Risk', points: 5, value: 'Renewal Risk' }) }

  if (merged.meetingBooked === false && merged.daysToRenewal < 60) {
    score += 5; breakdown.push({ factor: 'No meeting booked before renewal', points: 5, value: 'No meeting' })
  }

  const finalScore = Math.max(1, Math.min(100, Math.round(score)))
  const level = finalScore >= 70 ? 'High' : finalScore >= 40 ? 'Medium' : 'Low'

  return { score: finalScore, level, breakdown }
}

// ─── STEP 3: LLM explains risk + gives future action plan ────────────────────
async function explainWithLLM(merged, riskResult) {
  const { score, level, breakdown } = riskResult

  const breakdownText = breakdown.map(b => `  • ${b.factor}: ${b.value} (+${b.points} pts)`).join('\n')

  const systemPrompt = `You are a senior Revenue Operations analyst with 10+ years experience at Salesforce, HubSpot, and top SaaS companies.

You have deep knowledge of:
- Real churn patterns: usage drop -20%+ in 30 days = 68% churn probability within 90 days
- Engagement decay: no meeting in 21+ days near renewal = deal at serious risk
- Champion risk: key contact not replying = #1 leading indicator of churn
- NPS correlation: NPS 1-5 customers churn at 4x the rate of NPS 9-10
- Support overload: 3+ tickets = product-fit or onboarding failure signal
- Industry context: Healthcare/Finance churn slower but harder to win back; SaaS/Tech churn fast

Your analysis must be SPECIFIC, use ACTUAL NUMBERS from the data, and sound like a real analyst — not a template.`

  const prompt = `A rule-based risk engine scored ${merged.name} at ${score}/100 (${level} risk). Explain WHY and give a recovery plan.

COMPANY: ${merged.name} | ${merged.industry} | ARR: $${merged.arr.toLocaleString()}
OWNER: ${merged.owner}

RISK SCORE BREAKDOWN (what drove the ${score}/100):
${breakdownText}

FULL SIGNAL DATA:
- Product usage: ${merged.usageDrop != null ? merged.usageDrop + '%' : 'N/A'} change | Usage score: ${merged.usageScore != null ? merged.usageScore + '/100' : 'N/A'}
- Days to renewal: ${merged.daysToRenewal}
- Last activity: ${merged.lastActivityDays ?? merged.lastEmailDays ?? 'N/A'} days ago
- Champion ${merged.contactName} (${merged.contactTitle}): ${merged.contactReplied ? 'replying' : 'NOT replying to emails'}
- Email opens: ${merged.emailOpens != null ? merged.emailOpens : 'N/A'} | NPS: ${merged.npsScore != null ? merged.npsScore + '/10' : 'N/A'}
- Support cases: ${merged.supportCases} | CRM health: ${merged.accountHealth || 'N/A'}
- Deal stage: ${merged.crmStage || merged.dealStage || 'N/A'} | Meeting booked: ${merged.meetingBooked != null ? (merged.meetingBooked ? 'Yes' : 'No') : 'N/A'}

Respond in EXACT JSON (no markdown):
{
  "reasoning": "<3-4 sentences connecting signals causally. Use actual numbers. Start with the most critical signal. Explain what this pattern means for renewal probability.>",
  "riskDrivers": [
    { "driver": "<signal name>", "impact": "High|Medium|Low", "explanation": "<why this specific number matters based on industry benchmarks>" },
    { "driver": "<signal name>", "impact": "High|Medium|Low", "explanation": "<one sentence>" },
    { "driver": "<signal name>", "impact": "High|Medium|Low", "explanation": "<one sentence>" }
  ],
  "actionPlan": [
    { "week": "Week 1-2", "action": "<specific action with who, what, how>", "owner": "${merged.owner}", "goal": "<measurable outcome>" },
    { "week": "Week 3-4", "action": "<specific action>", "owner": "${merged.owner}", "goal": "<measurable outcome>" },
    { "week": "Month 2", "action": "<specific action>", "owner": "${merged.owner}", "goal": "<measurable outcome>" },
    { "week": "Month 3", "action": "<specific action>", "owner": "${merged.owner}", "goal": "<measurable outcome>" }
  ],
  "immediateAction": "<the ONE thing to do TODAY — specific person, specific ask>",
  "emailDraft": "Subject: <relevant subject>\\n\\nHi ${merged.contactName},\\n\\n<3-4 sentences: acknowledge their situation, show value, clear CTA>\\n\\nBest,\\n${merged.owner}",
  "expansionOpportunity": "<specific upsell tied to their usage/industry/ARR, or 'None at this time'>",
  "predictedOutcome": "<specific prediction: % probability of churn, revenue at risk, timeline>"
}`

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 3000,
  })

  const raw = response.choices[0].message.content.trim()
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('LLM did not return valid JSON')
  return JSON.parse(jsonMatch[0])
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    aiEnabled: !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here',
    hubspotEnabled: !!process.env.HUBSPOT_API_KEY,
    composioEnabled: !!process.env.COMPOSIO_API_KEY,
    totalCustomers: customers.length
  })
})

// ─── REAL HubSpot Sync → AI Risk Analysis ────────────────────────────────────
app.post('/api/sync/hubspot', async (req, res) => {
  try {
    console.log('🔄 Starting real HubSpot sync...')

    // 1. Fetch real customer data from HubSpot
    const hsCustomers = await fetchHubSpotCustomers()

    if (hsCustomers.length === 0) {
      return res.status(200).json({
        message: 'No contacts found in HubSpot. Add contacts with email addresses first.',
        total: 0,
        results: []
      })
    }

    // 2. Optionally enrich with Gmail signals
    const gmailStatus = await checkGmailConnected().catch(() => ({ connected: false }))
    console.log(`📧 Gmail: ${gmailStatus.connected ? 'Connected' : 'Not connected'}`)

    // 3. Run AI risk analysis on each customer
    const results = []
    for (const customer of hsCustomers) {
      // Gmail enrichment if available
      if (gmailStatus.connected && customer.email) {
        try {
          const emailSignal = await getEmailSignal(customer.email)
          if (emailSignal.lastEmailDays < 999) {
            customer.lastEmailDays = emailSignal.lastEmailDays
            customer.emailReplied = emailSignal.replied
            customer.unansweredEmails = emailSignal.unansweredCount
          }
        } catch (e) { /* keep HubSpot data */ }
      }

      // Build merged object for risk pipeline
      const merged = {
        name: customer.name,
        owner: customer.owner,
        industry: customer.industry || 'General',
        arr: customer.arr,
        source: 'HubSpot Live',
        lastActivityDays: customer.lastActivityDays,
        lastEmailDays: customer.lastEmailDays,
        contactName: customer.name,
        contactTitle: customer.jobTitle,
        contactReplied: customer.emailReplied,
        contactLastEmailDays: customer.lastEmailDays,
        emailOpens: customer.emailOpens,
        meetingBooked: customer.dealStage === 'Meeting Scheduled' || customer.dealStage === 'Qualified',
        dealStage: customer.dealStage,
        usageScore: null,
        npsScore: null,
        usageDrop: customer.usageTrend,
        openOpportunities: customer.noNextStep ? 0 : 1,
        crmStage: customer.dealStage,
        accountHealth: customer.dealStage === 'Churn Risk' ? 'Critical'
          : customer.lastActivityDays > 21 ? 'At Risk' : 'Healthy',
        supportCases: customer.supportTickets,
        daysToRenewal: customer.daysToRenewal,
        renewal: customer.renewal,
      }

      // Rule-based risk score
      const riskResult = calculateRiskScore(merged)

      // LLM explanation
      let llmResult, llmError
      try {
        llmResult = await explainWithLLM(merged, riskResult)
      } catch (e) {
        llmError = e.message
        llmResult = fallbackLLMResult(merged, riskResult)
      }

      // Save/update customer
      const existing = customers.findIndex(c => c._crmId === customer.hsId)
      const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

      const rec = {
        id: existing >= 0 ? customers[existing].id : nextId++,
        name: customer.name,
        owner: customer.owner,
        industry: customer.industry || 'General',
        arr: customer.arr,
        mrr: Math.round(customer.arr / 12),
        renewal: customer.renewal,
        daysToRenewal: customer.daysToRenewal,
        email: customer.email,
        jobTitle: customer.jobTitle,
        company: customer.company,
        lastMeeting: customer.lastActivityDays === 0 ? 'Today'
          : customer.lastActivityDays === 1 ? '1 day ago'
          : `${customer.lastActivityDays} days ago`,
        unansweredEmails: customer.unansweredEmails,
        noNextStep: customer.noNextStep,
        usageChange: customer.usageTrend,
        evidence: riskResult.breakdown.length,
        _crmId: customer.hsId,
        _source: 'HubSpot Live',
        _gmailEnriched: gmailStatus.connected,
        // Risk
        riskScore: riskResult.score,
        riskLevel: riskResult.level,
        status: riskResult.level,
        riskBreakdown: riskResult.breakdown,
        // AI
        aiReasoning: llmResult.reasoning,
        aiConfidence: Math.max(55, 90 - riskResult.breakdown.length * 3),
        signals: llmResult.riskDrivers?.map(d => d.driver) || [],
        riskDrivers: llmResult.riskDrivers || [],
        actionPlan: llmResult.actionPlan || [],
        nextAction: llmResult.immediateAction,
        emailDraft: llmResult.emailDraft,
        expansionOpportunity: llmResult.expansionOpportunity,
        predictedOutcome: llmResult.predictedOutcome,
        urgency: riskResult.score >= 75 ? 'Immediate' : riskResult.score >= 50 ? 'This Week' : 'This Month',
        llmError,
        // Data sources
        crm: { status: 'Connected', lastSync: now, source: 'HubSpot' },
        email: { status: gmailStatus.connected ? 'Connected (Gmail)' : 'Connected (HubSpot)', pending: customer.unansweredEmails, lastSync: now },
        calendar: { status: 'Connected', lastSync: now },
        productUsage: { status: 'Not connected', trend: customer.usageTrend >= 0 ? 'up' : 'down', lastSync: null },
        support: { status: 'Not connected', lastSync: null },
        recentActivity: [
          { time: new Date().toLocaleString(), desc: `Synced from HubSpot Live — AI risk analysis complete`, by: 'Agent', type: 'AI' },
          { time: new Date().toLocaleString(), desc: `Risk score: ${riskResult.score}/100 (${riskResult.level})`, by: 'Agent', type: 'AI' },
        ]
      }

      if (existing >= 0) customers[existing] = rec
      else customers.push(rec)

      results.push({
        name: customer.name,
        email: customer.email,
        company: customer.company,
        riskScore: riskResult.score,
        riskLevel: riskResult.level,
        dealStage: customer.dealStage,
        arr: customer.arr,
        source: 'HubSpot Live'
      })

      console.log(`  ✓ ${customer.name} (${customer.email}) → Risk: ${riskResult.score} ${riskResult.level}`)
    }

    console.log(`✅ Sync complete: ${results.length} customers`)
    res.json({
      message: `Synced ${results.length} real customers from HubSpot with AI risk analysis`,
      total: results.length,
      gmailEnriched: gmailStatus.connected,
      results,
    })
  } catch (err) {
    console.error('HubSpot sync error:', err.message)
    if (err.response?.status === 401 || !process.env.HUBSPOT_API_KEY) {
      seedDemoData()
      const demoResults = customers.map(customer => ({
        name: customer.name,
        email: typeof customer.email === 'string' ? customer.email : '',
        company: customer.company || customer.name,
        riskScore: customer.riskScore,
        riskLevel: customer.riskLevel,
        dealStage: customer.dealStage || customer.status,
        arr: customer.arr,
        source: 'Local demo data',
      }))

      console.warn('⚠️ HubSpot is not authenticated; returning local demo data for the sync flow.')
      return res.json({
        message: 'HubSpot is not connected. Local demo customer data was analyzed instead.',
        total: demoResults.length,
        gmailEnriched: false,
        fallback: true,
        results: demoResults,
      })
    }
    res.status(500).json({ error: err.message, hint: 'Check HUBSPOT_API_KEY in .env' })
  }
})

// ─── Check integration status ─────────────────────────────────────────────────
app.get('/api/integrations/status', async (req, res) => {
  const gmail = await checkGmailConnected().catch(() => ({ connected: false }))
  res.json({
    hubspot: { connected: !!process.env.HUBSPOT_API_KEY, source: 'HubSpot Private App' },
    gmail: { connected: gmail.connected, email: gmail.email },
    composio: { connected: !!process.env.COMPOSIO_API_KEY },
    groq: { connected: !!process.env.GROQ_API_KEY },
  })
})

// ─── Send real email via Composio/Gmail ───────────────────────────────────────
app.post('/api/actions/send-email', async (req, res) => {
  const { to, subject, body, customerId } = req.body
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject, body required' })
  }

  const result = await sendGmailEmail({ to, subject, body })

  if (result.success) {
    // Log to customer activity
    if (customerId) {
      const customer = customers.find(c => c.id === parseInt(customerId))
      if (customer) {
        customer.recentActivity = [
          { time: new Date().toLocaleString(), desc: `Email sent: "${subject}"`, by: 'Agent', type: 'Email' },
          ...(customer.recentActivity || [])
        ]
      }
    }
    res.json({ success: true, message: `Email sent to ${to}` })
  } else {
    res.status(500).json({ error: result.error })
  }
})

// ─── MAIN PIPELINE: Merge SF + HS → Score → LLM ──────────────────────────────
app.post('/api/integrate-and-analyze', async (req, res) => {
  const { salesforce, hubspot } = req.body
  if (!salesforce && !hubspot) return res.status(400).json({ error: 'Provide salesforce and/or hubspot arrays' })

  const sfList = (salesforce || []).filter(r => r && r.name)
  const hsList = (hubspot || []).filter(r => r && r.name)
  const normalize = n => n.toLowerCase().replace(/[^a-z0-9]/g, '')
  const sfMap = {}; sfList.forEach(r => { sfMap[normalize(r.name)] = r })
  const hsMap = {}; hsList.forEach(r => { hsMap[normalize(r.name)] = r })
  const allKeys = new Set([...Object.keys(sfMap), ...Object.keys(hsMap)])

  const results = []
  for (const key of allKeys) {
    const merged = mergeData(sfMap[key] || null, hsMap[key] || null)
    const riskResult = calculateRiskScore(merged)
    let llmResult = null, llmError = null
    try {
      llmResult = await explainWithLLM(merged, riskResult)
    } catch (e) {
      llmError = e.message
      llmResult = fallbackLLMResult(merged, riskResult)
    }

    const existing = customers.findIndex(c => c._crmId === ((sfMap[key]?.sfId) || (hsMap[key]?.hsId)))
    const rec = buildCustomerRecord(merged, riskResult, llmResult, llmError, sfMap[key], hsMap[key], existing >= 0 ? customers[existing].id : nextId++)
    if (existing >= 0) customers[existing] = rec; else customers.push(rec)
    results.push({ merged, riskResult, llmResult, llmError })
  }
  res.json({ total: results.length, results })
})

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(customers)
})

// Get single customer
app.get('/api/customers/:id', (req, res) => {
  const c = customers.find(c => c.id === parseInt(req.params.id))
  if (!c) return res.status(404).json({ error: 'Customer not found' })
  res.json(c)
})

// Add customer + run AI analysis immediately
app.post('/api/customers', async (req, res) => {
  const {
    name, owner, industry, arr,
    lastMeetingDaysAgo, unansweredEmails, noNextStep,
    productUsageTrend, daysToRenewal, supportTicketsOpen,
    emailSummary, lastMeetingNotes,
    renewal, _crmId, _source
  } = req.body

  if (!name || !owner) {
    return res.status(400).json({ error: 'name and owner are required' })
  }

  // If customer from same CRM ID already exists, update instead of duplicate
  const existingIdx = customers.findIndex(c => c._crmId && c._crmId === _crmId)

  const customerData = {
    name, owner, industry: industry || 'Unknown',
    arr: arr || 0,
    lastMeetingDaysAgo: lastMeetingDaysAgo || 0,
    unansweredEmails: unansweredEmails || 0,
    noNextStep: noNextStep || false,
    productUsageTrend: productUsageTrend || 0,
    daysToRenewal: daysToRenewal || 90,
    supportTicketsOpen: supportTicketsOpen || 0,
    emailSummary: emailSummary || '',
    lastMeetingNotes: lastMeetingNotes || ''
  }

  let aiResult = null
  let aiError = null

  try {
    aiResult = await analyzeWithAI(customerData)
  } catch (err) {
    aiError = err.message
    aiResult = fallbackRiskScore(customerData)
  }

  const built = {
    id: existingIdx >= 0 ? customers[existingIdx].id : nextId++,
    ...customerData,
    _crmId: _crmId || null,
    _source: _source || 'manual',
    lastMeeting: lastMeetingDaysAgo === 0 ? 'Today' : lastMeetingDaysAgo === 1 ? '1 day ago' : `${lastMeetingDaysAgo} days ago`,
    renewal: renewal || getRelativeDate(daysToRenewal || 90),
    mrr: Math.round((arr || 0) / 12),
    riskScore: aiResult.riskScore,
    riskLevel: aiResult.riskLevel,
    aiConfidence: aiResult.confidence,
    aiReasoning: aiResult.reasoning,
    signals: aiResult.topSignals,
    nextAction: aiResult.recommendedAction,
    emailDraft: aiResult.emailDraft,
    expansionOpportunity: aiResult.expansionOpportunity,
    urgency: aiResult.urgency,
    status: aiResult.riskLevel,
    usageChange: productUsageTrend || 0,
    evidence: countEvidence(customerData),
    aiError,
    crm: { status: 'Connected', lastSync: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
    email: { status: 'Connected', pending: unansweredEmails || 0, lastSync: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
    calendar: { status: 'Connected', lastSync: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
    productUsage: { status: 'Connected', trend: (productUsageTrend || 0) >= 0 ? 'up' : 'down', lastSync: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
    support: { status: (supportTicketsOpen || 0) > 0 ? 'Connected' : 'Not connected', lastSync: (supportTicketsOpen || 0) > 0 ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null },
    recentActivity: [
      { time: new Date().toLocaleString(), desc: `Synced from ${_source === 'salesforce' ? 'Salesforce' : _source === 'hubspot' ? 'HubSpot' : 'CRM'} — AI analysis complete`, by: 'Agent', type: 'AI' },
      { time: new Date().toLocaleString(), desc: `Risk score: ${aiResult.riskScore}/100 (${aiResult.riskLevel})`, by: 'Agent', type: 'AI' },
    ]
  }

  if (existingIdx >= 0) {
    customers[existingIdx] = built
  } else {
    customers.push(built)
  }

  res.status(201).json(built)
})

// Re-run AI analysis on existing customer with updated data
app.post('/api/customers/:id/analyze', async (req, res) => {
  const customer = customers.find(c => c.id === parseInt(req.params.id))
  if (!customer) return res.status(404).json({ error: 'Customer not found' })

  // Merge new data if provided
  const updatedData = { ...customer, ...req.body }

  let aiResult
  try {
    aiResult = await analyzeWithAI(updatedData)
  } catch (err) {
    aiResult = fallbackRiskScore(updatedData)
  }

  // Update customer in place
  Object.assign(customer, {
    riskScore: aiResult.riskScore,
    riskLevel: aiResult.riskLevel,
    aiConfidence: aiResult.confidence,
    aiReasoning: aiResult.reasoning,
    signals: aiResult.topSignals,
    nextAction: aiResult.recommendedAction,
    emailDraft: aiResult.emailDraft,
    expansionOpportunity: aiResult.expansionOpportunity,
    urgency: aiResult.urgency,
    status: aiResult.riskLevel,
    ...req.body,
    recentActivity: [
      { time: new Date().toLocaleString(), desc: 'AI re-analysis completed', by: 'Agent', type: 'AI' },
      ...(customer.recentActivity || [])
    ]
  })

  res.json(customer)
})

// Standalone AI risk analysis (no customer saved)
app.post('/api/analyze-risk-standalone', async (req, res) => {
  // Use new pipeline for single record too
  const merged = mergeData(req.body._sf || null, req.body._hs || null) 
  const actualData = (req.body._sf || req.body._hs) ? merged : req.body
  
  // If it's a raw payload (not SF/HS format), use old path
  if (!req.body._sf && !req.body._hs) {
    try {
      const result = await analyzeWithAI(req.body)
      res.json(result)
    } catch (err) {
      res.json({ ...fallbackRiskScore(req.body), fallback: true, error: err.message })
    }
    return
  }

  const riskResult = calculateRiskScore(actualData)
  try {
    const llmResult = await explainWithLLM(actualData, riskResult)
    res.json({ ...riskResult, ...llmResult, riskScore: riskResult.score, riskLevel: riskResult.level })
  } catch (e) {
    const fb = fallbackLLMResult(actualData, riskResult)
    res.json({ ...riskResult, ...fb, riskScore: riskResult.score, riskLevel: riskResult.level, fallback: true })
  }
})

// Update customer fields (CRM patch)
app.patch('/api/customers/:id', (req, res) => {
  const customer = customers.find(c => c.id === parseInt(req.params.id))
  if (!customer) return res.status(404).json({ error: 'Customer not found' })
  Object.assign(customer, req.body)
  res.json(customer)
})

// Delete customer
app.delete('/api/customers/:id', (req, res) => {
  const idx = customers.findIndex(c => c.id === parseInt(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Customer not found' })
  customers.splice(idx, 1)
  res.json({ success: true })
})

// Dashboard stats (computed from real data)
app.get('/api/stats', (req, res) => {
  const total = customers.length
  const high = customers.filter(c => c.riskLevel === 'High').length
  const revenueAtRisk = customers.filter(c => c.riskLevel === 'High').reduce((sum, c) => sum + (c.arr || 0), 0)
  const renewalsIn30 = customers.filter(c => c.daysToRenewal <= 30).length

  res.json({
    totalAccounts: total,
    totalAccountsChange: '+0%',
    highRisk: high,
    highRiskChange: total > 0 ? `${Math.round((high / total) * 100)}%` : '0%',
    revenueAtRisk: revenueAtRisk >= 1000 ? `$${Math.round(revenueAtRisk / 1000)}K` : `$${revenueAtRisk}`,
    revenueAtRiskChange: '+0%',
    renewalsIn30Days: renewalsIn30,
    pendingApprovals: customers.filter(c => c.urgency === 'Immediate').length
  })
})

// Risk trend (last 7 days based on current data)
app.get('/api/risk-trend', (req, res) => {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      highRisk: customers.filter(c => c.riskLevel === 'High').length,
      mediumRisk: customers.filter(c => c.riskLevel === 'Medium').length,
      lowRisk: customers.filter(c => c.riskLevel === 'Low').length,
    })
  }
  res.json(days)
})

// Revenue exposure
app.get('/api/revenue-exposure', (req, res) => {
  const high = customers.filter(c => c.riskLevel === 'High').reduce((s, c) => s + (c.arr || 0), 0)
  const med = customers.filter(c => c.riskLevel === 'Medium').reduce((s, c) => s + (c.arr || 0), 0)
  const low = customers.filter(c => c.riskLevel === 'Low').reduce((s, c) => s + (c.arr || 0), 0)
  const total = high + med + low || 1

  res.json([
    { name: 'High Risk', value: Math.round(high / 1000), percent: Math.round((high / total) * 100), color: '#ef4444' },
    { name: 'Medium Risk', value: Math.round(med / 1000), percent: Math.round((med / total) * 100), color: '#f59e0b' },
    { name: 'Low Risk', value: Math.round(low / 1000), percent: Math.round((low / total) * 100), color: '#22c55e' },
  ])
})

// Signal coverage
app.get('/api/signal-coverage', (req, res) => {
  res.json({
    percentage: 92,
    signals: [
      { name: 'CRM', status: 'Connected' },
      { name: 'Email', status: 'Connected' },
      { name: 'Calendar', status: 'Connected' },
      { name: 'Product Usage', status: 'Connected' },
      { name: 'Support', status: customers.some(c => c.supportTicketsOpen > 0) ? 'Connected' : 'Not connected' },
    ]
  })
})

// Opportunities (high ARR low-risk or expansion flagged)
app.get('/api/opportunities', (req, res) => {
  const opps = customers
    .filter(c => c.expansionOpportunity && c.expansionOpportunity !== 'None identified')
    .map(c => ({
      id: c.id,
      company: c.name,
      type: c.expansionOpportunity,
      value: c.arr ? Math.round(c.arr * 0.2) : 10000,
      confidence: c.riskLevel === 'Low' ? 'High' : c.riskLevel === 'Medium' ? 'Medium' : 'Low'
    }))
  res.json(opps)
})

// Tasks (auto-generated from AI recommendations)
app.get('/api/tasks', (req, res) => {
  const tasks = customers.map((c, i) => ({
    id: i + 1,
    title: c.nextAction || `Follow up with ${c.name}`,
    customer: c.name,
    dueDate: getRelativeDate(c.urgency === 'Immediate' ? 1 : c.urgency === 'This Week' ? 5 : 14),
    priority: c.riskLevel,
    status: 'Pending',
    assignee: c.owner
  }))
  res.json(tasks)
})

// Renewals
app.get('/api/renewals', (req, res) => {
  const renewals = customers
    .filter(c => c.daysToRenewal <= 90)
    .sort((a, b) => a.daysToRenewal - b.daysToRenewal)
    .map((c, i) => ({
      id: i + 1,
      customer: c.name,
      owner: c.owner,
      renewalDate: c.renewal,
      arr: c.arr || 0,
      riskLevel: c.riskLevel,
      status: c.riskLevel === 'High' ? 'Action Required' : c.riskLevel === 'Medium' ? 'In Review' : 'On Track'
    }))
  res.json(renewals)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countEvidence(data) {
  let count = 0
  if (data.lastMeetingDaysAgo > 14) count++
  if (data.unansweredEmails > 0) count++
  if (data.noNextStep) count++
  if (data.productUsageTrend < -10) count++
  if (data.daysToRenewal < 45) count++
  if (data.supportTicketsOpen > 0) count++
  return count
}

function getRelativeDate(daysFromNow) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Rule-based fallback if Groq API is unavailable
function fallbackRiskScore(data) {
  const { lastMeetingDaysAgo, unansweredEmails, noNextStep, productUsageTrend, daysToRenewal, supportTicketsOpen } = data
  let score = 30
  const signals = []

  if (productUsageTrend <= -30) { score += 30; signals.push('Critical usage decline') }
  else if (productUsageTrend <= -15) { score += 20; signals.push('Significant usage decline') }
  else if (productUsageTrend <= -5) { score += 10; signals.push('Moderate usage decline') }
  else if (productUsageTrend >= 10) { score -= 10; signals.push('Positive usage growth') }

  if (lastMeetingDaysAgo >= 30) { score += 20; signals.push('No meeting in 30+ days') }
  else if (lastMeetingDaysAgo >= 14) { score += 10; signals.push('Meeting overdue') }

  if (unansweredEmails >= 3) { score += 15; signals.push('Multiple unanswered emails') }
  else if (unansweredEmails >= 1) { score += 7; signals.push('Unanswered email pending') }

  if (noNextStep) { score += 10; signals.push('No next step in CRM') }
  if (daysToRenewal <= 30) { score += 15; signals.push('Renewal within 30 days') }
  else if (daysToRenewal <= 60) { score += 8; signals.push('Renewal within 60 days') }
  if (supportTicketsOpen > 2) { score += 8; signals.push('Multiple open support tickets') }

  score = Math.max(1, Math.min(100, score))
  const level = score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low'

  return {
    riskScore: score,
    riskLevel: level,
    confidence: 60,
    reasoning: `${data.name || 'This customer'} has ${signals.length} risk signals including ${signals.slice(0, 2).join(' and ')}. ${daysToRenewal <= 45 ? `Renewal is approaching in ${daysToRenewal} days.` : ''} Immediate attention is ${level === 'High' ? 'required' : 'recommended'}.`,
    topSignals: signals.slice(0, 3),
    recommendedAction: level === 'High' ? 'Schedule urgent call and send follow-up email' : level === 'Medium' ? 'Send check-in email and update CRM' : 'Monitor and look for expansion opportunities',
    emailDraft: `Hi ${data.name || 'Team'},\n\nI wanted to check in and see how things are going. Would you have 15 minutes this week for a quick call?\n\nBest regards,\n${data.owner || 'Your Account Manager'}`,
    expansionOpportunity: productUsageTrend >= 15 ? 'Strong usage growth suggests readiness for plan upgrade' : 'None identified',
    urgency: score >= 75 ? 'Immediate' : score >= 50 ? 'This Week' : 'This Month'
  }
}

function fallbackLLMResult(merged, riskResult) {
  const top2 = riskResult.breakdown.slice(0, 2).map(b => b.factor).join(' and ')
  return {
    reasoning: `${merged.name} has a calculated risk score of ${riskResult.score}/100 driven primarily by ${top2}. With ${merged.daysToRenewal} days to renewal, immediate engagement is ${riskResult.level === 'High' ? 'critical' : 'recommended'}.`,
    riskDrivers: riskResult.breakdown.slice(0, 3).map(b => ({
      driver: b.factor, impact: b.points >= 15 ? 'High' : b.points >= 8 ? 'Medium' : 'Low',
      explanation: `${b.factor} adds ${b.points} points to the risk score (current value: ${b.value}).`
    })),
    actionPlan: [
      { week: 'Week 1-2', action: `Call ${merged.contactName} and schedule a business review`, owner: merged.owner, goal: 'Re-establish engagement' },
      { week: 'Week 3-4', action: 'Share personalized ROI report and renewal proposal', owner: merged.owner, goal: 'Justify renewal value' },
      { week: 'Month 2', action: 'Conduct product health check and address support issues', owner: merged.owner, goal: 'Improve product adoption' },
      { week: 'Month 3', action: 'Finalize renewal and explore expansion opportunities', owner: merged.owner, goal: 'Secure contract' },
    ],
    immediateAction: `Contact ${merged.contactName} (${merged.contactTitle}) by phone within 24 hours.`,
    emailDraft: `Subject: Checking in — ${merged.name}\n\nHi ${merged.contactName},\n\nI wanted to personally reach out to make sure you're getting everything you need from us. Would you be available for a quick 20-minute call this week?\n\nBest regards,\n${merged.owner}`,
    expansionOpportunity: 'None at this time',
    predictedOutcome: `Without action, ${merged.name} may not renew at the upcoming renewal date.`
  }
}

function buildCustomerRecord(merged, riskResult, llmResult, llmError, sf, hs, id) {
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return {
    id, name: merged.name, owner: merged.owner, industry: merged.industry,
    arr: merged.arr, mrr: Math.round(merged.arr / 12),
    renewal: merged.renewal || `In ${merged.daysToRenewal} days`,
    daysToRenewal: merged.daysToRenewal,
    lastMeeting: merged.lastActivityDays != null ? (merged.lastActivityDays === 0 ? 'Today' : `${merged.lastActivityDays} days ago`) : 'Unknown',
    unansweredEmails: merged.contactReplied === false ? 2 : 0,
    noNextStep: merged.meetingBooked === false,
    usageChange: merged.usageDrop ?? 0,
    evidence: riskResult.breakdown.length,
    _crmId: sf?.sfId || hs?.hsId,
    _source: merged.source,
    riskScore: riskResult.score,
    riskLevel: riskResult.level,
    status: riskResult.level,
    riskBreakdown: riskResult.breakdown,
    aiReasoning: llmResult.reasoning,
    aiConfidence: Math.max(50, 90 - riskResult.breakdown.length * 3),
    signals: llmResult.riskDrivers?.map(d => d.driver) || [],
    riskDrivers: llmResult.riskDrivers || [],
    actionPlan: llmResult.actionPlan || [],
    nextAction: llmResult.immediateAction,
    emailDraft: llmResult.emailDraft,
    expansionOpportunity: llmResult.expansionOpportunity,
    predictedOutcome: llmResult.predictedOutcome,
    urgency: riskResult.score >= 75 ? 'Immediate' : riskResult.score >= 50 ? 'This Week' : 'This Month',
    llmError,
    crm: { status: sf ? 'Connected' : 'Not connected', lastSync: now },
    email: { status: 'Connected', pending: merged.contactReplied === false ? 2 : 0, lastSync: now },
    calendar: { status: 'Connected', lastSync: now },
    productUsage: { status: 'Connected', trend: (merged.usageDrop ?? 0) >= 0 ? 'up' : 'down', lastSync: now },
    support: { status: (merged.supportCases ?? 0) > 0 ? 'Connected' : 'Not connected', lastSync: (merged.supportCases ?? 0) > 0 ? now : null },
    recentActivity: [
      { time: new Date().toLocaleString(), desc: `Integrated from ${merged.source} — AI risk analysis complete`, by: 'Agent', type: 'AI' },
      { time: new Date().toLocaleString(), desc: `Risk score: ${riskResult.score}/100 (${riskResult.level}) | ${riskResult.breakdown.length} signals detected`, by: 'Agent', type: 'AI' },
    ]
  }
}

// ─── Demo Seed Data ───────────────────────────────────────────────────────────
function seedDemoData() {
  if (customers.length > 0) return  // don't seed if data already exists

  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const seedCustomers = [
    {
      id: nextId++, name: 'TechNova Inc', owner: 'Sarah Chen', industry: 'SaaS / Technology',
      arr: 145000, mrr: 12083,
      renewal: getRelativeDate(28), daysToRenewal: 28,
      lastMeeting: '21 days ago', unansweredEmails: 3, noNextStep: true,
      usageChange: -32, evidence: 5,
      riskScore: 88, riskLevel: 'High', status: 'High',
      aiConfidence: 87,
      aiReasoning: 'TechNova has dropped product usage by 32% over the last 30 days while going completely dark on communications — no email replies in 21 days, 3 unanswered messages, and renewal is 28 days away. This trifecta of usage decline, champion silence, and imminent renewal is the textbook pre-churn pattern seen in 78% of churned accounts in this ARR range. Without immediate executive escalation, this deal is at 85%+ churn probability.',
      signals: ['Critical product usage decline (-32%)', 'Champion not replying — 21 days silence', 'Renewal in 28 days with no next step'],
      nextAction: 'Escalate to VP-level: call CEO directly within 24 hours and book an EBR',
      emailDraft: 'Subject: Quick check-in — TechNova + RevOps AI\n\nHi Alex,\n\nI noticed we haven\'t connected in a few weeks and wanted to personally reach out. I\'d love to schedule a 30-minute business review to make sure you\'re getting full value from the platform.\n\nWould Thursday or Friday this week work for a call?\n\nBest,\nSarah Chen',
      expansionOpportunity: 'None at this time',
      urgency: 'Immediate',
      predictedOutcome: '85% churn probability within 30 days — estimated $145,000 ARR loss if no action taken this week.',
      riskBreakdown: [
        { factor: 'Critical product usage decline', points: 25, value: '-32%' },
        { factor: 'Renewal very soon (<30 days)', points: 15, value: '28 days' },
        { factor: 'Champion not replying to emails', points: 15, value: '21 days no reply' },
        { factor: 'No engagement in 30+ days', points: 20, value: '21 days ago' },
        { factor: 'No next step in CRM', points: 10, value: 'Missing' },
      ],
      actionPlan: [
        { week: 'Week 1-2', action: 'Executive call with CEO and VP Engineering — present ROI report', owner: 'Sarah Chen', goal: 'Re-establish exec-level relationship and uncover blockers' },
        { week: 'Week 3-4', action: 'On-site product deep-dive with the core team', owner: 'Sarah Chen', goal: 'Identify adoption gaps and create usage recovery plan' },
        { week: 'Month 2', action: 'Deliver customized feature training and assign a CSM for weekly check-ins', owner: 'Sarah Chen', goal: 'Reverse usage decline to 0% or better' },
        { week: 'Month 3', action: 'Present renewal proposal with updated success metrics', owner: 'Sarah Chen', goal: 'Secure 12-month renewal at current ARR' },
      ],
      riskDrivers: [
        { driver: 'Product Usage Collapse', impact: 'High', explanation: 'A 32% usage drop in 30 days signals active disengagement — users have likely found a workaround or competitor.' },
        { driver: 'Champion Silence', impact: 'High', explanation: '21 days without a reply is the #1 leading indicator of churn according to SaaS industry research.' },
        { driver: 'Renewal Proximity', impact: 'Medium', explanation: 'With only 28 days to renewal and no next step logged, the sales motion has stalled completely.' },
      ],
      _source: 'salesforce',
      crm: { status: 'Connected', lastSync: now },
      email: { status: 'Connected', pending: 3, lastSync: now },
      calendar: { status: 'Connected', lastSync: now },
      productUsage: { status: 'Connected', trend: 'down', lastSync: now },
      support: { status: 'Connected', lastSync: now },
      recentActivity: [
        { time: '2 hours ago', desc: 'AI risk analysis flagged as High Risk (88/100)', by: 'Agent', type: 'AI' },
        { time: '1 day ago', desc: 'No email reply detected — champion silence alert triggered', by: 'Agent', type: 'AI' },
        { time: '3 days ago', desc: 'Product usage dropped 32% vs prior 30 days', by: 'System', type: 'Usage' },
      ],
    },
    {
      id: nextId++, name: 'RetailEdge Co', owner: 'Marcus Johnson', industry: 'Retail & E-Commerce',
      arr: 67000, mrr: 5583,
      renewal: getRelativeDate(12), daysToRenewal: 12,
      lastMeeting: '35 days ago', unansweredEmails: 4, noNextStep: true,
      usageChange: -41, evidence: 6,
      riskScore: 92, riskLevel: 'High', status: 'High',
      aiConfidence: 91,
      aiReasoning: 'RetailEdge is in a severe pre-churn state with a 92/100 risk score — the worst combination of signals: 41% usage decline, 35 days of total communication blackout, 4 unanswered emails, and renewal in just 12 days. The account has essentially gone dark. At this stage, renewal recovery requires an immediate executive-to-executive call, not a standard CSM follow-up.',
      signals: ['Severe usage decline (-41%) — platform near-abandoned', '35 days without any engagement — total communication blackout', 'Renewal in 12 days with zero pipeline activity'],
      nextAction: 'CEO to CEO escalation call today — this account is days away from churning',
      emailDraft: 'Subject: RetailEdge renewal — personal note from Marcus\n\nHi Jamie,\n\nI want to reach out directly — I noticed we haven\'t connected in over a month and your renewal is coming up very soon. I\'d love 20 minutes to understand how things are going and what we can do better.\n\nAre you free for a call tomorrow?\n\nBest,\nMarcus Johnson',
      expansionOpportunity: 'None at this time',
      urgency: 'Immediate',
      predictedOutcome: '92% churn probability — renewal in 12 days with no engagement. $67,000 ARR at immediate risk.',
      riskBreakdown: [
        { factor: 'Critical product usage decline', points: 25, value: '-41%' },
        { factor: 'Renewal imminent (<14 days)', points: 20, value: '12 days' },
        { factor: 'No engagement in 30+ days', points: 20, value: '35 days ago' },
        { factor: 'Champion not replying to emails', points: 15, value: '35 days no reply' },
        { factor: 'CRM account health: Critical', points: 10, value: 'Critical' },
      ],
      actionPlan: [
        { week: 'Week 1-2', action: 'Immediate CEO-to-CEO escalation call — understand blockers and business value gaps', owner: 'Marcus Johnson', goal: 'Stop churn clock and re-open dialogue' },
        { week: 'Week 3-4', action: 'Emergency product onboarding session — identify why usage collapsed', owner: 'Marcus Johnson', goal: 'Diagnose root cause of disengagement' },
        { week: 'Month 2', action: 'Mutual success plan with quarterly milestones and ROI targets', owner: 'Marcus Johnson', goal: 'Rebuild trust and commitment' },
        { week: 'Month 3', action: 'Renewal negotiation with value-based pricing discussion', owner: 'Marcus Johnson', goal: 'Secure renewal with success KPIs' },
      ],
      riskDrivers: [
        { driver: 'Platform Abandonment', impact: 'High', explanation: '41% usage drop indicates users have stopped relying on the platform — possible internal process change or competitor evaluation.' },
        { driver: 'Total Communication Blackout', impact: 'High', explanation: '35 days with 4 unanswered emails is an unprecedented engagement gap — the champion may have left or deprioritized the tool.' },
        { driver: 'Imminent Renewal', impact: 'High', explanation: '12 days to renewal with no pipeline activity means this deal will lapse without dramatic intervention.' },
      ],
      _source: 'salesforce',
      crm: { status: 'Connected', lastSync: now },
      email: { status: 'Connected', pending: 4, lastSync: now },
      calendar: { status: 'Connected', lastSync: now },
      productUsage: { status: 'Connected', trend: 'down', lastSync: now },
      support: { status: 'Connected', lastSync: now },
      recentActivity: [
        { time: '1 hour ago', desc: 'Critical risk alert — renewal in 12 days, no engagement', by: 'Agent', type: 'AI' },
        { time: '5 days ago', desc: '4th unanswered email detected', by: 'Agent', type: 'Email' },
        { time: '1 week ago', desc: 'Usage dropped 41% — platform near-abandoned', by: 'System', type: 'Usage' },
      ],
    },
    {
      id: nextId++, name: 'GrowthStack SaaS', owner: 'Priya Patel', industry: 'Marketing Technology',
      arr: 54000, mrr: 4500,
      renewal: getRelativeDate(20), daysToRenewal: 20,
      lastMeeting: '28 days ago', unansweredEmails: 2, noNextStep: true,
      usageChange: -35, evidence: 5,
      riskScore: 78, riskLevel: 'High', status: 'High',
      aiConfidence: 79,
      aiReasoning: 'GrowthStack shows a 35% usage collapse with renewal in 20 days and 28 days since the last meeting. Two unanswered emails and no next step in the CRM confirm that this account has been deprioritized on both sides. For a $54K ARR account in the marketing tech space, competitive displacement is the most likely cause — this requires urgent re-engagement with a tailored value proposition.',
      signals: ['35% product usage decline — likely competitive displacement', '28 days since last meeting — engagement has lapsed', 'Renewal in 20 days with no active pipeline'],
      nextAction: 'Book an emergency QBR within 48 hours — lead with ROI data and competitive differentiation',
      emailDraft: 'Subject: Your GrowthStack ROI — quick check-in\n\nHi Taylor,\n\nI want to make sure you\'re seeing full value from GrowthStack before your renewal. I\'d love to share some new features that directly address marketing attribution — would you have 30 minutes this week?\n\nBest,\nPriya Patel',
      expansionOpportunity: 'None at this time',
      urgency: 'Immediate',
      predictedOutcome: '72% churn probability. Without engagement in the next 7 days, renewal will very likely lapse.',
      riskBreakdown: [
        { factor: 'Critical product usage decline', points: 25, value: '-35%' },
        { factor: 'Renewal very soon (<30 days)', points: 15, value: '20 days' },
        { factor: 'No engagement in 30+ days', points: 20, value: '28 days ago' },
        { factor: 'Champion not replying to emails', points: 15, value: '28 days no reply' },
        { factor: 'HubSpot deal stage: Churn Risk', points: 8, value: 'Churn Risk' },
      ],
      actionPlan: [
        { week: 'Week 1-2', action: 'Emergency QBR — present usage benchmarks vs peers and ROI calculation', owner: 'Priya Patel', goal: 'Reconnect and understand objections' },
        { week: 'Week 3-4', action: 'Send personalized competitive analysis showing platform advantages', owner: 'Priya Patel', goal: 'Counter competitive displacement risk' },
        { week: 'Month 2', action: 'Implement advanced features with dedicated onboarding support', owner: 'Priya Patel', goal: 'Drive usage back to baseline' },
        { week: 'Month 3', action: 'Renewal close with success story documentation', owner: 'Priya Patel', goal: 'Secure annual renewal' },
      ],
      riskDrivers: [
        { driver: 'Competitive Displacement Risk', impact: 'High', explanation: '35% usage drop in a competitive MarTech space strongly suggests the team is evaluating or trialing an alternative.' },
        { driver: 'Engagement Decay', impact: 'High', explanation: '28 days without a meeting or email reply is well past the 21-day threshold where churn probability triples.' },
        { driver: 'Renewal Proximity', impact: 'Medium', explanation: '20 days to renewal with no pipeline activity — the decision may already be made internally.' },
      ],
      _source: 'hubspot',
      crm: { status: 'Not connected', lastSync: null },
      email: { status: 'Connected', pending: 2, lastSync: now },
      calendar: { status: 'Connected', lastSync: now },
      productUsage: { status: 'Connected', trend: 'down', lastSync: now },
      support: { status: 'Not connected', lastSync: null },
      recentActivity: [
        { time: '3 hours ago', desc: 'High risk alert triggered — 78/100 risk score', by: 'Agent', type: 'AI' },
        { time: '2 days ago', desc: 'Usage decline detected — 35% drop vs prior month', by: 'System', type: 'Usage' },
        { time: '4 days ago', desc: '2nd unanswered email follow-up sent', by: 'Priya Patel', type: 'Email' },
      ],
    },
    {
      id: nextId++, name: 'MediTrack Health', owner: 'David Kim', industry: 'Healthcare Technology',
      arr: 88000, mrr: 7333,
      renewal: getRelativeDate(42), daysToRenewal: 42,
      lastMeeting: '19 days ago', unansweredEmails: 1, noNextStep: false,
      usageChange: -19, evidence: 4,
      riskScore: 65, riskLevel: 'Medium', status: 'Medium',
      aiConfidence: 73,
      aiReasoning: 'MediTrack shows moderate risk with a 19% usage decline and 19 days since the last meeting — both approaching critical thresholds but not yet in the danger zone. The single unanswered email and upcoming renewal in 42 days create a window of opportunity to course-correct. Healthcare accounts churn more slowly but are harder to recover once lost, making this the optimal intervention window.',
      signals: ['19% product usage decline — approaching critical threshold', '19 days since last meeting — re-engagement needed', '42 days to renewal — intervention window open'],
      nextAction: 'Schedule a product health check call within 7 days and address the open support cases',
      emailDraft: 'Subject: MediTrack product health check — scheduling a review\n\nHi Dr. Patel,\n\nI wanted to check in and make sure the platform is meeting your team\'s clinical workflow needs. I\'d love to schedule a product review and discuss some new HIPAA-compliant features that could save your team significant documentation time.\n\nWould next week work for a 45-minute call?\n\nBest,\nDavid Kim',
      expansionOpportunity: 'Compliance reporting module — high relevance for HIPAA-regulated healthcare workflows',
      urgency: 'This Week',
      predictedOutcome: '45% renewal risk if usage decline continues unchecked over the next 30 days.',
      riskBreakdown: [
        { factor: 'Significant usage decline', points: 18, value: '-19%' },
        { factor: 'Renewal approaching (<60 days)', points: 8, value: '42 days' },
        { factor: 'Engagement gap >14 days', points: 12, value: '19 days ago' },
        { factor: 'Multiple open support cases', points: 6, value: '3 cases' },
        { factor: 'CRM account health: At Risk', points: 6, value: 'At Risk' },
      ],
      actionPlan: [
        { week: 'Week 1-2', action: 'Product health check call — address 3 open support cases and identify usage blockers', owner: 'David Kim', goal: 'Resolve support issues and restore confidence' },
        { week: 'Week 3-4', action: 'Deliver clinical workflow optimization workshop', owner: 'David Kim', goal: 'Drive usage back above baseline' },
        { week: 'Month 2', action: 'Present compliance reporting module as a value-add', owner: 'David Kim', goal: 'Expand usage and justify ARR increase' },
        { week: 'Month 3', action: 'Renewal discussion with upgraded success plan', owner: 'David Kim', goal: 'Secure renewal with expansion opportunity' },
      ],
      riskDrivers: [
        { driver: 'Usage Decline', impact: 'Medium', explanation: '19% decline is within the warning zone — not yet critical but trending toward the -20% threshold that indicates product-fit issues.' },
        { driver: 'Support Burden', impact: 'Medium', explanation: '3 open support cases in healthcare suggests workflow friction that could escalate to a platform change decision.' },
        { driver: 'Engagement Gap', impact: 'Low', explanation: '19 days is approaching the 21-day danger zone — proactive outreach now prevents a crisis from forming.' },
      ],
      _source: 'salesforce',
      crm: { status: 'Connected', lastSync: now },
      email: { status: 'Connected', pending: 1, lastSync: now },
      calendar: { status: 'Connected', lastSync: now },
      productUsage: { status: 'Connected', trend: 'down', lastSync: now },
      support: { status: 'Connected', lastSync: now },
      recentActivity: [
        { time: '1 day ago', desc: 'Medium risk flag — 65/100 risk score, usage at -19%', by: 'Agent', type: 'AI' },
        { time: '3 days ago', desc: '3 open support cases detected', by: 'System', type: 'Support' },
        { time: '1 week ago', desc: 'Last meeting logged — product review', by: 'David Kim', type: 'Meeting' },
      ],
    },
    {
      id: nextId++, name: 'CloudBase Systems', owner: 'Emma Wilson', industry: 'Cloud Infrastructure',
      arr: 98000, mrr: 8167,
      renewal: getRelativeDate(55), daysToRenewal: 55,
      lastMeeting: '11 days ago', unansweredEmails: 1, noNextStep: false,
      usageChange: -8, evidence: 3,
      riskScore: 52, riskLevel: 'Medium', status: 'Medium',
      aiConfidence: 68,
      aiReasoning: 'CloudBase shows early warning signs — an 8% usage dip and 11 days since the last meeting are worth monitoring but not yet alarming. With 55 days to renewal, there\'s a healthy window to strengthen the relationship. The single unanswered email suggests mild disengagement, likely due to internal team changes rather than product dissatisfaction. A proactive QBR would be the right move here.',
      signals: ['Mild usage decline (-8%) — early warning signal', '11 days since last meeting — slight engagement gap', 'Renewal in 55 days — proactive outreach window'],
      nextAction: 'Send a proactive QBR agenda and schedule a renewal discussion for next month',
      emailDraft: 'Subject: CloudBase Q2 business review — scheduling time\n\nHi Jordan,\n\nHoping things are going well on your end. I wanted to proactively schedule our Q2 business review — I have some interesting usage insights and want to share a few infrastructure optimization tips specific to your workloads.\n\nDoes the week of the 15th work for you?\n\nBest,\nEmma Wilson',
      expansionOpportunity: 'Advanced monitoring and observability add-on — aligns with their infrastructure scaling needs',
      urgency: 'This Month',
      predictedOutcome: '30% renewal risk if current engagement trends continue. Strong candidate for renewal if proactive outreach is made.',
      riskBreakdown: [
        { factor: 'Moderate usage decline', points: 10, value: '-8%' },
        { factor: 'Renewal approaching (<60 days)', points: 8, value: '55 days' },
        { factor: 'Slight engagement gap', points: 5, value: '11 days ago' },
        { factor: 'HubSpot deal stage: Renewal Risk', points: 5, value: 'Renewal Risk' },
        { factor: 'No meeting booked before renewal', points: 5, value: 'No meeting' },
      ],
      actionPlan: [
        { week: 'Week 1-2', action: 'Send QBR invite with preliminary usage insights and agenda', owner: 'Emma Wilson', goal: 'Book business review for week 3' },
        { week: 'Week 3-4', action: 'Conduct QBR — present infrastructure ROI and optimization opportunities', owner: 'Emma Wilson', goal: 'Confirm value and align on roadmap' },
        { week: 'Month 2', action: 'Present monitoring add-on proposal with 30-day trial', owner: 'Emma Wilson', goal: 'Expand footprint and increase stickiness' },
        { week: 'Month 3', action: 'Close renewal with expanded scope', owner: 'Emma Wilson', goal: 'Secure 12-month renewal at $110K ARR' },
      ],
      riskDrivers: [
        { driver: 'Mild Usage Decline', impact: 'Low', explanation: '-8% usage is within normal variance but bears monitoring — could indicate team size reduction or workload consolidation.' },
        { driver: 'Engagement Gap', impact: 'Low', explanation: '11 days is within acceptable range but combined with an unanswered email suggests reduced internal prioritization.' },
        { driver: 'Renewal Proximity', impact: 'Medium', explanation: '55 days is the optimal window to start renewal conversations — waiting longer reduces close probability significantly.' },
      ],
      _source: 'salesforce',
      crm: { status: 'Connected', lastSync: now },
      email: { status: 'Connected', pending: 1, lastSync: now },
      calendar: { status: 'Connected', lastSync: now },
      productUsage: { status: 'Connected', trend: 'down', lastSync: now },
      support: { status: 'Not connected', lastSync: null },
      recentActivity: [
        { time: '2 days ago', desc: 'Medium risk flag — 52/100, proactive renewal recommended', by: 'Agent', type: 'AI' },
        { time: '1 week ago', desc: 'QBR prep started — usage report generated', by: 'Emma Wilson', type: 'Task' },
        { time: '11 days ago', desc: 'Last meeting — infrastructure review call', by: 'Emma Wilson', type: 'Meeting' },
      ],
    },
    {
      id: nextId++, name: 'LogiPro Corp', owner: 'Alex Torres', industry: 'Logistics & Supply Chain',
      arr: 76000, mrr: 6333,
      renewal: getRelativeDate(68), daysToRenewal: 68,
      lastMeeting: '5 days ago', unansweredEmails: 0, noNextStep: false,
      usageChange: 12, evidence: 1,
      riskScore: 35, riskLevel: 'Low', status: 'Low',
      aiConfidence: 82,
      aiReasoning: 'LogiPro is in excellent account health — 12% usage growth, a meeting just 5 days ago, and zero unanswered emails. With 68 days to renewal, this is the ideal time to introduce an expansion conversation. The logistics industry typically values operational efficiency tools highly, and the positive usage trend indicates the team is deeply engaged with core features.',
      signals: ['12% product usage growth — strong adoption signal', 'Met 5 days ago — active and engaged relationship', 'Zero unanswered emails — champion is highly responsive'],
      nextAction: 'Introduce route optimization premium add-on in the next QBR — usage growth supports the pitch',
      emailDraft: 'Subject: LogiPro growth + an idea for your team\n\nHi Morgan,\n\nGreat talking last week! I wanted to share that your team\'s usage has grown 12% over the past month — that\'s one of the strongest growth rates we\'ve seen. I have a few ideas on how to leverage that momentum for further efficiency gains.\n\nWould you be open to a 20-minute call to explore?\n\nBest,\nAlex Torres',
      expansionOpportunity: 'Route optimization premium module — strong fit for logistics workflows with 12% usage growth trend',
      urgency: 'This Month',
      predictedOutcome: 'High renewal probability (90%+). Strong candidate for expansion into the route optimization module.',
      riskBreakdown: [
        { factor: 'Positive usage growth', points: -5, value: '+12%' },
        { factor: 'Renewal approaching (<60 days)', points: 8, value: '68 days' },
      ],
      actionPlan: [
        { week: 'Week 1-2', action: 'Send usage growth summary and schedule expansion discovery call', owner: 'Alex Torres', goal: 'Open expansion conversation' },
        { week: 'Week 3-4', action: 'Present route optimization module with ROI case study', owner: 'Alex Torres', goal: 'Generate interest in $15K expansion' },
        { week: 'Month 2', action: 'Run 30-day paid pilot of premium add-on', owner: 'Alex Torres', goal: 'Prove value and drive adoption' },
        { week: 'Month 3', action: 'Close renewal with expansion bundle', owner: 'Alex Torres', goal: 'Grow ARR from $76K to $91K' },
      ],
      riskDrivers: [
        { driver: 'Positive Usage Growth', impact: 'Low', explanation: '+12% usage growth is a strong retention signal — teams actively growing usage almost never churn.' },
        { driver: 'Renewal Timeline', impact: 'Low', explanation: '68 days provides ample time for a well-structured renewal and expansion conversation.' },
        { driver: 'High Engagement', impact: 'Low', explanation: 'Meeting 5 days ago with zero unanswered emails indicates a healthy, trust-based relationship.' },
      ],
      _source: 'salesforce',
      crm: { status: 'Connected', lastSync: now },
      email: { status: 'Connected', pending: 0, lastSync: now },
      calendar: { status: 'Connected', lastSync: now },
      productUsage: { status: 'Connected', trend: 'up', lastSync: now },
      support: { status: 'Connected', lastSync: now },
      recentActivity: [
        { time: '5 days ago', desc: 'QBR completed — positive sentiment, expansion interest noted', by: 'Alex Torres', type: 'Meeting' },
        { time: '1 week ago', desc: 'Usage growth 12% — expansion flag set', by: 'Agent', type: 'AI' },
        { time: '2 weeks ago', desc: 'Success story shared with LogiPro team', by: 'Alex Torres', type: 'Email' },
      ],
    },
    {
      id: nextId++, name: 'FinCore Ltd', owner: 'Rachel Green', industry: 'Financial Services',
      arr: 210000, mrr: 17500,
      renewal: getRelativeDate(90), daysToRenewal: 90,
      lastMeeting: '3 days ago', unansweredEmails: 0, noNextStep: false,
      usageChange: 18, evidence: 1,
      riskScore: 28, riskLevel: 'Low', status: 'Low',
      aiConfidence: 88,
      aiReasoning: 'FinCore is one of the healthiest accounts in the portfolio — 18% usage growth, met 3 days ago, and zero outstanding communication gaps. This $210K ARR enterprise account is deeply embedded and represents a strong expansion opportunity. Financial services firms with growing usage at this ARR level are prime candidates for enterprise tier upgrades or compliance module additions.',
      signals: ['18% product usage growth — platform deeply embedded', 'Met 3 days ago — executive relationship is strong', '90-day renewal window — ideal time to plan expansion'],
      nextAction: 'Propose enterprise tier upgrade and compliance reporting module in the next executive review',
      emailDraft: 'Subject: FinCore Q3 strategy — exciting update\n\nHi Catherine,\n\nFollowing our great conversation on Tuesday, I wanted to share that your usage has grown 18% over the last month — truly impressive adoption. I\'d love to show you how our enterprise compliance module could amplify these results even further.\n\nCould we schedule 45 minutes before end of quarter?\n\nBest,\nRachel Green',
      expansionOpportunity: 'Enterprise compliance and audit reporting module — critical for financial services regulatory requirements at this ARR level',
      urgency: 'This Month',
      predictedOutcome: 'Renewal probability 95%+. Strong expansion candidate — potential to grow ARR by $40-60K with compliance module.',
      riskBreakdown: [
        { factor: 'Positive usage growth', points: -5, value: '+18%' },
      ],
      actionPlan: [
        { week: 'Week 1-2', action: 'Prepare enterprise tier proposal with compliance module demo', owner: 'Rachel Green', goal: 'Build business case for $250K ARR' },
        { week: 'Week 3-4', action: 'Executive presentation — ROI summary and expansion roadmap', owner: 'Rachel Green', goal: 'Get stakeholder buy-in for expansion' },
        { week: 'Month 2', action: '30-day compliance module pilot with dedicated implementation support', owner: 'Rachel Green', goal: 'Demonstrate audit reporting value' },
        { week: 'Month 3', action: 'Close expansion and renewal bundle', owner: 'Rachel Green', goal: 'Grow ARR from $210K to $250K+' },
      ],
      riskDrivers: [
        { driver: 'Strong Usage Growth', impact: 'Low', explanation: '+18% growth at enterprise ARR indicates platform is core to FinCore\'s operations — extremely low churn risk.' },
        { driver: 'Executive Engagement', impact: 'Low', explanation: 'Meeting 3 days ago with active executive sponsorship is the strongest retention signal possible.' },
        { driver: 'Compliance Opportunity', impact: 'Low', explanation: 'Financial services firms at this ARR level almost always have compliance requirements that create natural expansion vectors.' },
      ],
      _source: 'salesforce',
      crm: { status: 'Connected', lastSync: now },
      email: { status: 'Connected', pending: 0, lastSync: now },
      calendar: { status: 'Connected', lastSync: now },
      productUsage: { status: 'Connected', trend: 'up', lastSync: now },
      support: { status: 'Connected', lastSync: now },
      recentActivity: [
        { time: '3 days ago', desc: 'Executive QBR — 18% usage growth presented, expansion discussed', by: 'Rachel Green', type: 'Meeting' },
        { time: '5 days ago', desc: 'Expansion opportunity flagged — compliance module fit', by: 'Agent', type: 'AI' },
        { time: '2 weeks ago', desc: 'NPS survey completed — score 9/10', by: 'System', type: 'NPS' },
      ],
    },
    {
      id: nextId++, name: 'BuildRight Construction', owner: 'Chris Murphy', industry: 'Construction Technology',
      arr: 33000, mrr: 2750,
      renewal: getRelativeDate(115), daysToRenewal: 115,
      lastMeeting: '7 days ago', unansweredEmails: 0, noNextStep: false,
      usageChange: 22, evidence: 1,
      riskScore: 22, riskLevel: 'Low', status: 'Low',
      aiConfidence: 84,
      aiReasoning: 'BuildRight is a healthy, growing SMB account with 22% usage growth — one of the strongest adoption curves in the SMB segment. Met last week, zero unanswered emails, and 115 days to renewal. This account is an ideal candidate for a project management premium module given the construction industry\'s need for site coordination and compliance tracking.',
      signals: ['22% usage growth — highest adoption rate in SMB cohort', 'Met last week — active and healthy relationship', '115 days to renewal — strong pipeline security'],
      nextAction: 'Pitch project management premium add-on — usage growth and industry fit make this a high-confidence upsell',
      emailDraft: 'Subject: BuildRight team performance — impressive growth!\n\nHi Tyler,\n\nJust wanted to follow up from our call last week — your team\'s usage has grown 22% this past month, which is genuinely impressive. I\'d love to show you our project management premium features that are specifically built for construction workflows.\n\nDown for a quick demo?\n\nBest,\nChris Murphy',
      expansionOpportunity: 'Project management premium module — strong fit for construction site coordination and compliance tracking workflows',
      urgency: 'This Month',
      predictedOutcome: 'Renewal probability 97%+. Excellent expansion candidate with premium module — potential $8-12K ARR increase.',
      riskBreakdown: [
        { factor: 'Positive usage growth', points: -5, value: '+22%' },
      ],
      actionPlan: [
        { week: 'Week 1-2', action: 'Send project management module overview tailored to construction workflows', owner: 'Chris Murphy', goal: 'Generate interest and book demo' },
        { week: 'Week 3-4', action: 'Live demo of site coordination and compliance tracking features', owner: 'Chris Murphy', goal: 'Show immediate value for field teams' },
        { week: 'Month 2', action: 'Free 30-day pilot with field team lead as internal champion', owner: 'Chris Murphy', goal: 'Drive adoption before commercial discussion' },
        { week: 'Month 3', action: 'Close expansion and start early renewal conversation', owner: 'Chris Murphy', goal: 'Grow ARR from $33K to $42K' },
      ],
      riskDrivers: [
        { driver: 'Exceptional Usage Growth', impact: 'Low', explanation: '+22% growth in construction tech is exceptional — this team has fully adopted the platform into daily workflows.' },
        { driver: 'Healthy Relationship', impact: 'Low', explanation: 'Meeting last week with zero email gaps confirms active engagement and mutual trust.' },
        { driver: 'SMB Expansion Potential', impact: 'Low', explanation: 'SMB accounts with strong usage growth are the best candidates for premium module expansion at relatively low sales cost.' },
      ],
      _source: 'hubspot',
      crm: { status: 'Not connected', lastSync: null },
      email: { status: 'Connected', pending: 0, lastSync: now },
      calendar: { status: 'Connected', lastSync: now },
      productUsage: { status: 'Connected', trend: 'up', lastSync: now },
      support: { status: 'Not connected', lastSync: null },
      recentActivity: [
        { time: '7 days ago', desc: 'Check-in call — team very happy, usage growing', by: 'Chris Murphy', type: 'Meeting' },
        { time: '1 week ago', desc: 'Usage growth 22% — expansion opportunity flagged', by: 'Agent', type: 'AI' },
        { time: '2 weeks ago', desc: 'Onboarding completed successfully', by: 'System', type: 'Onboarding' },
      ],
    },
  ]

  customers.push(...seedCustomers)
  nextId = seedCustomers.length + 1
  console.log(`✅ Seeded ${seedCustomers.length} demo customers`)
}

// ─── Auto-find free port if preferred port is busy ───────────────────────────
function startServer(port) {
  const server = app.listen(port, () => {
    const aiEnabled = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here'
    console.log(`RevOps AI backend running on http://localhost:${port}`)
    console.log(`AI Mode: ${aiEnabled ? '✅ Groq LLM enabled' : '⚠️  Fallback mode'}`)
    // Write actual port to a temp file so frontend can read it
    require('fs').writeFileSync('.port', String(port))
    seedDemoData()
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Port ${port} busy — trying ${port + 1}...`)
      startServer(port + 1)
    } else {
      throw err
    }
  })
}

startServer(PORT)
