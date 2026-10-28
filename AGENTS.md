# AGENTS.md — rules for any AI agent working on this repository

This file is read automatically by coding agents (OpenAI Codex / GPT, Gemini CLI, Claude Code and others).
Read it fully before changing anything. If an instruction here conflicts with a request, stop and ask the owner.

Owner: Davit Barabadze, MD — medical director of LeaderMed (Tbilisi). He approves every clinical change.
The owner writes in Georgian; answer him in Georgian, short and concrete, no jargon.

---

## 1. What this is

**GMAI (Georgian Expert Medical AI)** — a free, public, Georgian-language medical platform by LeaderMed for
patients, doctors and students. Next.js 16 (App Router), React 19, TypeScript, Tailwind, zod, vitest.

The core is **deterministic**: answers are assembled from a verified, source-cited knowledge base by 21 agents
(A00–A20, see `docs/AGENT_MATRIX.md`). A language model is used only to write the final text (A00 synthesis)
and to explain results; every number and citation it writes is checked (A19) and a release gate (A20) can
block the answer. Calculators, risk models, the prevention engine and the pregnancy/fertility tools are pure
TypeScript functions with tests — **the model never computes a clinical number.**

Modules (public tier):

| Route | What | Code |
|---|---|---|
| `/clinical`, `/ddx`, `/patient` | clinical AI, differential diagnosis, patient explanations | `src/services/orchestrator.ts`, `src/agents/` |
| `/prevention` | personal prevention plan, calendar + reminders (ICS / Google), 7 risk simulators (`?tool=simulator`, `?tool=calendar`) | engine `src/prevention/`, UI `src/features/prevention/` |
| `/reproductive` | due date (LMP / conception / IVF / ultrasound, ACOG CO 700 redating), antenatal calendar, ovulation, time to pregnancy, weight gain (`?tool=due|calendar|ovulation|chance|weight`) | engine `src/reproductive/`, UI `src/features/reproductive/` |
| `/medication-review`, `/medications`, `/drugs` | medication identity (Georgian names → FDA / EMA labels), interactions | `src/server/medications/`, `knowledge/medications` |
| `/labs`, `/calculators` (18), `/documents`, `/academy`, `/quality` … | see `docs/ARCHITECTURE.md` | |

## 2. Non-negotiable rules

1. **No secrets in the repository. Ever.** API keys live only in Cloud Run environment variables / Secret
   Manager. Never print, log, commit or echo a key. `.env*` files are never committed. Every environment
   variable the code reads must be listed in `src/config/env-schema.json` **and** `.env.example`, then run
   `npm run docs:gen` — `src/tests/readiness.test.ts` fails otherwise.
2. **Do not change the existing design** unless the owner asks. The owner has approved the look. Reuse what
   exists: colour tokens (`navy`, `cyan-brand`, `cyan`, `ink-*`, `slate-*`, `fg`, `line`, `clinical-*` in
   `tailwind.config.ts`), classes `panel`, `field`, `prev-range`, components `Slider`, `Toggle`, `Card`,
   `Gauge`, `StatusRing`, `Sources`. Hero = navy rounded-3xl with a cyan glow; tool tabs = gradient cards.
   Mobile first (390 px): the bottom bar shows the first 5 items of `MENU.patient` in
   `src/components/layout/nav.ts` — changing their order changes the phone menu.
3. **All user-visible text is Georgian.** `src/tests/ui-language.test.ts` fails on Latin-only UI strings
   (allowed abbreviations are listed there). Keep code comments in English.
4. **Clinical content must be sourced and verified.** Every rule, threshold, interval and number comes from a
   primary source (WHO, ESC, USPSTF, ACOG, NICE, CDC, ADA, ASRM, a PubMed paper …) that you have actually
   opened and read. Add the source to `src/prevention/rules/sources.json` (org, title, year, URL that
   resolves) and cite it next to the content. If you cannot verify a figure, leave it out and tell the owner.
   Never invent a number, a dose, a guideline, a reference or a URL. The owner approves clinical changes.
5. **Deterministic first.** New calculators / models are pure functions in `src/prevention/`,
   `src/reproductive/` or `src/lib/`, with tests whose expected values were computed **independently** (by
   hand or a separate script from the published formula), never copied from the code's own output.
6. **Do not weaken safety layers:** `src/server/processing-policy.ts` (consent / attestation before health
   data reaches the AI), `src/services/verifiers.ts`, `src/services/release-contract.ts`, red-flag handling,
   `src/proxy.ts` (public/internal tier boundary).
7. **Personal data:** prevention and reproductive tools keep data in the browser (`localStorage`, wrapped in
   try/catch). Do not add server-side storage of health data. File upload of medical documents is
   restricted by the owner for legal reasons — do not re-enable or advertise it without asking.
