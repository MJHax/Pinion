# Rename OpenChat to Pinion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the project to Pinion everywhere people see it, without losing anyone's chats, backups or settings, and get README and CI ready for the public launch.

**Architecture:** Two small new server modules carry the compatibility rules: `server/src/env.ts` reads `PINION_*` with `OPENCHAT_*` as a fallback, and `server/src/dbPath.ts` picks the database file and moves an old `data/openchat.db` to `data/pinion.db` once. Restore learns to read both the new and the old backup layout. Everything else is text.

**Tech Stack:** TypeScript, Hono, better-sqlite3, Vitest, React/Vite, GitHub Actions.

**Spec:** the owner's request of 2026-11-15 (items 1–7), restated in Global Constraints.

## Global Constraints

- Nothing under `docs/superpowers/` changes except this new plan file.
- New name: **Pinion**. Lowercase form for files, folders, ids: `pinion`.
- GitHub URLs become `https://github.com/MJHax/Pinion` (the owner renames the repo before pushing; GitHub redirects the old URL).
- Env vars `PINION_HOST`, `PINION_PORT`, `PINION_DB`, `PINION_DETECT_HOST`, `PINION_ALLOWED_HOSTS`, `PINION_TAVILY_URL`; the matching `OPENCHAT_*` name is read when the `PINION_*` one is not set. README mentions the old names once.
- Default database `data/pinion.db`; an existing `data/openchat.db` is moved to it, never lost.
- New exports write `pinion-export/…`, `pinion-backup` manifest, `pinion.db`. Import accepts both that and the old `openchat-export/backup/openchat.db` layout.
- Browser storage keys become `pinion.*` (`pinion.theme`, `pinion.appearance`, …), with no migration: the owner is the only user and accepts resetting their preferences once.
- The Docker volume becomes `pinion-data`: the owner is the only Docker user and has a backup to import.
- Code that means "open a chat" (`openChat`, `onOpenChat`) is not the brand and stays.
- Work on branch `rename-to-pinion`, one commit per task. No push, no tag.
- CI tests on ubuntu-latest, windows-latest, macos-latest × Node 22 and 24.

## Review Focus

1. An old install whose last session didn't shut down cleanly (chats still in `openchat.db-wal`) must keep those chats after the move → Task 2 test "moves an unclean database with its WAL".
2. OpenChat still running (file in use) when Pinion starts → don't move, keep using the old file → Task 2 test "leaves a database that is in use where it is".
3. Someone with both `openchat.db` and `pinion.db` → use `pinion.db`, leave the old one alone → Task 2 test.
4. `PINION_X=''` set alongside `OPENCHAT_X` → the explicit empty new value wins (same as `??` today) → Task 1 test.
5. A Docker user rebuilding the image → their `/app/data/openchat.db` is found: the Dockerfile stops setting a DB path so the default (and the move) applies → Task 1 Dockerfile step + Task 2.

---

### Task 1: Env vars with old-name fallback

**Files:**
- Create: `server/src/env.ts`, `server/test/env.test.ts`
- Modify: `server/src/index.ts`, `server/src/app.ts:44-66`, `server/src/webSearch/index.ts:16`, `server/src/localDetect.ts:8` (comment), `vite.config.ts:24`, `scripts/readme-screenshots.ts:135`, `Dockerfile`, `compose.yaml`, `.env.example`, `server/test/http.test.ts:68`, `server/test/settingsRoutes.test.ts:94`, `server/test/localServers.test.ts:139` (name only)

**Interfaces:**
- Produces: `type PinionVar = 'HOST' | 'PORT' | 'DB' | 'DETECT_HOST' | 'ALLOWED_HOSTS' | 'TAVILY_URL'`; `envVar(env: NodeJS.ProcessEnv | Record<string, string | undefined>, name: PinionVar): string | undefined` returning `env['PINION_' + name] ?? env['OPENCHAT_' + name]`.

