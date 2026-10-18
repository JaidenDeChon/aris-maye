# Evergreen guides and market report (traffic PR 4)

The fourth of five PRs aimed at growing new traffic. PR 1 made the existing pages findable, PR 2
gave item links their own share image, and PR 3 made browse-page views shareable. This PR adds
pages that answer the questions OSRS players actually search for and that no page on the site
answers today: what to high alch, the cheapest way to train a skill, how an Ironman makes money,
and what moved on the Grand Exchange today. Each page has a fixed URL and a fixed explanation, and
its tables refresh every hour from data the site already collects.

## Problem

- Every indexable page is either an item page or a browse page. The browse pages (`/items`,
  `/items/<skill>`) load their list in the browser from `/api/game-items`, so a crawler sees a
  title, a description and an empty list.
- The homepage already works out high alch picks, the cheapest XP per skill, an Ironman corner and
  Market pulse (risers, fallers, most traded). Each list shows 6 rows behind a "See all items" link
  that goes to `/items`, which shows none of them. There's nowhere to see the full list, and nothing
  for a search engine to send someone to.
- Searches like "osrs high alch list", "cheapest way to train herblore" and "osrs ironman money
  making" have a clear answer in our data, but no page here targets them.

## Decisions

| Decision            | Choice                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages               | `/guides` (hub), `/guides/market`, `/guides/high-alch`, `/guides/cheapest-xp`, `/guides/cheapest-xp/<skill>` for 10 skills, `/guides/ironman-money-making`. 15 new indexable URLs |
| URL shape           | Under a `/guides/` prefix, with a hub page at `/guides`, so the section has one home and a URL that never 404s when someone trims the path                                        |
| Rendering           | Fully server-rendered. The tables are in the HTML a crawler gets, and the page works with JavaScript off                                                                          |
| Data source         | A cached snapshot per page, built by the same machinery as the homepage snapshot and refreshed by the hourly job                                                                  |
| Live numbers        | In the page body, with a visible "Updated" time. Never in `<title>` or the meta description (the PR 1 rule)                                                                       |
| Fixed copy          | Each page has a short intro, a "How we work this out" section and assumptions written so they don't go stale. They go through the humanizer                                       |
| Market report share | Its own share image, `/og/guides/market.png`, drawn by the same layout as the item cards and the homepage thumbnail. The other guides use the default thumbnail                   |
| Pricing basis       | The same profit pipeline and GE tax as `/items` and item pages, so a guide's number for an item never disagrees with that item's page                                             |
| Ironman             | One dedicated page. The other guides are valued for main accounts and say so                                                                                                      |
| Skill page set      | A fixed list in code, not computed from data, so the sitemap can't change from hour to hour                                                                                       |

### Rejected: make `/items` server-render its list

That would make one page crawlable, but it would still target "money making", which `/items`
already does, and none of the four questions above. It would also mean reworking a client-driven
page that PR 3 just stabilised.

### Rejected: query live on every request with CDN caching

Netlify can cache function responses (`s-maxage`, `stale-while-revalidate`), but the profit
pipeline takes seconds on a cold run, and a crawler that lands on a cold page gets either a slow
response or a timeout. The snapshot approach is already proven here: it survives Netlify freezing
a function once it has answered, and it has a rebuild lock.

## Pages

### `/guides/market`: GE market report

- **Summary strip:** GP traded in the last 24 hours (the sum of `volume24h × typicalPrice24h` over
  tradeable items), how many liquid items rose and how many fell, and the median change among
  liquid items.
- **Biggest risers** and **biggest fallers**: 25 each, using the homepage's movers floor
  (`MOVERS_MIN_GP_PER_DAY`, `MOVERS_MIN_TRADES_PER_DAY`, `MOVERS_MIN_TRADED_HOURS`) unchanged.
  Columns: item, typical price, 24h change, trades, GP traded.
- **Most traded**: 25 by GP traded in 24 hours, and 25 by number of trades, in two tabs. The GP
  tab comes first, because counting trades fills the list with feathers and runes.
- **How we measure:** the movers floor in prose, why there is one, and that a day is the median of
  the first and last three traded hours (from `docs/homepage-plan.md`).
- If the stored history is shorter than `PRICE_CHANGE_MIN_HOURS`, the risers and fallers tables are
  replaced by a line saying the report needs a day of history. The page still returns 200.