8. **Licensed material:** content derived from UpToDate must never be committed, published or quoted
   (internal tier only, from the owner's own copy). The public rule set is written from open sources.
9. **AI models** are configuration, not code: `OPENAI_MODEL`, `AI_MODEL_FAST` (plain questions),
   `AI_MODEL_REASONING` (deep modes and high-risk questions; chosen by `src/services/model-router.ts`).
   Do not hard-code a more expensive model.

## 3. How to make a change (every time)

```bash
git checkout main && git pull
git checkout -b <short-feature-name>
npm ci
# … change …
npm run typecheck          # must be clean
npm run lint               # 0 errors (existing warnings are known)
npm test                   # all must pass (at the time of writing: 584 passed, 44 skipped)
APP_TIER=public npm run build
APP_TIER=public npm run start -- -p 3100   # open it, click through the changed screens, mobile width too
git commit -m "…"          # clear message; no model names, no secrets
git push -u origin <branch>
git checkout main && git merge --ff-only <branch> && git push origin main   # = deploy
```

- Pushing to `main` **deploys to production automatically** (≈6–10 min). Do not push to `main` unless all
  checks above pass.
- After the deploy, **verify on the live site** (open the changed page, `GET /api/health/ready` → the
  `ai_provider` and `environment` checks must say `pass`). Only then tell the owner it is done.
- If you changed a page that the service worker pre-caches (`public/sw.js`, `PRECACHE`), bump `VERSION`.
- Never use destructive git (force-push to `main`, history rewrite) and never delete data without asking.

## 4. Infrastructure

| What | Where |
|---|---|
| Code | GitHub `datobarabadzee-lgtm/GMAI`, branch `main` |
| Hosting | Google Cloud Run, service `gmai`, region `europe-west1`, project `notional-life-454212-q7` ("My First Project") |
| Live URL | https://gmai-29267867738.europe-west1.run.app (own `.ge` domain planned) |
| Build | Cloud Build trigger on push to `main` → `Dockerfile` (no BuildKit features; app listens on port 3000) |
| Images | Artifact Registry `europe-west1-docker.pkg.dev/notional-life-454212-q7/cloud-run-source-deploy/gmai` |
| Runtime settings | Cloud Run → gmai → Edit & deploy new revision → Variables & Secrets |
| Legacy | https://gmai-public.vercel.app (old Vercel deployment, being retired) |

Environment variables currently set on Cloud Run (values are NOT in the repo): `OPENAI_API_KEY` (secret),
`OPENAI_MODEL=gpt-6.1-terra`, `AI_MODEL_FAST=gpt-6.1-terra`, `AI_MODEL_REASONING=gpt-6.1-sol`,
`PUBLIC_ORIGIN=<live URL>`. `APP_TIER` defaults to `public`. Full list: `docs/ENVIRONMENT_SCHEMA.md`.

**Rollback:** Cloud Run → gmai → Revisions → pick the previous revision → Manage traffic → 100 %.
Or `git revert <commit>` on `main` and push (redeploys).

**Moving to the own domain:** Cloud Run → Domain mappings → add the domain, put the DNS records at the
registrar; then set `NEXT_PUBLIC_SITE_URL` (share-card links, read at build time — redeploy) and
`PUBLIC_ORIGIN` to the new address.

## 5. Known pitfalls

- `ui-language.test.ts` reads JSX text between `>` and `<`: inline `a <= b`, `=>` or `Record<…>` on a JSX
  line can be mistaken for text — move logic out of the JSX line.
- `useSearchParams()` needs a `<Suspense>` boundary in the page (see `src/app/prevention/page.tsx`).
- Dates are calendar dates in the user's time zone: use `localToday()` / `addDaysIso()` from
  `src/prevention/schedule.ts`, never `new Date().toISOString()` for "today".
- Calendar exports go through `buildIcsFromSchedule()` / `googleCalendarUrl()` (one source of truth).
- Share cards: `src/lib/site.ts` → `shareMeta()`, images in `public/og/` (1200×630).
- Tailwind: no opacity modifier on arbitrary `rgb(var(--x))` colours; use theme tokens.

## 6. Open items (ask the owner before starting)

- Rotate the OpenAI key (it was once pasted in a chat) and move it to Secret Manager.
- Own `.ge` domain.
- Georgian state screening / HCV programme details for the prevention plan — the owner supplies them; do not invent.
- Knowledge-base gaps found in testing (e.g. first-line hypertension drugs) — add from guidelines, with sources.
- Formal clinical validation is still to be done (`docs/KNOWN_LIMITATIONS.md`).
