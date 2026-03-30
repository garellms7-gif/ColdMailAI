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

const CHAR_LIMIT_NAME_OFFER = 300
const CHAR_LIMIT_TARGET_ROLE = 120
const CHAR_LIMIT_GOAL = 200
const CHAR_LIMIT_PAIN_POINT = 150
const CHAR_LIMIT_COMPETITOR_TOOLS = 80

const PAIN_POINT_LIBRARY = {
  SaaS:          ['Low trial conversions', 'High churn', 'Long sales cycles', 'Poor onboarding completion', 'Feature adoption gaps'],
  Agency:        ['Inconsistent lead flow', 'Client churn', 'Project scope creep', 'Underpriced services', 'Difficulty scaling'],
  eCommerce:     ['High cart abandonment', 'Low repeat purchases', 'Rising ad costs', 'Poor email open rates', 'Thin margins'],
  'Real Estate': ['Inconsistent referrals', 'Slow follow-up', 'Low listing inventory', 'Long deal cycles', 'Lead quality'],
  Recruiting:    ['Slow time-to-hire', 'Candidate ghosting', 'Poor job ad response', 'High cost-per-hire', 'Retention issues'],
  Consulting:    ['Feast or famine revenue', 'Proposal rejection', 'Long sales cycles', 'Difficulty charging premium rates', 'No referral system'],
  Finance:       ['Client acquisition costs', 'Compliance complexity', 'Low financial literacy in prospects', 'Trust barriers', 'Commoditized services'],
  Healthcare:    ['Patient no-shows', 'Insurance complexity', 'Staff burnout', 'Low online visibility', 'Referral gaps'],
}
const PAIN_POINT_LIBRARY_INDUSTRIES = Object.keys(PAIN_POINT_LIBRARY)

const VOICE_PROFILE_KEY = 'coldmailai_voice_profile'

function getStoredVoiceProfile() {
  try {
    const raw = localStorage.getItem(VOICE_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tone === 'string') return parsed
    return null
  } catch {
    return null
  }
}

function setStoredVoiceProfile(profile) {
  try {
    localStorage.setItem(VOICE_PROFILE_KEY, JSON.stringify(profile))
  } catch {
    // ignore
  }
}

function clearStoredVoiceProfile() {
  try {
    localStorage.removeItem(VOICE_PROFILE_KEY)
  } catch {
    // ignore
  }
}

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

/** Email copywriting frameworks */
const EMAIL_FRAMEWORKS = [
  {
    value: 'PAS',
    label: 'PAS',
    description: 'Problem, Agitation, Solution',
    tooltip: 'Open with the prospect\'s pain, agitate it by describing the consequence, then present your offer as the solution.',
    promptInstruction: 'Structure each email using the PAS framework: (1) Problem — open by naming the prospect\'s specific pain point directly; (2) Agitation — deepen the pain by describing the downstream consequence or cost of not fixing it; (3) Solution — introduce your offer as the clear fix. The three sections should feel like a natural narrative arc, not labeled blocks.',
  },
  {
    value: 'AIDA',
    label: 'AIDA',
    description: 'Attention, Interest, Desire, Action',
    tooltip: 'Hook with a bold statement, build interest with context, create desire with the outcome, close with a CTA.',
    promptInstruction: 'Structure each email using the AIDA framework: (1) Attention — open with a bold, unexpected, or provocative statement that stops them mid-scroll; (2) Interest — provide relevant context or a surprising insight that earns continued reading; (3) Desire — paint a specific, vivid picture of the outcome they\'ll get; (4) Action — close with one clear, low-friction CTA. Keep each section tight.',
  },
  {
    value: 'BAB',
    label: 'BAB',
    description: 'Before, After, Bridge',
    tooltip: 'Describe their current situation, paint the picture of life after your solution, then bridge the gap with your offer.',
    promptInstruction: 'Structure each email using the BAB framework: (1) Before — describe their current frustrating reality in concrete terms the prospect will instantly recognise; (2) After — paint a vivid, specific picture of what their world looks like once the problem is solved; (3) Bridge — present your offer as the direct path from Before to After. Make the contrast between Before and After feel stark and desirable.',
  },
]

/** Per-industry default pattern-interrupt openers for Email 1 */
const PATTERN_INTERRUPT_LINES = {
  'SaaS/Tech':   "I know you probably get 50 of these a week...",
  Agency:        "I'll skip the part where I tell you I'm different...",
  eCommerce:     "This isn't another 'scale your store' pitch...",
  'Real Estate': "I won't waste your time with a long pitch...",
  Finance:       "I'll be upfront — this is a cold email...",
  Healthcare:    "I know you're busy with patients, not emails...",
  Recruitment:   "I know your inbox is full of recruiters...",
  Coaching:      "I know you've heard this before...",
  Other:         "I'll keep this brief — promise.",
}

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

function buildVoiceProfileBlock(profile) {
  return `Tone: ${profile.tone}
Vocabulary level: ${profile.vocabularyLevel}
Sentence style: ${profile.sentenceLength}
Personality markers: ${profile.personalityMarkers}`
}

function buildSystemPromptWithTone(toneLabel, voiceProfile = null) {
  let prompt = `${SYSTEM_PROMPT}\n\n${getTonePromptLine(toneLabel)}`
  if (voiceProfile) {
    prompt += `\n\nVOICE CALIBRATION — The user has provided samples of their actual writing. Match their natural voice as closely as possible — this overrides generic AI phrasing:\n${buildVoiceProfileBlock(voiceProfile)}`
  }
  return prompt
}