- Price history only covers 24 hours, so there are no weekly figures (see Out of scope).

### `/guides/high-alch`: high alch profit list

- 50 items by profit per cast: `highalch − highPrice − natureRunePrice`, with the homepage's
  filters (tradeable, price under 24 hours old, has a buy limit).
- Columns: item, buy price, alch value, profit per cast, buy limit, profit per buy limit, trades in
  24h. The trades column helps the reader spot an item whose price nobody is actually filling.
- A two-option toggle sorts by "Profit per cast" (the default and what the server renders) or
  "Profit per 4 hours" (profit × buy limit). The toggle re-sorts the 50 rows in the browser.
- Assumptions box: Magic 55, 65 XP per cast, a fire staff for the runes, a nature rune at its
  current GE price (shown).
- Links to `/guides/cheapest-xp/magic`.

### `/guides/cheapest-xp` and `/guides/cheapest-xp/<skill>`

Skills: construction, cooking, crafting, farming, firemaking, fletching, herblore, magic,
runecrafting, smithing. On `osrsbox-prod` each has between 13 and 517 creations that grant XP.
Woodcutting, fishing, mining, hunter and prayer have six or fewer, which is too few for a page.

- **`/guides/cheapest-xp`:** one row per skill showing its cheapest method overall, what it costs per XP,
  and a link to the skill's page. This is the homepage's `cheapXp` list, without the 6-row cap.
- **`/guides/cheapest-xp/<skill>`:** the cheapest methods within each level band: 1–19, 20–39, 40–59,
  60–79 and 80–99, up to 8 rows per band. A method's level is its required level in that skill, or 1 when it has none.
  Without bands the list would be all level 1 methods.
- Columns: item, level, XP each, cost each (or "pays you N gp" when it's profitable), GP per XP.
  It's ranked by GP per XP, with ties broken by more XP each.
- It says plainly that this is the cost of XP, not the speed: the dataset has no actions-per-hour
  figures, so a cheap method can still be slow.
- It links to `/items/<skill>` (money makers) when the skill has a browse page, and that page links
  back. The two pages answer different questions, so they don't compete in search.
- An unknown skill slug is a 404 (a param matcher, `xpSkill`).

### `/guides/ironman-money-making`

- The homepage's Ironman corner, at full length: shop sales (25), make from shop stock (25), craft
  to alch (25), and the cheapest Ironman XP per skill.
- Every number is valued the Ironman way already described in `docs/homepage-plan.md`. Nothing
  on the page depends on the GE.
- The intro states the dataset's limit: it can't tell gatherable resources from drop-only ones, so
  "make from shop stock" is the reliable self-sufficient list.

### `/guides`: the hub

- A short intro and one card per guide (title, one-line answer, link), plus a row of skill links
  into `/guides/cheapest-xp/<skill>`.
- No live numbers, so it never needs a snapshot and can't fail on one.
- Title "OSRS Money Making & Training Guides · Aris Maye". It's indexable and in the sitemap.

### Shared page parts

- A page header with the title, a one-line answer to the question, and "Updated {time}". The time
  is a `<time datetime>` element. The server renders it in UTC and the browser rewrites it in local
  time after hydration, so the two renders don't mismatch.
- Tables use `ui/table` inside a horizontally scrolling container, so the page itself never scrolls
  sideways at 390px. Item names link to `/items/{id}`, with their icon.
- A "Related guides" block at the bottom linking to the other guides.

## SEO

| Page                           | Title                                                   |
| ------------------------------ | ------------------------------------------------------- |
| `/guides`                      | OSRS Money Making & Training Guides · Aris Maye         |
| `/guides/market`               | OSRS GE Market Report: Today's Biggest Risers & Fallers |
| `/guides/high-alch`            | OSRS High Alch Profit List: Best Items to Alch          |
| `/guides/cheapest-xp`          | Cheapest XP in OSRS: GP per XP for Every Skill          |
| `/guides/cheapest-xp/<skill>`  | Cheapest OSRS {Skill} XP: GP per XP by Level            |
| `/guides/ironman-money-making` | OSRS Ironman Money Making: Shops, Alching & Crafting    |

- All are `index`, have a description of 70–160 characters with no live figures, and are canonical
  to `SITE_URL` + path, built by new builders in `src/lib/seo/guide-seo.ts`.
- `sitemapUrls` adds the 15 paths. The skill list comes from the same constant the matcher uses.
- `/guides/market` sets `og:image` to `/og/guides/market.png?h={snapshot hour}`. The hour in the
  query changes the URL every hour, so Discord and others, which cache a preview by URL, pick up
  the new card. The others keep the default thumbnail.

## Data

### Snapshots

- New `src/lib/services/guide-service.server.ts` with one builder per page: `computeMarketReport`,
  `computeHighAlch`, `computeCheapestXp` (all 10 skills in one profit-pipeline pass, with
  `$group` + `$topN` per skill and band) and `computeIronmanGuide`.
- The homepage's cached-snapshot logic (memory cache, staleness, the Mongo rebuild claim, and
  "serve stale, rebuild only when missing") moves out of `homepage-service.server.ts` into a
  generic `snapshot-cache.server.ts`. The homepage and the guides both use it. The homepage's
  behaviour doesn't change, and its existing tests must still pass.
