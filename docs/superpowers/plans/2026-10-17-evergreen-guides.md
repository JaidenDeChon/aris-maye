# Evergreen Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-rendered guide pages under `/guides/` (a hub, a GE market report, a high alch list, cheapest XP per skill and Ironman money making) whose tables refresh hourly, plus a market share image in the same style as the existing ones.

**Architecture:** The homepage's cached-snapshot logic moves into a generic `snapshot-cache.server.ts`. The homepage's section builders take a row limit so the guides can reuse them at full length. A new `guide-service.server.ts` builds one snapshot per guide, and each guide's `+page.server.ts` awaits it, so the tables are in the server HTML. The hourly job refreshes each guide with its own request. The market share image reuses PR 2's `shareCardLayout` and renderer unchanged, with new text.

**Tech Stack:** SvelteKit 2.49, Svelte 5 runes, Mongoose 9 aggregations, Bun 1.3 (`bun test`), satori + resvg-wasm (PR 2), bits-ui toggle group, `lucide-svelte` icons, `playwright-core` with Playwright's cached headless Chromium.

**Spec:** `docs/superpowers/specs/2026-10-17-evergreen-guides-design.md`

## Global Constraints

- Paths: `/guides`, `/guides/market`, `/guides/high-alch`, `/guides/cheapest-xp`, `/guides/cheapest-xp/<skill>`, `/guides/ironman-money-making`. Share image at `/og/guides/market.png`.
- Guide skills, in this order: construction, cooking, crafting, farming, firemaking, fletching, herblore, magic, runecrafting, smithing. Slugs are lowercase. `runecraft` in the data is the same skill as `runecrafting` (`canonicalSkill`).
- Level bands: 1–19, 20–39, 40–59, 60–79, 80–99. A missing level counts as 1, and a level above 99 goes in 80–99.
- Row counts: market risers/fallers/most-traded 25 each, high alch 50, cheapest XP 8 per band, Ironman lists 25 each.
- Titles 60 characters or fewer. Descriptions 70–160 with no live figures. Canonical is `SITE_URL` + path.
- A guide page never renders a 200 with empty tables because its snapshot failed. No snapshot plus a failed build means a 503 with `Retry-After: 600`.
- The homepage's behaviour and its snapshot documents don't change (`homepage-snapshots`, `SNAPSHOT_VERSION = 5`).
- Profit and cost figures come from `buildProfitPipeline`, the same as `/items`.
- Run SvelteKit commands with `NODE_OPTIONS=--no-experimental-webstorage`. Quote URLs in zsh commands.

## Review Focus

1. **The snapshot-cache move.** The homepage must behave exactly as before: stale served from `getHomepageSnapshot`, a rebuild only through `getFreshHomepageSnapshot` or `refresh`, and one rebuild per key per instance. The fake-collection tests in Task 1 pin this down.
2. **Cheapest XP levels.** A method's level is looked up in `primarySpec.requiredSkills` by the XP skill's _canonical_ name, so `runecraft` XP finds a `Runecrafting` requirement. Covered by the data check (Task 4), which prints rows per band.
3. **Time limits.** Each refresh target is its own request, and the job fires them all at once. The data check prints each build's time. Anything over 8 s needs a look before merge.
4. **Hydration.** The "Updated" time renders in UTC on the server and switches to local time only after mount. The page check fails on any hydration warning.

---

## File Structure