- [ ] **Step 1: Write failing tests** in `server/test/env.test.ts`: `envVar({ PINION_PORT: '4000', OPENCHAT_PORT: '5000' }, 'PORT') === '4000'`; `envVar({ OPENCHAT_PORT: '5000' }, 'PORT') === '5000'`; `envVar({}, 'PORT') === undefined`; `envVar({ PINION_HOST: '', OPENCHAT_HOST: '0.0.0.0' }, 'HOST') === ''`. In `http.test.ts`, switch the existing test to `PINION_ALLOWED_HOSTS` and add "still answers on names in the old OPENCHAT_ALLOWED_HOSTS". In `settingsRoutes.test.ts`, use `PINION_TAVILY_URL`.
- [ ] **Step 2: Run** `npx vitest run server/test/env.test.ts server/test/http.test.ts server/test/settingsRoutes.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `envVar` and use it in `index.ts` (PORT, HOST, DETECT_HOST; DB comes in Task 2), `app.ts`, `webSearch/index.ts`. Update the 403 message to name `PINION_ALLOWED_HOSTS`. `vite.config.ts`: `process.env.PINION_PORT ?? process.env.OPENCHAT_PORT ?? 3000` (Vite config doesn't import server code). Screenshots script, Dockerfile (`PINION_HOST`, `PINION_PORT`, healthcheck reads `PINION_PORT`, **drop the DB line**), compose (`PINION_DETECT_HOST`, commented `PINION_ALLOWED_HOSTS`), `.env.example` all use the new names.
- [ ] **Step 4: Run** the same tests — expect PASS. Run `npm run typecheck` — expect no errors.
- [ ] **Step 5: Commit** `feat: read PINION_* settings, keeping OPENCHAT_* as a fallback`

### Task 2: Database moves from openchat.db to pinion.db

**Files:**
- Create: `server/src/dbPath.ts`, `server/test/dbPath.test.ts`
- Modify: `server/src/index.ts:20`

**Interfaces:**
- Consumes: `envVar` from Task 1.
- Produces: `resolveDbFile(env: NodeJS.ProcessEnv, dataDir = 'data'): string`.

Rules, in order: `envVar(env, 'DB')` set → return it unchanged. `pinion.db` exists, or `openchat.db` doesn't → return `join(dataDir, 'pinion.db')`. Otherwise open `openchat.db` with better-sqlite3, `PRAGMA wal_checkpoint(TRUNCATE)`, close; if `openchat.db-wal` still exists (another process has it open) → log and return the old path; else `renameSync` to `pinion.db`, log "Moved your chats from data/openchat.db to data/pinion.db", return the new path; if anything throws → log and return the old path.

- [ ] **Step 1: Write failing tests** (each in a fresh temp dir):
  - "uses data/pinion.db on a fresh install" → returns `join(dir,'pinion.db')`, creates no file.
  - "moves an old openchat.db" → old db with a row; result is `pinion.db`, the row is there, `openchat.db` gone.
  - "moves an unclean database with its WAL" → open a WAL db with `wal_autocheckpoint = 0`, insert a row, copy `openchat.db` and `openchat.db-wal` into the test dir while still open; after `resolveDbFile` the row is in `pinion.db` and no `openchat.db-wal` remains.
  - "leaves a database that is in use where it is" → keep a WAL connection open on `openchat.db` with an uncheckpointed write; returns the `openchat.db` path, file still there.
  - "prefers pinion.db when both exist" → both untouched, returns `pinion.db`.
  - "PINION_DB wins, OPENCHAT_DB still works" → `{ PINION_DB: 'a.db', OPENCHAT_DB: 'b.db' }` → `'a.db'`; `{ OPENCHAT_DB: 'b.db' }` → `'b.db'`; neither moves anything.
- [ ] **Step 2: Run** `npx vitest run server/test/dbPath.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `resolveDbFile`; `index.ts` uses `const dbFile = resolveDbFile(process.env)`.
- [ ] **Step 4: Run** the test — expect PASS (on Windows too: the in-use test is the one that differs by OS, so the test must not depend on rename failing).
- [ ] **Step 5: Commit** `feat: store chats in data/pinion.db and move an old openchat.db there`

### Task 3: Backups under the new name, old backups still import

**Files:**
- Modify: `server/src/backup.ts`, `server/src/restore.ts`, `server/src/exportData.ts:13`, `server/src/routes/data.ts:32,44`, `server/test/backup.test.ts`, `server/test/restore.test.ts`, `server/test/export.test.ts`, `server/test/discussionData.test.ts`

**Interfaces:**
- Produces: `BACKUP_DIR = 'pinion-export/backup'`, `LEGACY_BACKUP_DIR = 'openchat-export/backup'`; `BackupManifest.format: 'pinion-backup' | 'openchat-backup'`; the backup db entry is `pinion.db` (legacy `openchat.db`).

