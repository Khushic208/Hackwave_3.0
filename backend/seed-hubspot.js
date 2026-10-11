require('dotenv').config()
const axios = require('axios')

const TOKEN = process.env.HUBSPOT_API_KEY
const hs = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  timeout: 30000,
})

// 20 realistic SaaS customers
const contacts = [
  { firstname: 'Rahul', lastname: 'Sharma', email: 'rahul.sharma@technova.io', company: 'TechNova Inc', jobtitle: 'CTO', phone: '+91-9876543210', lifecyclestage: 'customer' },
  { firstname: 'Priya', lastname: 'Mehta', email: 'priya.mehta@retailedge.com', company: 'RetailEdge Co', jobtitle: 'CEO', phone: '+91-9876543211', lifecyclestage: 'customer' },
  { firstname: 'Arjun', lastname: 'Kapoor', email: 'arjun.kapoor@growthstack.io', company: 'GrowthStack SaaS', jobtitle: 'VP Engineering', phone: '+91-9876543212', lifecyclestage: 'customer' },
  { firstname: 'Sneha', lastname: 'Rao', email: 'sneha.rao@meditrack.health', company: 'MediTrack Health', jobtitle: 'CIO', phone: '+91-9876543213', lifecyclestage: 'customer' },
  { firstname: 'Vikram', lastname: 'Nair', email: 'vikram.nair@cloudbase.systems', company: 'CloudBase Systems', jobtitle: 'Head of IT', phone: '+91-9876543214', lifecyclestage: 'customer' },
  { firstname: 'Anjali', lastname: 'Desai', email: 'anjali.desai@logipro.corp', company: 'LogiPro Corp', jobtitle: 'COO', phone: '+91-9876543215', lifecyclestage: 'customer' },
  { firstname: 'Rohit', lastname: 'Verma', email: 'rohit.verma@fincore.ltd', company: 'FinCore Ltd', jobtitle: 'CFO', phone: '+91-9876543216', lifecyclestage: 'customer' },
  { firstname: 'Kavita', lastname: 'Singh', email: 'kavita.singh@buildright.co', company: 'BuildRight Construction', jobtitle: 'Director Operations', phone: '+91-9876543217', lifecyclestage: 'customer' },
  { firstname: 'Aditya', lastname: 'Ghosh', email: 'aditya.ghosh@zomato.biz', company: 'Zomato Business', jobtitle: 'VP Operations', phone: '+91-9876543218', lifecyclestage: 'customer' },
  { firstname: 'Neha', lastname: 'Gupta', email: 'neha.gupta@razorpay.ent', company: 'Razorpay Enterprises', jobtitle: 'CTO', phone: '+91-9876543219', lifecyclestage: 'customer' },
  { firstname: 'Karan', lastname: 'Mehta', email: 'karan.mehta@meesho.platform', company: 'Meesho Seller Platform', jobtitle: 'CEO', phone: '+91-9876543220', lifecyclestage: 'customer' },
  { firstname: 'Dhiraj', lastname: 'Relli', email: 'dhiraj.relli@hdfcsec.com', company: 'HDFC Securities', jobtitle: 'MD & CEO', phone: '+91-9876543221', lifecyclestage: 'customer' },
  { firstname: 'Sangita', lastname: 'Reddy', email: 'sangita.reddy@apollo.digital', company: 'Apollo Hospitals Digital', jobtitle: 'Joint MD', phone: '+91-9876543222', lifecyclestage: 'customer' },
  { firstname: 'Sahil', lastname: 'Barua', email: 'sahil.barua@delhivery.log', company: 'Delhivery Logistics', jobtitle: 'CEO', phone: '+91-9876543223', lifecyclestage: 'customer' },
  { firstname: 'Falguni', lastname: 'Nayar', email: 'falguni.nayar@nykaa.fashion', company: 'Nykaa Fashion', jobtitle: 'CEO', phone: '+91-9876543224', lifecyclestage: 'customer' },
  { firstname: 'Aadit', lastname: 'Palicha', email: 'aadit.palicha@zepto.qc', company: 'Zepto Quick Commerce', jobtitle: 'CEO', phone: '+91-9876543225', lifecyclestage: 'customer' },
  { firstname: 'Sriharsha', lastname: 'Majety', email: 'sriharsha@swiggy.tech', company: 'Swiggy Technology', jobtitle: 'CEO', phone: '+91-9876543226', lifecyclestage: 'customer' },
  { firstname: 'Deepinder', lastname: 'Goyal', email: 'deepinder@zomato.platform', company: 'Zomato Platform', jobtitle: 'CEO & Founder', phone: '+91-9876543227', lifecyclestage: 'customer' },
  { firstname: 'Ritesh', lastname: 'Agarwal', email: 'ritesh@oyo.rooms', company: 'OYO Rooms Tech', jobtitle: 'CEO', phone: '+91-9876543228', lifecyclestage: 'customer' },
  { firstname: 'Kunal', lastname: 'Shah', email: 'kunal.shah@cred.club', company: 'CRED Financial', jobtitle: 'CEO & Founder', phone: '+91-9876543229', lifecyclestage: 'customer' },
]

