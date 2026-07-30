# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

**AZTEC Control Center** (Sokrati Client Centre) is a Next.js 15 App Router app backed by Firebase Auth + Firestore. Optional Google Gemini AI (Genkit) powers Business Snapshot refresh.

### Source code location

Application source under `src/` is **not tracked in git**. It ships in `project-full.zip` at the repo root. On a fresh clone, extract before building:

```bash
unzip -o project-full.zip
```

The VM update script handles this automatically when `src/app` is missing.

### Services

| Service | Required | Command / notes |
|---------|----------|-----------------|
| Next.js dev server | Yes | `npm run dev` — Turbopack, port **3000** |
| Firebase Auth + Firestore | Yes (cloud) | Hardcoded project `vdc200007-ppclientcentre-prod` in `src/firebase/config.ts`; no local emulator config |
| Gemini API | Optional | Only for Business Snapshot AI refresh; set `GEMINI_API_KEY` or `GOOGLE_GENAI_API_KEY` in `.env` |

Optional: `npm run genkit:dev` for Genkit AI flow debugging (separate process, not needed for normal app use).

### Common commands

See `package.json` scripts:

- **Dev:** `npm run dev`
- **Build:** `npm run build` (ignores TS/ESLint errors via `next.config.ts`)
- **Production:** `npm run start` (after build)
- **Typecheck:** `npm run typecheck` — reports existing TS errors; does not block build
- **Lint:** `npm run lint` — may prompt interactively for ESLint setup on first run; no `eslint.config.*` in repo yet

There is **no test suite** configured (no Jest/Vitest/Playwright).

### Dev server gotchas

- If you see **Internal Server Error** or missing `.next` manifest errors after a build, stop the dev server, run `rm -rf .next`, then restart `npm run dev`.
- Run the dev server in tmux so it stays alive across commands (e.g. session name `nextjs-dev-server`).

### Auth for end-to-end testing

Login requires valid Firebase Auth credentials plus a Firestore `users/{uid}` profile with `status` ≠ `Pending` and appropriate `permissions` (or `role: Admin`). Without credentials, verify the environment by loading `/` (login) and `/register`.

### Environment variables

`.env` template includes empty `GEMINI_API_KEY` and `GOOGLE_GENAI_API_KEY`. Firebase config is hardcoded, not env-based.
