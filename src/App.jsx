import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { jsPDF } from 'jspdf'

const FREE_GENERATIONS_LIMIT = 6
const USAGE_STORAGE_KEY = 'coldmailai_usage_count'
const UNLOCK_STORAGE_KEY = 'coldmailai_unlocked'
const SAVED_EMAILS_STORAGE_KEY = 'coldmailai_saved_emails'
const MAX_SAVED_EMAILS = 20
const SAVED_EMAILS_WARN_AT = 18
const VALID_UNLOCK_CODE = 'COLDMAIL2024'
const GUMROAD_LINK = 'https://garell.gumroad.com/l/cfjno' // Replace with your Gumroad product URL

const INPUT_TEXTAREA_MAX_CHARS = 200

const LOADING_MESSAGES = [
  'Analyzing your target...',
  'Crafting your hook...',
  'Writing personalized version...',
  'Polishing the follow-up...',
  'Almost ready...',
]

const LOADING_MESSAGE_INTERVAL_MS = 1500
const LOADING_FADE_MS = 300
const RESULTS_SECTION_FADE_MS = 500

function getStoredUsage() {
  try {
    const n = parseInt(localStorage.getItem(USAGE_STORAGE_KEY) || '0', 10)
    return Number.isNaN(n) ? 0 : Math.max(0, n)
  } catch {
    return 0
  }
}

function setStoredUsage(count) {
  try {
    localStorage.setItem(USAGE_STORAGE_KEY, String(count))
  } catch {
    // ignore storage errors (e.g. private mode)
  }
}

const LIMIT_MODAL_DISMISSED_KEY = 'coldmailai_limit_modal_dismissed'

function getLimitModalDismissed() {
  try {
    return localStorage.getItem(LIMIT_MODAL_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

function setLimitModalDismissedStored(value) {
  try {
    if (value) localStorage.setItem(LIMIT_MODAL_DISMISSED_KEY, 'true')
    else localStorage.removeItem(LIMIT_MODAL_DISMISSED_KEY)
  } catch {
    // ignore
  }
}

function getStoredUnlocked() {
  try {
    return localStorage.getItem(UNLOCK_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function setStoredUnlocked(value) {
  try {
    localStorage.setItem(UNLOCK_STORAGE_KEY, value ? 'true' : 'false')
  } catch {
    // ignore
  }
}

function parseSavedEmailsList(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.savedAt === 'number' &&
        item.email &&
        typeof item.email.title === 'string' &&
        item.inputs &&
        typeof item.inputs === 'object',
    )
  } catch {
    return []
  }
}

function readSavedEmailsFromStorage() {
  try {
    const list = parseSavedEmailsList(localStorage.getItem(SAVED_EMAILS_STORAGE_KEY))
    return list.slice(0, MAX_SAVED_EMAILS)
  } catch {
    return []
  }
}

function writeSavedEmailsToStorage(list) {
  try {
    localStorage.setItem(SAVED_EMAILS_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SAVED_EMAILS)))
  } catch {
    // ignore
  }
}

function formatSavedAt(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return ''
  }
}

const INDUSTRY_OPTIONS = [
  'SaaS/Tech',
  'Agency',
  'eCommerce',
  'Real Estate',
  'Finance',
  'Healthcare',
  'Recruitment',
  'Coaching',
  'Other',
]

const EXAMPLE_SCENARIOS = [
  {
    id: 'freelance-designer',
    label: 'Freelance Designer',
    nameAndOffer:
      'Jordan Kim, freelance product & brand designer — I help SaaS and DTC teams ship landing pages, onboarding flows, and lightweight design systems in focused 2–3 week engagements.',
    targetAndRole: 'Northwind Analytics, VP of Marketing',
    goal: 'Book a Call',
  },
  {
    id: 'saas-founder',
    label: 'SaaS Founder',
    nameAndOffer:
      'Alex Rivera, founder of OutboundSync — outbound sales automation that plugs into your CRM: sequences, reply detection, and pipeline reporting for lean sales teams.',
    targetAndRole: 'Sterling Freight Co., Director of Sales Operations',
    goal: 'Request a Demo',
  },
  {
    id: 'recruitment-agency',
    label: 'Recruitment Agency',
    nameAndOffer:
      'Sam Okonkwo, TechMatch Recruiting — we place senior engineers and product leaders for funded startups; typical time-to-hire is about 35 days with a replacement guarantee.',
    targetAndRole: 'Horizon Biotech, Head of Talent',
    goal: 'Book a Call',
  },
  {
    id: 'marketing-consultant',
    label: 'Marketing Consultant',
    nameAndOffer:
      'Riley Patel, B2B growth marketing consultant — paid LinkedIn and Google campaigns, landing page experiments, and attribution so Series A–C SaaS teams know what drives pipeline.',
    targetAndRole: 'Cipher Security, VP of Demand Generation',
    goal: 'Get a Reply',
  },
  {
    id: 'ecommerce-brand',
    label: 'eCommerce Brand',
    nameAndOffer:
      'Casey Morales, co-founder of Wildthread Co. — sustainable apparel DTC; retention email flows, SMS, and loyalty offers aimed at lifting repeat purchase rate and LTV.',
    targetAndRole: 'Urban Outpost Retail, Senior Buyer',
    goal: 'Pitch a Deal',
  },
]

/** Label + system-prompt line: "Write in a [tone] tone — ..." */
const TONE_OPTIONS = [
  {
    label: 'Professional',
    promptLine:
      'Write in a professional tone — polished, clear, and business-appropriate; confident without slang or fluff.',
  },
  {
    label: 'Conversational',
    promptLine:
      'Write in a conversational tone — natural and human, like a peer talking to a peer, not a stiff template.',
  },
  {
    label: 'Bold',
    promptLine:
      'Write in a bold tone — direct, confident, and opinionated; strong hooks and clear asks without being rude.',
  },
  {
    label: 'Friendly',
    promptLine:
      'Write in a friendly tone — warm, personable, and genuinely helpful; likable and easy to read without sounding fake.',
  },
]

const EMAIL_CARD_KEYS = [
  { key: 'short_email', title: 'Short Email' },
  { key: 'personalized_email', title: 'Personalized Email' },
  { key: 'follow_up_email', title: 'Follow-Up Email' },
]

/** API JSON keys for subject lines (per email slot, same order as EMAIL_CARD_KEYS) */
const SUBJECT_JSON_KEYS = ['subject_short', 'subject_personalized', 'subject_followup']

const COPY_ALL_SECTION_HEADERS = [
  'EMAIL 1 - SHORT',
  'EMAIL 2 - PERSONALIZED',
  'EMAIL 3 - FOLLOW UP',
]

function formatSingleEmailForClipboard(email) {
  return email.subject
    ? `Subject: ${email.subject}\n\n${email.body}`
    : email.body
}

function buildCopyAllEmailsText(emails) {
  return COPY_ALL_SECTION_HEADERS.map((header, i) => {
    const email = emails[i]
    const block = email ? formatSingleEmailForClipboard(email) : ''
    return `${header}:\n${block}`
  }).join('\n\n')
}

function countWords(text) {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

function emailLocalPartFromName(name) {
  const s = (name || 'you').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
  return s || 'you'
}

function buildInboxPreviewPlainText(fromLine, toLine, subject, body) {
  return `From: ${fromLine}\nTo: ${toLine}\nSubject: ${subject}\n\n${body}`
}

function buildPdfFilename(targetAndRole) {
  const segment = (targetAndRole || '')
    .split(',')[0]
    .trim()
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48)
  const safe = segment || 'Target'
  const date = new Date().toISOString().slice(0, 10)
  return `ColdMailAI-${safe}-${date}.pdf`
}

/** @param {{ nameAndOffer: string, targetAndRole: string, goal: string, industry: string, tone: string, emails: { title: string, subject: string, body: string }[], appUrl: string }} params */
function generateColdMailPdf(params) {
  const { nameAndOffer, targetAndRole, goal, industry, tone, emails, appUrl } = params
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const m = 18
  const maxW = pageW - 2 * m
  let y = m

  function newPage() {
    doc.addPage()
    y = m
  }

  function check(h) {
    if (y + h > pageH - 12) newPage()
  }

  function textBlock(str, size, opt = {}) {
    const { bold = false, color = [15, 23, 42] } = opt
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(color[0], color[1], color[2])
    const lines = doc.splitTextToSize(String(str ?? ''), maxW)
    const lh = size * 0.52
    for (const line of lines) {
      check(lh + 1)
      doc.text(line, m, y)
      y += lh
    }
  }

  function space(mm) {
    y += mm
  }

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageW, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('ColdMailAI', m, 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('AI Cold Email Generator', m, 17)
  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(0.35)
  doc.line(m, 20.5, pageW - m, 20.5)
  y = 29

  doc.setTextColor(15, 23, 42)
  textBlock('Your inputs', 11, { bold: true, color: [37, 99, 235] })
  space(2)

  const fields = [
    ['Name & what you offer', nameAndOffer],
    ['Target company & role', targetAndRole],
    ['Goal', goal],
    ['Industry', industry],
    ['Tone', tone],
  ]
  for (const [label, value] of fields) {
    textBlock(label, 8.5, { bold: true, color: [100, 116, 139] })
    space(1)
    textBlock(value || '—', 10, { color: [30, 41, 59] })
    space(3)
  }

  space(2)
  textBlock('Generated emails', 11, { bold: true, color: [37, 99, 235] })
  space(3)

  for (const email of emails) {
    textBlock(email.title, 10.5, { bold: true, color: [29, 78, 216] })
    space(1)
    if (email.subject?.trim()) {
      textBlock(`Subject: ${email.subject.trim()}`, 9.5, { color: [146, 64, 14] })
      space(2)
    }
    textBlock(email.body || '', 10, { color: [30, 41, 59] })
    space(5)
  }

  check(10)
  doc.setDrawColor(203, 213, 225)
  doc.line(m, y, pageW - m, y)
  space(4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  const footerText = `Generated with ColdMailAI · ${appUrl}`
  const fLines = doc.splitTextToSize(footerText, maxW)
  const flh = 7.5 * 0.52
  for (const line of fLines) {
    check(flh + 1)
    doc.text(line, m, y)
    y += flh
  }

  doc.save(buildPdfFilename(targetAndRole))
}

const PLACEHOLDER_EMAILS = [
  {
    title: 'Short Email',
    subject: 'Quick question on [topic] at [Company]',
    body: 'Hi [Name], I\'m [Your Name] and I help companies like [Company] achieve [benefit]. Would you be open to a quick 15-minute call this week to explore if we\'re a fit? Best, [Your Name]',
  },
  {
    title: 'Personalized Email',
    subject: 'Idea for [Company] after [recent milestone]',
    body: 'Hi [Name], I noticed [Company] has been [recent achievement/trend]. As someone who specializes in [your offer], I\'ve helped similar companies [specific outcome]. I\'d love to share one idea that could [relevant benefit]. Are you available for a brief call on [timeframe]? Regards, [Your Name]',
  },
  {
    title: 'Follow-Up Email',
    subject: 'Still on your radar?',
    body: 'Hi [Name], I wanted to follow up on my previous message about [topic]. I understand you\'re busy—if now isn\'t the right time, no problem. I\'ll check back in [timeframe]. In the meantime, here\'s a [resource] that might be useful. Best, [Your Name]',
  },
]

const SYSTEM_PROMPT = `You are an expert cold email copywriter. Write cold emails that are direct, personal, and have high reply rates. Never use generic openers like I hope this finds you well. Always lead with value or a specific pain point.

For every email, write a compelling, specific subject line in the matching subject_* field. Subjects should feel human and relevant to the target—never empty, never a single vague word like "Hello" or "Introduction."

CRITICAL — Sender name vs product: The sender is a real person with a separate product or service. The sender's personal first name must appear in the sign-off and may appear in the body; the product/business name must NEVER replace the person's name anywhere. Never sign off with the product name or "Team" — only the sender's first name (e.g. "Best," then "Garell" on the next line). In the body, reference the person by their first name where natural and describe the product/service separately.

Email 1 (short): Use a specific, conversational CTA such as "Open to a quick 12-minute call this week?" — not "Worth a 15-minute call?" or similar.

Email 2 (personalized): For social proof, use a specific, believable line like "I've helped a handful of founders in the SaaS space cut their outreach time in half using this same approach" — never vague phrases like "A few networks similar to yours are using [product name]."

Email 3 (follow-up): Do NOT use "wanted to bump this up," "wanted to float this up," or any automated-sequence opener. Use a human opener such as "Still thinking about whether this makes sense for you —" so it feels like a real person following up, not a sequence.`

function getTonePromptLine(toneLabel) {
  const found = TONE_OPTIONS.find((t) => t.label === toneLabel)
  return (found ?? TONE_OPTIONS[1]).promptLine
}

function buildSystemPromptWithTone(toneLabel) {
  return `${SYSTEM_PROMPT}\n\n${getTonePromptLine(toneLabel)}`
}

/** Parses "Your Name & What You Offer" into personal name and product/service. Format: "Name, What you offer" (first comma separates them). */
function parseNameAndOffer(input) {
  const trimmed = (input || '').trim()
  const commaIndex = trimmed.indexOf(',')
  if (commaIndex === -1) {
    return { senderName: trimmed || 'Sender', senderOffer: trimmed || 'their product/service' }
  }
  return {
    senderName: trimmed.slice(0, commaIndex).trim() || 'Sender',
    senderOffer: trimmed.slice(commaIndex + 1).trim() || 'their product/service',
  }
}

function buildUserMessage(senderName, senderOffer, targetAndRole, goal, industry) {
  return `Generate 3 cold emails for the following situation:

SENDER'S PERSONAL NAME (use for opening, in-body reference, and sign-off — sign off with first name only): ${senderName}
SENDER'S PRODUCT OR SERVICE (describe/reference this separately in the body, not as a business name): ${senderOffer}

TARGET: ${targetAndRole}
GOAL: ${goal}
INDUSTRY CONTEXT: ${industry}
Use industry-appropriate pain points, terminology, benchmarks, and references for this sector so the emails sound credible to the reader. Stay accurate—do not invent fake stats or name-drop unrelated industries.

Return ONLY a JSON object with these keys (all string values, no markdown):
- subject_short, short_email (body)
- subject_personalized, personalized_email (body)
- subject_followup, follow_up_email (body)
Every email must sign off with only the sender's first name (e.g. "Best," then "${senderName.split(/\s+/)[0] || senderName}" on the next line).`
}

function parseEmailJson(raw) {
  let str = raw.trim()
  const jsonMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) str = jsonMatch[1].trim()
  return JSON.parse(str)
}

async function generateEmails(nameAndOffer, targetAndRole, goal, toneLabel, industry) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: buildSystemPromptWithTone(toneLabel),
      messages: [
        { role: 'user', content: buildUserMessage(senderName, senderOffer, targetAndRole, goal, industry) },
      ],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    let message = `API error: ${res.status} ${res.statusText}`
    try {
      const data = JSON.parse(errBody)
      if (data.error?.message) message = data.error.message
    } catch {
      if (errBody) message += ` — ${errBody.slice(0, 200)}`
    }
    throw new Error(message)
  }

  const data = await res.json()
  const content = data.content
  if (!content?.length || content[0].type !== 'text') {
    throw new Error('Invalid response format from API')
  }
  const text = content[0].text
  const parsed = parseEmailJson(text)

  return EMAIL_CARD_KEYS.map(({ key, title }, i) => {
    const subjectNewKey = SUBJECT_JSON_KEYS[i]
    const subjectLegacyKey = `${key}_subject`
    let subject = ''
    if (typeof parsed[subjectNewKey] === 'string') subject = parsed[subjectNewKey]
    else if (typeof parsed[subjectLegacyKey] === 'string') subject = parsed[subjectLegacyKey]
    return {
      title,
      subject,
      body: typeof parsed[key] === 'string' ? parsed[key] : '',
    }
  })
}