// Deal stages with different risk levels
const dealStages = [
  { stage: 'closedlost', amount: '0', daysOffset: -30 },          // churned
  { stage: 'contractsent', amount: '145000', daysOffset: 25 },    // renewal soon
  { stage: 'decisionmakerboughtin', amount: '240000', daysOffset: 55 },
  { stage: 'contractsent', amount: '95000', daysOffset: 9 },      // very soon
  { stage: 'qualifiedtobuy', amount: '88000', daysOffset: 44 },
  { stage: 'qualifiedtobuy', amount: '98000', daysOffset: 55 },
  { stage: 'appointmentscheduled', amount: '76000', daysOffset: 68 },
  { stage: 'closedwon', amount: '210000', daysOffset: 90 },
  { stage: 'contractsent', amount: '180000', daysOffset: 21 },
  { stage: 'decisionmakerboughtin', amount: '240000', daysOffset: 58 },
  { stage: 'closedlost', amount: '0', daysOffset: -10 },
  { stage: 'closedwon', amount: '320000', daysOffset: 95 },
  { stage: 'contractsent', amount: '145000', daysOffset: 44 },
  { stage: 'appointmentscheduled', amount: '112000', daysOffset: 72 },
  { stage: 'contractsent', amount: '68000', daysOffset: 18 },
  { stage: 'closedwon', amount: '52000', daysOffset: 120 },
  { stage: 'qualifiedtobuy', amount: '89000', daysOffset: 35 },
  { stage: 'presentationscheduled', amount: '134000', daysOffset: 48 },
  { stage: 'contractsent', amount: '78000', daysOffset: 15 },
  { stage: 'closedwon', amount: '156000', daysOffset: 85 },
]

async function createContact(props) {
  const res = await hs.post('/crm/v3/objects/contacts', { properties: props })
  return res.data.id
}

async function createDeal(contactId, dealData) {
  const closeDate = new Date()
  closeDate.setDate(closeDate.getDate() + dealData.daysOffset)

  const dealRes = await hs.post('/crm/v3/objects/deals', {
    properties: {
      dealname: `${dealData.contactName} - Renewal ${new Date().getFullYear()}`,
      dealstage: dealData.stage,
      amount: dealData.amount,
      closedate: closeDate.toISOString().split('T')[0],
      pipeline: 'default',
    }
  })
  const dealId = dealRes.data.id

  // Associate deal with contact
  await hs.put(`/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`)
  return dealId
}

async function main() {
  console.log('🚀 Seeding HubSpot with 20 real customers...\n')

  let created = 0
  let skipped = 0

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i]
    const deal = dealStages[i]

    try {
      process.stdout.write(`  Creating ${contact.firstname} ${contact.lastname}... `)

      const contactId = await createContact(contact)
      await createDeal(contactId, { ...deal, contactName: `${contact.firstname} ${contact.lastname}` })

      console.log(`✅ (ID: ${contactId})`)
      created++

      // Rate limit: 100ms between requests
      await new Promise(r => setTimeout(r, 150))

    } catch (err) {
      if (err.response?.status === 409) {
        console.log(`⚠️  Already exists (skipped)`)
        skipped++
      } else {
        console.log(`❌ Error: ${err.response?.data?.message || err.message}`)
      }
    }
  }

  console.log(`\n✅ Done! Created: ${created}, Skipped: ${skipped}`)
  console.log('Now run: POST /api/sync/hubspot to fetch and analyze all customers')
}

main().catch(console.error)
