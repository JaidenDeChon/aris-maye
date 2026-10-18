# Calculators (traffic PR 5)

The last of five PRs aimed at growing new traffic. PR 1 made the existing pages findable, PR 2
gave item links their own share image, PR 3 made browse-page views shareable, and PR 4 added
evergreen guides. This PR adds calculators: a skill calculator for each of the eight skills the
cheapest XP guides cover, and a GE tax calculator. A player enters where they are and where they
want to be, and the page works out how many of each item they'd make and what it costs at today's
prices.

## Problem

- "osrs herblore calculator", "osrs smithing calculator" and the like are among the most common
  searches an OSRS player makes. The answers that rank today use fixed or hand-entered prices. Ours
  would use live GE prices, run through the same profit pipeline as the rest of the site.
- The cheapest XP guides (PR 4) say what each XP costs, but not what a goal costs. "Level 70 to 80
  Herblore" means 1.2M XP, and turning a GP-per-XP figure into a total is left to the reader.
- Since the tax went to 2%, "osrs ge tax calculator" is a common search too, and the site already
  has the exact rules in `src/lib/constants/ge-tax.ts`.

## Decisions

| Decision         | Choice                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages            | `/calculators` (hub), `/calculators/<skill>` for the 8 cheapest XP skills, `/calculators/ge-tax`. 10 new indexable URLs                                               |
| URL shape        | A `/calculators/` prefix with a hub, like `/guides/`. Skill slugs are the same as the guides' (`XP_GUIDE_SKILLS`), so the two sections can't drift apart              |
| Rendering        | Server-rendered with a default goal, so a crawler gets a full results table. The inputs work in the browser, and the table updates as you type                        |
| Shareable inputs | The goal lives in the query (`?from=50&to=70`). The server reads it, so a shared link opens on the same results. Canonical stays the bare path, as in PR 3            |
| Data source      | A new `calculators` snapshot in `guide-snapshots`, refreshed by the hourly job. It's built from the same rows as the cheapest XP guide, so the two never disagree     |
| Methods shown    | Every method for the skill, not just the cheapest 8 per band. Methods above the player's level stay in the table, dimmed, with an option to hide them                 |
| Icons            | A new icon endpoint, `/icons/items/<id>.png`, rather than data URIs. Herblore alone has 241 methods, and inline icons would make its page about 400 KB                |
| Pricing basis    | GE prices for a main, the same as the cheapest XP guides, with the same "pays you" handling for methods that make money                                               |
| Character        | With no `from` in the URL, the current level comes from the active character's level in that skill, after mount. The URL is left alone until the player edits a field |
| Live numbers     | In the page body only, with the guides' "Updated" time. Never in `<title>` or the meta description (the PR 1 rule)                                                    |
| Copy             | A one-line answer under the title and a short assumptions line. No long explanations (removed from the guides at review). It all goes through the humanizer           |
| Share image      | The default thumbnail. A per-skill card is out of scope                                                                                                               |

### Rejected: one calculator page with a skill picker

One page could only target one search. Eight pages each target "osrs {skill} calculator", and each
can carry the skill's name in its title, heading and table.

### Rejected: icons as data URIs, as the guides do

The guides show at most 50 rows. The calculators show every method, up to 241 on Herblore. Icons
are about 800 bytes each in base64, and each one would be sent twice (in the HTML and in the page
data), so Herblore's page would weigh about 400 KB before any of its own content. An icon endpoint
with a long CDN cache costs each icon one function call, once, for every visitor after.

### Rejected: computing in the browser from `/api/game-items`

A crawler would see an empty table, and the browse list's paging and filters don't fit "every
method for one skill".

## Pages

### `/calculators/<skill>`: skill calculator

- **Inputs.** Current and target, each a level (1–99) or an exact XP amount (0–200,000,000), with a
  Level / XP switch per field. The default goal is level 1 to 99. Invalid or out-of-range values
  are clamped, and a target at or below the current XP shows "You're already there" in place of
  the table's counts.
- **Summary.** XP needed, and the cheapest method that's usable at the current level: how many to
  make and the total cost (or what it pays).
- **Table.** Every method for the skill, ranked the same way as the guide (`compareXpMethods`).
  Columns: item (icon and link), level, XP each, how many, total cost (or "pays you N gp" in green),
  GP per XP. "How many" is `ceil(xp needed / xp each)`, and total cost is that many times the
  method's net cost (buying the inputs and selling the result, after GE tax).
- **Levels.** A method that needs more than the current level is dimmed with "Needs {level}". A
  checkbox, "Only methods I can use now", hides them. It's off by default and in the URL (`can=1`).
- **Assumptions line.** "Live Grand Exchange prices, buying the materials and selling what you make.
  It doesn't count boosts, outfits or XP rates." Then the "Updated" time.