- [ ] **Step 1: Write failing tests.** Update existing expectations to `pinion-export/…`, `pinion-backup`, `pinion.db`, and the download name `pinion-export-YYYY-MM-DD.zip`. Add to `restore.test.ts`: "imports a backup made by OpenChat" — export a source instance with a chat, rename every zip entry from `pinion-export/` to `openchat-export/`, `backup/pinion.db` to `backup/openchat.db`, set manifest `format: 'openchat-backup'`; restoring it into an empty target brings the chat back.
- [ ] **Step 2: Run** `npx vitest run server/test/backup.test.ts server/test/restore.test.ts server/test/export.test.ts server/test/discussionData.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Export writes the new names. Restore looks for `manifest.json` under `BACKUP_DIR`, then `LEGACY_BACKUP_DIR`, and uses the database entry and `clips/` from whichever folder held it (`pinion.db` in the new one, `openchat.db` in the old). Accept either manifest format. Temp prefixes become `pinion-…`.
- [ ] **Step 4: Run** the same tests — expect PASS.
- [ ] **Step 5: Commit** `feat: name exports pinion-export and still import OpenChat backups`

### Task 4: Rename everything else people see

**Files:** every remaining hit of `git grep -i openchat -- . ':!docs/superpowers' ':!package-lock.json'` except the kept items in Global Constraints. That includes `package.json` + the two `name` fields in `package-lock.json`, `web/index.html` `<title>`, `IconRail.tsx` label, `Logo.tsx`, `App.tsx` error banner, `api.ts`, `DataTab.tsx`, `SpendingLimitsSection.tsx`, `Stats.tsx`, `shared/attachments.ts`, `server/src/discussion/report.tsx`, `exportData.ts` "Exported from", `restore.ts` and `videoJobs.ts` messages, `openrouter.ts` `APP_URL`/`APP_TITLE`, `index.ts` startup log, SearXNG test query `'pinion'`, `filePreview.ts` + `FilePanel.tsx` message `'pinion:print'`, `usedByOpenChat` → `usedByPinion`, code comments, `aria-label` in the four `docs/brand/*.svg`, `SECURITY.md`, `AGENTS.md` (env table lists `PINION_*` and says the old names still work; data path `data/pinion.db`), `compose.yaml` service, `container_name` and volume → `pinion`/`pinion-data`, every `openchat.` browser storage key (including the inline script in `web/index.html`) → `pinion.`, test temp-dir prefixes, and the matching test expectations.

- [ ] **Step 1:** Make the edits; update tests whose expected strings changed (`openrouter.test.ts`, `restore.test.ts` messages, `webSearchServices.test.ts`, `catalog.test.ts`, `dataRoutes.test.ts` title).
- [ ] **Step 2: Run** `npm test` and `npm run typecheck` — expect all pass.
- [ ] **Step 3: Commit** `chore: rename OpenChat to Pinion in the app, docs and Docker files`

### Task 5: README

**Files:** Modify `README.md`

- [ ] **Step 1:** Title, alt texts, clone URL and `cd Pinion`, every "OpenChat" → "Pinion". Keep the banner image link (the owner is remaking `banner.png`).
- [ ] **Step 2:** Near the top, "How this was built": the owner came up with the ideas and product direction; Claude Code turned their brain dumps into specs and implementation plans, then built each feature while they tested it; link `docs/superpowers`.
- [ ] **Step 3:** "Why another chat app?": no Docker or database server needed (just `npm start`); model debates with a moderator; Compare mixing local and cloud models with cost and speed shown; built-in cost tracking and spending limits. Say Open WebUI and LibreChat are great and much bigger; Pinion is lighter and focused on comparing and debating models.
- [ ] **Step 4:** One sentence where settings are described: the old `OPENCHAT_*` names still work.
- [ ] **Step 5: Commit** `docs: README for the Pinion launch`

### Task 6: CI on three systems and two Node versions

**Files:** Modify `.github/workflows/ci.yml`

- [ ] **Step 1:** `test` job gets `strategy: { fail-fast: false, matrix: { os: [ubuntu-latest, windows-latest, macos-latest], node: [22, 24] } }`, `runs-on: ${{ matrix.os }}`, `node-version: ${{ matrix.node }}`, job name showing both. Docker job unchanged. Update the top comment.
- [ ] **Step 2: Verify** the YAML parses: `node -e "require('yaml')"` isn't available, so check with `npx --yes yaml-lint .github/workflows/ci.yml` or by eye; real proof comes from the first push.
- [ ] **Step 3: Commit** `ci: test on Linux, Windows and macOS with Node 22 and 24`

### Task 7: Final check

- [ ] **Step 1: Run** `npm test` and `npm run typecheck` — all pass.
- [ ] **Step 2: Run** `git grep -n -i openchat -- . ':!docs/superpowers' ':!package-lock.json'` and list every hit with its reason (expected: fallback code and tests, `openChat`/`onOpenChat`).
- [ ] **Step 3:** Report that `docs/brand/banner.png` shows the word "OpenChat" and needs remaking; the README screenshots/GIF may too.