| File                                                                                                         | Responsibility                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/lib/services/snapshot-cache.server.ts` (create)                                                         | Generic cached snapshot: memory cache, Mongo store, rebuild claim                  |
| `src/lib/services/snapshot-cache.test.ts` (create)                                                           | Cache behaviour against a fake collection                                          |
| `src/lib/services/homepage-service.server.ts`                                                                | Uses the cache, and its builders take a row limit and are exported                 |
| `src/lib/constants/guides.ts` (create)                                                                       | Skills, bands, row counts, snapshot version, guide list                            |
| `src/lib/models/guides.ts` (create)                                                                          | Snapshot types                                                                     |
| `src/lib/helpers/guides.ts` (create) + test                                                                  | Band for a level, median, market summary, high alch sorting, cheapest per skill    |
| `src/lib/services/guide-service.server.ts` (create)                                                          | Builders and `getGuideSnapshot`, `refreshGuideSnapshot`                            |
| `src/routes/api/homepage/refresh/+server.ts`                                                                 | `?target=`                                                                         |
| `netlify/functions/update-item-prices.ts`                                                                    | One refresh request per target                                                     |
| `src/params/xpSkill.ts` (create) + test                                                                      | Matcher                                                                            |
| `src/lib/seo/guide-seo.ts` (create) + test                                                                   | Page SEO for each guide                                                            |
| `src/lib/seo/sitemap.ts` + test                                                                              | Guide paths                                                                        |
| `src/lib/seo/market-share-card.ts` (create) + test                                                           | Market card text                                                                   |
| `src/routes/og/guides/market.png/+server.ts` (create)                                                        | Market share image                                                                 |
| `src/lib/components/guides/*.svelte` (create)                                                                | `guide-header`, `updated-time`, `guide-table`, `guide-item-cell`, `related-guides` |
| `src/routes/guides/**` (create)                                                                              | Hub and guide pages                                                                |
| `src/lib/components/layout/nav-menu/nav-contents.svelte`                                                     | Guides group                                                                       |
| `src/lib/components/homepage/{home-band,market-pulse-section,alch-xp-section,ironman-corner-section}.svelte` | Links to the guides                                                                |
| `scripts/verify-guides.ts` (create)                                                                          | Data check                                                                         |
| `scripts/verify-guide-pages.ts` (create)                                                                     | Page check against a running site                                                  |
| `package.json`                                                                                               | `verify-guides`, `verify-guide-pages` scripts                                      |

---

### Task 1: Move the snapshot cache out of the homepage service

**Files:** create `src/lib/services/snapshot-cache.server.ts` and `src/lib/services/snapshot-cache.test.ts`, and modify `src/lib/services/homepage-service.server.ts`.

- [ ] **Step 1: Write the failing tests** against a fake collection (an in-memory `Map` implementing `findOne`, `updateOne` with the `$or` claim filter, and `upsert`). Cases:
    - no stored document: `get()` computes once, stores it, and returns it
    - a stored fresh document: `get()` returns it without computing
    - a stored stale document: `get()` returns it without computing
    - `getFresh()` on a stale, unclaimed document: claims it, computes, stores, and clears `rebuildingAt`
    - `getFresh()` on a stale document claimed less than 2 minutes ago: returns the stale copy without computing
    - `getFresh()` on a claim older than 2 minutes: takes it over and computes
    - a compute that throws: releases the claim and rethrows
    - two concurrent `getFresh()` calls in one instance compute once
    - the memory cache: a second `get()` within 60 s doesn't call `findOne`

- [ ] **Step 2: Implement**

```ts
import mongoose from 'mongoose';

type SnapshotDoc<T> = { _id: string; snapshot?: T; rebuildingAt?: number };

/** The parts of a Mongo collection the cache uses, so tests can pass a fake. */
export type SnapshotCollection<T> = {
    findOne(filter: { _id: string }): Promise<SnapshotDoc<T> | null>;
    updateOne(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: { upsert?: boolean },
    ): Promise<{ modifiedCount: number }>;
};

export type SnapshotCacheOptions<T extends { computedAt: number }> = {
    collection: () => SnapshotCollection<T>;
    key: string;
    compute: () => Promise<T>;
    maxAgeMs: number;
    memoryMs?: number; // default 60_000
    claimMs?: number; // default 120_000
};

export function mongoSnapshotCollection<T>(name: string): () => SnapshotCollection<T> {
    return () => mongoose.connection.collection<SnapshotDoc<T>>(name) as unknown as SnapshotCollection<T>;
}