- **Links.** To the skill's cheapest XP guide, and the guide links back ("{Skill} calculator").
- An unknown skill is a 404 (the existing `xpSkill` matcher).

### `/calculators/ge-tax`: GE tax calculator

- Inputs: sell price per item, quantity, and an optional buy price per item. In the URL as
  `?price=&qty=&buy=`, read by the server.
- Results: tax per item, total tax, what you receive, and with a buy price, profit after tax.
- The rules as four short bullets: 2% of the sale price, rounded down per item; anything under
  50 gp is tax-free; tax is capped at 5M per item; bonds are exempt. All from `ge-tax.ts`, with a
  bond checkbox standing in for the exemption.
- No snapshot, so it can't fail on one.

### `/calculators`: the hub

- One card per calculator: the eight skills and GE tax. No live numbers.
- Title "OSRS Calculators: Skill XP & GE Tax · Aris Maye". Indexable and in the sitemap.

### Shared page parts

The guides' page header (title, one-line answer, "Updated" time), `GuideTable` styling inside a
horizontally scrolling box, and a "Related" block linking to the other calculators and the
matching guide.

## Data

### Snapshot

- `computeCheapestXp`'s aggregation moves into `fetchXpRows()`, which both the guide and the new
  `computeCalculatorMethods()` call. The guide's output doesn't change.
- The calculator snapshot stores, per skill, every method as a slim row: `id`, `name`, `level`,
  `xp`, `netCost` (the negated `creationProfit`) and `gpPerXp`. No icons and no market fields:
  about 1,100 rows and 130 KB across all eight skills.
- Stored under `calculators-v{CALCULATOR_SNAPSHOT_VERSION}` in `guide-snapshots`, through the same
  `createSnapshotCache`. A page awaits it like a guide, and a failure is the same 503 with
  `Retry-After: 600`.
- The page receives only its own skill's rows.
- The refresh endpoint and the hourly job gain a `calculators` target (six requests in all).

### Icon endpoint

- `GET /icons/items/[id=integer].png` reads one item's `icon` field and returns the decoded image
  with its real content type (PNG, GIF or JPEG, using the same magic numbers as `iconToDataUri`).
- `Cache-Control: public, max-age=86400` and
  `Netlify-CDN-Cache-Control: public, max-age=31536000, durable`. Links carry `?v=1`, so a change of
  icons can be rolled out by bumping it.
- An unknown item or an item with no icon is a 404. The table shows the name alone if an image
  fails to load.
- Only the calculators use it in this PR. Moving the guides and item lists over is a possible
  follow-up.

### XP table

`src/lib/helpers/xp-table.ts`: `xpForLevel(level)` from the game's formula and `levelForXp(xp)`,
for levels 1–99 and up to 200M XP.

## SEO

| Page                   | Title                                           |
| ---------------------- | ----------------------------------------------- |
| `/calculators`         | OSRS Calculators: Skill XP & GE Tax · Aris Maye |
| `/calculators/<skill>` | OSRS {Skill} Calculator: XP & GP to Your Goal   |
| `/calculators/ge-tax`  | OSRS GE Tax Calculator: What You Keep           |

- Each is `index`, with a 70–160 character description and no live figures, canonical to
  `SITE_URL` + path whatever the query, built in `src/lib/seo/calculator-seo.ts`.
- The sitemap adds the 10 paths, the skills from `XP_GUIDE_SKILLS`.

## Navigation

- The sidebar gets a "Calculators" group under "Guides": All calculators, GE tax, and a link per
  skill.
- `/guides` links to `/calculators`, and each cheapest XP skill page links to its calculator.
- The `/items/<skill>` link to the cheapest XP guide gains a calculator link beside it.

## Units

