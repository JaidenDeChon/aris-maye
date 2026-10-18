# Calculators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-rendered calculators under `/calculators/`: a skill calculator for each of the eight cheapest XP skills, a GE tax calculator and a hub. Their goals live in the URL, and their prices refresh hourly.

**Architecture:** The cheapest XP aggregation moves into `fetchXpRows()`, which feeds both the existing guide and a new `calculators` snapshot (every method per skill, slim rows, no icons). Icons come from a new cached endpoint, `/icons/items/<id>.png`. Each calculator's `+page.server.ts` reads the goal from the query and returns the snapshot rows, and the page works out the totals with pure helpers, on the server for the first render and in the browser as the player types.

**Tech Stack:** SvelteKit 2.49, Svelte 5 runes, Mongoose 9 aggregations, Bun 1.3 (`bun test`), bits-ui, `lucide-svelte` icons, `playwright-core` with Playwright's cached headless Chromium.

**Spec:** `docs/superpowers/specs/2026-10-17-calculators-design.md`

## Global Constraints

- Paths: `/calculators`, `/calculators/<skill>` (the `xpSkill` matcher, so the 8 `XP_GUIDE_SKILLS` slugs), `/calculators/ge-tax`. Icons at `/icons/items/<id>.png?v=1`.
- Query parameters. Skill calculator: `from`, `to` (levels), `fromXp`, `toXp` (XP, winning over the level when both are present), `can=1`. GE tax: `price`, `qty`, `buy`, `bond=1`. Defaults: level 1 to 99, and an empty GE tax form showing an example of 1,000 gp × 1.
- Levels are 1–99, XP 0–200,000,000. Out-of-range values are clamped, and junk falls back to the default.
- Titles 60 characters or fewer. Descriptions 70–160 with no live figures. Canonical is `SITE_URL` + path, whatever the query.
- A skill calculator never renders a 200 with an empty table because its snapshot failed: a 503 with `Retry-After: 600` (`loadGuide`'s behaviour).
- The cheapest XP guide's output doesn't change. `verify-guides` and `verify-guide-pages` must still pass.
- Values are for a main from GE prices, through `buildProfitPipeline`, as in the guides.
- Run SvelteKit commands with `NODE_OPTIONS=--no-experimental-webstorage`. Quote URLs in zsh commands. Local runs that write use `VITE_MONGO_DB_DB_NAME=osrsbox-dev`.

## Review Focus

1. **Server and browser agree.** The first render and the browser use the same helpers on the same rows, so there's no hydration mismatch. The character prefill happens only after mount.
2. **The guide is unchanged.** `fetchXpRows` is a move, not a rewrite. The data check compares every guide row with the calculator's.
3. **Page weight.** Rows carry no icons. Check Herblore's HTML size on the preview: it should be well under 150 KB.
4. **Icon endpoint caching.** It's a function call per icon until the CDN has it. Check the headers on the preview.

---

## File Structure

| File                                                           | Responsibility                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/helpers/xp-table.ts` (create) + test                  | `xpForLevel`, `levelForXp`, `MAX_LEVEL`, `MAX_XP`                  |
| `src/lib/helpers/skill-calculator.ts` (create) + test          | Goal parsing and serialising, XP needed, row totals                |
| `src/lib/helpers/ge-tax-calculator.ts` (create) + test         | GE tax inputs and results                                          |
| `src/lib/constants/calculators.ts` (create)                    | Snapshot version, calculator list                                  |
| `src/lib/models/calculators.ts` (create)                       | `CalculatorMethod`, `CalculatorSnapshot`                           |
| `src/lib/services/guide-service.server.ts`                     | `fetchXpRows`, `computeCalculatorMethods`, the `calculators` cache |
| `src/routes/api/homepage/refresh/+server.ts`                   | `calculators` target                                               |
| `netlify/functions/update-item-prices.ts`                      | Sixth refresh target                                               |
| `src/routes/api/homepage/status/+server.ts`                    | Reports the calculator snapshot                                    |
| `src/routes/icons/items/[id=integer].png/+server.ts` (create)  | Icon endpoint                                                      |
| `src/lib/seo/calculator-seo.ts` (create) + test                | Page SEO                                                           |
| `src/lib/seo/sitemap.ts` + test                                | Calculator paths                                                   |
| `src/lib/components/calculators/*.svelte` (create)             | Goal input, results table, item cell with the icon URL             |
| `src/routes/calculators/**` (create)                           | Hub, skill calculator, GE tax calculator                           |
| `src/lib/components/layout/nav-menu/nav-contents.svelte`       | Calculators group                                                  |
| `src/routes/guides/+page.svelte`, `guides/cheapest-xp/[skill]` | Links to the calculators                                           |
| `src/lib/components/items/game-items-page.svelte`              | Calculator link beside the cheapest XP link                        |
| `scripts/verify-calculators.ts` (create)                       | Data check                                                         |
| `scripts/verify-calculator-pages.ts` (create)                  | Page check against a running site                                  |
| `package.json`                                                 | `verify-calculators`, `verify-calculator-pages` scripts            |

---

### Task 1: XP table and calculator helpers

**Files:** create `src/lib/helpers/xp-table.ts`, `skill-calculator.ts`, `ge-tax-calculator.ts` and their tests.

- [ ] **Step 1: Failing tests** for the cases in the spec's Verification §1.
- [ ] **Step 2: `xp-table.ts`.** Build the table once: `xp(L) = floor(Σ_{l=1}^{L-1} floor(l + 300 × 2^(l/7)) / 4)`. `levelForXp` is the highest level whose XP is at most the amount, capped at 99.
- [ ] **Step 3: `skill-calculator.ts`.**

```ts
export type SkillGoal = { fromXp: number; toXp: number; canUseOnly: boolean };
export function parseSkillGoal(params: URLSearchParams): SkillGoal;
export function skillGoalParams(goal: SkillGoal): URLSearchParams; // levels when the XP is exactly a level's, otherwise fromXp/toXp
export function xpNeeded(goal: SkillGoal): number; // max(0, toXp - fromXp)
export type MethodTotals = { count: number; totalCost: number; usable: boolean };
export function methodTotals(method: CalculatorMethod, goal: SkillGoal): MethodTotals;
```

`count = ceil(xpNeeded / xp)`, `totalCost = count × netCost` (negative means it pays), `usable = method.level <= levelForXp(fromXp)`. Default goal parameters are omitted from `skillGoalParams`, so the default page's URL stays bare.

- [ ] **Step 4: `ge-tax-calculator.ts`.** `parseGeTaxInput(params)` and `geTaxResult({ price, qty, buy, bond })` using `geTax(price, bond ? 13190 : null)`, so the per-item rounding and cap are the existing ones.
- [ ] **Step 5:** `bun test` passes. **Commit** "Add the XP table and calculator helpers".

---

### Task 2: Calculator snapshot and refresh

**Files:** create `src/lib/constants/calculators.ts` and `src/lib/models/calculators.ts`, and modify `guide-service.server.ts`, the refresh and status endpoints, and the hourly job.

- [ ] **Step 1: Move the aggregation.** `computeCheapestXp`'s pipeline becomes `fetchXpRows(natureRunePrice): Promise<RawXpRow[]>`. `computeCheapestXp` calls it and `bucketXpRows`, exactly as before. Pull the level lookup out of `bucketXpRows` into `methodLevel(row, skill)` so both use it.
- [ ] **Step 2: `computeCalculatorMethods()`.** Group `fetchXpRows` rows by canonical skill (guide skills only) into `{ computedAt, skills: Record<slug, CalculatorMethod[]> }`, each list sorted by `compareXpMethods`. `CalculatorMethod = { id, name, level, xp, netCost, gpPerXp }`, with `netCost = -(creationProfit ?? 0)`. `compareXpMethods` takes `XpMethod`, so give it a structural type both fit (`{ gpPerXp; xp; item: { name } } | { gpPerXp; xp; name }`), or add a sibling comparator with a shared core. Keep the guide's ordering identical.
- [ ] **Step 3: The cache.** A `calculators-v{CALCULATOR_SNAPSHOT_VERSION}` cache in `guide-snapshots`. Export `getCalculatorMethods(skill)` (awaits `getFresh()`, returns that skill's rows and `computedAt`), `refreshCalculatorSnapshot()` and a status entry. Reuse `loadGuide`'s 503 by generalising it to take a loader, or add `loadCalculator` beside it.
- [ ] **Step 4: Refresh.** The endpoint accepts `target=calculators`. The job's `REFRESH_TARGETS` gains `'calculators'`. The status endpoint lists it.
- [ ] **Step 5: Commit** "Build and cache the calculator methods, and refresh them hourly".

---

### Task 3: Data check

**Files:** create `scripts/verify-calculators.ts`, and add `"verify-calculators": "bun run --env-file .env scripts/verify-calculators.ts"` to `package.json`.

- [ ] **Step 1:** Same shape as `verify-guides.ts` (`autoIndex` off, dynamic imports, nothing written). Build both `computeCalculatorMethods` and `computeCheapestXp` in memory.
- [ ] **Step 2: Checks** from the spec's Verification §2, plus every row having a positive `xp` and a level from 1 to 99. Print the count per skill and the build time.
- [ ] **Step 3:** Run against `osrsbox-prod` and `osrsbox-dev`, and run `verify-guides` against both too. **Commit** "Add a data check for the calculators".

---

### Task 4: Icon endpoint

**Files:** create `src/routes/icons/items/[id=integer].png/+server.ts`.

- [ ] **Step 1:** Look up `{ id }` with projection `{ icon: 1 }` (`lean()`). Missing item or icon: 404. Otherwise decode the base64 (stripping any `data:` prefix), pick the content type from the magic number as `iconToDataUri` does, and return it with the spec's two cache headers.
- [ ] **Step 2:** Check in dev: `curl -sI 'http://localhost:5173/icons/items/2.png?v=1'` gives 200, the right type and both headers. `/icons/items/99999999.png` gives 404. **Commit** "Serve item icons from a cached endpoint".

---

### Task 5: SEO and sitemap

**Files:** create `src/lib/seo/calculator-seo.ts` and its test, and modify `sitemap.ts` and its test.

- [ ] **Step 1: Failing tests, then the builders:** `calculatorsHubSeo`, `buildSkillCalculatorSeo(slug)` and `geTaxCalculatorSeo`, with the spec's titles. Descriptions, before the humanizer pass:
    - Hub: "Free OSRS calculators that use live Grand Exchange prices: what a skill goal costs, and what you keep after GE tax."
    - Skill: "Work out the XP and GP to reach your {Skill} goal in OSRS, with every method priced from live Grand Exchange data."
    - GE tax: "See how much Grand Exchange tax you'll pay on a sale in OSRS and what you keep, with the 2% rate, the cap and exemptions."
- [ ] **Step 2: Sitemap.** Add `/calculators`, `/calculators/ge-tax` and one path per `XP_GUIDE_SKILLS` slug. The test checks the 10 appear once each.
- [ ] **Step 3:** `bun test` passes. **Commit** "Add calculator SEO and sitemap entries".

---

### Task 6: Calculator components and routes

**Files:** create `src/lib/components/calculators/*` and everything under `src/routes/calculators/`.

- [ ] **Step 1: Components.**
    - `goal-input.svelte`: a label, a number input and a Level / XP toggle group (bits-ui, as the high alch sort). Binds an XP value, so switching modes keeps the same goal.
    - `calculator-item-cell.svelte`: `GuideItemCell`'s markup with `src="/icons/items/{id}.png?v=1"`, `loading="lazy"`, `width`/`height` set, and the image hidden on `error`.
    - `skill-calculator-table.svelte`: `GuideTable` with the spec's columns. Unusable rows get `opacity-60` and a "Needs {level}" badge. "Pays you" totals in green, as on the guides.
- [ ] **Step 2: `/calculators/[skill=xpSkill]`.**
    - `+page.server.ts` returns `{ skill, goal: parseSkillGoal(url.searchParams), methods, computedAt }` through the 503 wrapper.
    - `+page.svelte` keeps `goal` in `$state` seeded from `data.goal`, derives the summary and rows with the helpers, and writes the URL with `replaceState` after each change (debounced, and only once the router is ready, as `game-items-page.svelte` does).
    - In `onMount`, with no `from`/`fromXp` in `page.url`, take the active character's level for the skill from `character-store` and set `fromXp = xpForLevel(level)` without touching the URL.
    - It renders `<SeoHead>`, `GuideHeader`, the inputs, the summary, the table, the assumptions line and the related links.
- [ ] **Step 3: `/calculators/ge-tax`.** A `+page.server.ts` that returns `parseGeTaxInput(url.searchParams)`. The page has the inputs, the results and the rules list. No snapshot.
- [ ] **Step 4: `/calculators`.** The hub cards, from `CALCULATOR_PAGES`.
- [ ] **Step 5:** Check in dev at 390px and 1280px, with JavaScript off (the server render shows the results for the URL's goal). **Commit** "Add the calculator pages".

---

### Task 7: Links

- [ ] Sidebar "Calculators" group under "Guides": All calculators, GE tax, and the eight skills.
- [ ] `/guides` gets a card or line linking to `/calculators`. Each `/guides/cheapest-xp/<skill>` links to "{Skill} calculator", and the calculator links back.
- [ ] `game-items-page.svelte`: "{Skill} calculator →" beside "Cheapest {Skill} XP →".
- [ ] **Commit** "Link the calculators from the sidebar, the guides and the skill pages".

---

### Task 8: Page check

**Files:** create `scripts/verify-calculator-pages.ts`, and add `"verify-calculator-pages": "bun scripts/verify-calculator-pages.ts"` to `package.json`.

- [ ] **Step 1:** Same structure as `verify-guide-pages.ts` (finding Chromium, `check()`, screenshots to `--out`). Implement the ten checks in the spec's Verification §4. For the character check, seed `localStorage` with an `addInitScript` holding a character at Herblore 60 before the page loads.
- [ ] **Step 2:** Run against `bun run dev` (on `osrsbox-dev`) until it passes. Run `verify-guide-pages` too. **Commit** "Add a browser check for the calculators".

---

### Task 9: Copy, regression and PR

- [ ] Run the copy-humanizer on the new pages and the SEO descriptions, updating the tests with them. `python3 scripts/humanize_copy.py check` passes.
- [ ] `bun test`, `svelte-check` (no new errors compared with `main`), ESLint and Prettier on the changed files only.
- [ ] Against the deploy preview: `verify-seo`, `verify-calculator-pages`, `verify-guide-pages`. Check Herblore's HTML size.
- [ ] Add "Decisions made during implementation" to the spec for anything that changed, then mark the PR ready.