const SHORT_VARIANT_SYSTEM_APPEND = `VARIANT TASK: Output only three alternative SHORT cold emails (first-touch length, comparable to a "short email" in a sequence). Each variant must use a completely different opening angle and hook from the others—no recycled sentences or parallel structure across variants. Obey all sender sign-off and person-vs-product rules from the main instructions above.`

const REENGAGE_EMAIL_CARDS = [
  { key: 'curiosity_bump', title: 'Curiosity Bump' },
  { key: 'value_update', title: 'Value Update' },
  { key: 'easy_out', title: 'Easy Out' },
]
const REENGAGE_SUBJECT_KEYS = ['curiosity_bump_subject', 'value_update_subject', 'easy_out_subject']

const SHORT_VARIANT_SLOTS = [
  {
    angleLabel: 'Question opener',
    description: 'Opens with a sharp, specific question that earns a reply and leads into your offer.',
    subjectKey: 'variant_question_subject',
    bodyKey: 'variant_question_body',
  },
  {
    angleLabel: 'Stat or insight',
    description: 'Opens with a credible stat, pattern, or industry insight; do not invent fake numbers—use ranges or qualitative insight if needed.',
    subjectKey: 'variant_stat_subject',
    bodyKey: 'variant_stat_body',
  },
  {
    angleLabel: 'Compliment → pivot',
    description: 'Opens with a specific, believable compliment (no generic praise), then pivots to why you are reaching out.',
    subjectKey: 'variant_compliment_subject',
    bodyKey: 'variant_compliment_body',
  },
]