export function createSnapshotCache<T extends { computedAt: number }>(options: SnapshotCacheOptions<T>) {
    // get(), getFresh() and refresh(): the bodies of getHomepageSnapshot,
    // getFreshHomepageSnapshot, refreshHomepageSnapshot and rebuildOnce, moved as they are, with
    // the module-level maps becoming closure state. Keep their doc comments.
}
```

`getFresh()` also returns the memory copy when it was read within `memoryMs` and isn't stale. That's harmless for the homepage, which only calls it after seeing a stale copy, and saves the guides a Mongo read per request.

- [ ] **Step 3: Switch the homepage over.** Keep `getHomepageSnapshot`, `getFreshHomepageSnapshot` and `refreshHomepageSnapshot` exported with the same signatures, delegating to two caches (`ge-v5` and `ironman-v5`) over `mongoSnapshotCollection('homepage-snapshots')`. Remove the moved code.

- [ ] **Step 4: Verify.** `bun test` passes, including `homepage-service.test.ts`. Run `bun run dev`, load `/`, and check `/api/homepage/status` shows both snapshots.

- [ ] **Step 5: Commit** "Move the homepage's snapshot cache into a reusable module".

---

### Task 2: Constants, models and pure helpers

**Files:** create `src/lib/constants/guides.ts`, `src/lib/models/guides.ts`, `src/lib/helpers/guides.ts` and `src/lib/helpers/guides.test.ts`.

- [ ] **Step 1: Constants**

```ts
export const GUIDE_SNAPSHOT_VERSION = 1;
export const GUIDE_SNAPSHOT_COLLECTION = 'guide-snapshots';

export const XP_GUIDE_SKILLS = [
    { slug: 'construction', title: 'Construction' },
    { slug: 'cooking', title: 'Cooking' },
    { slug: 'crafting', title: 'Crafting' },
    { slug: 'farming', title: 'Farming' },
    { slug: 'firemaking', title: 'Firemaking' },
    { slug: 'fletching', title: 'Fletching' },
    { slug: 'herblore', title: 'Herblore' },
    { slug: 'magic', title: 'Magic' },
    { slug: 'runecrafting', title: 'Runecrafting' },
    { slug: 'smithing', title: 'Smithing' },
] as const;

export const XP_LEVEL_BANDS = [
    { min: 1, max: 19 },
    { min: 20, max: 39 },
    { min: 40, max: 59 },
    { min: 60, max: 79 },
    { min: 80, max: 99 },
] as const;

export const GUIDE_ROWS = { market: 25, highAlch: 50, xpPerBand: 8, ironman: 25 } as const;

export type GuideKey = 'market' | 'high-alch' | 'cheapest-xp' | 'ironman';
export const GUIDE_KEYS: GuideKey[] = ['market', 'high-alch', 'cheapest-xp', 'ironman'];

