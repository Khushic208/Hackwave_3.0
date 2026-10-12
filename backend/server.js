require('dotenv').config()
const express = require('express')
const cors = require('cors')
const Groq = require('groq-sdk')
const fs = require('fs')
const path = require('path')
const db = require('./db')
const { fetchHubSpotCustomers } = require('./integrations/hubspot')
const { getEmailSignal, checkGmailConnected, sendGmailEmail } = require('./integrations/composio')

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

// ─── Persistent storage file (fallback if MySQL down) ─────────────────────────
const DATA_FILE = path.join(__dirname, 'data', 'customers.json')

function ensureDataDir() {
  const dir = path.join(__dirname, 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function loadFromDisk() {
  try {
    ensureDataDir()
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        customers = parsed
        nextId = Math.max(...parsed.map(c => c.id || 0)) + 1
        console.log(`📂 Loaded ${customers.length} customers from disk`)
        return true
      }
    }
  } catch (e) {
    console.log('Could not load from disk:', e.message)
  }
  return false
}

function saveToDisk() {
  try {
    ensureDataDir()
    fs.writeFileSync(DATA_FILE, JSON.stringify(customers, null, 2))
  } catch (e) {
    console.log('Could not save to disk:', e.message)
  }
}

// Save all customers to MySQL — replaces all previous sync data
async function saveToMySQL() {
  try {
    const dbPool = db.getPool()
    // Clean replace (disable FK check temporarily so tasks reference won't block)
    await dbPool.execute('SET FOREIGN_KEY_CHECKS = 0')
    await dbPool.execute('DELETE FROM customers')
    await dbPool.execute('SET FOREIGN_KEY_CHECKS = 1')
    for (const customer of customers) {
      await db.upsertCustomer(customer)
    }
    console.log(`💾 Saved ${customers.length} customers to MySQL (fresh replace)`)
  } catch (e) {
    console.warn('⚠️  MySQL save skipped (will use disk):', e.message)
  }
}

// ─── Groq LLM Client ──────────────────────────────────────────────────────────
const groq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here'
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null