- Guide snapshots live in a new `guide-snapshots` collection, keyed `{guide}-v{GUIDE_SNAPSHOT_VERSION}`
  (the same versioning reason as the homepage: previews share `osrsbox-dev`).
- **A guide page always awaits its snapshot,** unlike the homepage, which gives up after 400 ms.
  A crawler must get the tables. A stored snapshot is served straight away even when it's stale.
  When there's no snapshot at all it's built during that request. When it's more than 65 minutes
  old, the request that finds it claims the rebuild and builds inline, and other requests meanwhile
  get the stale copy. On production the hourly job keeps them fresh, so only deploy previews ever
  wait.
- Sizes: the market report is about 125 rows, high alch 50, cheapest XP up to 400, and Ironman
  about 90. Each fits in one small document.

### Refresh

- `POST /api/homepage/refresh` takes an optional `?target=` of `homepage`, `market`, `high-alch`,
  `cheapest-xp` or `ironman`. With no target it refreshes only the homepage, as it does today.
- The hourly job sends one request per target, all at once (`Promise.allSettled`). Each runs in
  its own function invocation with its own time limit, and together they add only the slowest
  rebuild to the job's run, which has to stay inside a scheduled function's 30 seconds. A failure
  is logged and doesn't affect the others.

### Share image

The market card matches the other two share images: the homepage thumbnail
(`static/other-images/share-thumb.png`) and the item cards from PR 2. It is drawn by the same
`shareCardLayout`, unchanged, so it gets the same dark frame, gold "OLD SCHOOL RUNESCAPE" eyebrow,
RuneScape-font title, sentence with gold highlights, chips and glowing icon on the right.

- `src/lib/seo/market-share-card.ts`: `buildMarketShareCard(report): ShareCard`, pure and tested.
    - **Title:** "GE Market Report".
    - **Sentence:** "Biggest riser: **{item} +{n}%**. Biggest faller: **{item} −{n}%**. Live GE
      prices, updated hourly." The highlighted parts are the `strong` segments, drawn in gold.
    - **Chips:** the date in UTC ("17 Oct 2026"), "{n} rising", "{n} falling".
    - **Alt:** "OSRS Grand Exchange market report for {date}: biggest risers and fallers on Aris Maye."
- **Icon:** the biggest riser's item icon, scaled by `scalePixelIcon` as on item cards.
- `src/routes/og/guides/market.png/+server.ts` follows the item card route: `renderShareCard`
  with `shareCardAssets()`, and on any failure, a missing snapshot or too little history, a 302
  to the default thumbnail kept for 5 minutes.
- Caching: `Cache-Control: public, max-age=300` and
  `Netlify-CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=600, durable`. It's an
  hour rather than the item card's week because the content changes hourly.

## Navigation and internal links

- The sidebar gets a "Guides" group under "Item trees": All guides, Market report, High alch,
  Cheapest XP and Ironman money.
- Homepage bands link to their guide instead of `/items`: Market pulse goes to `/guides/market`, the alch
  picks to `/guides/high-alch`, Cheapest XP to `/guides/cheapest-xp`, and the Ironman corner to
  `/guides/ironman-money-making`. The other bands keep "See all items".
- Item pages are unchanged.

## Units