/** The guide pages, for the hub, the sidebar and "Related guides". */
export const GUIDE_PAGES = [
    { key: 'market', path: '/guides/market', title: 'GE market report', blurb: '…' },
    { key: 'high-alch', path: '/guides/high-alch', title: 'High alch profit list', blurb: '…' },
    { key: 'cheapest-xp', path: '/guides/cheapest-xp', title: 'Cheapest XP', blurb: '…' },
    { key: 'ironman', path: '/guides/ironman-money-making', title: 'Ironman money making', blurb: '…' },
] as const;
```

Write the blurbs in plain words (one line each, no live figures).

- [ ] **Step 2: Models.** `MarketReport`, `HighAlchGuide`, `CheapestXpGuide`, `IronmanGuide`, each with `computedAt: number`. They reuse `HomepageItem`, `HomepageAlchPick`, `HomepageShopSale` and `HomepageCheapXp`.
    - `MarketReport`: `historyHours`, `summary: { gpTraded24h, rising, falling, medianChange: number | null }`, `risers`, `fallers`, `mostTradedByGp`, `mostTradedByCount`.
    - `HighAlchGuide`: `natureRunePrice`, `picks: HomepageAlchPick[]`.
    - `CheapestXpGuide`: `skills: { skill: string; bands: { min: number; max: number; rows: XpMethod[] }[] }[]`, where `XpMethod = { item: HomepageItem; level: number; xp: number; gpPerXp: number }`.
    - `IronmanGuide`: `natureRunePrice` plus the four corner lists.

- [ ] **Step 3: Failing tests, then the helpers**
    - `levelBand(level: number | null | undefined)`: `null`, `0` and `1` give 1–19. `19` gives 1–19 and `20` gives 20–39. `79`/`80`. `99` and `120` give 80–99.
    - `median(values)`: odd, even (the mean of the middle two), empty (`null`), unsorted input.
    - `sortAlchPicks(picks, 'cast' | 'limit')`: `'limit'` ranks by `profit × buyLimit`, so a missing buy limit sorts last. Ties go by name.
    - `cheapestPerSkill(guide)`: the lowest-`gpPerXp` row across a skill's bands (ties go to more XP). A skill with no rows is left out.
    - `alchPerLimit(pick)`: `profit × buyLimit`, or `null`.

- [ ] **Step 4:** `bun test src/lib/helpers/guides.test.ts` passes. **Commit** "Add guide constants, types and helpers".

---

### Task 3: Guide builders, snapshots and refresh

**Files:** modify `src/lib/services/homepage-service.server.ts`, `src/routes/api/homepage/refresh/+server.ts` and `netlify/functions/update-item-prices.ts`, and create `src/lib/services/guide-service.server.ts`.

- [ ] **Step 1: Give the homepage builders a limit.** Export `computeAlchPicks(natureRunePrice, limit = HOMEPAGE_LIST_SIZE)`, `computeShopSales(natureRunePrice, limit = HOMEPAGE_LIST_SIZE)` and `computeShopSupplied(natureRunePrice, limit = HOMEPAGE_LIST_SIZE)`. Add `computeCreationSections(ironman, natureRunePrice, limit = HOMEPAGE_LIST_SIZE)`, plus `ITEM_PROJECTION`, `toHomepageItem`, `baseCreationMatch` and `RawItem`. The homepage passes nothing, so its output doesn't change.

- [ ] **Step 2: `computeMarketReport()`** in `guide-service.server.ts`. One aggregation over the tradeable match from `computeMarketPulse`, with `$facet`:
    - `historyHours`: as in `computeMarketPulse`
    - `gpTraded`: `$group` summing `volume24h × ifNull(typicalPrice24h, 0)`
    - `liquidChanges`: the movers floor match, then `$group` with `$push: '$priceChange24h'` (about 1,400 numbers). JS works out `rising`, `falling` and `median`
    - `risers` / `fallers`: as in `computeMarketPulse`, with `GUIDE_ROWS.market`
    - `mostTradedByGp`: `$set gpTraded24h`, sort descending, 25
    - `mostTradedByCount`: `volume24h` descending, 25

    Add `gpTraded24h` to the market rows' projection. `HomepageItem` doesn't carry it, so the market row type is `HomepageItem & { gpTraded24h: number | null }`.

- [ ] **Step 3: `computeHighAlch()`** = `{ computedAt, natureRunePrice: await getNatureRunePrice(), picks: await computeAlchPicks(rune, GUIDE_ROWS.highAlch) }`.

- [ ] **Step 4: `computeCheapestXp()`.** One profit-pipeline pass for mains:

```ts
[
    { $match: baseCreationMatch(false) },
    { $unset: ['equipment', 'weapon'] },
    ...buildProfitPipeline(null, true, false, false, false, natureRunePrice),
    { $set: { primarySpec: buildPrimarySpecExpression() } },
    { $unwind: '$primarySpec.experienceGranted' },
    { $match: { 'primarySpec.experienceGranted.experienceAmount': { $gt: 0 } } },
    {
        $set: {
            xpSkill: { $toLower: '$primarySpec.experienceGranted.skillName' },
            xp: '$primarySpec.experienceGranted.experienceAmount',
            gpPerXp: {
                $divide: [
                    { $max: [0, { $multiply: ['$creationProfit', -1] }] },
                    '$primarySpec.experienceGranted.experienceAmount',
                ],
            },
            requiredSkills: { $ifNull: ['$primarySpec.requiredSkills', []] },
        },
    },
    {
        $project: {
            ...ITEM_PROJECTION,
            xpSkill: 1,
            xp: 1,
            gpPerXp: 1,
            requiredSkills: { skillName: 1, skillLevel: 1 },
        },
    },
];
```

Finish in JS rather than with `$topN`, so it doesn't depend on the server version. There are about 2,800 rows. For each row: 1. `skill = canonicalSkill(xpSkill)`, skipping skills not in `XP_GUIDE_SKILLS`. 2. `level` = the `skillLevel` of the `requiredSkills` entry whose `canonicalSkill(skillName)` equals `skill`, or 1. 3. Bucket it by `levelBand(level)`. 4. Sort each bucket by `gpPerXp`, then `xp` descending, then name, and keep 8.

The requirement fields are `skillName` and `skillLevel` (`SkillLevelDesignation` in `osrsbox-db-item.ts`).

- [ ] **Step 5: `computeIronmanGuide()`.**
    1. Get `rune = await getIronmanNatureRunePrice()`.
    2. Build `computeShopSales(rune, 25)`, `computeShopSupplied(rune, 25)` and `computeCreationSections(true, rune, 25)`.
    3. From the creation sections, take `topProfit` as craft to alch and `cheapXp` as is.

- [ ] **Step 6: The caches.** There's one `createSnapshotCache` per guide, keyed `${guide}-v${GUIDE_SNAPSHOT_VERSION}` over `mongoSnapshotCollection(GUIDE_SNAPSHOT_COLLECTION)`, with `maxAgeMs: HOMEPAGE_SNAPSHOT_MAX_AGE_MS`. Export:
    - `getGuideSnapshot(key)`, which is `cache.getFresh()`. A guide always awaits.
    - `refreshGuideSnapshot(key)`, which is `cache.refresh()`.

    Type them with an overload per key, so callers get the right model.

- [ ] **Step 7: The refresh endpoint.** It reads `url.searchParams.get('target') ?? 'homepage'`. `homepage` keeps today's body. A `GuideKey` calls `refreshGuideSnapshot` and returns `{ ok: true, target, computedAt }`. Anything else is a 400.

- [ ] **Step 8: The hourly job.** `refreshHomepageSnapshots` becomes `refreshSnapshots`. It runs `Promise.allSettled` over `['homepage', 'market', 'high-alch', 'cheapest-xp', 'ironman']`, each a POST to `/api/homepage/refresh?target=…`, and logs each result on its own line. Write the target list out in the file: the job's bundler can't import `$lib`, and the constants file imports nothing from `$lib`, but there's no need to couple them.

- [ ] **Step 9: Commit** "Build and cache the guide snapshots, and refresh them hourly".

---

### Task 4: Data check script

**Files:** create `scripts/verify-guides.ts`, and modify `package.json` (`"verify-guides": "bun run --env-file .env scripts/verify-guides.ts"`).

- [ ] **Step 1:** Follow `verify-used-in-index.ts`: set `mongoose.set('autoIndex', false)` first, then dynamic imports and `startMongo()`. Print the database name. Call each `compute*` directly (it writes nothing) and time it.

- [ ] **Step 2: Checks**, with any failure pushed to `failures` so the script exits 1:
    - Every `XP_GUIDE_SKILLS` skill has at least 10 rows and at least three non-empty bands. Print a table of skill by band counts.
    - Every row has `gpPerXp === max(0, -creationProfit) / xp` (to 1e-9), and each band is sorted.
    - High alch has at least 10 picks, and each pick's `profit === highalch - buyPrice - natureRunePrice`.
    - The market report's `historyHours` is at least 23, there are at least 10 risers and 10 fallers, and `rising + falling` is at least the number of rows.
    - The Ironman lists aren't all empty.
    - Spot checks: print Herblore's cheapest row and the top high alch pick next to `getGameItemById` for the same id, for a by-hand comparison.
    - Print every build time. Flag (but don't fail) anything over 8 s.

- [ ] **Step 3: Run it** against both databases:
    - `VITE_MONGO_DB_DB_NAME=osrsbox-prod bun run verify-guides`
    - `VITE_MONGO_DB_DB_NAME=osrsbox-dev bun run verify-guides`

    Both must pass. Paste the band table and timings into the PR description.

- [ ] **Step 4: Commit** "Add a data check for the guide snapshots".

---

### Task 5: SEO builders, matcher and sitemap

**Files:** create `src/params/xpSkill.ts`, `src/params/xpSkill.test.ts`, `src/lib/seo/guide-seo.ts` and `src/lib/seo/guide-seo.test.ts`, and modify `src/lib/seo/sitemap.ts` and `src/lib/seo/sitemap.test.ts`.

- [ ] **Step 1: Matcher.** It trims, lowercases, and accepts any `XP_GUIDE_SKILLS` slug. Its test accepts all 10 (including `Herblore`) and rejects `woodcutting`, `runecraft`, `''` and `../items`.

- [ ] **Step 2: Failing tests, then `guide-seo.ts`.** The builders are `guidesHubSeo`, `marketSeo(imagePath, imageAlt)`, `highAlchSeo`, `cheapestXpSeo` and `buildCheapestXpSkillSeo(slug)`. Titles are exactly as in the spec table. Descriptions:
    - Hub: "Guides to making money and training skills in OSRS, built from live Grand Exchange prices and updated every hour."
    - Market: "Which OSRS items rose and fell most on the Grand Exchange today, and what traded most, from live prices updated hourly."
    - High alch: "The most profitable OSRS items to buy and high alch right now, after the nature rune, with buy limits and how often each trades."
    - Cheapest XP hub: "The cheapest way to train each OSRS production skill by making things, ranked by GP per XP from live GE prices."
    - Skill: "The cheapest {Skill} training in OSRS at every level, ranked by GP per XP from live Grand Exchange prices, updated hourly."
    - Ironman: "Ways to make money on an OSRS Ironman without the Grand Exchange: shops that pay well, shop-bought crafts and alching."

    The tests assert exact strings, titles of 60 characters or fewer, descriptions of 70–160, and no `/\d\s?(gp|k|m)\b/i`. The descriptions above go through the humanizer in Task 9, and the tests change with them.

- [ ] **Step 3: Sitemap.** `sitemapUrls` adds `'/guides'`, the four guide paths and `XP_GUIDE_SKILLS.map((s) => '/guides/cheapest-xp/' + s.slug)`. The test checks all 15 appear exactly once.

- [ ] **Step 4:** `bun test` passes. **Commit** "Add guide SEO, the skill matcher and sitemap entries".

---

### Task 6: Shared guide components

**Files:** create the following in `src/lib/components/guides/`.

- [ ] `updated-time.svelte`: props `computedAt`. It renders `<time datetime={iso}>{utcText}</time>`, where `utcText` is formatted with `timeZone: 'UTC'` and a "UTC" suffix. After `onMount` it switches to the visitor's local time with `Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })`.
- [ ] `guide-header.svelte`: props `title`, `answer` (one line) and `computedAt?`. The `<h1>` uses the site's heading style (`rs-font-with-shadow dark:rs-font text-primary`, as `home-band.svelte` does). Then the answer, then "Updated <UpdatedTime>".
- [ ] `guide-table.svelte`: wraps `ui/table` in `<div class="overflow-x-auto rounded-md border">`. Props are `caption` and `children`, plus an `empty` message rendered when there are no rows. Number columns use `tabular-nums text-right`.
- [ ] `guide-item-cell.svelte`: icon (via `iconToDataUri`) and name, linking to `/items/{id}` with `resolve`, the same as `home-item-row.svelte`.
- [ ] `related-guides.svelte`: links to every `GUIDE_PAGES` entry except the current one, plus the hub.
- [ ] **Commit** "Add shared guide page components".

---

### Task 7: Guide routes

**Files:** create everything under `src/routes/guides/`.

- [ ] **Step 1: Server loads.** Each guide's `+page.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import { getGuideSnapshot } from '$lib/services/guide-service.server';