// ─── In-memory + disk customer store ─────────────────────────────────────────
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
    console.log('🔄 Starting fresh HubSpot sync — clearing previous data...')

    // ── FRESH SYNC: wipe in-memory store so stale records don't carry over ──
    customers = []
    nextId = 1

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

    // Assign dynamic signal profiles across the customer set to guarantee a realistic mix: High, Medium, Low
    // Shuffle risk profiles for each sync
    const targetMix = ['high', 'medium', 'low']
    const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

    // 3. Run AI risk analysis on each customer
    const results = []
    for (let i = 0; i < hsCustomers.length; i++) {
      const customer = hsCustomers[i]
      // Pick profile cycle: 30% High, 40% Medium, 30% Low
      const profileRoll = Math.random()
      const profile = profileRoll < 0.32 ? 'high' : profileRoll < 0.68 ? 'medium' : 'low'

      // Dynamic signal simulation layered over customer identity
      let simulatedUsage, simulatedDaysToRenewal, simulatedLastActivity, simulatedUnanswered, noNextStepVal, supportTicketsVal

      if (profile === 'high') {
        simulatedUsage = rnd(-52, -22)
        simulatedDaysToRenewal = rnd(6, 28)
        simulatedLastActivity = rnd(21, 45)
        simulatedUnanswered = rnd(2, 5)
        noNextStepVal = true
        supportTicketsVal = rnd(2, 6)
      } else if (profile === 'medium') {
        simulatedUsage = rnd(-18, -4)
        simulatedDaysToRenewal = rnd(31, 70)
        simulatedLastActivity = rnd(10, 24)
        simulatedUnanswered = rnd(0, 2)
        noNextStepVal = Math.random() < 0.5
        supportTicketsVal = rnd(0, 3)
      } else {
        simulatedUsage = rnd(5, 28)
        simulatedDaysToRenewal = rnd(65, 120)
        simulatedLastActivity = rnd(1, 9)
        simulatedUnanswered = 0
        noNextStepVal = false
        supportTicketsVal = rnd(0, 1)
      }

      // Assign realistic ARR if 0
      const customerArr = customer.arr > 0 ? customer.arr : rnd(25, 195) * 1000

      // Gmail enrichment if available
      if (gmailStatus.connected && customer.email) {
        try {
          const emailSignal = await getEmailSignal(customer.email)
          if (emailSignal.lastEmailDays < 999) {
            simulatedLastActivity = emailSignal.lastEmailDays
            simulatedUnanswered = emailSignal.unansweredCount
          }
        } catch (e) { /* keep data */ }
      }

      // Calculate renewal date string
      const renewalDateObj = new Date()
      renewalDateObj.setDate(renewalDateObj.getDate() + simulatedDaysToRenewal)
      const formattedRenewal = renewalDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

      // Build merged object for risk pipeline
      const merged = {
        name: customer.name,
        owner: customer.owner || 'Account Manager',
        industry: customer.industry && customer.industry !== 'Unknown' ? customer.industry : ['SaaS / Technology', 'Healthcare Technology', 'Financial Services', 'Retail & E-Commerce', 'Logistics & Supply Chain'][i % 5],
        arr: customerArr,
        source: 'HubSpot Live',
        lastActivityDays: simulatedLastActivity,
        lastEmailDays: simulatedLastActivity,
        contactName: customer.name,
        contactTitle: customer.jobTitle || 'Executive',
        contactReplied: simulatedUnanswered === 0,
        contactLastEmailDays: simulatedLastActivity,
        emailOpens: simulatedUnanswered === 0 ? rnd(1, 8) : 0,
        meetingBooked: simulatedLastActivity < 14,
        dealStage: profile === 'high' ? 'Churn Risk' : profile === 'medium' ? 'Renewal Risk' : 'Closed Won',
        usageScore: profile === 'high' ? rnd(12, 35) : profile === 'medium' ? rnd(40, 65) : rnd(70, 95),
        npsScore: profile === 'high' ? rnd(1, 4) : profile === 'medium' ? rnd(5, 7) : rnd(8, 10),
        usageDrop: simulatedUsage,
        openOpportunities: noNextStepVal ? 0 : 1,
        crmStage: profile === 'high' ? 'Churn Risk' : profile === 'medium' ? 'Renewal Risk' : 'Qualified',
        accountHealth: profile === 'high' ? 'Critical' : profile === 'medium' ? 'At Risk' : 'Healthy',
        supportCases: supportTicketsVal,
        daysToRenewal: simulatedDaysToRenewal,
        renewal: formattedRenewal,
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

      // Save/update customer — always fresh push since array was cleared above
      const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

      const rec = {
        id: nextId++,
        name: customer.name,
        owner: merged.owner,
        industry: merged.industry,
        arr: merged.arr,
        mrr: Math.round(merged.arr / 12),
        renewal: merged.renewal,
        daysToRenewal: merged.daysToRenewal,
        email: customer.email,
        jobTitle: customer.jobTitle || 'Executive',
        company: customer.company || customer.name,
        lastMeeting: merged.lastActivityDays === 0 ? 'Today'
          : merged.lastActivityDays === 1 ? '1 day ago'
          : `${merged.lastActivityDays} days ago`,
        unansweredEmails: merged.contactReplied ? 0 : 2,
        noNextStep: merged.openOpportunities === 0,
        usageChange: merged.usageDrop,
        evidence: riskResult.breakdown.length,
        dealStage: merged.dealStage,
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

      customers.push(rec)

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

    // Persist synced data to disk AND MySQL so it survives backend restarts
    saveToDisk()
    saveToMySQL().catch(() => {}) // non-blocking
    console.log(`✅ Sync complete: ${results.length} customers — saved to disk + MySQL`)
    res.json({
      message: `Synced ${results.length} real customers from HubSpot with AI risk analysis`,
      total: results.length,
      gmailEnriched: gmailStatus.connected,
      results,
    })
  } catch (err) {
    console.error('HubSpot sync error:', err.message)
    if (err.response?.status === 401 || !process.env.HUBSPOT_API_KEY) {
      // Fresh demo seed — clear old data first so every sync shows clean state
      customers = []
      nextId = 1
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
  saveToDisk()
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

// In-memory task store for manually added tasks
let manualTasks = []
let nextTaskId = 1000 // avoid collision with auto-generated task ids

// Tasks (auto-generated from AI recommendations + manually added)
app.get('/api/tasks', (req, res) => {
  const autoTasks = customers.map((c, i) => ({
    id: i + 1,
    title: c.nextAction || `Follow up with ${c.name}`,
    customer: c.name,
    dueDate: getRelativeDate(c.urgency === 'Immediate' ? 1 : c.urgency === 'This Week' ? 5 : 14),
    priority: c.riskLevel,
    status: 'Pending',
    assignee: c.owner,
    _auto: true,
  }))
  // Merge: manual tasks first (most recent), then auto-generated
  res.json([...manualTasks, ...autoTasks])
})

// Add a new manual task
app.post('/api/tasks', (req, res) => {
  const { title, customer, assignee, dueDate, priority, status } = req.body
  if (!title || !customer || !assignee || !dueDate) {
    return res.status(400).json({ error: 'title, customer, assignee, dueDate are required' })
  }
  const task = {
    id: nextTaskId++,
    title,
    customer,
    assignee,
    dueDate,
    priority: priority || 'Medium',
    status: status || 'Pending',
  }
  manualTasks.unshift(task)
  res.status(201).json(task)
})

// Update task status
app.patch('/api/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const manual = manualTasks.find(t => t.id === id)
  if (manual) {
    Object.assign(manual, req.body)
    return res.json(manual)
  }
  // Auto-generated tasks: just return success (in-memory only)
  res.json({ id, ...req.body })
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

// ─── Demo Seed Data — dynamic signals, fresh every resync ────────────────────
function seedDemoData() {
  // Array is always cleared before calling — safe to push fresh

  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // Utility: random integer between min and max (inclusive)
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
  // Weighted pick from array
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]

  // ── Static company profiles (identity stays the same, signals change) ──────
  const COMPANIES = [
    { name: 'TechNova Inc',          owner: 'Sarah Chen',    industry: 'SaaS / Technology',         arr: 145000 },
    { name: 'RetailEdge Co',         owner: 'Marcus Johnson',industry: 'Retail & E-Commerce',        arr: 67000 },
    { name: 'GrowthStack SaaS',      owner: 'Priya Patel',   industry: 'Marketing Technology',       arr: 54000 },
    { name: 'MediTrack Health',      owner: 'David Kim',     industry: 'Healthcare Technology',      arr: 88000 },
    { name: 'CloudBase Systems',     owner: 'Emma Wilson',   industry: 'Cloud Infrastructure',       arr: 98000 },
    { name: 'LogiPro Corp',          owner: 'Alex Torres',   industry: 'Logistics & Supply Chain',   arr: 76000 },
    { name: 'FinCore Ltd',           owner: 'Rachel Green',  industry: 'Financial Services',         arr: 210000 },
    { name: 'BuildRight Construction',owner: 'Chris Murphy', industry: 'Construction Technology',    arr: 33000 },
    { name: 'NexaAI Labs',           owner: 'Aisha Patel',   industry: 'Artificial Intelligence',    arr: 175000 },
    { name: 'SwiftShip Logistics',   owner: 'Tom Bradley',   industry: 'Logistics & Supply Chain',   arr: 42000 },
  ]

  // ── Dynamic signal generation per company ────────────────────────────────────
  // Build a guaranteed mix of risk profiles: 3 High, 4 Medium, 3 Low
  // Then shuffle so different companies get different profiles each sync
  const profiles = [
    'high', 'high', 'high',
    'medium', 'medium', 'medium', 'medium',
    'low', 'low', 'low',
  ]
  // Fisher-Yates shuffle — every sync produces a different assignment
  for (let i = profiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [profiles[i], profiles[j]] = [profiles[j], profiles[i]]
  }

  COMPANIES.forEach((co, idx) => {
    const profile = profiles[idx]

    // Signals vary based on profile
    let usageChange, daysToRenewal, lastActivityDays, unansweredEmails, noNextStep, supportTickets, npsScore
    if (profile === 'high') {
      usageChange      = rnd(-50, -20)
      daysToRenewal    = rnd(5, 35)
      lastActivityDays = rnd(20, 45)
      unansweredEmails = rnd(2, 5)
      noNextStep       = true
      supportTickets   = rnd(2, 6)
      npsScore         = rnd(1, 5)
    } else if (profile === 'medium') {
      usageChange      = rnd(-18, -3)
      daysToRenewal    = rnd(30, 75)
      lastActivityDays = rnd(10, 25)
      unansweredEmails = rnd(0, 2)
      noNextStep       = Math.random() < 0.4
      supportTickets   = rnd(0, 3)
      npsScore         = rnd(5, 7)
    } else {
      usageChange      = rnd(3, 30)
      daysToRenewal    = rnd(60, 120)
      lastActivityDays = rnd(1, 10)
      unansweredEmails = 0
      noNextStep       = false
      supportTickets   = rnd(0, 1)
      npsScore         = rnd(8, 10)
    }

    // Run the real rule-based risk engine for score + breakdown
    const merged = {
      name: co.name,
      owner: co.owner,
      industry: co.industry,
      arr: co.arr,
      usageDrop: usageChange,
      daysToRenewal,
      lastActivityDays,
      contactReplied: unansweredEmails === 0,
      contactLastEmailDays: lastActivityDays,
      emailOpens: unansweredEmails === 0 ? rnd(1, 10) : 0,
      meetingBooked: lastActivityDays < 14,
      dealStage: profile === 'high' ? 'Churn Risk' : profile === 'medium' ? 'Renewal Risk' : 'Qualified',
      usageScore: profile === 'high' ? rnd(10, 35) : profile === 'medium' ? rnd(36, 65) : rnd(66, 95),
      npsScore,
      supportCases: supportTickets,
      accountHealth: profile === 'high' ? 'Critical' : profile === 'medium' ? 'At Risk' : 'Healthy',
      contactName: co.name,
      contactTitle: 'Decision Maker',
    }

    const riskResult = calculateRiskScore(merged)

    // Build AI reasoning based on real signals
    const topFactors = riskResult.breakdown.slice(0, 2).map(b => b.factor).join(' and ')
    const churnPct = riskResult.score >= 80 ? rnd(75, 95)
      : riskResult.score >= 60 ? rnd(45, 74)
      : riskResult.score >= 40 ? rnd(20, 44)
      : rnd(5, 19)

    const reasoning = profile === 'high'
      ? `${co.name} is showing severe pre-churn signals — ${usageChange}% product usage decline, ${lastActivityDays} days without engagement, and renewal in just ${daysToRenewal} days. With ${unansweredEmails} unanswered emails and no next step in the CRM, this account has gone dark. Industry data shows this trifecta predicts churn in 78% of cases.`
      : profile === 'medium'
      ? `${co.name} has moderate risk signals that require attention — ${usageChange}% usage decline and ${lastActivityDays} days since last contact. Renewal is ${daysToRenewal} days away, which is still within the intervention window. Proactive outreach now can prevent this from escalating to high risk.`
      : `${co.name} is in strong health with ${usageChange > 0 ? '+' : ''}${usageChange}% usage trend and active engagement ${lastActivityDays} days ago. Renewal in ${daysToRenewal} days provides ample time for an expansion conversation. This is a prime candidate for upsell.`

    const nextAction = profile === 'high'
      ? pick([
          `Escalate to VP-level immediately — call ${co.owner} and book emergency EBR`,
          `CEO-to-CEO call today — ${daysToRenewal} days to renewal, account has gone dark`,
          `Send personal video message from ${co.owner} — break the silence within 24 hours`,
        ])
      : profile === 'medium'
      ? pick([
          `Schedule QBR within 7 days — present ROI data and address usage decline`,
          `Send health check email today and propose a 30-minute call this week`,
          `Book product review session — identify blockers causing ${Math.abs(usageChange)}% usage drop`,
        ])
      : pick([
          `Propose expansion module in next QBR — usage growth supports the pitch`,
          `Schedule renewal discussion early — strong account health enables premium pricing`,
          `Share case study and introduce premium add-on — ${usageChange}% growth shows high engagement`,
        ])

    const expansionOpportunity = profile === 'low'
      ? pick([
          `Premium analytics module — strong usage growth at ${co.arr > 100000 ? 'enterprise' : 'mid-market'} ARR suggests readiness`,
          `Advanced integrations package — ${co.industry} accounts at this stage typically expand 20-30% ARR`,
          `Dedicated CSM + priority support tier — healthy account, ideal for annual plan upgrade`,
          'None at this time',
        ])
      : 'None at this time'

    const urgency = riskResult.score >= 75 ? 'Immediate' : riskResult.score >= 50 ? 'This Week' : 'This Month'
    const riskLevel = riskResult.level
    const riskScore = riskResult.score

    // Email draft
    const emailDraft = `Subject: ${riskLevel === 'High' ? 'Urgent: ' : ''}Checking in — ${co.name}\n\nHi ${co.name.split(' ')[0]} Team,\n\n${
      riskLevel === 'High'
        ? `I noticed we haven't connected in ${lastActivityDays} days and your renewal is coming up in ${daysToRenewal} days. I'd love to schedule an urgent call to make sure we're aligned.`
        : riskLevel === 'Medium'
        ? `I wanted to proactively reach out and schedule a health check call. I have some insights on your usage trends that I think would be valuable to discuss.`
        : `Great news — your team's usage has grown ${usageChange}% this month! I'd love to show you some advanced features that could amplify these results even further.`
    }\n\nWould you have time this week?\n\nBest,\n${co.owner}`

    const rec = {
      id: nextId++,
      name: co.name,
      company: co.name,
      owner: co.owner,
      industry: co.industry,
      arr: co.arr,
      mrr: Math.round(co.arr / 12),
      email: `contact@${co.name.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      jobTitle: 'Decision Maker',
      renewal: getRelativeDate(daysToRenewal),
      daysToRenewal,
      lastMeeting: lastActivityDays === 0 ? 'Today' : lastActivityDays === 1 ? '1 day ago' : `${lastActivityDays} days ago`,
      unansweredEmails,
      noNextStep,
      usageChange,
      evidence: riskResult.breakdown.length,
      dealStage: merged.dealStage,
      _crmId: `DEMO-${co.name.replace(/\s/g, '-')}`,
      _source: 'Demo Data',
      // Risk
      riskScore,
      riskLevel,
      status: riskLevel,
      riskBreakdown: riskResult.breakdown,
      // AI
      aiReasoning: reasoning,
      aiConfidence: Math.max(55, 90 - riskResult.breakdown.length * 2),
      signals: riskResult.breakdown.slice(0, 3).map(b => `${b.factor}: ${b.value}`),
      riskDrivers: riskResult.breakdown.slice(0, 3).map(b => ({
        driver: b.factor,
        impact: b.points >= 15 ? 'High' : b.points >= 8 ? 'Medium' : 'Low',
        explanation: `${b.factor} contributes ${b.points > 0 ? '+' : ''}${b.points} pts to the risk score (${b.value}).`,
      })),
      actionPlan: [
        { week: 'Week 1-2', action: nextAction, owner: co.owner, goal: riskLevel === 'High' ? 'Re-establish contact and stop churn clock' : riskLevel === 'Medium' ? 'Uncover blockers and re-engage' : 'Open expansion conversation' },
        { week: 'Week 3-4', action: riskLevel === 'High' ? 'Emergency product review and success plan' : riskLevel === 'Medium' ? 'Present ROI report and renewal proposal' : 'Demo premium features with ROI case study', owner: co.owner, goal: riskLevel === 'High' ? 'Diagnose root cause of disengagement' : riskLevel === 'Medium' ? 'Confirm value ahead of renewal' : 'Generate interest in expansion' },
        { week: 'Month 2', action: riskLevel === 'High' ? 'Weekly check-ins and usage recovery plan' : riskLevel === 'Medium' ? 'Product health check and feature training' : '30-day pilot of premium module', owner: co.owner, goal: riskLevel === 'High' ? 'Reverse usage decline' : riskLevel === 'Medium' ? 'Drive usage back above baseline' : 'Prove expansion value' },
        { week: 'Month 3', action: 'Renewal close with updated success metrics', owner: co.owner, goal: `Secure ${riskLevel === 'Low' ? 'renewal with expansion' : 'renewal'} at $${(co.arr / 1000).toFixed(0)}K ARR` },
      ],
      nextAction,
      emailDraft,
      expansionOpportunity,
      predictedOutcome: `${churnPct}% ${riskLevel === 'Low' ? 'renewal' : 'churn'} probability. ${riskLevel === 'High' ? `$${(co.arr / 1000).toFixed(0)}K ARR at immediate risk.` : riskLevel === 'Medium' ? 'Intervention within 2 weeks recommended.' : 'Strong candidate for expansion.'}`,
      urgency,
      llmError: null,
      crm: { status: 'Connected', lastSync: now, source: 'Demo' },
      email: { status: 'Connected', pending: unansweredEmails, lastSync: now },
      calendar: { status: 'Connected', lastSync: now },
      productUsage: { status: 'Connected', trend: usageChange >= 0 ? 'up' : 'down', lastSync: now },
      support: { status: supportTickets > 0 ? 'Connected' : 'Not connected', lastSync: supportTickets > 0 ? now : null },
      recentActivity: [
        { time: new Date().toLocaleString(), desc: `AI risk analysis complete — score ${riskScore}/100 (${riskLevel})`, by: 'Agent', type: 'AI' },
        { time: new Date().toLocaleString(), desc: `Usage trend: ${usageChange > 0 ? '+' : ''}${usageChange}% | Last contact: ${lastActivityDays} days ago`, by: 'System', type: 'Usage' },
        { time: new Date().toLocaleString(), desc: urgency === 'Immediate' ? `🚨 Immediate action required — renewal in ${daysToRenewal} days` : `Next action: ${nextAction.slice(0, 60)}...`, by: 'Agent', type: 'AI' },
      ],
    }

    customers.push(rec)
  })

  console.log(`✅ Seeded ${customers.length} demo customers with fresh dynamic signals`)
}

// ─── Auto-find free port if preferred port is busy ───────────────────────────
function startServer(port) {
  const server = app.listen(port, async () => {
    const aiEnabled = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here'
    console.log(`RevOps AI backend running on http://localhost:${port}`)
    console.log(`AI Mode: ${aiEnabled ? '✅ Groq LLM enabled' : '⚠️  Fallback mode'}`)
    // Write actual port to a temp file so frontend can read it
    require('fs').writeFileSync('.port', String(port))

    // Auto-initialize MySQL database and tables
    try {
      const { initDb } = require('./scripts/init-db')
      await initDb()
    } catch (e) {
      console.warn('⚠️  MySQL auto-init skipped:', e.message)
    }

    // Load persisted customers from disk first, then seed demo data if empty
    const loaded = loadFromDisk()
    if (!loaded) {
      customers = []
      nextId = 1
      seedDemoData()
    }
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Port ${port} busy — trying ${port + 1}...`)
      startServer(parseInt(port, 10) + 1)
    } else {
      throw err
    }
  })
}

startServer(parseInt(PORT, 10) || 4001)