function buildShortVariantsUserMessage(senderName, senderOffer, targetAndRole, goal, industry) {
  const first = senderName.split(/\s+/)[0] || senderName
  return `Generate three NEW alternative versions of the SHORT cold email only (the concise first-touch email). Same sales context as the user's main generation, but each version must use a totally different hook:

CONTEXT
SENDER PERSONAL NAME (sign off with first name only): ${senderName}
SENDER PRODUCT OR SERVICE: ${senderOffer}
TARGET: ${targetAndRole}
GOAL: ${goal}
INDUSTRY CONTEXT: ${industry}

VARIANT 1 — QUESTION OPENER: Lead with a thoughtful, specific question; no rhetorical filler.
VARIANT 2 — STAT OR INSIGHT: Lead with a credible stat, trend, or insight; then bridge to the ask.
VARIANT 3 — COMPLIMENT THEN PIVOT: Lead with a concrete compliment about the person or company, then pivot—no hollow flattery.

Return ONLY a JSON object (all string values, no markdown) with exactly these keys:
- variant_question_subject, variant_question_body
- variant_stat_subject, variant_stat_body
- variant_compliment_subject, variant_compliment_body

Each body must sign off with only the sender's first name (e.g. "Best," then "${first}" on the next line).`
}

function parseShortVariantsFromResponse(parsed) {
  return SHORT_VARIANT_SLOTS.map((slot) => ({
    angleLabel: slot.angleLabel,
    description: slot.description,
    subject: typeof parsed[slot.subjectKey] === 'string' ? parsed[slot.subjectKey] : '',
    body: typeof parsed[slot.bodyKey] === 'string' ? parsed[slot.bodyKey] : '',
  }))
}

async function generateShortEmailVariants(nameAndOffer, targetAndRole, goal, toneLabel, industry) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const system = `${buildSystemPromptWithTone(toneLabel)}\n\n${SHORT_VARIANT_SYSTEM_APPEND}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1200,
      system,
      messages: [
        {
          role: 'user',
          content: buildShortVariantsUserMessage(senderName, senderOffer, targetAndRole, goal, industry),
        },
      ],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    let message = `API error: ${res.status} ${res.statusText}`
    try {
      const data = JSON.parse(errBody)
      if (data.error?.message) message = data.error.message
    } catch {
      if (errBody) message += ` — ${errBody.slice(0, 200)}`
    }
    throw new Error(message)
  }

  const data = await res.json()
  const content = data.content
  if (!content?.length || content[0].type !== 'text') {
    throw new Error('Invalid response format from API')
  }
  const text = content[0].text
  const parsed = parseEmailJson(text)
  return parseShortVariantsFromResponse(parsed)
}

async function generateReengageEmails(nameAndOffer, reengageName, reengageCompany, reengageTopic, reengageLastContact, reengageReason, toneLabel, industry) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const first = senderName.split(/\s+/)[0] || senderName
  const userMessage = `Generate 3 re-engagement cold emails for the following situation:

SENDER'S PERSONAL NAME (sign off with first name only): ${senderName}
SENDER'S PRODUCT OR SERVICE: ${senderOffer}
PROSPECT NAME: ${reengageName}
PROSPECT COMPANY: ${reengageCompany}
ORIGINAL OUTREACH TOPIC: ${reengageTopic}
HOW LONG AGO LAST CONTACT: ${reengageLastContact || 'a while ago'}
WHY REACHING BACK OUT: ${reengageReason || 'checking in'}
INDUSTRY CONTEXT: ${industry}

Generate three distinct re-engagement email styles:

EMAIL 1 — CURIOSITY BUMP: A short, intriguing follow-up that sparks curiosity. Reference the previous conversation naturally. Keep it brief and open-ended to invite a reply.

EMAIL 2 — VALUE UPDATE: Provide a new piece of value, insight, or update relevant to their situation since the last conversation. Make it genuinely useful, not just a check-in.

EMAIL 3 — EASY OUT: Give them an easy way to say no or close the loop, but frame it in a way that makes replying feel low-effort. Sometimes this honesty gets a reply.

Return ONLY a JSON object with these keys (all string values, no markdown):
- curiosity_bump_subject, curiosity_bump (body)
- value_update_subject, value_update (body)
- easy_out_subject, easy_out (body)
Every email must sign off with only the sender's first name (e.g. "Best," then "${first}" on the next line).`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: buildSystemPromptWithTone(toneLabel),
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    let message = `API error: ${res.status} ${res.statusText}`
    try {
      const data = JSON.parse(errBody)
      if (data.error?.message) message = data.error.message
    } catch {
      if (errBody) message += ` — ${errBody.slice(0, 200)}`
    }
    throw new Error(message)
  }

  const data = await res.json()
  const content = data.content
  if (!content?.length || content[0].type !== 'text') {
    throw new Error('Invalid response format from API')
  }
  const text = content[0].text
  const parsed = parseEmailJson(text)

  return REENGAGE_EMAIL_CARDS.map(({ key, title }, i) => {
    const subjectKey = REENGAGE_SUBJECT_KEYS[i]
    return {
      title,
      subject: typeof parsed[subjectKey] === 'string' ? parsed[subjectKey] : '',
      body: typeof parsed[key] === 'string' ? parsed[key] : '',
    }
  })
}

