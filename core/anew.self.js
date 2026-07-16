// EANEW - Self-aware email processing loop
// Fixed: FIX A & FIX B from task

import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY
const BRAIN_URL = process.env.MEMORY_BANK_URL || process.env.AIBE_BRAIN_URL || 'http://brain:3002'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// FIX B: Echo filter - check if from_email appears in any EANEW bead within last hour
// ⬡B:eanew:WIRE:funneled_to_one_bank:20260716⬡ Table and schema from env, legacy defaults.
var BEAD_TBL = process.env.BEAD_TABLE || 'aibe_brain'; // funnel: one department, one bank
var BR_SCHEMA = process.env.BRAIN_SCHEMA || BR_SCHEMA;

async function echoFilter(fromEmail) {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  
  const { data, error } = await supabase
    .from('brain')
    .select('content')
    .eq('agent_global', 'EANEW')
    .gte('created_at', oneHourAgo)
    .like('content', `%${fromEmail}%`)
    
  if (error) {
    console.error('Echo filter query error:', error)
    return false
  }
  
  if (data && data.length > 0) {
    console.log(`Echo detected: ${fromEmail} found in recent EANEW beads`)
    // Stamp ECHO_DROPPED
    await fetch(`${BRAIN_URL}/rest/v1/aibe_brain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stamp_type: 'ECHO_DROPPED',
        agent_global: 'EANEW',
        summary: `Echo filtered: ${fromEmail}`,
        content: `Filtered duplicate from ${fromEmail}`
      })
    })
    return true
  }
  
  return false
}

// FIX A: Write LOGFUL to brain instead of sending email unless action is SEND_EMAIL
async function writeLogfulToBrain(subject, deliberationText, action) {
  const payload = {
    stamp_type: 'LOGFUL',
    agent_global: 'EANEW',
    summary: `[EANEW] processed inbound: ${subject}`,
    content: deliberationText
  }
  
  return await fetch(`${BRAIN_URL}/rest/v1/aibe_brain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

// Main processing loop
export async function processInbound(inboundEmail) {
  const { from, subject, body } = inboundEmail
  
  // FIX B: Apply echo filter
  const isEcho = await echoFilter(from)
  if (isEcho) {
    console.log(`Dropped echo from ${from}`)
    return { status: 'echo_dropped' }
  }
  
  // Generate deliberation text (simulated - actual generation would call LLM)
  const deliberationText = await generateDeliberation(from, subject, body)
  
  // FIX A: Parse action from deliberation
  let action = 'NONE'
  try {
    const parsed = JSON.parse(deliberationText)
    if (parsed.action) {
      action = parsed.action
    }
  } catch {
    // If not JSON, default to NONE
  }
  
  // Write LOGFUL to brain FIRST (always)
  await writeLogfulToBrain(subject, deliberationText, action)
  
  // Only send email if action explicitly says SEND_EMAIL
  if (action === 'SEND_EMAIL') {
    // Extract the actual email content from deliberation
    let emailContent = deliberationText
    try {
      const parsed = JSON.parse(deliberationText)
      if (parsed.emailContent) {
        emailContent = parsed.emailContent
      }
    } catch {
      // use raw deliberation
    }
    
    console.log(`Sending email reply to ${from}`)
    // Send via Nylas or your email service
    await sendEmailViaNylas(from, subject, emailContent)
  } else {
    console.log(`Action is ${action}, not sending email. Written to brain instead.`)
  }
  
  return { status: 'processed', action }
}

// Stub for deliberation generation (would call LLM)
async function generateDeliberation(from, subject, body) {
  // In reality, call LLM and return deliberation text
  return `{"action":"NONE","emailContent":"No action required"}`
}

// Stub for email sending via Nylas
async function sendEmailViaNylas(to, subject, body) {
  // In reality, use Nylas API
  console.log(`Sent email to ${to}: ${subject}`)
}

// Startup: listen for inbound emails (simulated)
setInterval(async () => {
  // In production, this would be a webhook or polling
  const mockInbound = {
    from: 'test@example.com',
    subject: 'Test',
    body: 'Hello'
  }
  await processInbound(mockInbound)
}, 300000) // Run every 5 minutes for testing

console.log('EANEW self-aware loop started with FIX A and FIX B enabled')