async function analyzeVoiceProfile(emailSamples) {
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
      max_tokens: 400,
      system: `You are a writing style analyst. Analyze the provided email samples and extract a concise voice profile. Return ONLY a valid JSON object with exactly these string keys (no markdown, no extra keys):
- "tone": overall tone (e.g., "Direct and confident", "Warm but professional")
- "vocabularyLevel": vocabulary complexity (e.g., "Conversational — short words, avoids jargon")
- "sentenceLength": sentence length pattern (e.g., "Short punchy sentences, rarely over 15 words")
- "personalityMarkers": 2-3 distinctive writing habits separated by semicolons (e.g., "Starts with questions; uses em-dashes; skips formal openers")
- "summary": one-sentence description of the overall voice`,
      messages: [
        {
          role: 'user',
          content: `Analyze these email samples and return a voice profile JSON:\n\n${emailSamples}`,
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
  return parseEmailJson(content[0].text)
}

const PS_STYLES = ['urgency', 'social_proof', 'secondary_cta']
const PS_STYLE_LABELS = { urgency: 'Urgency', social_proof: 'Social proof', secondary_cta: 'Alt. CTA' }
/** Email card indices (0-based) that receive a P.S. line — Email 1 and Email 3 */
const PS_EMAIL_INDICES = [0, 2]

async function generatePsLine(emailBody, targetAndRole, goal, industry, psStyle, toneLabel, voiceProfile = null) {
  const styleInstructions = {
    urgency:
      'Urgency: write a specific, believable time-sensitive reason to act soon — tie it to something contextual like a deadline, capacity, or timing related to their situation. Avoid vague phrases like "limited time."',
    social_proof:
      'Social proof: write a concrete result or outcome a real customer or client achieved — be specific about what changed (e.g., metric, time, outcome). Do not use vague language like "many clients love this."',
    secondary_cta:
      'Secondary CTA (lower commitment): offer a lower-friction alternative to the main ask — e.g., a yes/no reply, a short resource, or a 10-minute chat instead of a full call. Make it feel easy to say yes to.',
  }
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
      max_tokens: 120,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        {
          role: 'user',
          content: `Here is a cold email body:
---
${emailBody}
---

Target: ${targetAndRole}
Goal: ${goal}
Industry: ${industry}

Write a single P.S. line using this angle:
${styleInstructions[psStyle]}

Rules:
- Start with exactly "P.S."
- 1–2 sentences maximum
- Match the email's tone
- Do NOT repeat the main CTA verbatim
- Return ONLY the P.S. line as plain text — no quotes, no markdown`,
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  return content[0].text.trim()
}

const LENGTH_SLIDER_MIN = 30
const LENGTH_SLIDER_MAX = 150
const LENGTH_SLIDER_DEFAULT = 75

/** Returns a CSS linear-gradient string for a filled range-input track. */
function sliderTrackStyle(value, min, max) {
  const pct = ((value - min) / (max - min)) * 100
  return {
    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${pct}%, #334155 ${pct}%, #334155 100%)`,
  }
}

async function rewriteEmailToLength(emailBody, targetWordCount, toneLabel, nameAndOffer, targetAndRole, goal, voiceProfile = null) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const firstName = senderName.split(/\s+/)[0] || senderName
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
      max_tokens: 700,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        {
          role: 'user',
          content: `Rewrite the cold email below to be approximately ${targetWordCount} words. Preserve the hook, value proposition, CTA, and sign-off format exactly.

SENDER: ${senderName}
PRODUCT/SERVICE: ${senderOffer}
TARGET: ${targetAndRole}
GOAL: ${goal}

ORIGINAL EMAIL:
---
${emailBody}
---

Rules:
- Target: approximately ${targetWordCount} words total (sign-off "Best,\\n${firstName}" included; ±10 words is acceptable)
- If trimming: cut filler sentences and tighten phrasing — never remove the CTA or sign-off
- If expanding: add specific supporting context or a credible detail — no generic padding
- Return ONLY the rewritten email body — no subject line, no labels, no markdown, no extra commentary`,
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  return content[0].text.trim()
}

async function simplifyEmailToGrade5(emailBody, toneLabel, nameAndOffer, targetAndRole, goal, voiceProfile = null) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const firstName = senderName.split(/\s+/)[0] || senderName
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
      max_tokens: 700,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        {
          role: 'user',
          content: `Rewrite the cold email below to a Flesch-Kincaid grade 5 reading level. Shorter sentences, simpler words, same message.

SENDER: ${senderName}
PRODUCT/SERVICE: ${senderOffer}
TARGET: ${targetAndRole}
GOAL: ${goal}

ORIGINAL EMAIL:
---
${emailBody}
---

Rules:
- Target Flesch-Kincaid grade 4–5 (short sentences, common words, no jargon)
- Preserve the core offer, tone, CTA, and sign-off "Best,\\n${firstName}"
- Keep approximately the same word count (±15 words)
- Do NOT change the meaning, omit the offer, or remove the CTA
- Return ONLY the rewritten email body — no subject line, no labels, no markdown, no commentary`,
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  return content[0].text.trim()
}

async function generatePatternInterruptLine(industry, nameAndOffer, targetAndRole, goal, toneLabel, voiceProfile = null) {
  const defaultLine = PATTERN_INTERRUPT_LINES[industry] ?? PATTERN_INTERRUPT_LINES['Other']
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
      max_tokens: 80,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        {
          role: 'user',
          content: `Write ONE pattern-interrupt opening sentence for a cold email to someone in the ${industry} industry.

The line must:
- Acknowledge that the reader gets a lot of cold emails (without whining about it)
- Be self-aware, disarming, and human — never salesy
- NOT pitch the product or mention the sender's offer
- Be 8–15 words, conversational, ending with "..." to signal more is coming
- Feel fresh — avoid clichés like "I know you're busy"

SENDER: ${senderName}
OFFER: ${senderOffer}
TARGET: ${targetAndRole}
GOAL: ${goal}

Style reference (do NOT copy, just match the vibe): "${defaultLine}"

Return ONLY the single sentence — no quotes, no labels, no commentary.`,
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  return content[0].text.trim()
}

async function generateAiPainPoints(targetAndRole, industry) {
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
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Generate exactly 3 specific, believable pain points for this prospect in a cold email context.

Target: ${targetAndRole}
Industry: ${industry}

Rules:
- Each pain point: 4–8 words, specific to this prospect type
- No numbering, no bullets, no markdown
- Return ONLY a JSON array of 3 strings — e.g. ["pain 1", "pain 2", "pain 3"]`,
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  const parsed = parseEmailJson(content[0].text)
  if (!Array.isArray(parsed)) throw new Error('Unexpected response shape')
  return parsed.slice(0, 3).map((s) => String(s))
}

// ─── Icebreakers ────────────────────────────────────────────────────────────

const ICEBREAKER_ANGLES = ['recent_news', 'compliment', 'shared_connection', 'bold_claim', 'question']
const ICEBREAKER_ANGLE_LABELS = {
  recent_news:       'Recent news',
  compliment:        'Compliment',
  shared_connection: 'Shared connection',
  bold_claim:        'Bold claim',
  question:          'Question',
}

async function generateIcebreakers(targetAndRole, industry, emailBody, toneLabel, voiceProfile = null) {
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
      max_tokens: 500,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        {
          role: 'user',
          content: `Generate 5 one-sentence icebreaker opening lines for a cold email.

TARGET: ${targetAndRole}
INDUSTRY: ${industry}

Current email opener for context (do NOT reuse it):
---
${emailBody.split('\n\n')[0] ?? emailBody.slice(0, 300)}
---

Each icebreaker must use a DIFFERENT angle and work as a standalone first sentence that replaces the current opener:
1. recent_news — Reference something plausibly happening in their industry right now; specific enough to feel credible, general enough to be accurate without research
2. compliment — A genuine, specific observation about their company, product, or role (no hollow flattery like "love what you're doing")
3. shared_connection — Reference a mutual context: a community, event, trend, or shared experience relevant to their industry
4. bold_claim — A surprising or counterintuitive statement that challenges a common assumption in their industry
5. question — Open with curiosity; a sharp, specific question directly relevant to their situation that earns a reply

Rules:
- 1 sentence each — no "I wanted to reach out" or "I hope this finds you well" starts
- Each must stand alone as an engaging cold email opener
- Return ONLY a valid JSON array of exactly 5 objects: [{"angle":"recent_news","text":"..."},{"angle":"compliment","text":"..."},{"angle":"shared_connection","text":"..."},{"angle":"bold_claim","text":"..."},{"angle":"question","text":"..."}]
- No markdown, no extra keys, no extra text`,
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  const parsed = parseEmailJson(content[0].text)
  if (!Array.isArray(parsed)) throw new Error('Unexpected response shape')
  // Validate and normalise — ensure one item per angle in the defined order
  return ICEBREAKER_ANGLES.map((angle) => {
    const found = parsed.find((item) => item?.angle === angle)
    return { angle, text: typeof found?.text === 'string' ? found.text.trim() : '' }
  }).filter((item) => item.text.length > 0)
}

// ─── Reply Templates ─────────────────────────────────────────────────────────

const REPLY_TEMPLATE_SCENARIOS = [
  { key: 'interested',    label: 'Interested',      description: 'Prospect wants to learn more or book a call' },
  { key: 'needs_info',   label: 'Needs More Info',  description: 'Prospect wants details before committing'    },
  { key: 'objection',    label: 'Objection',        description: 'Prospect pushes back on price, timing, or fit' },
  { key: 'not_now',      label: 'Not Now',          description: 'Prospect is open but says bad timing'         },
]

async function generateAllReplyTemplates(nameAndOffer, targetAndRole, goal, industry, toneLabel, emailBody, voiceProfile = null) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const firstName = senderName.split(/\s+/)[0] || senderName
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
      max_tokens: 900,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        {
          role: 'user',
          content: `Generate 4 short reply templates for when a prospect responds to this cold email.

CONTEXT
Sender name (sign off with first name only): ${senderName}
Product/service: ${senderOffer}
Target: ${targetAndRole}
Goal: ${goal}
Industry: ${industry}
Original cold email body:
---
${emailBody.slice(0, 600)}
---

Write one reply template for each of these scenarios:
1. interested — Prospect is interested and wants to learn more or book a call. Confirm enthusiasm, suggest a specific next step (time/link), and keep momentum.
2. needs_info — Prospect wants more details before committing. Provide 1-2 concrete specifics, then re-ask for the meeting with a lower-friction ask.
3. objection — Prospect pushes back on price, timing, or fit. Validate the concern briefly, reframe the value, and offer a smaller commitment.
4. not_now — Prospect is open but says it's bad timing. Acknowledge without pressure, plant a seed for later, and give them control over the follow-up timing.

Rules:
- 3–4 sentences maximum per template
- Match the tone and industry context of the original email
- End each with a clear, specific next step
- Write as if ${firstName} is replying — first person, sign off with only "${firstName}"
- Return ONLY a valid JSON object with exactly these string keys (no markdown):
  "interested", "needs_info", "objection", "not_now"`,
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  const parsed = parseEmailJson(content[0].text)
  return REPLY_TEMPLATE_SCENARIOS.map((s) => ({
    ...s,
    text: typeof parsed[s.key] === 'string' ? parsed[s.key].trim() : '',
  }))
}

async function regenerateSingleReplyTemplate(scenario, nameAndOffer, targetAndRole, goal, industry, toneLabel, emailBody, voiceProfile = null) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const firstName = senderName.split(/\s+/)[0] || senderName
  const scenarioInstructions = {
    interested:  'Prospect is interested and wants to learn more or book a call. Confirm enthusiasm, suggest a specific next step (time/link), and keep momentum.',
    needs_info:  'Prospect wants more details before committing. Provide 1-2 concrete specifics, then re-ask for the meeting with a lower-friction ask.',
    objection:   'Prospect pushes back on price, timing, or fit. Validate the concern briefly, reframe the value, and offer a smaller commitment.',
    not_now:     'Prospect is open but says it\'s bad timing. Acknowledge without pressure, plant a seed for later, and give them control over the follow-up timing.',
  }
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
      max_tokens: 250,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        {
          role: 'user',
          content: `Write a NEW reply template for the scenario: ${scenario.label}
${scenarioInstructions[scenario.key]}

Context: Sender is ${senderName} offering ${senderOffer} to ${targetAndRole} in ${industry}. Goal: ${goal}.
Original email:
---
${emailBody.slice(0, 400)}
---

Rules: 3–4 sentences max, end with a clear next step, sign off with only "${firstName}". Return ONLY the plain text reply — no subject line, no JSON, no markdown.`,
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  return content[0].text.trim()
}

// ─── Re-engage Mode ──────────────────────────────────────────────────────────

const REENGAGE_EMAIL_CARDS = [
  { key: 'curiosity_bump', title: 'Curiosity Bump'  },
  { key: 'value_update',   title: 'Value Update'    },
  { key: 'easy_out',       title: 'Easy Out'         },
]
const REENGAGE_SUBJECT_KEYS = ['curiosity_bump_subject', 'value_update_subject', 'easy_out_subject']

async function generateReengageEmails(nameAndOffer, reengageName, reengageCompany, reengageTopic, reengageLastContact, reengageReason, toneLabel, industry, voiceProfile = null, targetWordCount = LENGTH_SLIDER_DEFAULT) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const senderFirst = senderName.split(/\s+/)[0] || senderName
  const prospectFirst = (reengageName.trim().split(/\s+/)[0] || reengageName.trim()) || 'there'
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
      max_tokens: 1800,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        {
          role: 'user',
          content: `Generate 3 re-engagement emails for a prospect who has gone cold.

SENDER NAME (sign off with first name only): ${senderName}
SENDER'S PRODUCT/SERVICE: ${senderOffer}
PROSPECT NAME: ${reengageName}
PROSPECT COMPANY: ${reengageCompany}
ORIGINAL OUTREACH TOPIC: ${reengageTopic}
TIME SINCE LAST CONTACT: ${reengageLastContact}
REASON FOR REACHING BACK OUT NOW: ${reengageReason}
INDUSTRY: ${industry}
TARGET WORD COUNT: ~${targetWordCount} words per email body (sign-off included; ±10 words is fine).

Each email must feel meaningfully different in angle, energy, and tone — no recycled sentences, no similar openers:

1. Curiosity Bump: Reference something genuinely new — a recent industry development, news, or update — that earns the right to come back. Do NOT rehash the original pitch. The new thing is the hook; the pitch is secondary.

2. Value Update: Lead with a concrete result, client win, or case study that DID NOT EXIST when you last reached out. Make the prospect feel they missed something real, not just a follow-up.

3. Easy Out: Short, direct, and explicitly low-pressure. Give them permission to say no. Acknowledge it's been a while, make a yes/no reply easy, and leave the door open gracefully. This is the breakup email — often the highest reply rate in any sequence.

Rules:
- Address the prospect by first name: ${prospectFirst}
- Each email must open with a completely different hook
- Sign off every email with "${senderFirst}" only (never the product name)
- End 1 and 2 with a clear, specific next step; end 3 with a single easy yes/no question

Return ONLY a valid JSON object (no markdown, no extra keys) with exactly these string keys:
- curiosity_bump_subject, curiosity_bump
- value_update_subject, value_update
- easy_out_subject, easy_out`,
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  const parsed = parseEmailJson(content[0].text)
  return REENGAGE_EMAIL_CARDS.map(({ key, title }, i) => ({
    title,
    subject: typeof parsed[REENGAGE_SUBJECT_KEYS[i]] === 'string' ? parsed[REENGAGE_SUBJECT_KEYS[i]] : '',
    body:    typeof parsed[key] === 'string' ? parsed[key] : '',
  }))
}

// ─── Drip Sequence ──────────────────────────────────────────────────────────

const DRIP_SEQUENCE_SLOTS = [
  { day: 0,  label: 'Day 0',  role: 'Cold Intro',       subjectKey: 'day0_subject',  bodyKey: 'day0_body'  },
  { day: 3,  label: 'Day 3',  role: 'Follow-Up 1',      subjectKey: 'day3_subject',  bodyKey: 'day3_body'  },
  { day: 7,  label: 'Day 7',  role: 'Value Add',         subjectKey: 'day7_subject',  bodyKey: 'day7_body'  },
  { day: 10, label: 'Day 10', role: 'Objection Handler', subjectKey: 'day10_subject', bodyKey: 'day10_body' },
  { day: 14, label: 'Day 14', role: 'Breakup Email',     subjectKey: 'day14_subject', bodyKey: 'day14_body' },
]

function buildDripSequenceUserMessage(senderName, senderOffer, targetAndRole, goal, industry, targetWordCount = LENGTH_SLIDER_DEFAULT, painPoint = '') {
  const first = senderName.split(/\s+/)[0] || senderName
  const painPointBlock = painPoint.trim()
    ? `\nPROSPECT PAIN POINT: ${painPoint.trim()}\nAddress this specific challenge naturally across the sequence — it should feel like you truly understand their situation.`
    : ''
  return `Generate a 5-email cold outreach drip sequence for the following situation:

SENDER'S PERSONAL NAME (sign off with first name only): ${senderName}
SENDER'S PRODUCT OR SERVICE (reference separately from the sender's name): ${senderOffer}
TARGET: ${targetAndRole}
GOAL: ${goal}
INDUSTRY CONTEXT: ${industry}
TARGET WORD COUNT: Aim for ~${targetWordCount} words per email body (sign-off included; ±10 words is fine).${painPointBlock}

Each email must have a DISTINCT angle, energy, and tone — no recycled sentences, no parallel openers, no templated structure.

Angles (follow exactly):
1. Day 0 — Cold Intro: Lead with a sharp hook. First touch, no prior context assumed. Open with a specific pain point or insight.
2. Day 3 — Follow-Up 1: Add a NEW angle or piece of insight NOT mentioned in Email 1. Never say "just following up" or "bumping this up."
3. Day 7 — Value Add: Share a concrete result, a specific case study outcome, or a genuinely useful resource. Make it feel generous, not salesy.
4. Day 10 — Objection Handler: Pre-emptively address the most common reason this type of prospect has NOT replied. Validate the hesitation before offering a reframe.
5. Day 14 — Breakup Email: Short and human. Give them permission to say no. Use reverse psychology — make walking away feel like their choice — then leave the door open.

Return ONLY a JSON object (all string values, no markdown, no extra keys) with exactly these keys:
- day0_subject, day0_body
- day3_subject, day3_body
- day7_subject, day7_body
- day10_subject, day10_body
- day14_subject, day14_body

Every email body must sign off with only the sender's first name (e.g. "Best," then "${first}" on the next line). Never sign off with the product/business name.`
}

async function generateDripSequence(nameAndOffer, targetAndRole, goal, toneLabel, industry, voiceProfile = null, targetWordCount = LENGTH_SLIDER_DEFAULT, painPoint = '') {
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
      max_tokens: 3500,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        { role: 'user', content: buildDripSequenceUserMessage(senderName, senderOffer, targetAndRole, goal, industry, targetWordCount, painPoint) },
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
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  const parsed = parseEmailJson(content[0].text)
  return DRIP_SEQUENCE_SLOTS.map((slot) => ({
    day: slot.day,
    label: slot.label,
    role: slot.role,
    subject: typeof parsed[slot.subjectKey] === 'string' ? parsed[slot.subjectKey] : '',
    body: typeof parsed[slot.bodyKey] === 'string' ? parsed[slot.bodyKey] : '',
  }))
}

function buildDripCsvContent(dripEmails) {
  const header = 'day_number,subject,body'
  const rows = dripEmails.map((e) => {
    const escapeCsv = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    return [e.day, escapeCsv(e.subject), escapeCsv(e.body)].join(',')
  })
  return [header, ...rows].join('\n')
}

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ────────────────────────────────────────────────────────────────────────────

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

function buildUserMessage(senderName, senderOffer, targetAndRole, goal, industry, prospectFirstName = '', targetWordCount = LENGTH_SLIDER_DEFAULT, painPoint = '', framework = 'PAS', competitorTools = '') {
  const personalizationBlock = prospectFirstName.trim()
    ? `\nPERSONALIZATION (Email 1 only): Use the literal token {{firstName}} wherever you include the prospect's first name in Email 1's opening greeting and in the subject_short field. Do not write the actual name — write {{firstName}} exactly so it can be dynamically replaced. Example opening: "Hi {{firstName}}," — example subject: "Quick question for {{firstName}} at [Company]". Do NOT use {{firstName}} in Email 2 or Email 3.`
    : ''
  const painPointBlock = painPoint.trim()
    ? `\nPROSPECT PAIN POINT: ${painPoint.trim()}\nLead with or address this specific challenge naturally in all three emails — it should feel like you understand their exact situation.`
    : ''
  const competitorBlock = competitorTools.trim()
    ? `\nTOOLS THEY LIKELY USE: ${competitorTools.trim()}\nIn Email 1 ONLY, weave in a natural, specific reference to one of these tools to signal that you've done research on their stack. Examples: "Since you're already using HubSpot...", "I noticed most teams using Apollo also struggle with...", "This works alongside Instantly, not instead of it...". Keep it to one brief mention — don't dwell on it or make it the focus. Do NOT reference these tools in Email 2 or Email 3.`
    : ''
  const fw = EMAIL_FRAMEWORKS.find((f) => f.value === framework) ?? EMAIL_FRAMEWORKS[0]
  const frameworkBlock = `\nEMAIL FRAMEWORK (${fw.label} — ${fw.description}): ${fw.promptInstruction}`
  return `Generate 3 cold emails for the following situation:

SENDER'S PERSONAL NAME (use for opening, in-body reference, and sign-off — sign off with first name only): ${senderName}
SENDER'S PRODUCT OR SERVICE (describe/reference this separately in the body, not as a business name): ${senderOffer}

TARGET: ${targetAndRole}
GOAL: ${goal}
INDUSTRY CONTEXT: ${industry}
Use industry-appropriate pain points, terminology, benchmarks, and references for this sector so the emails sound credible to the reader. Stay accurate—do not invent fake stats or name-drop unrelated industries.
TARGET WORD COUNT: Aim for approximately ${targetWordCount} words per email body (sign-off included; ±10 words is fine). Do not pad with filler to hit the number — stay tight and purposeful.${painPointBlock}${competitorBlock}${personalizationBlock}${frameworkBlock}

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

async function generateEmails(nameAndOffer, targetAndRole, goal, toneLabel, industry, prospectFirstName = '', voiceProfile = null, targetWordCount = LENGTH_SLIDER_DEFAULT, painPoint = '', framework = 'PAS', competitorTools = '') {
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
      max_tokens: 1800,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [
        { role: 'user', content: buildUserMessage(senderName, senderOffer, targetAndRole, goal, industry, prospectFirstName, targetWordCount, painPoint, framework, competitorTools) },
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

async function generateShortEmailVariants(nameAndOffer, targetAndRole, goal, toneLabel, industry, voiceProfile = null) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const system = `${buildSystemPromptWithTone(toneLabel, voiceProfile)}\n\n${SHORT_VARIANT_SYSTEM_APPEND}`
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

/** Replace {{firstName}} token with actual name, 'there', or remove it. */
function substituteFirstNameToken(text, firstName, mode = 'name') {
  if (!text) return text
  if (mode === 'name') return text.replace(/\{\{firstName\}\}/g, firstName)
  // 'standard': replace with 'there' in body-like text, strip from subject
  if (mode === 'standard-body') return text.replace(/\{\{firstName\}\}/g, 'there')
  if (mode === 'standard-subject') return text.replace(/\{\{firstName\}\}/g, '').replace(/\s{2,}/g, ' ').trim()
  return text
}

/** Renders text replacing {{firstName}} with a highlighted <mark> element. */
function renderPersonalizedText(text, firstName) {
  const parts = text.split('{{firstName}}')
  if (parts.length === 1) return text
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && (
        <mark className="bg-amber-200 text-amber-900 font-semibold not-italic rounded px-0.5">
          {firstName}
        </mark>
      )}
    </span>
  ))
}

// ─── Email 1 A/B Variant Generator ──────────────────────────────────────────

const EMAIL1_VARIANT_ANGLES = [
  {
    key: 'curiosity',
    label: 'Curiosity',
    angleLabel: 'Curiosity Gap',
    description: 'Teases a result or insight without fully revealing it — makes them need to reply to get the answer.',
    subjectKey: 'curiosity_subject',
    bodyKey: 'curiosity_body',
  },
  {
    key: 'stat',
    label: 'Stat',
    angleLabel: 'Specific Stat',
    description: 'Opens with a relevant number or data point that creates instant credibility.',
    subjectKey: 'stat_subject',
    bodyKey: 'stat_body',
  },
  {
    key: 'observation',
    label: 'Observation',
    angleLabel: 'Observation Opener',
    description: 'Starts with a specific observation about their company, role, or industry that shows research.',
    subjectKey: 'observation_subject',
    bodyKey: 'observation_body',
  },
]

async function generateEmail1Variants(nameAndOffer, targetAndRole, goal, toneLabel, industry, originalEmail1Body, voiceProfile = null, targetWordCount = LENGTH_SLIDER_DEFAULT) {
  const { senderName, senderOffer } = parseNameAndOffer(nameAndOffer)
  const first = senderName.split(/\s+/)[0] || senderName
  const userMessage = `Generate 3 alternative A/B versions of Email 1 — a concise first-touch cold email. Each version must use a completely different opening angle. Match approximately ${targetWordCount} words per email.

CONTEXT
SENDER PERSONAL NAME (sign off with first name only): ${senderName}
SENDER PRODUCT OR SERVICE: ${senderOffer}
TARGET: ${targetAndRole}
GOAL: ${goal}
INDUSTRY CONTEXT: ${industry}

ORIGINAL EMAIL 1 (for reference — do NOT recycle sentences or structure from it):
${originalEmail1Body}

VARIANT 1 — CURIOSITY GAP: Tease a specific result, pattern, or insight your offer delivers without fully revealing it — the reader must reply to get the full picture. Create genuine intrigue, not clickbait.

VARIANT 2 — SPECIFIC STAT: Open with a concrete, relevant number or data point that makes the reader stop and think. The stat must feel earned and directly bridge to the offer — no fake statistics; use realistic ranges or well-known benchmarks if needed.

VARIANT 3 — OBSERVATION OPENER: Open with a hyper-specific observation about their company, their role, or a recent industry development that shows real research. Make it feel like it was written only for them.

Return ONLY a JSON object (all string values, no markdown) with exactly these keys:
- curiosity_subject, curiosity_body
- stat_subject, stat_body
- observation_subject, observation_body

Each body must sign off with only the sender's first name (e.g. "Best," then "${first}" on the next line).`

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
      max_tokens: 1400,
      system: buildSystemPromptWithTone(toneLabel, voiceProfile),
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    let message = `API error: ${res.status} ${res.statusText}`
    try { const d = JSON.parse(errBody); if (d.error?.message) message = d.error.message } catch { if (errBody) message += ` — ${errBody.slice(0, 200)}` }
    throw new Error(message)
  }

  const data = await res.json()
  const content = data.content
  if (!content?.length || content[0].type !== 'text') throw new Error('Invalid response format from API')
  const parsed = parseEmailJson(content[0].text)
  return EMAIL1_VARIANT_ANGLES.map((angle) => ({
    key: angle.key,
    label: angle.label,
    angleLabel: angle.angleLabel,
    description: angle.description,
    subject: typeof parsed[angle.subjectKey] === 'string' ? parsed[angle.subjectKey] : '',
    body: typeof parsed[angle.bodyKey] === 'string' ? parsed[angle.bodyKey] : '',
  }))
}

// ─── Reply Score ────────────────────────────────────────────────────────────

const SPAM_TRIGGER_WORDS = ['free', 'guaranteed', 'no risk', 'limited time', 'act now']

/** Rough syllable count for a single word. */
function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return 1
  // strip trailing silent-e patterns and count vowel groups
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const matches = stripped.match(/[aeiouy]{1,2}/g)
  return matches ? Math.max(1, matches.length) : 1
}

/** Flesch-Kincaid Grade Level (simplified). */
function fleschKincaidGrade(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 2)
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0)
  if (sentences.length === 0 || words.length === 0) return 0
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0)
  return 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59
}