export async function load({ setHeaders }) {
    try {
        return { guide: await getGuideSnapshot('high-alch') };
    } catch (cause) {
        console.error('Failed to load the high alch guide:', cause);
        setHeaders({ 'retry-after': '600' });
        error(503, 'This guide is being rebuilt. Try again in a few minutes.');
    }
}
```

`getGuideSnapshot` only throws when there's no stored copy to fall back on, since `getFresh` returns the stale copy when the claim is taken. Check that a `setHeaders` header survives the thrown `error` (do this in dev by temporarily throwing in the builder). If it doesn't, set the header in `hooks.server.ts` for 503 responses under `/guides/`. `+error.svelte` is already noindex.

- [ ] **Step 2: Pages.** Each `+page.svelte` renders `<SeoHead>` (the coverage test enforces this), `GuideHeader`, the tables from the spec, a "How we work this out" section and `RelatedGuides`.
    - **`/guides`**: no server load. It renders the `GUIDE_PAGES` cards and a row of skill links.
    - **`/guides/market`**:
        - the summary strip (four `$lib/components/global/stat-tile.svelte` tiles)
        - the risers and fallers tables
        - Most traded in `ui/tabs`, with "By GP traded" first
        - when `historyHours < PRICE_CHANGE_MIN_HOURS`, the risers and fallers are replaced with one line
    - **`/guides/high-alch`**:
        - a `ToggleGroup` (as in `make-now-section.svelte`) with `cast` | `limit`, and rows from `sortAlchPicks`
        - the server renders `cast`
        - an assumptions box
    - **`/guides/cheapest-xp`**: a table from `cheapestPerSkill`. Each skill name links to its page.
    - **`/guides/cheapest-xp/[skill=xpSkill]`**:
        - the server load also returns `skill` (the slug, lowercased)
        - one `GuideTable` per non-empty band, headed "Levels {min}–{max}"
        - a profitable row shows "Pays {formatGpShort(profit)}" in green in the cost column
        - a link to `/items/{slug}` when `findSkillTreePage(slug)` exists
    - **`/guides/ironman-money-making`**: four tables, one per corner list. Column choices follow `ironman-corner-section.svelte`.
    - Formatting uses `formatGpShort`, `formatGpPerXp`, `formatChange` and `skillLabel` from `$lib/helpers/homepage`.

- [ ] **Step 3: Link back from the skill browse page.** `/items/[skill]` gets a small "Cheapest {Skill} XP →" link when the skill is in `XP_GUIDE_SKILLS`. Put it in `game-items-page.svelte`'s header area if there's one. Otherwise it goes above `<GameItemsPage>` in `src/routes/items/[skill=skill]/+page.svelte`.

- [ ] **Step 4: Check it by hand.**
    1. Run `NODE_OPTIONS=--no-experimental-webstorage bun run dev`.
    2. Open every guide. `curl -s "http://localhost:5173/guides/high-alch" | grep -c '<tr'` should show at least 10.
    3. `/guides/cheapest-xp/woodcutting` gives a 404.

- [ ] **Step 5: Commit** "Add the guide pages".

---

### Task 8: Market share image

**Files:** create `src/lib/seo/market-share-card.ts`, `src/lib/seo/market-share-card.test.ts` and `src/routes/og/guides/market.png/+server.ts`, and modify `src/routes/guides/market/+page.svelte`.

- [ ] **Step 1: Failing tests, then `buildMarketShareCard(report): ShareCard | null`.**
    - `name`: "GE Market Report"
    - `sentence`: `[{text:'Biggest riser: '}, {text:`${riser.name} ${formatChange(riser.priceChange24h)}`, strong:true}, {text:'. Biggest faller: '}, {text:`${faller.name} ${formatChange(...)}`, strong:true}, {text:'. Live GE prices, updated hourly.'}]`
    - `chips`: the UTC date as "17 Oct 2026", then `${rising} rising` and `${falling} falling`
    - `alt`: "OSRS Grand Exchange market report for 17 Oct 2026: biggest risers and fallers on Aris Maye."
    - It returns `null` when there's no riser and no faller, or history is short. With only one of the two, that clause is dropped.
    - Tests cover those cases and a 40-character item name. The card's sentence wraps, so the test only checks the text.
    - Export `marketShareImagePath(computedAt)`, which returns `/og/guides/market.png?h=${Math.floor(computedAt / 3_600_000)}`.

- [ ] **Step 2: The route** copies the item route's shape:
    1. `getGuideSnapshot('market')`, then `buildMarketShareCard`.
    2. A `null` card, or any error, gives a 302 to `DEFAULT_SHARE_IMAGE` with `max-age=300`.
    3. Otherwise `renderShareCard(card, scalePixelIcon(report.risers[0]?.icon), await shareCardAssets())`, sent with `Cache-Control: public, max-age=300` and `Netlify-CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=600, durable`.

- [ ] **Step 3: The page.** `marketSeo(marketShareImagePath(guide.computedAt), card?.alt)`. When the card is `null`, the image falls back to the default.

- [ ] **Step 4: Look at it.**
    1. Render the card to a PNG in the scratchpad from a dev server.
    2. Put it side by side with `static/other-images/share-thumb.png` and an item card (`/og/items/2.png`).
    3. Check the frame, eyebrow, title, sentence and chips line up the same.

- [ ] **Step 5: Commit** "Add the market report share image".

---

### Task 9: Navigation, homepage links and copy

**Files:** modify `nav-contents.svelte`, `home-band.svelte`, `market-pulse-section.svelte`, `alch-xp-section.svelte` and `ironman-corner-section.svelte`.

- [ ] **Step 1: Sidebar.** Add a "Guides" `Sidebar.Group` after "Item trees", in the same markup as the primary menu, with these entries:

    | Entry         | Icon          | Link                           |
    | ------------- | ------------- | ------------------------------ |
    | All guides    | BookOpen      | `/guides`                      |
    | Market report | TrendingUp    | `/guides/market`               |
    | High alch     | Sparkles      | `/guides/high-alch`            |
    | Cheapest XP   | GraduationCap | `/guides/cheapest-xp`          |
    | Ironman money | Shield        | `/guides/ironman-money-making` |

    The active-route indicator works the same way as for the primary menu.

- [ ] **Step 2: `HomeBand`** gets `seeAllHref = '/items'` and `seeAllLabel = 'See all items'`.
    - Market pulse: `showSeeAll`, linking to `/guides/market`, label "Full market report".
    - Ironman corner: `showSeeAll`, linking to `/guides/ironman-money-making`, label "More Ironman money makers".
    - Alch & XP: `showSeeAll={false}`, with two links at the foot of their columns. "Full high alch list →" (mains only) goes to `/guides/high-alch`. "Cheapest XP by level →" goes to `/guides/cheapest-xp`.

- [ ] **Step 3: Copy.** Run the `copy-humanizer` agent on each new `.svelte` page, `constants/guides.ts` and `guide-seo.ts`, then `python3 scripts/humanize_copy.py check`. Update the SEO tests with any changed strings.

- [ ] **Step 4: Commit** "Link the guides from the sidebar and homepage".

---

### Task 10: Page check script

**Files:** create `scripts/verify-guide-pages.ts`, and modify `package.json` (`"verify-guide-pages": "bun scripts/verify-guide-pages.ts"`).

- [ ] **Step 1:** Copy the setup from `verify-share-links.ts`: browser discovery, the failure list, and `pageerror`/console capture. Implement the 7 checks in spec § Verification 4.
    - Check 1 uses plain `fetch` (no browser) and counts `<tr` elements containing `href="/items/`.
    - Check 4 reads the first row's item link before and after hydration, then clicks the "Profit per 4 hours" toggle item.
    - Check 6 opens a new 390px context per guide.
    - Screenshots and the downloaded card go to `--out=<dir>`, which defaults to the OS temp dir. The path is printed.

- [ ] **Step 2: Negative control.** Temporarily make `/guides/high-alch` load in the browser (return an empty `picks` from the server and fetch them in `onMount`). Check 1 must fail. Revert.

- [ ] **Step 3:** Run against a local build:
    1. `NODE_OPTIONS=--no-experimental-webstorage bun run build && bun run preview`
    2. `bun run verify-guide-pages "http://localhost:4173"`

    It must pass.

- [ ] **Step 4: Commit** "Add a page check for the guides".

---

### Task 11: Regression, spec notes, PR

- [ ] `bun test` passes.
- [ ] `bun run check` shows no new errors compared with `main`. ESLint and Prettier are clean on the changed files.
- [ ] `bun run verify-seo "http://localhost:4173" --sample=400` passes, and the guides are in the sitemap count.
- [ ] `verify-share-links` against the local build still passes, since the `/items/[skill]` page changed.
- [ ] Add "Decisions made during implementation" to the spec for anything that changed.
- [ ] Push. Update the PR description with the data check's band table and timings, the screenshots, and the owner checklist. Once the Netlify preview is up, run `verify-guide-pages` and a sampled `verify-seo` against it.