| Unit                                         | Purpose                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/lib/constants/guides.ts`                | `XP_GUIDE_SKILLS` (slug and title), `XP_LEVEL_BANDS`, row counts, `GUIDE_SNAPSHOT_VERSION`          |
| `src/lib/models/guides.ts`                   | `MarketReport`, `HighAlchGuide`, `CheapestXpGuide`, `IronmanGuide`                                  |
| `src/lib/helpers/guides.ts`                  | Pure shaping: level band for a level, the summary-strip maths, sorting high alch rows by mode       |
| `src/lib/services/snapshot-cache.server.ts`  | Generic cached snapshot, moved out of the homepage service                                          |
| `src/lib/services/guide-service.server.ts`   | The four builders and `getGuideSnapshot(guide)`                                                     |
| `src/lib/seo/guide-seo.ts`                   | Title, description and canonical for each guide                                                     |
| `src/params/xpSkill.ts`                      | Matcher for the 10 skill slugs                                                                      |
| `src/routes/guides/…`                        | The hub, plus `+page.server.ts` (awaits the snapshot) and `+page.svelte` with `<SeoHead>` per guide |
| `src/lib/components/guides/*`                | Page header, guide table, related guides                                                            |
| `src/lib/seo/market-share-card.ts`           | The market card's text, laid out by the existing `shareCardLayout`                                  |
| `src/routes/og/guides/market.png/+server.ts` | The market share image                                                                              |
| `scripts/verify-guides.ts`                   | Data check (see Verification)                                                                       |

## Error handling

- A snapshot build fails and nothing is stored: the page responds 503 with `Retry-After: 600` and
  a noindex error page. It never renders a 200 with empty tables, which would teach Google that
  the page is thin.
- A build fails but a stale snapshot exists: serve the stale one, and log the failure.
- A section with no rows (for example no profitable alchs in some hour): that table shows a
  one-line explanation and the rest of the page renders.

## Out of scope

- Weekly or monthly price changes. That needs daily price history the job doesn't keep. It would
  make a good follow-up for the market report.
- Calculators (PR 5).
- Making `/items` server-rendered.
- JSON-LD, including FAQ markup, which Google no longer shows for sites like this.
- Ironman versions of the high alch and cheapest XP pages.
- XP per hour or GP per hour.

## Verification

### 1. Unit tests (`bun test`)

- `guide-seo`: exact titles and descriptions for every page and all 10 skills. Titles are 60
  characters or fewer, descriptions 70–160, and none contains a digit followed by "gp", "k" or "m".
- `helpers/guides`: band boundaries (19/20, 79/80, 99, a level above 99 or a missing level),
  summary-strip maths on fixtures (median of an even count, an empty list), and the high alch sort
  modes, including ties and a missing buy limit.
- `sitemap`: the 15 guide URLs are present exactly once and come from `XP_GUIDE_SKILLS`.
- `market-share-card`: sentence, chips and alt for a normal report; a report with no risers or no
  fallers; long item names; negative and positive changes formatted with the right sign.
- `xpSkill` matcher: accepts all 10 skills, case-insensitive, and rejects `woodcutting` and junk.
- The existing guard that every `+page.svelte` renders `SeoHead` covers the new routes.
- Existing homepage-service tests pass after the snapshot cache moves out.

### 2. Data check (`scripts/verify-guides.ts`, read-only by default)

Run against `osrsbox-prod` and `osrsbox-dev`. It builds each snapshot in memory and checks:

- Every skill in `XP_GUIDE_SKILLS` has at least 10 rows, and at least three of its five bands have
  rows. It prints the counts per band.
- Every row's GP per XP equals `max(0, −profit) / xp`, and each band is sorted.
- A few spot checks print beside the item page's own figures for the same item (for example
  Herblore's top row and the top high alch row), to confirm the guide and the item page agree.
- It prints build times for each snapshot, to confirm each refresh target fits the time limit.
- It exits non-zero on any failure.

### 3. Site audit (`verify-seo`, unchanged)

The guide URLs come from the sitemap, so the existing audit already checks each one's status,
unique title, description length, canonical and robots meta.

### 4. Guide page check (`scripts/verify-guide-pages.ts <baseUrl>`, Playwright)

A committed script in the style of `verify-share-links`. It exits non-zero on any failure.

1. **Crawlable.** For each guide URL, the raw server HTML (fetched without a browser) has at least
   10 `<tr>` rows linking to `/items/`. The hub links to every guide.
2. **404.** `/guides/cheapest-xp/woodcutting` returns 404.
3. **Share image.** `/guides/market` has `og:image` on `/og/guides/market.png?h=…`, and fetching
   it returns `image/png` at 1200×630. The image is saved for review beside an item card.
4. **High alch toggle.** The first row after hydration matches the server's first row. Switching to
   "Profit per 4 hours" puts the row with the largest profit × buy limit first.
5. **Updated time.** No hydration warning or page error in the console on any guide.
6. **Mobile (390px).** A fresh page per guide: `scrollWidth <= innerWidth`, and each table's
   container scrolls on its own. Screenshots at 390px and 1280px are saved.
7. **Links.** The sidebar's Guides links and the homepage's guide links reach the right pages.

### 5. Regression

- `svelte-check` shows no new errors compared with `main`, and ESLint and Prettier are clean.
- The homepage still renders its snapshot, and `/api/homepage/status` still reports.
- `scripts/humanize_copy.py check` passes on the new pages.

### 6. Deploy preview and production (owner)

- Run the audit and the browser check against the preview (reading `osrsbox-dev`).
- After the production deploy: confirm the Netlify log shows each refresh target succeeding, then
  resubmit the sitemap in Search Console and inspect `/guides/high-alch` and `/guides/cheapest-xp/herblore`.
- Share `/guides/market` in Discord and check the card looks like an item card's.

## Decisions made during implementation

Real data and the page checks showed cases the design above didn't anticipate. The code follows
these, and they take precedence over the sections above where the two differ.

- **Eight skills, not ten.** Valued from GE prices, Farming has only three methods (tradeable
  composts) and Firemaking's are all pyre logs with no Firemaking level in the data, so its page
  would claim everything is level 1. Both are dropped, which makes 13 guide URLs. The data check
  enforces the rule: at least 10 rows across at least three level bands.
- **Cheapest XP keeps the homepage's ranking.** Everything that pays counts as 0 gp/xp, and among
  those, the most XP each ranks first. Ranking paying methods by what they earn per XP was tried
  and dropped: the overview filled with money makers such as a 3rd age felling axe that pays 1.5B
  for 5 XP. A paying method still shows what it earns per XP, in green.
- **The app layout's content column gets `min-w-0`.** Without it, the sidebar inset (a flex child)
  grew to a table's width, and every guide scrolled sideways on a phone. With it, each table
  scrolls in its own box, as the spec intended.
- **"Unused shops" is left out of shop sales.** It's a wiki category the scraper picked up, not a
  shop. This also changes the homepage's Ironman corner, for the better.
- **Short gp amounts gain a T.** A day of GE trading is about 4.7T gp, which read as "4716B".
- **No "How we work this out" sections.** Removed at the owner's request after review. The two
  cross-links they carried stay as single lines: the high alch list links to the cheapest Magic
  XP, and each cheapest XP skill page links to that skill's money makers.
- **The Ironman page says "From shop prices and alch values"** where the other guides say "From
  Grand Exchange prices".
- **`/api/homepage/status` also reports the guide snapshots**, so a deploy can be checked in one
  place.
- **`verify-seo` is unchanged.** The guide-specific checks all live in `verify-guide-pages`. Its
  item-link count matches the site's relative links (`../items/2`), and the cheapest XP overview
  needs one row per skill rather than 10.
- **The market report's second tab is in the server HTML too.** bits-ui renders inactive tab
  content, so a crawler gets both "Most traded" lists.

Results on `osrsbox-prod` (the same on `osrsbox-dev`):

| Skill        | 1–19 | 20–39 | 40–59 | 60–79 | 80–99 |
| ------------ | ---- | ----- | ----- | ----- | ----- |
| Construction | 8    | 8     | 8     | 8     | 8     |
| Cooking      | 8    | 8     | 8     | 8     | 8     |
| Crafting     | 8    | 8     | 8     | 8     | 8     |
| Fletching    | 8    | 8     | 8     | 8     | 8     |
| Herblore     | 8    | 8     | 8     | 8     | 8     |
| Magic        | 8    | 8     | 8     | 8     | 8     |
| Runecrafting | 8    | 0     | 5     | 6     | 2     |
| Smithing     | 8    | 8     | 8     | 8     | 8     |

Build times: cheapest XP about 1.7 s, Ironman about 1 s, market report about 0.2 s and high alch
about 0.1 s. All four fit comfortably inside a function's time limit.