/**
 * Computes the reply-likelihood score (0–100) and per-factor breakdown.
 * @param {string} body  Email body text
 * @param {string} ps    P.S. line (empty string if none)
 */
function computeReplyScore(body, ps) {
  const wc = countWords(body)
  const bodyLower = body.toLowerCase()

  // 1. Word count in optimal range (50–125 words): +20
  const wcPass = wc >= 50 && wc <= 125

  // 2. Prospect first name in greeting: +15
  //    Matches "Hi Sarah," / "Hey John!" / "Dear Alex,"
  const namePass = /\b(?:hi|hey|dear)\s+[A-Z][a-z]{1,}[,!]/.test(body)

  // 3. Ends with a question as CTA: +15
  //    Check the last ~200 chars for a question mark before the sign-off
  const tail = body.slice(-200)
  const questionPass = /\?/.test(tail)

  // 4. No spam trigger words: +20
  const foundSpam = SPAM_TRIGGER_WORDS.filter((w) => bodyLower.includes(w))
  const spamPass = foundSpam.length === 0

  // 5. Reading level ≤ grade 6: +15
  const grade = fleschKincaidGrade(body)
  const readPass = grade <= 6.0

  // 6. P.S. line present: +15
  const psPass = ps.trim().length > 0

  const factors = [
    { label: 'Word count (50–125 words)',     points: 20, pass: wcPass,      earned: wcPass ? 20 : 0,      detail: `${wc} words` },
    { label: 'First name in greeting',         points: 15, pass: namePass,    earned: namePass ? 15 : 0,    detail: namePass ? 'Name detected' : 'No "Hi [Name]" found' },
    { label: 'Ends with a question CTA',       points: 15, pass: questionPass,earned: questionPass ? 15 : 0,detail: questionPass ? 'Question found' : 'No question mark near end' },
    { label: 'No spam trigger words',          points: 20, pass: spamPass,    earned: spamPass ? 20 : 0,    detail: spamPass ? 'Clean' : `Found: ${foundSpam.join(', ')}` },
    { label: `Reading level (grade ≤ 6)`,      points: 15, pass: readPass,    earned: readPass ? 15 : 0,    detail: `Grade ${Math.max(0, grade).toFixed(1)}` },
    { label: 'P.S. line attached',             points: 15, pass: psPass,      earned: psPass ? 15 : 0,      detail: psPass ? 'P.S. present' : 'No P.S. line' },
  ]

  const score = factors.reduce((sum, f) => sum + f.earned, 0)
  return { score, factors }
}

/** Tailwind classes for the score badge based on value. */
function scoreBadgeClasses(score) {
  if (score >= 75) return 'border-green-500/50 bg-green-600/15 text-green-300'
  if (score >= 50) return 'border-amber-500/50 bg-amber-500/15 text-amber-300'
  return 'border-red-500/50 bg-red-600/15 text-red-300'
}

// ────────────────────────────────────────────────────────────────────────────

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
  const isNearLimit = remaining >= 0 && remaining < 20
  const showHint = typeof hint === 'string' && hint.length > 0 && length < hintMinLength

  let counterClass = 'text-xs block tabular-nums text-slate-500'
  if (isOver) {
    counterClass = 'text-xs block tabular-nums text-red-400 font-bold'
  } else if (isNearLimit) {
    counterClass = 'text-xs block tabular-nums text-red-400'
  }

  return (
    <div className="mt-1 space-y-1">
      <span className={counterClass} aria-live="polite">
        {length} / {max}
      </span>
      {showHint && (
        <p className="text-xs text-slate-500 italic" aria-live="polite">
          {hint}
        </p>
      )}
    </div>
  )
}