| Unit                                       | Purpose                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/lib/helpers/xp-table.ts`              | XP for a level, level for an XP amount                                          |
| `src/lib/helpers/skill-calculator.ts`      | Parse and clamp the inputs from a URL, work out XP needed and each row's totals |
| `src/lib/helpers/ge-tax-calculator.ts`     | Parse the GE tax inputs and work out the results with `geTax`                   |
| `src/lib/constants/calculators.ts`         | Snapshot version, calculator list for the hub, sidebar and related links        |
| `src/lib/models/calculators.ts`            | `CalculatorMethod`, `CalculatorSnapshot`                                        |
| `src/lib/services/guide-service.server.ts` | `fetchXpRows`, `computeCalculatorMethods`, the `calculators` snapshot           |
| `src/routes/icons/items/[id=integer].png/` | The icon endpoint                                                               |
| `src/lib/seo/calculator-seo.ts`            | Titles, descriptions and canonicals                                             |
| `src/routes/calculators/**`                | The hub, the skill calculator and the GE tax calculator                         |
| `src/lib/components/calculators/*`         | The goal inputs (level / XP switch) and the results table                       |
| `scripts/verify-calculators.ts`            | Data check                                                                      |
| `scripts/verify-calculator-pages.ts`       | Page check against a running site                                               |

## Error handling

- No snapshot and a failed build: 503 with `Retry-After: 600`, never a 200 with an empty table.
- A stale snapshot and a failed rebuild: serve the stale one and log it.
- Junk in the query (`?from=abc&to=-5`): fall back to the defaults or clamp. Never a 400 or a 500.
- An icon that fails to load: the name still shows and links.

## Out of scope

- XP or GP per hour. The data has no action rates.
- Boosts, outfits and XP multipliers (Amy's saw, zealot's robes, the Prospector kit and so on).
- Levels above 99 (virtual levels).
- Ironman pricing. The calculators are valued for a main from GE prices, like the cheapest XP
  guides, and say so.
- Combat, Prayer, gathering skills, Farming and Firemaking: no or too few creations (see PR 4).
- A hiscores lookup by player name.
- Profit, high alch or "how many can I afford" calculators. The high alch guide and the item pages
  already cover most of those questions.
- Per-skill share images.

## Verification

### 1. Unit tests (`bun test`)

- `xp-table`: `xpForLevel` gives 0 at level 1, 83 at 2, 101,333 at 50, 737,627 at 70, 6,517,253 at
  92 and 13,034,431 at 99. `levelForXp` round-trips each level, gives 98 for 13,034,430, and caps at
  99 for 200M.
- `skill-calculator`:
    - parsing: defaults, levels, XP overriding a level, clamping, junk and `can=1`
    - XP needed, including a target below the current XP
    - "how many" rounding up, fractional XP (e.g. 12.5 each), total cost for a method that costs and
      one that pays, and dimming by level
- `ge-tax-calculator`: 49 gp is tax-free, 50 gp pays 1, the 5M cap at a 250M+ price, a bond pays
  nothing, quantity multiplies per-item tax (rounded per item, not on the total), and profit with
  and without a buy price.
- `calculator-seo`: exact titles and descriptions for every page. Titles 60 characters or fewer,
  descriptions 70–160, no live figures, canonical ignores the query.
- `sitemap`: the 10 calculator URLs are present exactly once.
- The existing `SeoHead` guard covers the new routes.

### 2. Data check (`scripts/verify-calculators.ts`, read-only)

Run against `osrsbox-prod` and `osrsbox-dev`. It builds the snapshot in memory and checks:

- Every skill has at least 10 methods, and prints the count.
- Every row's `gpPerXp` equals `max(0, netCost) / xp`.
- Every cheapest XP guide row appears in the calculator with the same level, XP and GP per XP, so
  the two can't disagree.
- The build time, which has to fit a function's time limit.

### 3. Site audit (`verify-seo`, unchanged)

The new URLs come from the sitemap, so the existing audit checks each one's status, title,
description, canonical and robots meta.

### 4. Page check (`scripts/verify-calculator-pages.ts <baseUrl>`, Playwright)

1. **Crawlable.** Each skill calculator's raw server HTML has at least 10 rows linking to item
   pages, and XP needed for 1 to 99 (13,034,431).
2. **Shared goal.** `/calculators/herblore?from=50&to=70` server-renders 636,294 XP needed, and
   the canonical is the bare path.
3. **Typing.** Changing the target to 80 updates XP needed and the counts, and the address bar
   reads `?from=50&to=80`.
4. **Character.** With a saved character at Herblore 60 and no `from`, the current level shows
   60 after load, and the URL is unchanged.
5. **Can-use filter.** Ticking "Only methods I can use now" leaves no row needing more than the
   current level.
6. **GE tax.** `?price=1000&qty=100&buy=900` shows 20 tax per item, 2,000 total, 98,000 received
   and 8,000 profit, in the server HTML.
7. **Icons.** An icon URL from the table returns an image with the cache headers above. An
   unknown id is a 404.
8. **404.** `/calculators/woodcutting` is a 404.
9. **Hydration and mobile.** No hydration warning or page error on any calculator. At 390px the
   page doesn't scroll sideways and the table scrolls in its own box. Screenshots at 390px and
   1280px are saved.
10. **Links.** The sidebar's Calculators links, and the links between each guide and its
    calculator, reach the right pages.

### 5. Regression

- `verify-guides` and `verify-guide-pages` still pass: the cheapest XP guide is unchanged after
  `fetchXpRows` moves out.
- `svelte-check` shows no new errors compared with `main`, and ESLint and Prettier are clean.
- `scripts/humanize_copy.py check` passes on the new pages.

### 6. Deploy preview and production (owner)

- Run the audit and the page check against the preview (reading `osrsbox-dev`).
- After the production deploy: confirm the Netlify log shows the `calculators` refresh succeeding,
  resubmit the sitemap in Search Console, and inspect `/calculators/herblore`.
