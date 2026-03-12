import { useState, useCallback } from 'react'

const FREE_GENERATIONS_LIMIT = 3
const USAGE_STORAGE_KEY = 'coldmailai_usage_count'
const GUMROAD_LINK = 'https://YOUR_GUMROAD_LINK' // Replace with your Gumroad product URL

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

const GOAL_OPTIONS = [
  'Book a Call',
  'Get a Reply',
  'Pitch a Deal',
  'Request a Demo',
]

const EMAIL_CARD_KEYS = [
  { key: 'short_email', title: 'Short Email' },
  { key: 'personalized_email', title: 'Personalized Email' },
  { key: 'follow_up_email', title: 'Follow-Up Email' },
]

const PLACEHOLDER_EMAILS = [
  { title: 'Short Email', body: 'Hi [Name], I\'m [Your Name] and I help companies like [Company] achieve [benefit]. Would you be open to a quick 15-minute call this week to explore if we\'re a fit? Best, [Your Name]' },
  { title: 'Personalized Email', body: 'Hi [Name], I noticed [Company] has been [recent achievement/trend]. As someone who specializes in [your offer], I\'ve helped similar companies [specific outcome]. I\'d love to share one idea that could [relevant benefit]. Are you available for a brief call on [timeframe]? Regards, [Your Name]' },
  { title: 'Follow-Up Email', body: 'Hi [Name], I wanted to follow up on my previous message about [topic]. I understand you\'re busy—if now isn\'t the right time, no problem. I\'ll check back in [timeframe]. In the meantime, here\'s a [resource] that might be useful. Best, [Your Name]' },
]

const SYSTEM_PROMPT = `You are an expert cold email copywriter. Write cold emails that are direct, personal, and have high reply rates. Never use generic openers like I hope this finds you well. Always lead with value or a specific pain point.`

function buildUserMessage(input1, input2, input3) {
  return `Generate 3 cold emails for the following situation:
Sender: ${input1}. Target: ${input2}. Goal: ${input3}.
Return ONLY a JSON object with keys: short_email, personalized_email, follow_up_email.
Each value is the full email body as a string. No markdown, no extra text.`
}

function parseEmailJson(raw) {
  let str = raw.trim()
  const jsonMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) str = jsonMatch[1].trim()
  return JSON.parse(str)
}

async function generateEmails(nameAndOffer, targetAndRole, goal) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your-api-key-here') {
    throw new Error('Missing API key. Add VITE_ANTHROPIC_API_KEY to your .env file.')
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserMessage(nameAndOffer, targetAndRole, goal) },
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

  return EMAIL_CARD_KEYS.map(({ key, title }) => ({
    title,
    body: typeof parsed[key] === 'string' ? parsed[key] : '',
  }))
}

function CharacterCount({ count }) {
  return (
    <span className="text-xs text-slate-500 mt-1 block tabular-nums">
      {count} character{count !== 1 ? 's' : ''}
    </span>
  )
}