function App() {
  const [appMode, setAppMode] = useState('generate') // 'generate' | 'reengage'
  const [nameAndOffer, setNameAndOffer] = useState('')
  const [targetAndRole, setTargetAndRole] = useState('')
  const [goal, setGoal] = useState('Book a Call')
  const [industry, setIndustry] = useState('Other')
  const [tone, setTone] = useState('Conversational')
  const [framework, setFramework] = useState('PAS')
  const [appliedFramework, setAppliedFramework] = useState(null) // set after generation
  // Re-engage form fields
  const [reengageName, setReengageName] = useState('')
  const [reengageCompany, setReengageCompany] = useState('')
  const [reengageTopic, setReengageTopic] = useState('')
  const [reengageLastContact, setReengageLastContact] = useState('')
  const [reengageReason, setReengageReason] = useState('')
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
  // Email 1 A/B variant generator
  const [email1Variants, setEmail1Variants] = useState(null)       // null | [{key,label,angleLabel,description,subject,body}]
  const [email1VariantsLoading, setEmail1VariantsLoading] = useState(false)
  const [email1VariantsError, setEmail1VariantsError] = useState(null)
  const [email1ActiveVariantTab, setEmail1ActiveVariantTab] = useState(0) // 0=Original, 1=Curiosity, 2=Stat, 3=Observation
  // Reading level simplifier state
  const [simplifyLoading, setSimplifyLoading] = useState(() => [false, false, false])
  const [simplifyError, setSimplifyError] = useState(() => [null, null, null])
  const [simplifyWordCountBefore, setSimplifyWordCountBefore] = useState(() => [null, null, null])
  const [simplifyWordCountAfter, setSimplifyWordCountAfter] = useState(() => [null, null, null])
  // Pattern interrupt opener
  const [patternInterruptEnabled, setPatternInterruptEnabled] = useState(false)
  const [patternInterruptLine, setPatternInterruptLine] = useState(null) // null = not active
  const [patternInterruptLoading, setPatternInterruptLoading] = useState(false)
  const [patternInterruptError, setPatternInterruptError] = useState(null)
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

  // Form validation — differs by mode
  const reengageFilledFields = [reengageName, reengageCompany, reengageTopic, reengageLastContact, reengageReason]
  const reengageFilledCount = reengageFilledFields.filter((s) => s.trim().length > 0).length
  const reengageAllFilled = nameAndOffer.trim() !== '' && reengageFilledCount >= 3 &&
    reengageName.trim() !== '' && reengageCompany.trim() !== '' && reengageTopic.trim() !== ''
  const allFilled = appMode === 'reengage'
    ? reengageAllFilled
    : (nameAndOffer.trim() !== '' && targetAndRole.trim() !== '' && goal.trim() !== '')
  const formFilledCount = appMode === 'reengage'
    ? Math.min(3, [nameAndOffer, reengageName, reengageCompany, reengageTopic, reengageLastContact, reengageReason].filter((s) => s.trim().length > 0).length)
    : [nameAndOffer, targetAndRole, goal].filter((s) => s.trim().length > 0).length
  const formProgressPct = FORM_PROGRESS_BY_FILLED[formFilledCount]
  const formReady = appMode === 'reengage' ? reengageAllFilled : formFilledCount === 3
  const canGenerate = allFilled && !loading && (unlocked || usageRemaining > 0)

  const displayEmails = emails ?? PLACEHOLDER_EMAILS
  const showGeneratedResults = emails !== null

  const [shareBannerDismissed, setShareBannerDismissed] = useState(false)
  const [shareLinkCopied, setShareLinkCopied] = useState(false)
  const shareLinkCopiedTimerRef = useRef(null)

  const [personalizeEnabled, setPersonalizeEnabled] = useState(false)
  const [prospectFirstName, setProspectFirstName] = useState('')
  const [email1RawForPreview, setEmail1RawForPreview] = useState(null)

  const [voiceProfile, setVoiceProfile] = useState(getStoredVoiceProfile)
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const [voiceSampleText, setVoiceSampleText] = useState('')
  const [voiceAnalyzing, setVoiceAnalyzing] = useState(false)
  const [voiceAnalysisError, setVoiceAnalysisError] = useState(null)

  const [painPoint, setPainPoint] = useState('')
  const [painPointModalOpen, setPainPointModalOpen] = useState(false)
  const [painPointLibraryTab, setPainPointLibraryTab] = useState(PAIN_POINT_LIBRARY_INDUSTRIES[0])
  const [aiPainPoints, setAiPainPoints] = useState([])
  const [aiPainPointsLoading, setAiPainPointsLoading] = useState(false)
  const [aiPainPointsError, setAiPainPointsError] = useState(null)
  const [competitorTools, setCompetitorTools] = useState('')
  const [appliedCompetitorTools, setAppliedCompetitorTools] = useState('')

  const [psLines, setPsLines] = useState(() => ({ 0: null, 2: null }))
  const [psLoading, setPsLoading] = useState(() => ({ 0: false, 2: false }))
  const [psStyles, setPsStyles] = useState(() => ({ 0: 'urgency', 2: 'social_proof' }))

  // emailScores depends on psLines — must be declared AFTER psLines useState
  const emailScores = useMemo(() => {
    if (!showGeneratedResults) return [null, null, null]
    return [0, 1, 2].map((i) => {
      const body = emailCardBodies[i] ?? ''
      if (!body.trim()) return null
      const ps = PS_EMAIL_INDICES.includes(i) ? (psLines[i] ?? '') : ''
      return computeReplyScore(body, ps)
    })
  }, [emailCardBodies, psLines, showGeneratedResults])

  const [targetLength, setTargetLength] = useState(LENGTH_SLIDER_DEFAULT)
  const [cardTargetLengths, setCardTargetLengths] = useState(() => [LENGTH_SLIDER_DEFAULT, LENGTH_SLIDER_DEFAULT, LENGTH_SLIDER_DEFAULT])
  const [cardAppliedLengths, setCardAppliedLengths] = useState(() => [LENGTH_SLIDER_DEFAULT, LENGTH_SLIDER_DEFAULT, LENGTH_SLIDER_DEFAULT])
  const [cardLengthLoading, setCardLengthLoading] = useState(() => [false, false, false])
  const [cardLengthError, setCardLengthError] = useState(() => [null, null, null])

  const [sequenceMode, setSequenceMode] = useState('standard') // 'standard' | 'drip'
  const [dripEmails, setDripEmails] = useState(null)
  const [dripLoading, setDripLoading] = useState(false)
  const [dripError, setDripError] = useState(null)
  const [dripActiveTab, setDripActiveTab] = useState(0)
  const [dripCardBodies, setDripCardBodies] = useState(() => DRIP_SEQUENCE_SLOTS.map(() => ''))
  const [dripCardSubjects, setDripCardSubjects] = useState(() => DRIP_SEQUENCE_SLOTS.map(() => ''))
  const [dripCopiedIndex, setDripCopiedIndex] = useState(null)

  const [icebreakers, setIcebreakers] = useState(null)
  const [icebreakerLoading, setIcebreakerLoading] = useState(false)
  const [icebreakerError, setIcebreakerError] = useState(null)
  const [icebreakerActiveIndex, setIcebreakerActiveIndex] = useState(null)
  const [icebreakerBodySnapshot, setIcebreakerBodySnapshot] = useState(null)

  const [replyTemplates, setReplyTemplates] = useState(null)          // null | array of {key,label,description,text}
  const [replyTemplatesLoading, setReplyTemplatesLoading] = useState(false)
  const [replyTemplatesError, setReplyTemplatesError] = useState(null)
  const [replyTemplatesSectionOpen, setReplyTemplatesSectionOpen] = useState(false)
  const [replyTemplateCopied, setReplyTemplateCopied] = useState(null) // key of copied template
  const [replyTemplateRegenLoading, setReplyTemplateRegenLoading] = useState({}) // { [key]: bool }
  const [replyTemplateRegenError, setReplyTemplateRegenError] = useState({})    // { [key]: string|null }

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
    const shouldSubstitute = personalizeEnabled && prospectFirstName.trim() !== '' && emails !== null
    const firstName = prospectFirstName.trim()

    if (shouldSubstitute) {
      // Save raw Email 1 (with {{firstName}} token) for the preview comparison
      setEmail1RawForPreview({
        body: source[0]?.body ?? '',
        subject: source[0]?.subject ?? '',
      })
    } else {
      setEmail1RawForPreview(null)
    }

    const bodies = source.map((e, i) => {
      const body = e.body
      if (shouldSubstitute && i === 0) return substituteFirstNameToken(body, firstName, 'name')
      return body
    })
    const subjects = source.map((e, i) => {
      const subj = e.subject ?? ''
      if (shouldSubstitute && i === 0) return substituteFirstNameToken(subj, firstName, 'name')
      return subj
    })

    setEmailCardBodies(bodies)
    setEmailCardOriginalBodies(bodies)
    setEmailCardSubjects(subjects)
    setEmailCardOriginalSubjects(subjects)

    // Sync card-level length sliders to current global target
    if (emails !== null) {
      setCardTargetLengths([targetLength, targetLength, targetLength])
      setCardAppliedLengths([targetLength, targetLength, targetLength])
      setCardLengthLoading([false, false, false])
      setCardLengthError([null, null, null])
    }
  }, [emails]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!emails) return
    const initialStyles = { 0: 'urgency', 2: 'social_proof' }
    setPsStyles(initialStyles)
    setPsLines({ 0: null, 2: null })
    setPsLoading({ 0: true, 2: true })
    PS_EMAIL_INDICES.forEach((idx) => {
      const emailBody = emails[idx]?.body ?? ''
      if (!emailBody) {
        setPsLoading((prev) => ({ ...prev, [idx]: false }))
        return
      }
      generatePsLine(emailBody, targetAndRole, goal, industry, initialStyles[idx], tone, voiceProfile)
        .then((text) => setPsLines((prev) => ({ ...prev, [idx]: text })))
        .catch(() => { /* silent — P.S. is an enhancement, not required */ })
        .finally(() => setPsLoading((prev) => ({ ...prev, [idx]: false })))
    })
  }, [emails]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!emails) return
    const body = emails[0]?.body ?? ''
    if (!body.trim()) return
    setIcebreakers(null)
    setIcebreakerError(null)
    setIcebreakerLoading(true)
    setIcebreakerActiveIndex(null)
    setIcebreakerBodySnapshot(null)
    generateIcebreakers(targetAndRole, industry, body, tone, voiceProfile)
      .then((items) => setIcebreakers(items))
      .catch((err) => setIcebreakerError(err.message || 'Failed to generate icebreakers'))
      .finally(() => setIcebreakerLoading(false))
  }, [emails]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!emails) return
    const body = emails[0]?.body ?? ''
    if (!body.trim()) return
    setReplyTemplates(null)
    setReplyTemplatesError(null)
    setReplyTemplatesLoading(true)
    setReplyTemplatesSectionOpen(false)
    setReplyTemplateCopied(null)
    setReplyTemplateRegenLoading({})
    setReplyTemplateRegenError({})
    generateAllReplyTemplates(nameAndOffer, targetAndRole, goal, industry, tone, body, voiceProfile)
      .then((items) => setReplyTemplates(items))
      .catch((err) => setReplyTemplatesError(err.message || 'Failed to generate reply templates'))
      .finally(() => setReplyTemplatesLoading(false))
  }, [emails]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-set pattern interrupt default line when new emails arrive with toggle on
  useEffect(() => {
    if (!emails || !patternInterruptEnabled) {
      if (!emails) setPatternInterruptLine(null)
      return
    }
    setPatternInterruptLine((prev) => prev ?? (PATTERN_INTERRUPT_LINES[industry] ?? PATTERN_INTERRUPT_LINES['Other']))
    setPatternInterruptError(null)
  }, [emails]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearFormAndResults = () => {
    setNameAndOffer('')
    setTargetAndRole('')
    setGoal('Book a Call')
    setIndustry('Other')
    setTone('Conversational')
    setFramework('PAS')
    setAppliedFramework(null)
    setReengageName('')
    setReengageCompany('')
    setReengageTopic('')
    setReengageLastContact('')
    setReengageReason('')
    setEmails(null)
    setEmail1RawForPreview(null)
    setError(null)
    setCopiedIndex(null)
    setCopiedSubjectIndex(null)
    setShortVariants(null)
    setVariantsError(null)
    setVariantsLoading(false)
    setVariantCopiedIndex(null)
    setVariantsExpanded(true)
    setEmail1Variants(null)
    setEmail1VariantsLoading(false)
    setEmail1VariantsError(null)
    setEmail1ActiveVariantTab(0)
    setPsLines({ 0: null, 2: null })
    setPsLoading({ 0: false, 2: false })
    setPsStyles({ 0: 'urgency', 2: 'social_proof' })
    setCardTargetLengths([LENGTH_SLIDER_DEFAULT, LENGTH_SLIDER_DEFAULT, LENGTH_SLIDER_DEFAULT])
    setCardAppliedLengths([LENGTH_SLIDER_DEFAULT, LENGTH_SLIDER_DEFAULT, LENGTH_SLIDER_DEFAULT])
    setCardLengthLoading([false, false, false])
    setCardLengthError([null, null, null])
    setPainPoint('')
    setAiPainPoints([])
    setAiPainPointsError(null)
    setAiPainPointsLoading(false)
    setCompetitorTools('')
    setAppliedCompetitorTools('')
    setDripEmails(null)
    setDripError(null)
    setDripLoading(false)
    setDripActiveTab(0)
    setDripCardBodies(DRIP_SEQUENCE_SLOTS.map(() => ''))
    setDripCardSubjects(DRIP_SEQUENCE_SLOTS.map(() => ''))
    setDripCopiedIndex(null)
    setIcebreakers(null)
    setIcebreakerLoading(false)
    setIcebreakerError(null)
    setIcebreakerActiveIndex(null)
    setIcebreakerBodySnapshot(null)
    setReplyTemplates(null)
    setReplyTemplatesLoading(false)
    setReplyTemplatesError(null)
    setReplyTemplatesSectionOpen(false)
    setReplyTemplateCopied(null)
    setReplyTemplateRegenLoading({})
    setReplyTemplateRegenError({})
    setSimplifyLoading([false, false, false])
    setSimplifyError([null, null, null])
    setSimplifyWordCountBefore([null, null, null])
    setSimplifyWordCountAfter([null, null, null])
    setPatternInterruptLine(null)
    setPatternInterruptLoading(false)
    setPatternInterruptError(null)
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
    setDripError(null)

    if (sequenceMode === 'drip') {
      setDripLoading(true)
      setDripEmails(null)
      setDripActiveTab(0)
      try {
        const result = await generateDripSequence(nameAndOffer, targetAndRole, goal, tone, industry, voiceProfile, targetLength, painPoint)
        setDripEmails(result)
        setDripCardBodies(result.map((e) => e.body))
        setDripCardSubjects(result.map((e) => e.subject))
        if (!unlocked) {
          const newCount = usageCount + 1
          setUsageCount(newCount)
          setStoredUsage(newCount)
          if (newCount >= FREE_GENERATIONS_LIMIT) setShowUpgradeModal(true)
        }
      } catch (err) {
        setDripError(err.message || 'Something went wrong.')
        setDripEmails(null)
      } finally {
        setDripLoading(false)
      }
      return
    }

    setLoading(true)
    setEmails(null)
    setEmail1RawForPreview(null)
    setShortVariants(null)
    setVariantsError(null)
    setVariantCopiedIndex(null)
    try {
      let result
      if (appMode === 'reengage') {
        result = await generateReengageEmails(nameAndOffer, reengageName, reengageCompany, reengageTopic, reengageLastContact, reengageReason, tone, industry, voiceProfile, targetLength)
        setAppliedFramework(null)
        setAppliedCompetitorTools('')
      } else {
        const firstName = personalizeEnabled ? prospectFirstName.trim() : ''
        result = await generateEmails(nameAndOffer, targetAndRole, goal, tone, industry, firstName, voiceProfile, targetLength, painPoint, framework, competitorTools)
        setAppliedFramework(framework)
        setAppliedCompetitorTools(competitorTools.trim())
      }
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

  const handleCopy = useCallback(
    (email, index) => {
      const ps = PS_EMAIL_INDICES.includes(index) && psLines[index] ? psLines[index] : null
      let body = email.body
      if (index === 0 && patternInterruptLine) {
        body = `${patternInterruptLine}\n\n${body}`
      }
      const bodyWithPs = ps ? `${body}\n\n${ps}` : body
      const emailToCopy = { ...email, body: bodyWithPs }
      const text = formatSingleEmailForClipboard(emailToCopy)
      navigator.clipboard.writeText(text)
      setCopiedSubjectIndex(null)
      setCopiedIndex(index)
      window.setTimeout(() => setCopiedIndex(null), 2000)
    },
    [psLines, patternInterruptLine],
  )

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

  const handleExportDripCsv = useCallback(() => {
    if (!dripEmails) return
    const merged = dripEmails.map((e, i) => ({
      ...e,
      subject: dripCardSubjects[i] ?? e.subject,
      body: dripCardBodies[i] ?? e.body,
    }))
    const csv = buildDripCsvContent(merged)
    const slug = targetAndRole.trim().slice(0, 30).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'sequence'
    downloadCsv(csv, `coldmail-sequence-${slug}.csv`)
  }, [dripEmails, dripCardSubjects, dripCardBodies, targetAndRole])

  const handleInjectIcebreaker = useCallback((icebreaker, index) => {
    // Capture snapshot of original body before first injection
    const snapshot = icebreakerActiveIndex === null
      ? (emailCardBodies[0] ?? '')
      : (icebreakerBodySnapshot ?? emailCardBodies[0] ?? '')
    if (icebreakerActiveIndex === null) {
      setIcebreakerBodySnapshot(emailCardBodies[0] ?? '')
    }
    // Replace the first paragraph (text before the first blank line) with the icebreaker
    const parts = snapshot.split('\n\n')
    parts[0] = icebreaker.text
    const newBody = parts.join('\n\n')
    setEmailCardBodies((prev) => { const next = [...prev]; next[0] = newBody; return next })
    setIcebreakerActiveIndex(index)
  }, [emailCardBodies, icebreakerActiveIndex, icebreakerBodySnapshot])

  const handleRemoveIcebreaker = useCallback(() => {
    if (icebreakerBodySnapshot !== null) {
      setEmailCardBodies((prev) => { const next = [...prev]; next[0] = icebreakerBodySnapshot; return next })
    }
    setIcebreakerActiveIndex(null)
    setIcebreakerBodySnapshot(null)
  }, [icebreakerBodySnapshot])

  const handleRegenerateIcebreakers = useCallback(async () => {
    const body = emailCardBodies[0] ?? emails?.[0]?.body ?? ''
    if (!body.trim()) return
    setIcebreakerLoading(true)
    setIcebreakerError(null)
    try {
      const items = await generateIcebreakers(targetAndRole, industry, body, tone, voiceProfile)
      setIcebreakers(items)
    } catch (err) {
      setIcebreakerError(err.message || 'Failed to generate icebreakers')
    } finally {
      setIcebreakerLoading(false)
    }
  }, [emailCardBodies, emails, targetAndRole, industry, tone, voiceProfile])

  const handleRegenerateReplyTemplate = useCallback(async (scenario) => {
    const body = emailCardBodies[0] ?? emails?.[0]?.body ?? ''
    setReplyTemplateRegenLoading((prev) => ({ ...prev, [scenario.key]: true }))
    setReplyTemplateRegenError((prev) => ({ ...prev, [scenario.key]: null }))
    try {
      const text = await regenerateSingleReplyTemplate(scenario, nameAndOffer, targetAndRole, goal, industry, tone, body, voiceProfile)
      setReplyTemplates((prev) =>
        prev ? prev.map((t) => (t.key === scenario.key ? { ...t, text } : t)) : prev
      )
    } catch (err) {
      setReplyTemplateRegenError((prev) => ({ ...prev, [scenario.key]: err.message || 'Failed' }))
    } finally {
      setReplyTemplateRegenLoading((prev) => ({ ...prev, [scenario.key]: false }))
    }
  }, [emailCardBodies, emails, nameAndOffer, targetAndRole, goal, industry, tone, voiceProfile])

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
      const list = await generateShortEmailVariants(nameAndOffer, targetAndRole, goal, tone, industry, voiceProfile)
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

  const handleGenerateEmail1Variants = useCallback(async () => {
    const originalBody = emailCardBodies[0] ?? emails?.[0]?.body ?? ''
    if (!originalBody.trim()) return
    setEmail1VariantsError(null)
    setEmail1VariantsLoading(true)
    setEmail1ActiveVariantTab(0)
    try {
      const variants = await generateEmail1Variants(nameAndOffer, targetAndRole, goal, tone, industry, originalBody, voiceProfile, targetLength)
      setEmail1Variants(variants)
      setEmail1ActiveVariantTab(1) // switch to first variant tab automatically
    } catch (err) {
      setEmail1VariantsError(err.message || 'Could not generate variants.')
    } finally {
      setEmail1VariantsLoading(false)
    }
  }, [emailCardBodies, emails, nameAndOffer, targetAndRole, goal, tone, industry, voiceProfile, targetLength])

  const handleUseEmail1Variant = useCallback((variant) => {
    setEmailCardSubjects((prev) => { const next = [...prev]; next[0] = variant.subject; return next })
    setEmailCardBodies((prev) => { const next = [...prev]; next[0] = variant.body; return next })
    setEmail1Variants(null)
    setEmail1ActiveVariantTab(0)
  }, [])

  const handleSimplifyEmail = useCallback(async (index) => {
    const body = emailCardBodies[index] ?? ''
    if (!body.trim()) return
    const wcBefore = countWords(body)
    setSimplifyError((prev) => { const next = [...prev]; next[index] = null; return next })
    setSimplifyLoading((prev) => { const next = [...prev]; next[index] = true; return next })
    setSimplifyWordCountBefore((prev) => { const next = [...prev]; next[index] = wcBefore; return next })
    setSimplifyWordCountAfter((prev) => { const next = [...prev]; next[index] = null; return next })
    try {
      const simplified = await simplifyEmailToGrade5(body, tone, nameAndOffer, targetAndRole, goal, voiceProfile)
      setEmailCardBodies((prev) => { const next = [...prev]; next[index] = simplified; return next })
      setSimplifyWordCountAfter((prev) => { const next = [...prev]; next[index] = countWords(simplified); return next })
    } catch (err) {
      setSimplifyError((prev) => { const next = [...prev]; next[index] = err.message || 'Simplification failed.'; return next })
    } finally {
      setSimplifyLoading((prev) => { const next = [...prev]; next[index] = false; return next })
    }
  }, [emailCardBodies, tone, nameAndOffer, targetAndRole, goal, voiceProfile])

  const handlePatternInterruptToggle = useCallback(() => {
    if (patternInterruptEnabled) {
      setPatternInterruptEnabled(false)
      setPatternInterruptLine(null)
      setPatternInterruptError(null)
    } else {
      setPatternInterruptEnabled(true)
      setPatternInterruptError(null)
      // If emails already exist, set the default line immediately
      if (showGeneratedResults) {
        setPatternInterruptLine(PATTERN_INTERRUPT_LINES[industry] ?? PATTERN_INTERRUPT_LINES['Other'])
      }
    }
  }, [patternInterruptEnabled, showGeneratedResults, industry])

  const handleRefreshPatternInterrupt = useCallback(async () => {
    setPatternInterruptLoading(true)
    setPatternInterruptError(null)
    try {
      const newLine = await generatePatternInterruptLine(industry, nameAndOffer, targetAndRole, goal, tone, voiceProfile)
      setPatternInterruptLine(newLine)
    } catch (err) {
      setPatternInterruptError(err.message || 'Could not refresh.')
    } finally {
      setPatternInterruptLoading(false)
    }
  }, [industry, nameAndOffer, targetAndRole, goal, tone, voiceProfile])

  const handleShareLinkCopy = useCallback(() => {
    navigator.clipboard.writeText('https://garell.gumroad.com/l/cfjno')
    setShareLinkCopied(true)
    if (shareLinkCopiedTimerRef.current) window.clearTimeout(shareLinkCopiedTimerRef.current)
    shareLinkCopiedTimerRef.current = window.setTimeout(() => {
      setShareLinkCopied(false)
      shareLinkCopiedTimerRef.current = null
    }, 2000)
  }, [])

  const handleAnalyzeVoice = async () => {
    if (!voiceSampleText.trim()) return
    setVoiceAnalyzing(true)
    setVoiceAnalysisError(null)
    try {
      const profile = await analyzeVoiceProfile(voiceSampleText.trim())
      setVoiceProfile(profile)
      setStoredVoiceProfile(profile)
      setVoiceSampleText('')
    } catch (err) {
      setVoiceAnalysisError(err.message || 'Could not analyze voice profile.')
    } finally {
      setVoiceAnalyzing(false)
    }
  }

  const handleClearVoiceProfile = () => {
    setVoiceProfile(null)
    clearStoredVoiceProfile()
    setVoiceSampleText('')
    setVoiceAnalysisError(null)
  }

  const openPainPointModal = () => {
    setAiPainPoints([])
    setAiPainPointsError(null)
    setPainPointModalOpen(true)
  }

  const closePainPointModal = () => setPainPointModalOpen(false)

  const selectPainPoint = (pt) => {
    setPainPoint(pt)
    closePainPointModal()
  }

  const handleGenerateAiPainPoints = async () => {
    setAiPainPointsLoading(true)
    setAiPainPointsError(null)
    setAiPainPoints([])
    try {
      const pts = await generateAiPainPoints(targetAndRole.trim() || 'a business prospect', industry)
      setAiPainPoints(pts)
    } catch (err) {
      setAiPainPointsError(err.message || 'Could not generate pain points.')
    } finally {
      setAiPainPointsLoading(false)
    }
  }

  const handleRefreshPs = useCallback(
    (index) => {
      const emailBody = emailCardBodies[index] ?? displayEmails[index]?.body ?? ''
      const nextStyle = PS_STYLES[(PS_STYLES.indexOf(psStyles[index]) + 1) % PS_STYLES.length]
      setPsStyles((prev) => ({ ...prev, [index]: nextStyle }))
      setPsLoading((prev) => ({ ...prev, [index]: true }))
      setPsLines((prev) => ({ ...prev, [index]: null }))
      generatePsLine(emailBody, targetAndRole, goal, industry, nextStyle, tone, voiceProfile)
        .then((text) => setPsLines((prev) => ({ ...prev, [index]: text })))
        .catch(() => { /* silent */ })
        .finally(() => setPsLoading((prev) => ({ ...prev, [index]: false })))
    },
    [emailCardBodies, displayEmails, psStyles, targetAndRole, goal, industry, tone, voiceProfile],
  )

  const handleApplyLength = useCallback(
    async (index) => {
      const emailBody = emailCardBodies[index] ?? ''
      const targetWC = cardTargetLengths[index]
      setCardLengthLoading((prev) => { const next = [...prev]; next[index] = true; return next })
      setCardLengthError((prev) => { const next = [...prev]; next[index] = null; return next })
      try {
        const newBody = await rewriteEmailToLength(emailBody, targetWC, tone, nameAndOffer, targetAndRole, goal, voiceProfile)
        setEmailCardBodies((prev) => { const next = [...prev]; next[index] = newBody; return next })
        setCardAppliedLengths((prev) => { const next = [...prev]; next[index] = targetWC; return next })
      } catch (err) {
        setCardLengthError((prev) => { const next = [...prev]; next[index] = err.message || 'Rewrite failed.'; return next })
      } finally {
        setCardLengthLoading((prev) => { const next = [...prev]; next[index] = false; return next })
      }
    },
    [emailCardBodies, cardTargetLengths, tone, nameAndOffer, targetAndRole, goal, voiceProfile],
  )

  const undoEmailCardEdits = (index) => {
    setEmailCardBodies((prev) => {
      const next = [...prev]
      next[index] = emailCardOriginalBodies[index] ?? ''
      return next
    })
  }

  const handleBookmarkCard = useCallback(
    (index) => {
      const email = displayEmails[index]
      const body = emailCardBodies[index] ?? email.body
      const subject = emailCardSubjects[index] ?? email.subject ?? ''
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        savedAt: Date.now(),
        email: { title: email.title, subject, body },
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
        if (bookmarkFlashTimerRef.current) window.clearTimeout(bookmarkFlashTimerRef.current)
        setBookmarkFlashIndex(index)
        bookmarkFlashTimerRef.current = window.setTimeout(() => {
          setBookmarkFlashIndex(null)
          bookmarkFlashTimerRef.current = null
        }, 2000)
      })
    },
    [displayEmails, emailCardSubjects, emailCardBodies, nameAndOffer, targetAndRole, goal, industry, tone],
  )

  const handleDeleteSavedEmail = useCallback((id) => {
    setSavedEmails((prev) => {
      const next = prev.filter((e) => e.id !== id)
      writeSavedEmailsToStorage(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!savedDrawerOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setSavedDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [savedDrawerOpen])

  useEffect(() => {
    if (!painPointModalOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closePainPointModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [painPointModalOpen])

  useEffect(
    () => () => {
      if (bookmarkFlashTimerRef.current) window.clearTimeout(bookmarkFlashTimerRef.current)
    },
    [],
  )

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
              onClick={() => setSavedDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/80 px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-medium text-slate-200 hover:bg-slate-700/80 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-expanded={savedDrawerOpen}
              aria-controls="saved-emails-drawer"
            >
              <StarBookmarkIcon filled={false} />
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
        {/* Main card */}
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700/50 p-6 sm:p-8 shadow-xl shadow-black/20">
          {/* Mode tabs */}
          <div className="flex gap-1.5 mb-6 sm:mb-8 rounded-xl border border-slate-700/50 bg-slate-900/40 p-1.5">
            <button
              type="button"
              onClick={() => setAppMode('generate')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                appMode === 'generate'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cold Email Generator
            </button>
            <button
              type="button"
              onClick={() => setAppMode('reengage')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                appMode === 'reengage'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Re-engage
            </button>
          </div>

          {/* Load Example — generator mode only */}
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
          )} {/* end appMode === 'generate' Load Example */}

          <div className="space-y-5 sm:space-y-6">
            {/* Sender info — shared across both modes */}
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
                max={CHAR_LIMIT_NAME_OFFER}
                hint="Tip: Be specific — e.g. John, freelance web designer"
              />
            </div>

            {/* Re-engage mode fields */}
            {appMode === 'reengage' && (
              <>
                <div>
                  <label htmlFor="reengage-name" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(reengageName.trim().length)}`} aria-hidden="true" />
                    Prospect Name
                  </label>
                  <input
                    id="reengage-name"
                    type="text"
                    value={reengageName}
                    onChange={(e) => setReengageName(e.target.value)}
                    placeholder="e.g. Sarah Chen"
                    disabled={loading}
                    className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
                  />
                </div>
                <div>
                  <label htmlFor="reengage-company" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(reengageCompany.trim().length)}`} aria-hidden="true" />
                    Company
                  </label>
                  <input
                    id="reengage-company"
                    type="text"
                    value={reengageCompany}
                    onChange={(e) => setReengageCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    disabled={loading}
                    className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
                  />
                </div>
                <div>
                  <label htmlFor="reengage-topic" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${fieldFillDotClass(reengageTopic.trim().length)}`} aria-hidden="true" />
                    Original Outreach Topic
                  </label>
                  <textarea
                    id="reengage-topic"
                    value={reengageTopic}
                    onChange={(e) => setReengageTopic(e.target.value)}
                    placeholder="e.g. Pitched our sales automation tool to help with their outbound process"
                    rows={3}
                    disabled={loading}
                    className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-y min-h-[5rem] disabled:opacity-60"
                  />
                </div>
                <div>
                  <label htmlFor="reengage-last-contact" className="block text-sm font-medium text-slate-300 mb-2">
                    How Long Ago Did You Last Contact Them?
                  </label>
                  <input
                    id="reengage-last-contact"
                    type="text"
                    value={reengageLastContact}
                    onChange={(e) => setReengageLastContact(e.target.value)}
                    placeholder="e.g. 30 days ago, 6 weeks ago, 3 months ago"
                    disabled={loading}
                    className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
                  />
                </div>
                <div>
                  <label htmlFor="reengage-reason" className="block text-sm font-medium text-slate-300 mb-2">
                    Why Are You Reaching Back Out Now?
                  </label>
                  <textarea
                    id="reengage-reason"
                    value={reengageReason}
                    onChange={(e) => setReengageReason(e.target.value)}
                    placeholder="e.g. Just shipped a new feature they asked about, saw a news story about their company, new case study to share"
                    rows={3}
                    disabled={loading}
                    className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-y min-h-[5rem] disabled:opacity-60"
                  />
                </div>
              </>
            )}

            {/* Voice Calibration panel */}
            {appMode === 'generate' && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-700/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setVoicePanelOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-700/30 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                aria-expanded={voicePanelOpen}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-violet-400" aria-hidden="true">
                    <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                    <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5H10.75v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
                  </svg>
                  <span className="text-sm font-medium text-slate-300">Calibrate Your Voice</span>
                  {voiceProfile && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-600/30 border border-violet-500/50 px-2 py-0.5 text-[11px] font-semibold text-violet-300 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" aria-hidden="true" />
                      Active
                    </span>
                  )}
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${voicePanelOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {voicePanelOpen && (
                <div className="border-t border-slate-700/40 px-4 pb-4 pt-3 space-y-3">
                  {voiceProfile ? (
                    <>
                      <div className="rounded-lg border border-violet-500/30 bg-violet-900/20 px-3.5 py-3 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-violet-300 mb-1">Your Voice Profile</p>
                        {[
                          ['Tone', voiceProfile.tone],
                          ['Vocabulary', voiceProfile.vocabularyLevel],
                          ['Sentences', voiceProfile.sentenceLength],
                          ['Markers', voiceProfile.personalityMarkers],
                        ].map(([label, value]) => (
                          <div key={label} className="flex gap-2 text-xs">
                            <span className="text-slate-500 shrink-0 w-20">{label}</span>
                            <span className="text-slate-300 leading-snug">{value}</span>
                          </div>
                        ))}
                      </div>
                      {voiceProfile.summary && (
                        <p className="text-xs text-slate-400 italic leading-snug">"{voiceProfile.summary}"</p>
                      )}
                      <button
                        type="button"
                        onClick={handleClearVoiceProfile}
                        className="text-xs font-medium text-slate-500 hover:text-red-400 transition-colors focus:outline-none"
                      >
                        Clear voice profile
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-slate-400 leading-snug">
                        Paste 2–3 cold emails you've personally written. Claude will extract your tone and style, then match it in every generation.
                      </p>
                      <textarea
                        value={voiceSampleText}
                        onChange={(e) => setVoiceSampleText(e.target.value)}
                        placeholder="Paste your email samples here (2–3 examples)…"
                        rows={6}
                        disabled={voiceAnalyzing || loading}
                        className="w-full rounded-lg bg-slate-700/60 border border-slate-600 text-white placeholder-slate-500 px-3.5 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-shadow resize-y min-h-[8rem] disabled:opacity-60"
                      />
                      {voiceAnalysisError && (
                        <p className="text-xs text-red-400 leading-snug">{voiceAnalysisError}</p>
                      )}
                      <button
                        type="button"
                        onClick={handleAnalyzeVoice}
                        disabled={!voiceSampleText.trim() || voiceAnalyzing || loading}
                        className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-violet-600"
                      >
                        {voiceAnalyzing ? 'Analyzing your voice…' : 'Analyze My Voice'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            )} {/* end appMode === 'generate' voice calibration */}

            {/* Generator-only fields: target, goal, pain point, progress */}
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
                max={CHAR_LIMIT_TARGET_ROLE}
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
                max={CHAR_LIMIT_GOAL}
                hint="Tip: One clear ask — e.g. a 15-min intro call"
                hintMinLength={15}
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label htmlFor="pain-point" className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  Prospect Pain Point
                  <span className="text-[10px] font-normal text-slate-500 rounded-full border border-slate-600 px-1.5 py-0.5">optional</span>
                </label>
                <button
                  type="button"
                  onClick={openPainPointModal}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/80 bg-slate-700/40 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700/70 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1ZM6.5 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm3 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM5.25 10.5a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Z" />
                  </svg>
                  Browse Pain Points
                </button>
              </div>
              <input
                id="pain-point"
                type="text"
                value={painPoint}
                onChange={(e) => setPainPoint(e.target.value)}
                placeholder="e.g. High churn, long sales cycles…"
                maxLength={CHAR_LIMIT_PAIN_POINT}
                disabled={loading}
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-slate-500 italic">Injected into every email's opening hook</span>
                <span className={`text-xs tabular-nums ${painPoint.length > CHAR_LIMIT_PAIN_POINT - 10 ? 'text-red-400' : 'text-slate-500'}`}>
                  {painPoint.length}/{CHAR_LIMIT_PAIN_POINT}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="competitor-tools" className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                Tools They Likely Use
                <span className="text-[10px] font-normal text-slate-500 rounded-full border border-slate-600 px-1.5 py-0.5">optional</span>
              </label>
              <input
                id="competitor-tools"
                type="text"
                value={competitorTools}
                onChange={(e) => setCompetitorTools(e.target.value)}
                placeholder="e.g. HubSpot, Apollo, Instantly…"
                maxLength={CHAR_LIMIT_COMPETITOR_TOOLS}
                disabled={loading}
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-slate-500 italic">Weaves a stack reference into Email 1 to signal research</span>
                <span className={`text-xs tabular-nums ${competitorTools.length > CHAR_LIMIT_COMPETITOR_TOOLS - 10 ? 'text-red-400' : 'text-slate-500'}`}>
                  {competitorTools.length}/{CHAR_LIMIT_COMPETITOR_TOOLS}
                </span>
              </div>
            </div>

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
                      ? 'Fill all three fields above to continue'
                      : `${formFilledCount} of 3 fields started`}
                  </span>
                )}
              </div>
            </div>

            </>
            )} {/* end appMode === 'generate' generator-only fields */}

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

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="target-length" className="text-sm font-medium text-slate-300">
                Target Email Length
              </label>
              <span className="text-sm tabular-nums font-semibold text-blue-400">{targetLength} words</span>
            </div>
            <input
              type="range"
              id="target-length"
              min={LENGTH_SLIDER_MIN}
              max={LENGTH_SLIDER_MAX}
              step={5}
              value={targetLength}
              onChange={(e) => setTargetLength(Number(e.target.value))}
              disabled={loading}
              style={sliderTrackStyle(targetLength, LENGTH_SLIDER_MIN, LENGTH_SLIDER_MAX)}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-slate-500">{LENGTH_SLIDER_MIN} words</span>
              <span className="text-xs text-slate-500 text-center">shorter ← → longer</span>
              <span className="text-xs text-slate-500">{LENGTH_SLIDER_MAX} words</span>
            </div>
          </div>

          {appMode === 'generate' && (
          <div className="mt-6">
            <div className="flex items-center gap-1.5 mb-2">
              <label htmlFor="email-framework" className="text-sm font-medium text-slate-300">
                Email Framework
              </label>
              <span className="group relative inline-flex">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-slate-500 cursor-help" aria-hidden="true">
                  <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                </svg>
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-300 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10 text-center">
                  {EMAIL_FRAMEWORKS.find((f) => f.value === framework)?.tooltip ?? ''}
                </span>
              </span>
            </div>
            <select
              id="email-framework"
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-shadow disabled:opacity-60"
            >
              {EMAIL_FRAMEWORKS.map((fw) => (
                <option key={fw.value} value={fw.value} className="bg-slate-800 text-white">
                  {fw.label} — {fw.description}
                </option>
              ))}
            </select>
          </div>
          )}

          {appMode === 'generate' && (
          <div className="mt-6 rounded-xl border border-slate-700/50 bg-slate-700/20 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Pattern Interrupt Opener</p>
                <p className="text-xs text-slate-500 mt-0.5">Prepends a self-aware, objection-acknowledging line to Email 1 before the pitch</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={patternInterruptEnabled}
                onClick={handlePatternInterruptToggle}
                disabled={loading}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${
                  patternInterruptEnabled ? 'bg-amber-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${
                    patternInterruptEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {patternInterruptEnabled && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-900/15 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500/70 mb-1">Preview for {industry}</p>
                <p className="text-xs text-amber-200/80 italic leading-relaxed">
                  "{PATTERN_INTERRUPT_LINES[industry] ?? PATTERN_INTERRUPT_LINES['Other']}"
                </p>
              </div>
            )}
          </div>
          )}

          <div className="mt-6 rounded-xl border border-slate-700/50 bg-slate-700/20 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Personalize with first name</p>
                <p className="text-xs text-slate-500 mt-0.5">Injects the prospect's name into Email 1's opening and subject</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={personalizeEnabled}
                onClick={() => setPersonalizeEnabled((v) => !v)}
                disabled={loading}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${
                  personalizeEnabled ? 'bg-blue-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${
                    personalizeEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {personalizeEnabled && (
              <div className="mt-3">
                <label htmlFor="prospect-first-name" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Prospect's first name
                </label>
                <input
                  type="text"
                  id="prospect-first-name"
                  value={prospectFirstName}
                  onChange={(e) => setProspectFirstName(e.target.value)}
                  placeholder="e.g. Sarah"
                  maxLength={50}
                  disabled={loading}
                  className="w-full rounded-lg bg-slate-700/60 border border-slate-600 text-white placeholder-slate-500 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
                />
              </div>
            )}
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
              {voiceProfile && (
                <span
                  className="inline-flex items-center gap-1.5 self-center sm:self-auto shrink-0 rounded-full border border-violet-500/60 bg-violet-900/40 px-3 py-1.5 text-xs font-semibold text-violet-300"
                  title={voiceProfile.summary || 'Your writing style is active'}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0 animate-pulse" aria-hidden="true" />
                  My Voice is Active
                </span>
              )}
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
          {/* Sequence mode toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 sm:mb-6">
            <h2 className="text-xl font-semibold text-slate-200">
              {appMode === 'reengage' ? 'Re-engagement Emails' : sequenceMode === 'drip' ? 'Full Drip Sequence' : 'Generated Emails'}
            </h2>
            <div className="flex items-center gap-2">
            {appMode === 'reengage' ? null : (<>
              <button
                type="button"
                onClick={() => setSequenceMode('standard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  sequenceMode === 'standard'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700/70 text-slate-300 hover:bg-slate-700 border border-slate-600'
                }`}
              >
                Standard — 3 emails
              </button>
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => setSequenceMode('drip')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    sequenceMode === 'drip'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700/70 text-slate-300 hover:bg-slate-700 border border-slate-600'
                  }`}
                >
                  Full Sequence — 5 emails
                </button>
              ) : (
                <a
                  href="https://garell.gumroad.com/l/cfjno"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/70 text-slate-400 border border-slate-600 hover:border-slate-500 hover:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Unlock Full Sequence — Pro Feature"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  Full Sequence
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 leading-none">Pro</span>
                </a>
              )}
            </>)}
            </div>
          </div>

          {/* Standard mode — 3-email grid + actions + variants */}
          {sequenceMode === 'standard' && (
          <>

          {/* Icebreakers section — hidden in reengage mode */}
          {appMode !== 'reengage' && showGeneratedResults && (
            <div className="mb-7 rounded-xl border border-slate-700/60 bg-slate-800/50 p-4 sm:p-5 animate-fade-in">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Icebreakers</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Click one to replace Email 1's opening line</p>
                </div>
                <button
                  type="button"
                  onClick={handleRegenerateIcebreakers}
                  disabled={icebreakerLoading}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {icebreakerLoading ? (
                    <>
                      <svg className="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                      </svg>
                      Regenerate
                    </>
                  )}
                </button>
              </div>

              {icebreakerError && (
                <p className="text-xs text-red-400 mb-3" role="alert">{icebreakerError}</p>
              )}

              {icebreakerLoading && !icebreakers && (
                <p className="text-xs text-slate-500 italic animate-pulse">Writing 5 opening angles…</p>
              )}

              {icebreakers && icebreakers.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {icebreakers.map((ice, i) => {
                    const isActive = icebreakerActiveIndex === i
                    return (
                      <button
                        key={`${ice.angle}-${i}`}
                        type="button"
                        onClick={() => handleInjectIcebreaker(ice, i)}
                        className={`text-left rounded-xl border p-3 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                          isActive
                            ? 'border-sky-500/70 bg-sky-500/10 ring-1 ring-sky-500/30'
                            : 'border-slate-600/70 bg-slate-700/40 hover:border-slate-500 hover:bg-slate-700/70'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${isActive ? 'text-sky-400' : 'text-slate-500'}`}>
                            {ICEBREAKER_ANGLE_LABELS[ice.angle]}
                          </span>
                          {isActive && (
                            <span className="rounded-full bg-sky-500/20 border border-sky-500/40 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300 leading-none">active</span>
                          )}
                        </div>
                        <p className={`text-xs leading-snug line-clamp-3 ${isActive ? 'text-sky-100' : 'text-slate-300'}`}>
                          {ice.text}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}

              {icebreakerActiveIndex !== null && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-sky-400/80">Icebreaker applied to Email 1</span>
                  <button
                    type="button"
                    onClick={handleRemoveIcebreaker}
                    className="text-[11px] font-medium text-slate-400 hover:text-red-400 transition-colors focus:outline-none focus:ring-1 focus:ring-red-400/50 rounded px-1"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

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
                    disabled={savedEmails.length >= MAX_SAVED_EMAILS}
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-amber-400 hover:bg-slate-700/60 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500"
                    aria-label={`Save ${email.title} to bookmarks`}
                    title={
                      savedEmails.length >= MAX_SAVED_EMAILS
                        ? `Save limit reached (${MAX_SAVED_EMAILS})`
                        : 'Save this email'
                    }
                  >
                    <StarBookmarkIcon filled={bookmarkFlashIndex === index} />
                  </button>
                </div>
                {(appliedFramework || (appliedCompetitorTools && index === 0)) && showGeneratedResults && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {appliedFramework && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-900/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300"
                        title={EMAIL_FRAMEWORKS.find((f) => f.value === appliedFramework)?.tooltip ?? ''}
                      >
                        {appliedFramework}
                      </span>
                    )}
                    {appliedCompetitorTools && index === 0 && (
                      <span
                        className="group relative inline-flex items-center gap-1 rounded-full border border-teal-500/40 bg-teal-900/25 px-2 py-0.5 text-[10px] font-semibold text-teal-300 cursor-default"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0" aria-hidden="true">
                          <path d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" fillRule="evenodd" />
                        </svg>
                        Research Signal Active
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-[11px] font-normal text-slate-300 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 text-center normal-case leading-snug">
                          Mentioning tools they use signals research and increases reply rates.
                        </span>
                      </span>
                    )}
                  </div>
                )}
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
                {/* Pattern Interrupt active indicator — Email 1 only */}
                {index === 0 && showGeneratedResults && patternInterruptLine && (
                  <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/8 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400">
                          Pattern Interrupt
                        </span>
                        <p className="mt-0.5 text-[13px] text-amber-200/90 leading-snug font-medium">
                          {patternInterruptLine}
                        </p>
                        {patternInterruptError && (
                          <p className="mt-1 text-[11px] text-red-400 leading-snug">{patternInterruptError}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleRefreshPatternInterrupt}
                        disabled={patternInterruptLoading || loading}
                        title="Regenerate pattern interrupt"
                        aria-label="Regenerate pattern interrupt opener"
                        className="shrink-0 rounded p-1 text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/15 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 ${patternInterruptLoading ? 'animate-spin' : ''}`} aria-hidden="true">
                          <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
                {/* Icebreaker active indicator — Email 1 only */}
                {index === 0 && icebreakerActiveIndex !== null && icebreakers?.[icebreakerActiveIndex] && (
                  <div className="mb-2 rounded-lg border border-sky-500/40 bg-sky-500/8 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-sky-400">
                          {ICEBREAKER_ANGLE_LABELS[icebreakers[icebreakerActiveIndex].angle]} opener active
                        </span>
                        <p className="mt-0.5 text-[11px] text-sky-200/80 leading-snug italic line-clamp-2">
                          "{icebreakers[icebreakerActiveIndex].text}"
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveIcebreaker}
                        className="shrink-0 text-[10px] font-medium text-slate-500 hover:text-red-400 transition-colors focus:outline-none rounded px-1 py-0.5"
                        aria-label="Remove icebreaker"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
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
                    className={`w-full flex-1 min-h-[8rem] rounded-lg border text-slate-300 text-sm leading-relaxed px-3 py-2.5 resize-y transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none focus:ring-2 ${
                      index === 0 && patternInterruptLine
                        ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/8 focus:border-amber-400/80 focus:bg-amber-500/10 focus:ring-amber-400/35'
                        : index === 0 && icebreakerActiveIndex !== null
                        ? 'border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/8 focus:border-sky-400/80 focus:bg-sky-500/10 focus:ring-sky-400/35'
                        : 'border-transparent bg-transparent hover:bg-slate-900/25 focus:border-sky-400/80 focus:bg-slate-900/30 focus:ring-sky-400/35'
                    }`}
                  />
                </div>
                {/* Per-card length slider */}
                {showGeneratedResults ? (
                  <div className="mt-1 mb-3">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <input
                        type="range"
                        min={LENGTH_SLIDER_MIN}
                        max={LENGTH_SLIDER_MAX}
                        step={5}
                        value={cardTargetLengths[index]}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setCardTargetLengths((prev) => { const next = [...prev]; next[index] = v; return next })
                        }}
                        disabled={cardLengthLoading[index]}
                        style={sliderTrackStyle(cardTargetLengths[index], LENGTH_SLIDER_MIN, LENGTH_SLIDER_MAX)}
                        className="flex-1 h-1 rounded-full appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                      />
                      <span className="text-[11px] tabular-nums text-slate-400 shrink-0 w-20 text-right">
                        <span className="text-slate-300 font-medium">{countWords(emailCardBodies[index] ?? '')}</span>
                        {' / '}
                        <span className="text-blue-400 font-medium">{cardTargetLengths[index]}</span>
                        {' w'}
                      </span>
                    </div>
                    {cardLengthError[index] && (
                      <p className="text-[11px] text-red-400 mb-1.5 leading-snug">{cardLengthError[index]}</p>
                    )}
                    {cardTargetLengths[index] !== cardAppliedLengths[index] && (
                      <button
                        type="button"
                        onClick={() => handleApplyLength(index)}
                        disabled={cardLengthLoading[index]}
                        className="w-full py-2 rounded-lg border border-blue-500/50 bg-blue-600/15 text-blue-300 text-xs font-semibold hover:bg-blue-600/25 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cardLengthLoading[index] ? 'Rewriting…' : `Apply — rewrite to ~${cardTargetLengths[index]} words`}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 tabular-nums text-right mb-2">
                    {countWords(emailCardBodies[index] ?? '')} words · {(emailCardBodies[index] ?? '').length} chars
                  </p>
                )}
                {(emailCardBodies[index] ?? '') !== (emailCardOriginalBodies[index] ?? '') && (
                  <button
                    type="button"
                    onClick={() => undoEmailCardEdits(index)}
                    className="mb-3 self-start text-xs font-medium text-sky-400/90 hover:text-sky-300 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:ring-offset-2 focus:ring-offset-slate-800 rounded px-1 -ml-1"
                  >
                    Undo edits
                  </button>
                )}
                {/* P.S. section — Email 1 (index 0) and Email 3 (index 2) only */}
                {showGeneratedResults && PS_EMAIL_INDICES.includes(index) && (
                  <div className="mt-3 mb-2 pt-3 border-t border-slate-700/50">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-sky-400/80">P.S.</span>
                        <span className="rounded-full border border-slate-600/60 bg-slate-700/40 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                          {PS_STYLE_LABELS[psStyles[index]]}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRefreshPs(index)}
                        disabled={psLoading[index]}
                        title="Regenerate P.S. with next style"
                        aria-label="Regenerate P.S. line"
                        className="rounded p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`h-3.5 w-3.5 ${psLoading[index] ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                    {psLoading[index] ? (
                      <p className="text-xs text-slate-500 italic animate-pulse">Writing P.S…</p>
                    ) : psLines[index] ? (
                      <p className="text-xs text-sky-300/80 leading-relaxed">{psLines[index]}</p>
                    ) : null}
                  </div>
                )}
                {/* Reply Score badge */}
                {showGeneratedResults && emailScores[index] && (
                  <div className="relative group/score mb-3">
                    <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 cursor-default select-none ${scoreBadgeClasses(emailScores[index].score)}`}>
                      <span className="text-xs font-semibold tracking-wide">Reply Score</span>
                      <span className="text-sm font-bold tabular-nums">
                        {emailScores[index].score}
                        <span className="text-[10px] font-normal opacity-60">/100</span>
                      </span>
                    </div>
                    {/* Breakdown tooltip */}
                    <div
                      className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl border border-slate-600/80 bg-slate-900/98 p-3.5 shadow-xl shadow-black/40 opacity-0 group-hover/score:opacity-100 transition-opacity duration-150 pointer-events-none z-30"
                      role="tooltip"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5">Score Breakdown</p>
                      <div className="space-y-2">
                        {emailScores[index].factors.map((f) => (
                          <div key={f.label} className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`shrink-0 text-xs leading-none ${f.pass ? 'text-green-400' : 'text-red-400'}`} aria-hidden="true">
                                {f.pass ? '✓' : '✗'}
                              </span>
                              <span className="text-[11px] text-slate-300 leading-snug">{f.label}</span>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className={`text-[11px] font-bold tabular-nums leading-none ${f.pass ? 'text-green-400' : 'text-slate-600'}`}>
                                +{f.earned}
                              </span>
                              {f.detail && (
                                <span className="block text-[10px] text-slate-500 mt-0.5 leading-snug">{f.detail}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex justify-between items-center">
                        <span className="text-[10px] text-slate-500">Total</span>
                        <span className={`text-xs font-bold tabular-nums ${scoreBadgeClasses(emailScores[index].score).split(' ').find(c => c.startsWith('text-'))}`}>
                          {emailScores[index].score} / 100
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {/* Reading Level badge + Simplify */}
                {showGeneratedResults && (() => {
                  const body = emailCardBodies[index] ?? ''
                  if (!body.trim()) return null
                  const grade = fleschKincaidGrade(body)
                  const gradeRounded = Math.round(grade * 10) / 10
                  const gradeInt = Math.round(grade)
                  const isGreen = grade <= 6
                  const isYellow = grade > 6 && grade < 10
                  const isRed = grade >= 10
                  const colorClasses = isGreen
                    ? 'border-green-500/40 bg-green-900/15 text-green-400'
                    : isYellow
                    ? 'border-yellow-500/40 bg-yellow-900/15 text-yellow-400'
                    : 'border-red-500/40 bg-red-900/15 text-red-400'
                  const label = isGreen ? 'Optimal' : isYellow ? 'Acceptable' : 'Too Complex'
                  return (
                    <div className="mb-3">
                      <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${colorClasses}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold tracking-wide">Reading Level</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold border ${colorClasses}`}>
                            {label}
                          </span>
                        </div>
                        <span className="text-sm font-bold tabular-nums">
                          Grade {gradeRounded}
                        </span>
                      </div>
                      {gradeInt >= 7 && (
                        <div className="mt-1.5">
                          {simplifyError[index] && (
                            <p className="text-[11px] text-red-400 mb-1 leading-snug">{simplifyError[index]}</p>
                          )}
                          {simplifyWordCountBefore[index] !== null && simplifyWordCountAfter[index] !== null && !simplifyLoading[index] && (
                            <p className="text-[11px] text-slate-500 mb-1 tabular-nums">
                              {simplifyWordCountBefore[index]} words → <span className="text-slate-300 font-medium">{simplifyWordCountAfter[index]} words</span>
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSimplifyEmail(index)}
                            disabled={simplifyLoading[index] || loading}
                            className="w-full py-2 rounded-lg border border-emerald-500/50 bg-emerald-900/15 text-emerald-300 text-xs font-semibold hover:bg-emerald-900/30 hover:text-emerald-200 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {simplifyLoading[index] ? 'Simplifying…' : 'Simplify to Grade 5'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })()}
                <button
                  type="button"
                  onClick={() => setInboxPreviewIndex(index)}
                  className="w-full mb-2 py-2.5 rounded-xl border border-slate-500/70 bg-slate-800/60 text-slate-200 text-sm font-medium hover:bg-slate-700/70 hover:border-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 active:scale-[0.99]"
                >
                  Preview in Inbox
                </button>
                {index === 0 && showGeneratedResults && appMode !== 'reengage' && (
                  <button
                    type="button"
                    onClick={handleGenerateEmail1Variants}
                    disabled={email1VariantsLoading || loading}
                    className="w-full mb-2 py-2.5 rounded-xl border border-violet-500/50 bg-violet-900/20 text-violet-300 text-sm font-medium hover:bg-violet-900/40 hover:text-violet-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                  >
                    {email1VariantsLoading ? 'Generating variants…' : email1Variants ? 'Regenerate Variants' : 'Generate Variants'}
                  </button>
                )}
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

          {/* Email 1 A/B Variant panel */}
          {showGeneratedResults && (email1VariantsLoading || email1VariantsError || email1Variants) && appMode !== 'reengage' && (
            <div className="mt-6 rounded-xl border border-violet-500/30 bg-slate-800/50 overflow-hidden animate-fade-in">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-700/50">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Email 1 — A/B Variants</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Three alternative angles for Email 1. Use the best one to replace it.</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setEmail1Variants(null); setEmail1VariantsError(null); setEmail1ActiveVariantTab(0) }}
                  className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                  aria-label="Close variant panel"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {email1VariantsLoading && (
                <p className="text-sm text-slate-400 italic animate-pulse px-5 py-8 text-center">Writing 3 distinct opening angles…</p>
              )}
              {email1VariantsError && (
                <div className="m-5 p-3 rounded-lg bg-red-900/35 border border-red-700/40 text-red-200 text-sm" role="alert">
                  {email1VariantsError}
                </div>
              )}
              {email1Variants && !email1VariantsLoading && (() => {
                const ALL_TABS = [
                  { key: 'original', label: 'Original', subject: emailCardSubjects[0] ?? emails?.[0]?.subject ?? '', body: emailCardBodies[0] ?? emails?.[0]?.body ?? '', angleLabel: 'Original Email 1', description: 'The original generated version.' },
                  ...email1Variants,
                ]
                const activeTab = ALL_TABS[email1ActiveVariantTab] ?? ALL_TABS[0]
                const tabScore = computeReplyScore(activeTab.body, '')
                return (
                  <div>
                    {/* Tab bar */}
                    <div className="flex overflow-x-auto border-b border-slate-700/50 px-4 gap-0.5 pt-3 pb-0">
                      {ALL_TABS.map((tab, ti) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setEmail1ActiveVariantTab(ti)}
                          className={`shrink-0 px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-inset ${
                            email1ActiveVariantTab === ti
                              ? 'border-violet-400 text-violet-300 bg-violet-900/20'
                              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab content */}
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-0.5">{activeTab.angleLabel}</p>
                          <p className="text-xs text-slate-500 leading-snug">{activeTab.description}</p>
                        </div>
                        <span className="shrink-0 tabular-nums text-xs text-slate-500 mt-0.5">
                          {countWords(activeTab.body)} words
                        </span>
                      </div>

                      {/* Subject */}
                      {activeTab.subject?.trim() ? (
                        <div className="mb-3 rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 mb-0.5">Subject</p>
                          <p className="text-xs font-medium text-slate-900">{activeTab.subject}</p>
                        </div>
                      ) : null}

                      {/* Body */}
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap mb-4">{activeTab.body}</p>

                      {/* Reply Score */}
                      <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 mb-4 ${scoreBadgeClasses(tabScore.score)}`}>
                        <span className="text-xs font-semibold tracking-wide">Reply Score</span>
                        <span className="text-sm font-bold tabular-nums">
                          {tabScore.score}<span className="text-[10px] font-normal opacity-60">/100</span>
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        {email1ActiveVariantTab > 0 && (
                          <button
                            type="button"
                            onClick={() => handleUseEmail1Variant(activeTab)}
                            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 active:scale-[0.98]"
                          >
                            Use This Variant
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              formatSingleEmailForClipboard({ title: activeTab.angleLabel, subject: activeTab.subject, body: activeTab.body })
                            )
                          }}
                          className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 active:scale-[0.98]"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Personalization preview — before/after comparison for Email 1 */}
          {showGeneratedResults && email1RawForPreview && prospectFirstName.trim() && (
            <div className="mt-10 animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-base font-semibold text-slate-200">Personalization Preview</h3>
                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                  Email 1
                </span>
              </div>
              <p className="text-sm text-slate-400 mb-5 leading-snug">
                See how Email 1 reads with and without the prospect's first name.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Standard card */}
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-5 flex flex-col">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Standard</p>
                  {email1RawForPreview.subject && (
                    <div className="mb-3 rounded-lg border border-slate-600/60 bg-slate-700/40 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">Subject</p>
                      <p className="text-xs font-medium text-slate-300">
                        {substituteFirstNameToken(email1RawForPreview.subject, '', 'standard-subject') || email1RawForPreview.subject.replace(/\{\{firstName\}\}/g, '').trim()}
                      </p>
                    </div>
                  )}
                  <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap flex-1">
                    {substituteFirstNameToken(email1RawForPreview.body, '', 'standard-body')}
                  </p>
                </div>
                {/* Personalized card */}
                <div className="rounded-xl border border-amber-500/40 bg-slate-800/60 p-5 flex flex-col ring-1 ring-amber-500/20">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-400 mb-3">Personalized</p>
                  {email1RawForPreview.subject && (
                    <div className="mb-3 rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 mb-0.5">Subject</p>
                      <p className="text-xs font-medium text-slate-900">
                        {renderPersonalizedText(email1RawForPreview.subject, prospectFirstName.trim())}
                      </p>
                    </div>
                  )}
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap flex-1">
                    {renderPersonalizedText(email1RawForPreview.body, prospectFirstName.trim())}
                  </p>
                </div>
              </div>
            </div>
          )}

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

          {/* Prepare for Replies — collapsible section */}
          {showGeneratedResults && (
            <div className="mt-10 rounded-xl border border-slate-700/60 bg-slate-800/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setReplyTemplatesSectionOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-800/60 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 select-none"
                aria-expanded={replyTemplatesSectionOpen}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-100">Prepare for Replies</span>
                  {replyTemplatesLoading && (
                    <svg className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {replyTemplates && !replyTemplatesLoading && (
                    <span className="text-slate-500 text-sm font-normal tabular-nums shrink-0">
                      {replyTemplates.length} templates
                    </span>
                  )}
                  {replyTemplatesError && !replyTemplatesLoading && (
                    <span className="text-xs text-red-400 shrink-0">Error</span>
                  )}
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${replyTemplatesSectionOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {replyTemplatesSectionOpen && (
                <div className="border-t border-slate-700/50 px-5 pb-5 pt-4">
                  <p className="text-sm text-slate-400 leading-relaxed mb-5">
                    Ready-to-send replies for the 4 most common responses — edit and copy as needed.
                  </p>

                  {replyTemplatesError && (
                    <div className="mb-4 rounded-lg border border-red-700/40 bg-red-900/30 p-3 text-red-200 text-sm" role="alert">
                      {replyTemplatesError}
                    </div>
                  )}

                  {replyTemplatesLoading && (
                    <p className="text-slate-400 text-sm py-4 text-center animate-pulse">Writing reply templates…</p>
                  )}

                  {replyTemplates && !replyTemplatesLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {replyTemplates.map((template) => {
                        const isRegenLoading = !!replyTemplateRegenLoading[template.key]
                        const regenErr = replyTemplateRegenError[template.key]
                        const isCopied = replyTemplateCopied === template.key
                        return (
                          <div
                            key={template.key}
                            className="rounded-xl border border-slate-700/50 bg-slate-800/80 p-4 flex flex-col gap-3 shadow-md shadow-black/10"
                          >
                            {/* Card header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-wide text-violet-400">{template.label}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{template.description}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRegenerateReplyTemplate(template)}
                                disabled={isRegenLoading}
                                title={`Regenerate ${template.label} reply`}
                                aria-label={`Regenerate ${template.label} reply template`}
                                className="shrink-0 rounded p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className={`h-3.5 w-3.5 ${isRegenLoading ? 'animate-spin' : ''}`}
                                  aria-hidden="true"
                                >
                                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>

                            {regenErr && (
                              <p className="text-[11px] text-red-400 leading-snug" role="alert">{regenErr}</p>
                            )}

                            {/* Template body */}
                            <p className={`text-sm text-slate-300 leading-relaxed whitespace-pre-wrap flex-1 ${isRegenLoading ? 'opacity-40' : ''}`}>
                              {template.text || (isRegenLoading ? 'Rewriting…' : '')}
                            </p>

                            {/* Copy button */}
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(template.text)
                                setReplyTemplateCopied(template.key)
                                window.setTimeout(() => setReplyTemplateCopied(null), 2000)
                              }}
                              disabled={!template.text || isRegenLoading}
                              className="w-full py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {isCopied ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          </>
          )} {/* end sequenceMode === 'standard' */}

          {/* Drip sequence mode */}
          {sequenceMode === 'drip' && (
            <div>
              {dripLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <svg className="h-8 w-8 animate-spin text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-slate-400 text-sm">Writing 5-email sequence…</p>
                </div>
              )}
              {dripError && (
                <div className="rounded-xl border border-red-700/40 bg-red-900/30 p-4 text-red-200 text-sm mb-6" role="alert">
                  {dripError}
                </div>
              )}
              {!dripLoading && !dripEmails && !dripError && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <p className="text-slate-300 font-medium">Full Sequence mode is active</p>
                  <p className="text-slate-400 text-sm max-w-sm leading-snug">
                    Click <strong className="text-slate-200">Generate</strong> to create your 5-email drip sequence.
                  </p>
                </div>
              )}
              {dripEmails && !dripLoading && (
                <div className="animate-fade-in">
                  {/* Day tabs */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 scrollbar-hide">
                    {DRIP_SEQUENCE_SLOTS.map((slot, i) => (
                      <button
                        key={slot.day}
                        type="button"
                        onClick={() => setDripActiveTab(i)}
                        className={`shrink-0 flex flex-col items-center px-4 py-2 rounded-xl border text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          dripActiveTab === i
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white'
                        }`}
                      >
                        <span className="font-bold">{slot.label}</span>
                        <span className={`text-[10px] mt-0.5 ${dripActiveTab === i ? 'text-blue-200' : 'text-slate-500'}`}>{slot.role}</span>
                      </button>
                    ))}
                  </div>

                  {/* Active email card */}
                  {(() => {
                    const slot = DRIP_SEQUENCE_SLOTS[dripActiveTab]
                    const email = dripEmails[dripActiveTab]
                    if (!email) return null
                    return (
                      <div className="bg-slate-800/90 rounded-xl border border-slate-700/50 p-5 sm:p-6 flex flex-col shadow-lg shadow-black/10">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 mb-4">
                          <div>
                            <h3 className="text-base font-semibold text-blue-400">{slot.label} — {slot.role}</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Send {slot.day === 0 ? 'on day 0 (first touch)' : `on day ${slot.day}`}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-slate-600 bg-slate-700/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 tabular-nums">
                            {dripActiveTab + 1} / {DRIP_SEQUENCE_SLOTS.length}
                          </span>
                        </div>

                        {/* Subject */}
                        <div className="mb-4 rounded-lg border border-amber-400/55 bg-amber-50 px-3 py-2 shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 mb-1">Subject line</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={dripCardSubjects[dripActiveTab] ?? ''}
                              onChange={(e) => {
                                const v = e.target.value
                                setDripCardSubjects((prev) => { const next = [...prev]; next[dripActiveTab] = v; return next })
                              }}
                              placeholder="Enter subject line…"
                              aria-label={`Subject for ${slot.label}`}
                              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-900 placeholder-amber-700/40 focus:outline-none leading-snug py-0.5"
                            />
                          </div>
                        </div>

                        {/* Body */}
                        <div className="relative group/body mb-3 flex-1 min-h-[12rem] flex flex-col">
                          <p className="pointer-events-none absolute right-2 top-2 z-[1] text-[11px] text-slate-500 opacity-0 transition-opacity duration-200 group-hover/body:opacity-100 group-focus-within/body:opacity-0" aria-hidden="true">
                            Click to edit
                          </p>
                          <textarea
                            value={dripCardBodies[dripActiveTab] ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setDripCardBodies((prev) => { const next = [...prev]; next[dripActiveTab] = v; return next })
                            }}
                            aria-label={`${slot.label} email body`}
                            rows={12}
                            className="w-full flex-1 min-h-[12rem] rounded-lg border border-transparent bg-transparent text-slate-300 text-sm leading-relaxed px-3 py-2.5 resize-y transition-[border-color,box-shadow,background-color] duration-200 hover:bg-slate-900/25 focus:outline-none focus:border-sky-400/80 focus:bg-slate-900/30 focus:ring-2 focus:ring-sky-400/35"
                          />
                        </div>
                        <p className="text-xs text-slate-500 tabular-nums text-right mb-4">
                          {countWords(dripCardBodies[dripActiveTab] ?? '')} words
                        </p>

                        {/* Nav + copy row */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDripActiveTab((t) => Math.max(0, t - 1))}
                            disabled={dripActiveTab === 0}
                            className="px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-700/50 text-slate-300 text-sm font-medium hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                          >
                            ← Prev
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const subj = dripCardSubjects[dripActiveTab] ?? ''
                              const body = dripCardBodies[dripActiveTab] ?? ''
                              const text = subj ? `Subject: ${subj}\n\n${body}` : body
                              navigator.clipboard.writeText(text)
                              setDripCopiedIndex(dripActiveTab)
                              window.setTimeout(() => setDripCopiedIndex(null), 2000)
                            }}
                            className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 active:scale-[0.98]"
                          >
                            {dripCopiedIndex === dripActiveTab ? 'Copied!' : 'Copy This Email'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDripActiveTab((t) => Math.min(DRIP_SEQUENCE_SLOTS.length - 1, t + 1))}
                            disabled={dripActiveTab === DRIP_SEQUENCE_SLOTS.length - 1}
                            className="px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-700/50 text-slate-300 text-sm font-medium hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                          >
                            Next →
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Drip action buttons */}
                  <div className="mt-8 flex flex-col sm:flex-row flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleExportDripCsv}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-emerald-500/50 bg-emerald-600/15 text-emerald-300 font-medium text-sm hover:bg-emerald-600/25 hover:border-emerald-500/70 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 active:scale-[0.98]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export Full Sequence (CSV)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDripEmails(null); setDripError(null) }}
                      className="px-6 py-3 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 active:scale-[0.98]"
                    >
                      Regenerate Sequence
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {(showGeneratedResults || dripEmails) && !shareBannerDismissed && (
            <div className="mt-8 rounded-xl border border-slate-700/60 bg-slate-800/40 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 animate-fade-in">
              <p className="flex-1 text-sm text-slate-300 leading-snug">
                <span className="font-semibold text-slate-100">Know someone who sends cold emails?</span>{' '}
                Share ColdMailAI.
              </p>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleShareLinkCopy}
                  className="rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {shareLinkCopied ? 'Link copied!' : 'Copy Link'}
                </button>
                <button
                  type="button"
                  onClick={() => window.open('https://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fgarell.gumroad.com%2Fl%2Fcfjno&summary=I%27ve%20been%20using%20ColdMailAI%20to%20generate%20high-converting%20cold%20emails%20in%20seconds.%20Check%20it%20out!', '_blank', 'noopener,noreferrer')}
                  className="rounded-lg border border-blue-700/60 bg-blue-900/40 hover:bg-blue-800/60 px-3 py-1.5 text-xs font-semibold text-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Share on LinkedIn
                </button>
                <button
                  type="button"
                  onClick={() => window.open('https://twitter.com/intent/tweet?text=I%27ve%20been%20using%20ColdMailAI%20to%20generate%20high-converting%20cold%20emails%20in%20seconds.%20Check%20it%20out%3A%20https%3A%2F%2Fgarell.gumroad.com%2Fl%2Fcfjno', '_blank', 'noopener,noreferrer')}
                  className="rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Share on X
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShareBannerDismissed(true)}
                aria-label="Dismiss"
                className="self-start sm:self-center rounded-md p-1 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            </div>
          )}
        </section>
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

      {savedDrawerOpen && (
        <div className="fixed inset-0 z-[55]">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close saved emails"
            onClick={() => setSavedDrawerOpen(false)}
          />
          <aside
            id="saved-emails-drawer"
            className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l border-slate-700 bg-slate-900 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-drawer-title"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-4">
              <h2 id="saved-drawer-title" className="text-lg font-semibold text-white">
                Saved Emails
              </h2>
              <button
                type="button"
                onClick={() => setSavedDrawerOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {savedEmails.length >= SAVED_EMAILS_WARN_AT && (
              <div
                className={`mx-4 mt-3 rounded-lg border px-3 py-2.5 text-sm ${
                  savedEmails.length >= MAX_SAVED_EMAILS
                    ? 'border-red-500/50 bg-red-950/40 text-red-200'
                    : 'border-amber-500/45 bg-amber-950/35 text-amber-100'
                }`}
                role="status"
              >
                {savedEmails.length >= MAX_SAVED_EMAILS ? (
                  <>You&apos;re at the limit ({MAX_SAVED_EMAILS}/{MAX_SAVED_EMAILS}). Delete a saved email to bookmark another.</>
                ) : (
                  <>
                    Approaching save limit: {savedEmails.length}/{MAX_SAVED_EMAILS} used. You can store up to {MAX_SAVED_EMAILS}{' '}
                    emails—delete older ones to make room.
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 border-b border-slate-700/80 px-4 py-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Sort</span>
              <div className="flex flex-wrap gap-2">
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

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {sortedSavedEmails.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-12 px-2">
                  No saved emails yet. Click the star on any card to save it with your current inputs.
                </p>
              ) : (
                <ul className="space-y-5">
                  {sortedSavedEmails.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-slate-700 bg-slate-800/80 p-4 shadow-lg shadow-black/10"
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-slate-700/80 pb-3 mb-3">
                        <p className="text-xs text-slate-400 tabular-nums">{formatSavedAt(item.savedAt)}</p>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedEmail(item.id)}
                          className="shrink-0 rounded-lg border border-red-500/40 bg-red-950/30 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-900/40 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="mb-3 space-y-1.5 rounded-lg bg-slate-900/50 px-3 py-2.5 text-xs text-slate-400">
                        <p className="font-semibold text-slate-300 text-[11px] uppercase tracking-wide">Inputs used</p>
                        <p>
                          <span className="text-slate-500">Name & offer:</span>{' '}
                          <span className="text-slate-300">{item.inputs.nameAndOffer || '—'}</span>
                        </p>
                        <p>
                          <span className="text-slate-500">Target:</span>{' '}
                          <span className="text-slate-300">{item.inputs.targetAndRole || '—'}</span>
                        </p>
                        <p>
                          <span className="text-slate-500">Goal:</span>{' '}
                          <span className="text-slate-300">{item.inputs.goal || '—'}</span>
                        </p>
                        <p>
                          <span className="text-slate-500">Industry:</span>{' '}
                          <span className="text-slate-300">{item.inputs.industry || '—'}</span>
                          {' · '}
                          <span className="text-slate-500">Tone:</span>{' '}
                          <span className="text-slate-300">{item.inputs.tone || '—'}</span>
                        </p>
                      </div>
                      <h3 className="text-sm font-semibold text-blue-400 mb-2">{item.email.title}</h3>
                      {item.email.subject?.trim() ? (
                        <div className="mb-3 rounded-lg border border-amber-400/50 bg-amber-50 px-2.5 py-2">
                          <p className="text-[10px] font-bold text-amber-950">Subject</p>
                          <p className="text-xs font-medium text-slate-900 mt-0.5">Subject: {item.email.subject}</p>
                        </div>
                      ) : null}
                      <p className="text-sm text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                        {item.email.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
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

      {painPointModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pain-point-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) closePainPointModal() }}
        >
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-5 py-4 shrink-0">
              <div>
                <h2 id="pain-point-modal-title" className="text-base font-semibold text-white">Pain Point Library</h2>
                <p className="text-xs text-slate-400 mt-0.5">Click any pain point to fill the field</p>
              </div>
              <button
                type="button"
                onClick={closePainPointModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Industry tabs */}
            <div className="shrink-0 border-b border-slate-700 px-4 pt-3 pb-0">
              <div className="flex gap-1 overflow-x-auto pb-3 scrollbar-hide">
                {PAIN_POINT_LIBRARY_INDUSTRIES.map((ind) => (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => setPainPointLibraryTab(ind)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      painPointLibraryTab === ind
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white border border-slate-600'
                    }`}
                  >
                    {ind}
                  </button>
                ))}
              </div>
            </div>

            {/* Pain point pills */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              <div className="flex flex-wrap gap-2">
                {PAIN_POINT_LIBRARY[painPointLibraryTab].map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => selectPainPoint(pt)}
                    className="rounded-lg border border-slate-600 bg-slate-700/60 px-3 py-2 text-sm text-slate-200 hover:border-blue-500 hover:bg-blue-600/20 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {pt}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-slate-700 pt-4 mt-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-medium text-slate-200">AI Generate</p>
                    <p className="text-xs text-slate-400">Get 3 custom pain points based on your prospect info</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateAiPainPoints}
                    disabled={aiPainPointsLoading}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {aiPainPointsLoading ? (
                      <>
                        <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Generating…
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                        </svg>
                        AI Generate
                      </>
                    )}
                  </button>
                </div>

                {aiPainPointsError && (
                  <p className="text-xs text-red-400 mb-2" role="alert">{aiPainPointsError}</p>
                )}

                {aiPainPoints.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {aiPainPoints.map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => selectPainPoint(pt)}
                        className="rounded-lg border border-blue-500/40 bg-blue-600/15 px-3 py-2 text-sm text-blue-200 hover:border-blue-500 hover:bg-blue-600/30 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {pt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
