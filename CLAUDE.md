# ColdMailAI — Claude Code Project Guide

## Stack
- Vite + React (NOT Next.js)
- Tailwind CSS
- Deployed on Vercel

## Critical Rules
- This is NOT a Next.js project. Do not create next.config.js or use any Next.js APIs.
- vercel.json lives at the PROJECT ROOT only — never inside src/
- vercel.json must always contain valid JSON — no markdown, no code fences, no comments
- Build output is dist/ (Vite default) — never .next/ or out/
- Do not modify vercel.json under any circumstances.

## vercel.json (do not modify)
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## Project Structure
```
src/
  App.jsx
  main.jsx
  index.css
vercel.json        ← always here, never move it
package.json
vite.config.js
index.html
```

## Environment Variables
- VITE_ANTHROPIC_API_KEY — Claude API key, never hardcode this
- All env vars must be prefixed with VITE_ to be accessible in the browser

## Git Workflow
- Main branch: main
- Feature branches: feature/description or fix/description
- Always commit before switching branches
- Never force push to main

## Commands
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`