function App() {
  const [nameAndOffer, setNameAndOffer] = useState('')
  const [targetAndRole, setTargetAndRole] = useState('')
  const [goal, setGoal] = useState('Book a Call')
  const [emails, setEmails] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [usageCount, setUsageCount] = useState(getStoredUsage)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const usageRemaining = Math.max(0, FREE_GENERATIONS_LIMIT - usageCount)
  const allFilled = nameAndOffer.trim() !== '' && targetAndRole.trim() !== '' && goal.trim() !== ''
  const canGenerate = allFilled && !loading && usageRemaining > 0

  const handleGenerate = async () => {
    if (usageRemaining <= 0) {
      setShowUpgradeModal(true)
      return
    }
    setError(null)
    setLoading(true)
    setEmails(null)
    try {
      const result = await generateEmails(nameAndOffer, targetAndRole, goal)
      setEmails(result)
      const newCount = usageCount + 1
      setUsageCount(newCount)
      setStoredUsage(newCount)
      if (newCount >= FREE_GENERATIONS_LIMIT) {
        setShowUpgradeModal(true)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
      setEmails(null)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = useCallback((text, index) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    window.setTimeout(() => setCopiedIndex(null), 2000)
  }, [])

  const handleRegenerate = () => {
    setEmails(null)
    setError(null)
  }

  const displayEmails = emails ?? PLACEHOLDER_EMAILS
  const showGeneratedResults = emails !== null

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans antialiased flex flex-col">
      {/* Upgrade limit modal */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setShowUpgradeModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-modal-title"
        >
          <div
            className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="upgrade-modal-title" className="text-xl font-semibold text-slate-900 mb-2">
              You&apos;ve used your 3 free generations!
            </h2>
            <p className="text-slate-600 mb-6">
              Upgrade to ColdMailAI Pro for unlimited emails.
            </p>
            <a
              href={GUMROAD_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full py-4 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg transition-colors shadow-lg shadow-blue-900/30 hover:shadow-xl"
            >
              Upgrade to Pro
            </a>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="mt-4 text-slate-500 hover:text-slate-700 text-sm"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl" aria-hidden="true">✉️</span>
            <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
              ColdMailAI
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-slate-400 text-sm tabular-nums">
              {usageRemaining}/3 free uses remaining
            </p>
            {usageRemaining === 0 && (
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                Upgrade
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-12">
        {/* Main card */}
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700/50 p-6 sm:p-8 shadow-xl shadow-black/20">
          <h2 className="text-2xl sm:text-3xl font-semibold text-center text-white mb-6 sm:mb-8">
            AI Cold Email Generator
          </h2>

          <div className="space-y-5 sm:space-y-6">
            <div>
              <label htmlFor="name-offer" className="block text-sm font-medium text-slate-300 mb-2">
                Your Name & What You Offer
              </label>
              <input
                id="name-offer"
                type="text"
                value={nameAndOffer}
                onChange={(e) => setNameAndOffer(e.target.value)}
                placeholder="e.g. Alex, B2B sales automation"
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                disabled={loading}
              />
              <CharacterCount count={nameAndOffer.length} />
            </div>

            <div>
              <label htmlFor="target-role" className="block text-sm font-medium text-slate-300 mb-2">
                Target Company & Decision Maker Role
              </label>
              <input
                id="target-role"
                type="text"
                value={targetAndRole}
                onChange={(e) => setTargetAndRole(e.target.value)}
                placeholder="e.g. Acme Corp, VP of Sales"
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                disabled={loading}
              />
              <CharacterCount count={targetAndRole.length} />
            </div>

            <div>
              <label htmlFor="goal" className="block text-sm font-medium text-slate-300 mb-2">
                Goal of the Email
              </label>
              <select
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full rounded-xl bg-slate-700/50 border border-slate-600 text-white px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-shadow"
                disabled={loading}
              >
                {GOAL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-slate-800 text-white">
                    {opt}
                  </option>
                ))}
              </select>
              <CharacterCount count={goal.length} />
            </div>
          </div>

          {error && (
            <div className="mt-5 p-4 rounded-xl bg-red-900/40 border border-red-700/50 text-red-200 text-sm">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full mt-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800 shadow-lg shadow-blue-900/30 disabled:bg-slate-600 disabled:hover:bg-slate-600 disabled:shadow-none disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </>
            ) : (
              'Generate Emails'
            )}
          </button>
        </div>

        {/* Results section */}
        <section className="mt-10 sm:mt-14">
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
                <h3 className="text-base font-semibold text-blue-400 mb-3">
                  {email.title}
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed flex-1 mb-5 whitespace-pre-wrap">
                  {email.body}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy(email.body, index)}
                  className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 active:scale-[0.98]"
                >
                  {copiedIndex === index ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ))}
          </div>

          {showGeneratedResults && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={handleRegenerate}
                className="px-6 py-3 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 active:scale-[0.98]"
              >
                Regenerate
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-700/50 py-5 sm:py-6">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-center text-slate-500 text-sm">
            Powered by ColdMailAI — Get more replies today
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
