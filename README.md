# ColdMailAI

AI-powered cold email generator. Create personalized, high-converting cold emails in seconds.

## Features

- **3 email variants** — Short, personalized, and follow-up templates
- **Goal-based** — Book a call, get a reply, pitch a deal, or request a demo
- **Usage limit** — 3 free generations; upgrade to Pro for unlimited emails

## Setup

### Prerequisites

- Node.js 18+ and npm

### Installation

1. **Clone the repo and install dependencies**

   ```bash
   cd ColdMailAI
   npm install
   ```

2. **Configure your API key**

   Copy the example env file and add your Anthropic API key:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set:

   ```
   VITE_ANTHROPIC_API_KEY=your_key_here
   ```

   Get an API key from [Anthropic Console](https://console.anthropic.com/).

3. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173) in your browser.

## Scripts

| Command        | Description                |
|----------------|----------------------------|
| `npm run dev`  | Start development server   |
| `npm run build`| Build for production       |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint                 |

## Deployment

1. Build the app:

   ```bash
   npm run build
   ```

2. Deploy the `dist` folder to any static host (Vercel, Netlify, GitHub Pages, etc.).

3. Set `VITE_ANTHROPIC_API_KEY` in your host’s environment variables so the build gets the key. (Vite inlines env vars that start with `VITE_` at build time.)

## Tech stack

- React 19
- Vite 7
- Tailwind CSS 4
- Anthropic Claude API