function StarBookmarkIcon({ filled }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

/** Gray = empty, yellow = 1–49 chars, green = 50+ chars (trimmed length). */
function fieldFillDotClass(trimmedLength) {
  if (trimmedLength === 0) return 'bg-slate-500'
  if (trimmedLength < 50) return 'bg-yellow-400'
  return 'bg-green-500'
}

const FORM_PROGRESS_BY_FILLED = [0, 33, 66, 100]

function TextareaCharFooter({ length, max, hint, hintMinLength = 20 }) {
  const remaining = max - length
  const isOver = length > max
  const atOrPastLimit = length >= max
  const isLow = remaining > 0 && remaining < 20
  const showHint = typeof hint === 'string' && hint.length > 0 && length < hintMinLength

  let counterClass = 'text-xs block tabular-nums text-slate-500'
  if (atOrPastLimit) {
    counterClass = 'text-xs block tabular-nums text-red-400 font-bold'
  } else if (isLow) {
    counterClass = 'text-xs block tabular-nums text-orange-400'
  }

  return (
    <div className="mt-1 space-y-1">
      <span className={counterClass} aria-live="polite">
        {length} / {max} characters
      </span>
      {showHint && (
        <p className="text-xs text-slate-500 italic" aria-live="polite">
          {hint}
        </p>
      )}
      {isOver && (
        <p className="text-xs text-slate-400" role="status">
          Shorter inputs = better emails
        </p>
      )}
    </div>
  )
}

function App() {
  const [nameAndOffer, setNameAndOffer] = useState('')
  const [targetAndRole, setTargetAndRole] = useState('')
  const [goal, setGoal] = useState('Book a Call')
  const [industry, setIndustry] = useState('Other')
  const [tone, setTone] = useState('Conversational')
  const [emails, setEmails] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [copiedSubjectIndex, setCopiedSubjectIndex] = useState(null)
  const [usageCount, setUsageCount] = useState(getStoredUsage)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [limitModalDismissed, setLimitModalDismissed] = useState(getLimitModalDismissed)
  const [unlocked, setUnlocked] = useState(getStoredUnlocked)
  const [showUnlockInput, setShowUnlockInput] = useState(false)
  const [unlockCodeInput, setUnlockCodeInput] = useState('')
  const [unlockCodeError, setUnlockCodeError] = useState('')
  const [showCopyAllToast, setShowCopyAllToast] = useState(false)
  const copyAllToastTimerRef = useRef(null)
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)
  const [loadingMsgOpacity, setLoadingMsgOpacity] = useState(1)
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false)
  const [resultsSectionVisible, setResultsSectionVisible] = useState(true)
  const [resultsSectionExiting, setResultsSectionExiting] = useState(false)
  const [emailCardBodies, setEmailCardBodies] = useState(() => PLACEHOLDER_EMAILS.map((e) => e.body))
  const [emailCardOriginalBodies, setEmailCardOriginalBodies] = useState(() =>
    PLACEHOLDER_EMAILS.map((e) => e.body),
  )
  const [emailCardSubjects, setEmailCardSubjects] = useState(() => PLACEHOLDER_EMAILS.map((e) => e.subject ?? ''))
  const [emailCardOriginalSubjects, setEmailCardOriginalSubjects] = useState(() =>
    PLACEHOLDER_EMAILS.map((e) => e.subject ?? ''),
  )
  const [savedEmails, setSavedEmails] = useState(readSavedEmailsFromStorage)
  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false)
  const [savedSortNewestFirst, setSavedSortNewestFirst] = useState(true)
  const [bookmarkFlashIndex, setBookmarkFlashIndex] = useState(null)
  const [saveLimitToast, setSaveLimitToast] = useState(false)
  const bookmarkFlashTimerRef = useRef(null)
  const bookmarkSaveBlockedRef = useRef(false)
  const [shortVariants, setShortVariants] = useState(null)
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [variantsError, setVariantsError] = useState(null)
  const [variantsExpanded, setVariantsExpanded] = useState(true)
  const [variantCopiedIndex, setVariantCopiedIndex] = useState(null)
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem('coldmailai_theme')
      if (stored === 'light' || stored === 'dark') return stored
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })
  const [appMode, setAppMode] = useState('generate')
  const [reengageName, setReengageName] = useState('')
  const [reengageCompany, setReengageCompany] = useState('')
  const [reengageTopic, setReengageTopic] = useState('')
  const [reengageLastContact, setReengageLastContact] = useState('')
  const [reengageReason, setReengageReason] = useState('')
  const [savedCardIds, setSavedCardIds] = useState([null, null, null])
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [pendingAutoGenerate, setPendingAutoGenerate] = useState(false)
  const [inboxPreviewIndex, setInboxPreviewIndex] = useState(null)
  const [inboxPreviewCopied, setInboxPreviewCopied] = useState(false)
  const inboxPreviewCopyTimerRef = useRef(null)
  const [exampleMenuOpen, setExampleMenuOpen] = useState(false)
  const exampleMenuRef = useRef(null)

  const sortedSavedEmails = useMemo(() => {
    const arr = [...savedEmails]
    arr.sort((a, b) => (savedSortNewestFirst ? b.savedAt - a.savedAt : a.savedAt - b.savedAt))
    return arr
  }, [savedEmails, savedSortNewestFirst])

  const usageRemaining = Math.max(0, FREE_GENERATIONS_LIMIT - usageCount)
  const atFreeLimit = !unlocked && usageCount >= FREE_GENERATIONS_LIMIT
  const showPersistentLimitBanner = atFreeLimit && limitModalDismissed && !showUpgradeModal
  const blurContentForPaywall = showUpgradeModal && !unlocked
  const reengageAllFilled =
    nameAndOffer.trim() !== '' &&
    reengageName.trim() !== '' &&
    reengageCompany.trim() !== '' &&
    reengageTopic.trim() !== ''
  const allFilled = appMode === 'reengage' ? reengageAllFilled : (nameAndOffer.trim() !== '' && targetAndRole.trim() !== '' && goal.trim() !== '')
  const formFilledCount = appMode === 'reengage'
    ? Math.min(3, [nameAndOffer, reengageName, reengageCompany, reengageTopic, reengageLastContact, reengageReason].filter((s) => s.trim().length > 0).length)
    : [nameAndOffer, targetAndRole, goal].filter((s) => s.trim().length > 0).length
  const formProgressPct = FORM_PROGRESS_BY_FILLED[formFilledCount]
  const formReady = appMode === 'reengage' ? reengageAllFilled : formFilledCount === 3
  const canGenerate = allFilled && !loading && (unlocked || usageRemaining > 0)

  const displayEmails = emails ?? PLACEHOLDER_EMAILS
  const showGeneratedResults = emails !== null

  const inboxPreviewData = useMemo(() => {
    if (inboxPreviewIndex === null) return null
    const email = displayEmails[inboxPreviewIndex]
    if (!email) return null
    const { senderName } = parseNameAndOffer(nameAndOffer)
    const senderDisplay = senderName.trim() || 'You'
    const localPart = emailLocalPartFromName(senderName)
    const fromLine = `${senderDisplay} <${localPart}@email.com>`
    const toLine = targetAndRole.trim() || 'Recipient'
    const subjectLine = (emailCardSubjects[inboxPreviewIndex] ?? email.subject ?? '').trim() || 'No subject yet'
    const body = emailCardBodies[inboxPreviewIndex] ?? email.body ?? ''
    return {
      fromLine,
      toLine,
      subject: subjectLine,
      body,
      title: email.title,
      senderDisplay,
      senderInitial: senderDisplay.charAt(0).toUpperCase(),
    }
  }, [inboxPreviewIndex, displayEmails, nameAndOffer, targetAndRole, emailCardSubjects, emailCardBodies])

  useEffect(() => {
    if (!loading) {
      setLoadingMsgIndex(0)
      setLoadingMsgOpacity(1)
      return
    }
    setLoadingMsgIndex(0)
    setLoadingMsgOpacity(1)
    let fadeTimeoutId = null
    const intervalId = window.setInterval(() => {
      setLoadingMsgOpacity(0)
      if (fadeTimeoutId != null) window.clearTimeout(fadeTimeoutId)
      fadeTimeoutId = window.setTimeout(() => {
        setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length)
        setLoadingMsgOpacity(1)
        fadeTimeoutId = null
      }, LOADING_FADE_MS)
    }, LOADING_MESSAGE_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
      if (fadeTimeoutId != null) window.clearTimeout(fadeTimeoutId)
    }
  }, [loading])

  useEffect(() => {
    const source = emails ?? PLACEHOLDER_EMAILS
    const bodies = source.map((e) => e.body)
    const subjects = source.map((e) => e.subject ?? '')
    setEmailCardBodies(bodies)
    setEmailCardOriginalBodies(bodies)
    setEmailCardSubjects(subjects)
    setEmailCardOriginalSubjects(subjects)
    setSavedCardIds([null, null, null])
  }, [emails])

  const clearFormAndResults = () => {
    setNameAndOffer('')
    setTargetAndRole('')
    setGoal('Book a Call')
    setIndustry('Other')
    setTone('Conversational')
    setReengageName('')
    setReengageCompany('')
    setReengageTopic('')
    setReengageLastContact('')
    setReengageReason('')
    setEmails(null)
    setError(null)
    setCopiedIndex(null)
    setCopiedSubjectIndex(null)
    setShortVariants(null)
    setVariantsError(null)
    setVariantsLoading(false)
    setVariantCopiedIndex(null)
    setVariantsExpanded(true)
    setSavedCardIds([null, null, null])
    setDeleteConfirmId(null)
    setPendingAutoGenerate(false)
  }

  const handleResultsSectionTransitionEnd = (e) => {
    if (!resultsSectionExiting) return
    if (e.target !== e.currentTarget) return
    if (e.propertyName !== 'opacity') return
    clearFormAndResults()
    setResultsSectionExiting(false)
    setResultsSectionVisible(false)
  }

  const handleStartOverClick = () => {
    setShowStartOverConfirm(true)
  }

  const handleStartOverCancel = () => {
    setShowStartOverConfirm(false)
  }

  const handleStartOverConfirm = () => {
    setShowStartOverConfirm(false)
    if (resultsSectionVisible) {
      setResultsSectionExiting(true)
    } else {
      clearFormAndResults()
    }
  }

  const handleGenerate = async () => {
    if (!unlocked && usageRemaining <= 0) {
      setShowUpgradeModal(true)
      return
    }
    setResultsSectionVisible(true)
    setError(null)
    setLoading(true)
    setEmails(null)
    setShortVariants(null)
    setVariantsError(null)
    setVariantCopiedIndex(null)
    try {
      const result = appMode === 'reengage'
        ? await generateReengageEmails(nameAndOffer, reengageName, reengageCompany, reengageTopic, reengageLastContact, reengageReason, tone, industry)
        : await generateEmails(nameAndOffer, targetAndRole, goal, tone, industry)
      setEmails(result)
      if (!unlocked) {
        const newCount = usageCount + 1
        setUsageCount(newCount)
        setStoredUsage(newCount)
        if (newCount >= FREE_GENERATIONS_LIMIT) {
          setShowUpgradeModal(true)
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
      setEmails(null)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = useCallback((email, index) => {
    const text = formatSingleEmailForClipboard(email)
    navigator.clipboard.writeText(text)
    setCopiedSubjectIndex(null)
    setCopiedIndex(index)
    window.setTimeout(() => setCopiedIndex(null), 2000)
  }, [])

  const handleCopySubject = useCallback((subjectLine, index) => {
    navigator.clipboard.writeText(subjectLine)
    setCopiedIndex(null)
    setCopiedSubjectIndex(index)
    window.setTimeout(() => setCopiedSubjectIndex(null), 2000)
  }, [])

  const handleCopyAll = useCallback(() => {
    const merged = displayEmails.map((e, i) => ({
      ...e,
      subject: emailCardSubjects[i] ?? e.subject,
      body: emailCardBodies[i] ?? e.body,
    }))
    const text = buildCopyAllEmailsText(merged)
    navigator.clipboard.writeText(text)
    setShowCopyAllToast(true)
    if (copyAllToastTimerRef.current) window.clearTimeout(copyAllToastTimerRef.current)
    copyAllToastTimerRef.current = window.setTimeout(() => {
      setShowCopyAllToast(false)
      copyAllToastTimerRef.current = null
    }, 2000)
  }, [displayEmails, emailCardSubjects, emailCardBodies])

  const handleDownloadPdf = useCallback(() => {
    const merged = displayEmails.map((e, i) => ({
      title: e.title,
      subject: emailCardSubjects[i] ?? e.subject ?? '',
      body: emailCardBodies[i] ?? e.body ?? '',
    }))
    generateColdMailPdf({
      nameAndOffer,
      targetAndRole,
      goal,
      industry,
      tone,
      emails: merged,
      appUrl:
        typeof window !== 'undefined' && window.location.origin
          ? window.location.origin
          : 'https://coldmail.ai',
    })
  }, [displayEmails, emailCardSubjects, emailCardBodies, nameAndOffer, targetAndRole, goal, industry, tone])

  const handleRegenerate = () => {
    setEmails(null)
    setError(null)
    setShortVariants(null)
    setVariantsError(null)
    setVariantCopiedIndex(null)
  }

  const handleGenerateVariants = async () => {
    setVariantsError(null)
    setVariantsLoading(true)
    setVariantCopiedIndex(null)
    try {
      const list = await generateShortEmailVariants(nameAndOffer, targetAndRole, goal, tone, industry)
      setShortVariants(list)
      setVariantsExpanded(true)
    } catch (err) {
      setVariantsError(err.message || 'Could not generate variants.')
    } finally {
      setVariantsLoading(false)
    }
  }

  const handleCopyVariant = useCallback((variant, index) => {
    const text = formatSingleEmailForClipboard({ title: variant.angleLabel, subject: variant.subject, body: variant.body })
    navigator.clipboard.writeText(text)
    setCopiedIndex(null)
    setCopiedSubjectIndex(null)
    setVariantCopiedIndex(index)
    window.setTimeout(() => setVariantCopiedIndex(null), 2000)
  }, [])

  const undoEmailCardEdits = (index) => {
    setEmailCardBodies((prev) => {
      const next = [...prev]
      next[index] = emailCardOriginalBodies[index] ?? ''
      return next
    })
  }

  const handleBookmarkCard = useCallback(
    (index) => {
      const existingId = savedCardIds[index]
      if (existingId !== null) {
        setSavedEmails((prev) => {
          const next = prev.filter((e) => e.id !== existingId)
          writeSavedEmailsToStorage(next)
          return next
        })
        setSavedCardIds((prev) => {
          const next = [...prev]
          next[index] = null
          return next
        })
        return
      }
      const email = displayEmails[index]
      const body = emailCardBodies[index] ?? email.body
      const subject = emailCardSubjects[index] ?? email.subject ?? ''
      const wordCount = countWords(body)
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const entry = {
        id: newId,
        savedAt: Date.now(),
        email: { title: email.title, subject, body, wordCount },
        inputs: {
          nameAndOffer,
          targetAndRole,
          goal,
          industry,
          tone,
        },
      }
      bookmarkSaveBlockedRef.current = false
      setSavedEmails((prev) => {
        if (prev.length >= MAX_SAVED_EMAILS) {
          bookmarkSaveBlockedRef.current = true
          return prev
        }
        const next = [entry, ...prev]
        writeSavedEmailsToStorage(next)
        return next
      })
      queueMicrotask(() => {
        if (bookmarkSaveBlockedRef.current) {
          setSaveLimitToast(true)
          window.setTimeout(() => setSaveLimitToast(false), 4000)
          return
        }
        setSavedCardIds((prev) => {
          const next = [...prev]
          next[index] = newId
          return next
        })
      })
    },
    [savedCardIds, displayEmails, emailCardSubjects, emailCardBodies, nameAndOffer, targetAndRole, goal, industry, tone],
  )

  const handleDeleteSavedEmail = useCallback((id) => {
    setSavedEmails((prev) => {
      const next = prev.filter((e) => e.id !== id)
      writeSavedEmailsToStorage(next)
      return next
    })
    setSavedCardIds((prev) => {
      if (!prev.includes(id)) return prev
      return prev.map((savedId) => (savedId === id ? null : savedId))
    })
  }, [])

  const handleRegenerateFromSaved = useCallback((item) => {
    setNameAndOffer(item.inputs.nameAndOffer || '')
    setTargetAndRole(item.inputs.targetAndRole || '')
    setGoal(item.inputs.goal || 'Book a Call')
    setIndustry(item.inputs.industry || 'Other')
    setTone(item.inputs.tone || 'Conversational')
    setAppMode('generate')
    setPendingAutoGenerate(true)
  }, [])

  useEffect(
    () => () => {
      if (bookmarkFlashTimerRef.current) window.clearTimeout(bookmarkFlashTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!pendingAutoGenerate) return
    setPendingAutoGenerate(false)
    handleGenerate()
  }, [pendingAutoGenerate]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseInboxPreview = useCallback(() => {
    setInboxPreviewIndex(null)
    setInboxPreviewCopied(false)
    if (inboxPreviewCopyTimerRef.current) {
      window.clearTimeout(inboxPreviewCopyTimerRef.current)
      inboxPreviewCopyTimerRef.current = null
    }
  }, [])

  const handleCopyInboxPreview = useCallback(() => {
    if (!inboxPreviewData) return
    const text = buildInboxPreviewPlainText(
      inboxPreviewData.fromLine,
      inboxPreviewData.toLine,
      inboxPreviewData.subject,
      inboxPreviewData.body,
    )
    navigator.clipboard.writeText(text)
    setInboxPreviewCopied(true)
    if (inboxPreviewCopyTimerRef.current) window.clearTimeout(inboxPreviewCopyTimerRef.current)
    inboxPreviewCopyTimerRef.current = window.setTimeout(() => {
      setInboxPreviewCopied(false)
      inboxPreviewCopyTimerRef.current = null
    }, 2000)
  }, [inboxPreviewData])

  useEffect(() => {
    if (inboxPreviewIndex === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') handleCloseInboxPreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inboxPreviewIndex, handleCloseInboxPreview])

  useEffect(
    () => () => {
      if (inboxPreviewCopyTimerRef.current) window.clearTimeout(inboxPreviewCopyTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!exampleMenuOpen) return
    const onPointerDown = (e) => {
      const el = exampleMenuRef.current
      if (el && !el.contains(e.target)) setExampleMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setExampleMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [exampleMenuOpen])

  const applyExampleScenario = useCallback((scenario) => {
    setNameAndOffer(scenario.nameAndOffer)
    setTargetAndRole(scenario.targetAndRole)
    setGoal(scenario.goal)
    setExampleMenuOpen(false)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.classList.add('light')
    } else {
      root.classList.remove('light')
    }
    try {
      localStorage.setItem('coldmailai_theme', theme)
    } catch {
      // ignore storage errors
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const dismissPaywallModal = useCallback(() => {
    setLimitModalDismissedStored(true)
    setLimitModalDismissed(true)
    setShowUpgradeModal(false)
    setShowUnlockInput(false)
    setUnlockCodeInput('')
    setUnlockCodeError('')
  }, [])

  const openPaywallModal = useCallback(() => {
    setShowUpgradeModal(true)
  }, [])

  useEffect(() => {
    if (unlocked) return
    if (usageCount < FREE_GENERATIONS_LIMIT) return
    if (getLimitModalDismissed()) return
    setShowUpgradeModal(true)
  }, [unlocked, usageCount])

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans antialiased flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl" aria-hidden="true">✉️</span>
            <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
              ColdMailAI
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 p-2 text-slate-300 hover:bg-slate-700/80 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              title={theme === 'light' ? 'Dark mode' : 'Light mode'}
            >
              {theme === 'light' ? (
                /* Moon — click to go dark */
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                /* Sun — click to go light */
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => setAppMode('saved')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/80 px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-medium text-slate-200 hover:bg-slate-700/80 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <StarBookmarkIcon filled={savedEmails.length > 0} />
              <span className="hidden sm:inline">Saved</span>
              {savedEmails.length > 0 && (
                <span className="tabular-nums rounded-full bg-blue-600/90 px-1.5 py-0.5 text-[11px] font-semibold text-white min-w-[1.25rem] text-center">
                  {savedEmails.length}
                </span>
              )}
            </button>
            {!unlocked && (
              <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                {usageCount === 0 ? (
                  <p className="text-slate-500 text-[11px] sm:text-xs tabular-nums text-right leading-tight max-w-[10rem] sm:max-w-none">
                    Up to {FREE_GENERATIONS_LIMIT} free generations
                  </p>
                ) : (
                  <>
                    <p className="text-slate-500 text-[11px] sm:text-xs tabular-nums text-right leading-tight hidden sm:block">
                      {usageCount} of {FREE_GENERATIONS_LIMIT} free generations used
                    </p>
                    <p className="text-slate-500 text-[11px] tabular-nums sm:hidden">
                      {usageCount}/{FREE_GENERATIONS_LIMIT} used
                    </p>
                  </>
                )}
                {atFreeLimit && (
                  <button
                    type="button"
                    onClick={openPaywallModal}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium whitespace-nowrap"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {showPersistentLimitBanner && (
          <div
            className="border-t border-amber-600/35 bg-amber-950/85 px-4 py-2.5 text-center"
            role="status"
          >
            <p className="text-xs sm:text-sm text-amber-100/95 leading-snug">
              You&apos;ve used all {FREE_GENERATIONS_LIMIT} free generations.{' '}
              <a
                href={GUMROAD_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-amber-300 underline decoration-amber-500/60 underline-offset-2 hover:text-white"
              >
                Upgrade on Gumroad
              </a>
              {' '}for unlimited access — or{' '}
              <button
                type="button"
                onClick={openPaywallModal}
                className="font-semibold text-amber-300 hover:text-white underline decoration-amber-500/60 underline-offset-2"
              >
                view details
              </button>
              .
            </p>
          </div>
        )}
      </header>

      <div
        className={`flex flex-col flex-1 min-h-0 transition-[filter] duration-300 ease-out ${
          blurContentForPaywall ? 'blur-md pointer-events-none select-none' : ''
        }`}
      >
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-12">
        {/* Mode tabs */}
        <div className="flex items-center gap-1 mb-6 sm:mb-8 bg-slate-800/60 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setAppMode('generate')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              appMode === 'generate'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cold Email
          </button>
          <button
            type="button"
            onClick={() => setAppMode('reengage')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              appMode === 'reengage'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Re-engage
          </button>
          <button
            type="button"
            onClick={() => setAppMode('saved')}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              appMode === 'saved'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Saved
            {savedEmails.length > 0 && (
              <span className={`tabular-nums rounded-full px-1.5 py-0.5 text-[11px] font-semibold min-w-[1.25rem] text-center ${
                appMode === 'saved' ? 'bg-blue-500/80 text-white' : 'bg-slate-700 text-slate-200'
              }`}>
                {savedEmails.length}
              </span>
            )}
          </button>
        </div>

        {(appMode === 'generate' || appMode === 'reengage') && (
        <>
        {/* Main card */}
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700/50 p-6 sm:p-8 shadow-xl shadow-black/20">
          <h2 className="text-2xl sm:text-3xl font-semibold text-center text-white mb-3 sm:mb-4">
            {appMode === 'reengage' ? 'Re-engage Email Generator' : 'AI Cold Email Generator'}
          </h2>

          {appMode === 'generate' && (
          <div className="flex justify-center mb-6 sm:mb-8">
            <div className="relative" ref={exampleMenuRef}>
              <button
                type="button"
                onClick={() => setExampleMenuOpen((o) => !o)}
                disabled={loading}
                aria-expanded={exampleMenuOpen}
                aria-haspopup="listbox"
                aria-controls="example-scenarios-list"
                id="load-example-button"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-500/80 bg-slate-700/40 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700/70 hover:text-white hover:border-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Load Example
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 text-slate-400 transition-transform ${exampleMenuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {exampleMenuOpen && (
                <ul
                  id="example-scenarios-list"
                  role="listbox"
                  aria-labelledby="load-example-button"
                  className="absolute left-1/2 z-30 mt-2 w-[min(100vw-2rem,20rem)] -translate-x-1/2 rounded-xl border border-slate-600 bg-slate-800 py-1 shadow-xl shadow-black/40"
                >
                  {EXAMPLE_SCENARIOS.map((scenario) => (
                    <li key={scenario.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700/80 transition-colors focus:outline-none focus:bg-slate-700/80"
                        onClick={() => applyExampleScenario(scenario)}
                      >
                        {scenario.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          )}

          <div className="space-y-5 sm:space-y-6">
            <div>
              <label
                htmlFor="name-offer"
                className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(nameAndOffer.trim().length)}`}
                  aria-hidden="true"
                />
                Your Name & What You Offer
              </label>
              <textarea
                id="name-offer"
                value={nameAndOffer}
                onChange={(e) => setNameAndOffer(e.target.value)}
                placeholder="e.g. Alex, B2B sales automation"
                rows={3}
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-y min-h-[5.5rem] disabled:opacity-60"
                disabled={loading}
              />
              <TextareaCharFooter
                length={nameAndOffer.length}
                max={INPUT_TEXTAREA_MAX_CHARS}
                hint="Tip: Be specific — e.g. John, freelance web designer"
              />
            </div>

            {appMode === 'generate' && (
            <>
            <div>
              <label
                htmlFor="target-role"
                className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(targetAndRole.trim().length)}`}
                  aria-hidden="true"
                />
                Target Company & Decision Maker Role
              </label>
              <textarea
                id="target-role"
                value={targetAndRole}
                onChange={(e) => setTargetAndRole(e.target.value)}
                placeholder="e.g. Acme Corp, VP of Sales"
                rows={3}
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-y min-h-[5.5rem] disabled:opacity-60"
                disabled={loading}
              />
              <TextareaCharFooter
                length={targetAndRole.length}
                max={INPUT_TEXTAREA_MAX_CHARS}
                hint="Tip: Include their role — e.g. Marketing managers at SaaS startups"
              />
            </div>

            <div>
              <label htmlFor="goal" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(goal.trim().length)}`}
                  aria-hidden="true"
                />
                What do you want?
              </label>
              <textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Book a call, get a reply, request a demo"
                rows={3}
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-y min-h-[5.5rem] disabled:opacity-60"
                disabled={loading}
              />
              <TextareaCharFooter
                length={goal.length}
                max={INPUT_TEXTAREA_MAX_CHARS}
                hint="Tip: One clear ask — e.g. a 15-min intro call"
                hintMinLength={15}
              />
            </div>
            </>
            )}

            {appMode === 'reengage' && (
            <>
            <div>
              <label
                htmlFor="reengage-name"
                className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(reengageName.trim().length)}`}
                  aria-hidden="true"
                />
                Prospect Name
              </label>
              <input
                id="reengage-name"
                type="text"
                value={reengageName}
                onChange={(e) => setReengageName(e.target.value)}
                placeholder="e.g. Sarah Johnson"
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="reengage-company"
                className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(reengageCompany.trim().length)}`}
                  aria-hidden="true"
                />
                Company
              </label>
              <input
                id="reengage-company"
                type="text"
                value={reengageCompany}
                onChange={(e) => setReengageCompany(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="reengage-topic"
                className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(reengageTopic.trim().length)}`}
                  aria-hidden="true"
                />
                Original Outreach Topic
              </label>
              <textarea
                id="reengage-topic"
                value={reengageTopic}
                onChange={(e) => setReengageTopic(e.target.value)}
                placeholder="e.g. Discussed automating their outbound sales process"
                rows={2}
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-y min-h-[4rem] disabled:opacity-60"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="reengage-last-contact"
                className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(reengageLastContact.trim().length)}`}
                  aria-hidden="true"
                />
                How Long Ago Did You Last Contact Them?
                <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                id="reengage-last-contact"
                type="text"
                value={reengageLastContact}
                onChange={(e) => setReengageLastContact(e.target.value)}
                placeholder="e.g. 3 months ago, last quarter"
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
                disabled={loading}
              />
            </div>

            <div>
              <label
                htmlFor="reengage-reason"
                className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(reengageReason.trim().length)}`}
                  aria-hidden="true"
                />
                Why Are You Reaching Back Out Now?
                <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <textarea
                id="reengage-reason"
                value={reengageReason}
                onChange={(e) => setReengageReason(e.target.value)}
                placeholder="e.g. They just raised a Series B, new product launch, end of quarter push"
                rows={2}
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-y min-h-[4rem] disabled:opacity-60"
                disabled={loading}
              />
            </div>
            </>
            )}

            <div
              className="pt-4 border-t border-slate-700/50"
              role="status"
              aria-label={`Form completion: ${formProgressPct} percent`}
            >
              <div className="h-1.5 w-full rounded-full bg-slate-700/80 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                    formReady ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${formProgressPct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 tabular-nums">{formProgressPct}%</span>
                {formReady ? (
                  <span className="text-green-400 font-medium">Ready to generate</span>
                ) : (
                  <span className="text-slate-500">
                    {formFilledCount === 0
                      ? appMode === 'reengage' ? 'Fill the required fields above to continue' : 'Fill all three fields above to continue'
                      : `${formFilledCount} of 3 fields started`}
                  </span>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="industry" className="block text-sm font-medium text-slate-300 mb-2">
                Industry
              </label>
              <select
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-shadow"
                disabled={loading}
              >
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-slate-800 text-white">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="mt-5 p-4 rounded-xl bg-red-900/40 border border-red-700/50 text-red-200 text-sm">
              {error}
            </div>
          )}

          <div className="mt-8">
            <p className="text-sm font-medium text-slate-300 mb-3" id="tone-label">
              Tone
            </p>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-labelledby="tone-label"
            >
              {TONE_OPTIONS.map(({ label }) => {
                const selected = tone === label
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTone(label)}
                    disabled={loading}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${
                      selected
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                        : 'bg-slate-700/40 text-slate-300 border border-slate-600 hover:bg-slate-700/70 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-stretch">
            <div className="flex flex-1 min-w-0 flex-col sm:flex-row gap-2 sm:items-center">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex-1 min-w-0 py-4 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800 shadow-lg shadow-blue-900/30 disabled:bg-slate-600 disabled:hover:bg-slate-600 disabled:shadow-none disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {loading ? (
                  <span
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    style={{ opacity: loadingMsgOpacity }}
                    className="min-h-[1.75rem] flex items-center justify-center px-2 text-center text-base sm:text-lg transition-opacity duration-300 ease-in-out"
                  >
                    {LOADING_MESSAGES[loadingMsgIndex]}
                  </span>
                ) : (
                  'Generate Emails'
                )}
              </button>
              <span
                className="inline-flex items-center justify-center self-center sm:self-auto shrink-0 rounded-full border border-slate-500/70 bg-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-200"
                title="Industry applied to generation"
              >
                {industry}
              </span>
            </div>
            <button
              type="button"
              onClick={handleStartOverClick}
              disabled={loading}
              className="sm:w-44 shrink-0 py-4 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-center border border-slate-600 bg-slate-700/40 hover:bg-slate-700/70 active:scale-[0.99] text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              Start Over
            </button>
          </div>
        </div>

        {/* Results section */}
        {resultsSectionVisible && (
        <section
          className={`mt-10 sm:mt-14 transition-opacity ease-in-out ${resultsSectionExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          style={{ transitionDuration: `${RESULTS_SECTION_FADE_MS}ms` }}
          onTransitionEnd={handleResultsSectionTransitionEnd}
        >
          <h2 className="text-xl font-semibold text-slate-200 mb-5 sm:mb-6">
            Generated Emails
          </h2>
          <div
            key={showGeneratedResults ? 'generated' : 'placeholder'}
            className={`grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 ${showGeneratedResults ? 'animate-fade-in' : ''}`}
          >
            {displayEmails.map((email, index) => (
              <div
                key={email.title}
                className="bg-slate-800/90 rounded-xl border border-slate-700/50 p-5 sm:p-6 flex flex-col shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-black/15 transition-shadow duration-200"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-base font-semibold text-blue-400 min-w-0 flex-1">
                    {email.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleBookmarkCard(index)}
                    disabled={savedCardIds[index] === null && savedEmails.length >= MAX_SAVED_EMAILS}
                    className={`shrink-0 rounded-lg p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/60 disabled:opacity-40 disabled:cursor-not-allowed ${
                      savedCardIds[index] !== null
                        ? 'text-amber-400 hover:text-amber-300 hover:bg-slate-700/60'
                        : 'text-slate-500 hover:text-amber-400 hover:bg-slate-700/60 disabled:hover:text-slate-500'
                    }`}
                    aria-label={savedCardIds[index] !== null ? `Remove ${email.title} from saved` : `Save ${email.title}`}
                    title={
                      savedCardIds[index] !== null
                        ? 'Remove bookmark'
                        : savedEmails.length >= MAX_SAVED_EMAILS
                        ? `Save limit reached (${MAX_SAVED_EMAILS})`
                        : 'Save this email'
                    }
                  >
                    <StarBookmarkIcon filled={savedCardIds[index] !== null} />
                  </button>
                </div>
                <div className="mb-4 rounded-lg border border-amber-400/55 bg-amber-50 px-3 py-2 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 mb-1">
                    Subject line
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={emailCardSubjects[index] ?? ''}
                      onChange={(e) => {
                        const next = e.target.value
                        setEmailCardSubjects((prev) => {
                          const copy = [...prev]
                          copy[index] = next
                          return copy
                        })
                      }}
                      placeholder="Enter subject line…"
                      aria-label={`Subject line for ${email.title}`}
                      className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-900 placeholder-amber-700/40 focus:outline-none leading-snug py-0.5"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopySubject(emailCardSubjects[index] ?? '', index)}
                      className="shrink-0 rounded-md bg-amber-200/90 px-2.5 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-200 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-amber-50"
                      aria-label={`Copy subject for ${email.title}`}
                    >
                      {copiedSubjectIndex === index ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  {(emailCardSubjects[index] ?? '') !== (emailCardOriginalSubjects[index] ?? '') && (
                    <button
                      type="button"
                      onClick={() =>
                        setEmailCardSubjects((prev) => {
                          const copy = [...prev]
                          copy[index] = emailCardOriginalSubjects[index] ?? ''
                          return copy
                        })
                      }
                      className="mt-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 transition-colors focus:outline-none"
                    >
                      Undo edit
                    </button>
                  )}
                </div>
                <div className="relative group/body mb-2 flex-1 min-h-[8rem] flex flex-col">
                  <p
                    className="pointer-events-none absolute right-2 top-2 z-[1] text-[11px] text-slate-500 opacity-0 transition-opacity duration-200 group-hover/body:opacity-100 group-focus-within/body:opacity-0"
                    aria-hidden="true"
                  >
                    Click to edit
                  </p>
                  <textarea
                    value={emailCardBodies[index] ?? ''}
                    onChange={(e) => {
                      const next = e.target.value
                      setEmailCardBodies((prev) => {
                        const copy = [...prev]
                        copy[index] = next
                        return copy
                      })
                    }}
                    aria-label={`${email.title} body`}
                    rows={8}
                    className="w-full flex-1 min-h-[8rem] rounded-lg border border-transparent bg-transparent text-slate-300 text-sm leading-relaxed px-3 py-2.5 resize-y transition-[border-color,box-shadow,background-color] duration-200 hover:bg-slate-900/25 focus:outline-none focus:border-sky-400/80 focus:bg-slate-900/30 focus:ring-2 focus:ring-sky-400/35"
                  />
                </div>
                <p className="text-xs text-slate-500 tabular-nums text-right mb-2">
                  {countWords(emailCardBodies[index] ?? '')} words · {(emailCardBodies[index] ?? '').length} chars
                </p>
                {(emailCardBodies[index] ?? '') !== (emailCardOriginalBodies[index] ?? '') && (
                  <button
                    type="button"
                    onClick={() => undoEmailCardEdits(index)}
                    className="mb-3 self-start text-xs font-medium text-sky-400/90 hover:text-sky-300 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:ring-offset-2 focus:ring-offset-slate-800 rounded px-1 -ml-1"
                  >
                    Undo edits
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInboxPreviewIndex(index)}
                  className="w-full mb-2 py-2.5 rounded-xl border border-slate-500/70 bg-slate-800/60 text-slate-200 text-sm font-medium hover:bg-slate-700/70 hover:border-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 active:scale-[0.99]"
                >
                  Preview in Inbox
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy({ ...email, subject: emailCardSubjects[index] ?? email.subject, body: emailCardBodies[index] ?? email.body }, index)}
                  className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 active:scale-[0.98]"
                >
                  {copiedIndex === index ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={handleCopyAll}
              className="px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 active:scale-[0.98]"
            >
              Copy All Emails
            </button>
            {showGeneratedResults && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-500/80 bg-slate-800/70 text-slate-200 font-medium text-sm transition-all duration-200 hover:bg-slate-700/80 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 active:scale-[0.98]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download as PDF
              </button>
            )}
          </div>

          {showGeneratedResults && (
            <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-stretch justify-center gap-3">
              <button
                type="button"
                onClick={handleGenerateVariants}
                disabled={variantsLoading}
                className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 focus:ring-offset-slate-900 shadow-lg shadow-violet-900/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-violet-600 active:scale-[0.98]"
              >
                {variantsLoading ? 'Generating variants…' : shortVariants ? 'Regenerate variants' : 'Generate Variants'}
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                className="px-6 py-3 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 active:scale-[0.98]"
              >
                Regenerate
              </button>
            </div>
          )}

          {showGeneratedResults && (variantsLoading || variantsError || shortVariants) && (
            <details
              className="mt-10 rounded-xl border border-slate-700/60 bg-slate-800/40 overflow-hidden group"
              open={variantsExpanded}
              onToggle={(e) => setVariantsExpanded(e.target.open)}
            >
              <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-100 flex items-center justify-between gap-3 select-none hover:bg-slate-800/60 transition-colors [&::-webkit-details-marker]:hidden">
                <span>Variant Emails</span>
                <span className="text-slate-500 text-sm font-normal tabular-nums shrink-0">
                  {shortVariants ? `${shortVariants.length} angles` : variantsLoading ? '…' : ''}
                </span>
              </summary>
              <div className="border-t border-slate-700/50 px-5 pb-5 pt-1">
                <p className="text-sm text-slate-400 leading-relaxed mb-5">
                  These are alternative <strong className="text-slate-300 font-medium">short email</strong> versions with
                  different opening strategies—use them to A/B test hooks and see what gets replies in your industry.
                </p>
                {variantsError && (
                  <div className="mb-4 p-3 rounded-lg bg-red-900/35 border border-red-700/40 text-red-200 text-sm" role="alert">
                    {variantsError}
                  </div>
                )}
                {variantsLoading && (
                  <p className="text-slate-400 text-sm py-6 text-center">Generating three distinct angles…</p>
                )}
                {shortVariants && !variantsLoading && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {shortVariants.map((variant, vi) => (
                      <div
                        key={`variant-${vi}-${variant.angleLabel}`}
                        className="rounded-xl border border-slate-700/50 bg-slate-800/90 p-4 sm:p-5 flex flex-col shadow-lg shadow-black/10"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-1">
                          {variant.angleLabel}
                        </p>
                        <p className="text-xs text-slate-500 mb-3 leading-snug">{variant.description}</p>
                        {variant.subject?.trim() ? (
                          <div className="mb-3 rounded-lg border border-amber-400/50 bg-amber-50 px-2.5 py-2">
                            <p className="text-[10px] font-bold text-amber-950">Subject</p>
                            <p className="text-xs font-medium text-slate-900 mt-0.5">Subject: {variant.subject}</p>
                          </div>
                        ) : null}
                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap flex-1 mb-4">
                          {variant.body}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopyVariant(variant, vi)}
                          className="w-full py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                          {variantCopiedIndex === vi ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </section>
        )}
        </>
        )}

        {appMode === 'saved' && (
        <div>
          {savedEmails.length >= SAVED_EMAILS_WARN_AT && (
            <div
              className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
                savedEmails.length >= MAX_SAVED_EMAILS
                  ? 'border-red-500/50 bg-red-950/40 text-red-200'
                  : 'border-amber-500/45 bg-amber-950/35 text-amber-100'
              }`}
              role="status"
            >
              {savedEmails.length >= MAX_SAVED_EMAILS ? (
                <>You&apos;re at the limit ({MAX_SAVED_EMAILS}/{MAX_SAVED_EMAILS}). Delete a saved email to add more.</>
              ) : (
                <>Approaching save limit: {savedEmails.length}/{MAX_SAVED_EMAILS} used.</>
              )}
            </div>
          )}
          {sortedSavedEmails.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-slate-800 text-slate-500 mb-4">
                <StarBookmarkIcon filled={false} />
              </div>
              <p className="text-slate-400 text-base mb-6">
                No saved emails yet.<br />Click the star on any generated email to save it.
              </p>
              <button
                type="button"
                onClick={() => setAppMode('generate')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                Start generating
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <p className="text-sm text-slate-400">
                  {sortedSavedEmails.length} saved email{sortedSavedEmails.length !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSavedSortNewestFirst(true)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      savedSortNewestFirst
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-600'
                    }`}
                  >
                    Newest first
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavedSortNewestFirst(false)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      !savedSortNewestFirst
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-600'
                    }`}
                  >
                    Oldest first
                  </button>
                </div>
              </div>
              <div className="space-y-5">
                {sortedSavedEmails.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-800/90 rounded-xl border border-slate-700/50 p-5 sm:p-6 shadow-lg shadow-black/10"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-full bg-slate-700/80 border border-slate-600 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                          {item.inputs.industry}
                        </span>
                        <span className="rounded-full bg-slate-700/80 border border-slate-600 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                          {item.inputs.tone}
                        </span>
                        {item.email.wordCount != null && (
                          <span className="text-[11px] text-slate-500 tabular-nums">{item.email.wordCount} words</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 tabular-nums shrink-0">{formatSavedAt(item.savedAt)}</p>
                    </div>
                    <h3 className="text-sm font-semibold text-blue-400 mb-2">{item.email.title}</h3>
                    {item.email.subject?.trim() ? (
                      <div className="mb-3 rounded-lg border border-amber-400/55 bg-amber-50 px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 mb-0.5">Subject line</p>
                        <p className="text-sm font-medium text-slate-900">{item.email.subject}</p>
                      </div>
                    ) : null}
                    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed mb-4">
                      {item.email.body}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => handleRegenerateFromSaved(item)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs font-medium hover:bg-blue-600/30 hover:border-blue-400/60 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Regenerate with same inputs
                      </button>
                      {deleteConfirmId === item.id ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-red-300 font-medium">Delete this email?</span>
                          <button
                            type="button"
                            onClick={() => { handleDeleteSavedEmail(item.id); setDeleteConfirmId(null) }}
                            className="px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                          >
                            Yes, delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-3 py-2 rounded-lg border border-slate-600 text-slate-400 text-xs font-medium hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(item.id)}
                          className="px-3.5 py-2 rounded-lg border border-red-500/40 bg-red-950/30 text-red-300 text-xs font-medium hover:bg-red-900/40 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-700/50 py-5 sm:py-6">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-center text-slate-500 text-sm">
            Powered by ColdMailAI — Get more replies today
          </p>
        </div>
      </footer>
      </div>

      {inboxPreviewData && (
        <div
          className="fixed inset-0 z-[58] flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-sm"
          onClick={handleCloseInboxPreview}
          role="presentation"
        >
          <div
            className="w-full max-w-2xl max-h-[min(90vh,840px)] flex flex-col rounded-2xl bg-[#f6f8fc] shadow-2xl shadow-black/25 border border-slate-200/90 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inbox-preview-title"
          >
            <div className="shrink-0 flex items-center gap-2 border-b border-slate-200/90 bg-white px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              </span>
              <span id="inbox-preview-title" className="ml-2 text-sm font-medium text-slate-600 truncate">
                Mail — Inbox preview
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto rounded-xl bg-white border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.06)] overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4 bg-white">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-semibold text-white"
                      aria-hidden="true"
                    >
                      {inboxPreviewData.senderInitial}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[15px] font-semibold text-slate-900 leading-tight truncate">
                        {inboxPreviewData.subject}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        <span className="text-slate-600">{inboxPreviewData.senderDisplay}</span>
                        <span className="mx-1 text-slate-400">·</span>
                        <span>to {inboxPreviewData.toLine}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 space-y-3 text-sm bg-white">
                  <div className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-2 items-baseline">
                    <span className="text-slate-500 text-right tabular-nums">From</span>
                    <span className="text-slate-900 font-medium break-all">{inboxPreviewData.fromLine}</span>
                    <span className="text-slate-500 text-right">To</span>
                    <span className="text-slate-900 break-all">{inboxPreviewData.toLine}</span>
                    <span className="text-slate-500 text-right">Subject</span>
                    <span className="text-slate-900 font-semibold">{inboxPreviewData.subject}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-4 mt-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Body</p>
                    <div className="text-[15px] text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
                      {inboxPreviewData.body}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end border-t border-slate-200/90 bg-white px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={handleCloseInboxPreview}
                className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Looks good
              </button>
              <button
                type="button"
                onClick={handleCopyInboxPreview}
                className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {inboxPreviewCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showStartOverConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={handleStartOverCancel}
          role="presentation"
        >
          <div
            className="bg-slate-800 text-slate-100 rounded-2xl border border-slate-600 shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-over-dialog-title"
          >
            <h2 id="start-over-dialog-title" className="text-lg font-semibold text-white mb-6">
              Clear all inputs and results?
            </h2>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={handleStartOverCancel}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700/50 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartOverConfirm}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showCopyAllToast && (
        <div
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 px-5 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm font-medium shadow-xl shadow-black/40 animate-fade-in"
          role="status"
          aria-live="polite"
        >
          Copied!
        </div>
      )}

      {saveLimitToast && (
        <div
          className="fixed bottom-6 left-1/2 z-[60] max-w-sm -translate-x-1/2 px-5 py-3 rounded-xl bg-amber-950/95 border border-amber-600/60 text-amber-100 text-sm font-medium text-center shadow-xl shadow-black/40 animate-fade-in"
          role="alert"
        >
          Maximum {MAX_SAVED_EMAILS} saved emails. Delete one in Saved to add more.
        </div>
      )}


      {showUpgradeModal && !unlocked && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            aria-label="Dismiss and show banner"
            onClick={dismissPaywallModal}
          />
          <div
            className="relative z-10 w-full max-w-lg max-h-[min(90vh,640px)] overflow-y-auto rounded-2xl bg-white text-slate-900 shadow-2xl shadow-black/40 border border-slate-200/90 p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="upgrade-modal-title" className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 pr-8">
              You&apos;ve reached your free limit
            </h2>
            <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-5">
              ColdMailAI includes <strong className="font-semibold text-slate-800">{FREE_GENERATIONS_LIMIT} free email generations</strong>. You&apos;ve
              used them all—your latest emails are still below (blur is only on this screen). Upgrade to keep generating
              without limits.
            </p>
            <ul className="text-left text-sm text-slate-700 space-y-2 mb-6 pl-1">
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold shrink-0" aria-hidden="true">✓</span>
                <span>Unlimited cold email generations with the same tone, industry, and variant tools</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold shrink-0" aria-hidden="true">✓</span>
                <span>Save bookmarks, inbox previews, and workflows without hitting a cap</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold shrink-0" aria-hidden="true">✓</span>
                <span>Pro access supports ongoing outreach and list testing as you scale</span>
              </li>
            </ul>
            <a
              href={GUMROAD_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base transition-colors shadow-lg shadow-blue-900/25 mb-3"
            >
              Upgrade on Gumroad
            </a>
            <button
              type="button"
              onClick={dismissPaywallModal}
              className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors mb-5"
            >
              Dismiss
            </button>
            <div className="border-t border-slate-200 pt-4 text-center">
              {!showUnlockInput ? (
                <button
                  type="button"
                  onClick={() => { setShowUnlockInput(true); setUnlockCodeError('') }}
                  className="text-slate-500 hover:text-slate-800 text-sm underline"
                >
                  Have a code?
                </button>
              ) : (
                <div className="text-left">
                  <input
                    type="text"
                    value={unlockCodeInput}
                    onChange={(e) => { setUnlockCodeInput(e.target.value); setUnlockCodeError('') }}
                    placeholder="Enter code"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm"
                    autoFocus
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (unlockCodeInput.trim() === VALID_UNLOCK_CODE) {
                          setStoredUnlocked(true)
                          setUnlocked(true)
                          setLimitModalDismissedStored(false)
                          setLimitModalDismissed(false)
                          setShowUpgradeModal(false)
                          setShowUnlockInput(false)
                          setUnlockCodeInput('')
                          setUnlockCodeError('')
                        } else {
                          setUnlockCodeError('Invalid code')
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
                    >
                      Unlock
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowUnlockInput(false); setUnlockCodeInput(''); setUnlockCodeError('') }}
                      className="text-slate-500 hover:text-slate-800 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                  {unlockCodeError && (
                    <p className="mt-1 text-red-600 text-sm" role="alert">
                      {unlockCodeError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
