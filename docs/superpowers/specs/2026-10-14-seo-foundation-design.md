# SEO foundation (traffic PR 1)

This is the first of five PRs aimed at growing new traffic. The later ones are dynamic OG images, shareable
item-page views, evergreen landing pages with a market report, and calculators. This PR makes the pages
that already exist findable. Each page gets its own title, description, canonical URL and robots rule.
The site gets a sitemap and a robots.txt. Item pages get a "Used in" section, so pages for ingredients
have enough on them to deserve indexing.

## Problem

- Every page renders the same `<title>`, description and OG tags from the `<svelte:head>` in
  `src/routes/+layout.svelte`. To search engines and link unfurls, thousands of item pages look identical
  to the homepage.
- There is no `sitemap.xml` and no `robots.txt`.
- `baseUrl` comes from the request origin, so a deploy preview would declare itself the canonical copy.
- A page for an ingredient-only item (for example an ore) shows price and alch values but nothing about
  what the item is for, which makes it a thin page.

## Decisions

| Decision                | Choice                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Production origin       | `https://aris-maye.com`, read from `VITE_SITE_URL` with that as the default                                                            |
| Indexable item pages    | Items with at least one creation recipe, **plus** every item used as an ingredient in a recipe                                         |
| Other item pages        | Reachable, but `noindex`                                                                                                               |
| Non-production hosts    | Everything `noindex` (header + robots.txt `Disallow: /`)                                                                               |
| How pages set head tags | Each `+page.svelte` renders a shared `<SeoHead>` from a pure builder. Head tags are not returned from `load` and not injected in hooks |
| Live gp figures in meta | No. Google caches snippets for weeks. Live numbers go in the OG image (PR 2)                                                           |
| "Used in" section       | Yes, on every item page that has any                                                                                                   |

Why `<SeoHead>` per page rather than layout-rendered `load` data: the item page's universal `load` hands
the page a promise on client-side navigation (`canDeferPageData`), so a layout would have to await it to
build a title. That would undo the instant route swap. The item page already keeps `gameItem` as `$state`,
filled during SSR (which is what crawlers see) and filled once the promise resolves on the client, so a
`$derived` SEO object from it works in both cases. Injecting tags in `hooks.server.ts` would never update
the tab title on client navigation.

## Page metadata

| Page                                     | Title                                                                       | Robots  |
| ---------------------------------------- | --------------------------------------------------------------------------- | ------- |
| `/`                                      | Aris Maye: Find the Best OSRS Items to Craft & Profit (unchanged)           | index   |
| `/items`                                 | OSRS Money Making & Crafting Profits, Updated Hourly                        | index   |
| `/items/[skill]`                         | Best OSRS {Skill} Money Makers & Profits                                    | index   |
| `/items/[id]` with a recipe              | {Item} Profit & Recipe: OSRS {Skill} {level}                                | index   |
| `/items/[id]` used in a recipe, has none | {Item}: OSRS Price & What You Can Make With It                              | index   |
| `/items/[id]` neither                    | {Item}: OSRS GE Price                                                       | noindex |
| `/items/[id]` not found / failed         | Item not found · Aris Maye                                                  | noindex |
| `/favorites`, `/hidden`, `/my-character` | Favorites · Aris Maye / Hidden items · Aris Maye / My character · Aris Maye | noindex |
| `/items/new`                             | Add item · Aris Maye                                                        | noindex |

Rules:

- Titles are 60 characters or fewer. When `{Item}` is long, drop the `: OSRS {Skill} {level}` tail first,
  then the `& Recipe`. Never cut a word in half.
- `{Skill} {level}` comes from the item's primary creation spec (the first spec's first required skill).
  If there's no skill data, the tail is dropped.
- Descriptions are 70 to 160 characters. They say what the page answers, using facts that don't go stale:
    - Recipe: "How to make {Item} in OSRS: needs {Skill} {level}, gives {xp} XP. See ingredient costs and
      profit from live GE prices, updated hourly."
    - Ingredient: "{Item} is used in {n} OSRS recipes, including {first two names}. See its live GE price
      and what you can make with it."
    - Skill page: "The most profitable things to make with {Skill} in OSRS, ranked by live GE prices and
      filtered to your levels."
    - When a sentence would run past 160 characters, drop clauses from the end, not mid-sentence.
- Canonical is `VITE_SITE_URL` + pathname, with no query string and no trailing slash (except `/`).
- `og:title`, `og:description`, `og:url` and `twitter:*` mirror the above. `og:image` stays
  `/other-images/share-thumb.png` until PR 2.
- The layout keeps only the tags that are the same on every page (`og:site_name`, `og:type`,
  `twitter:card`) and stops rendering `<title>`, description, `og:title`, `og:description`, `og:url`
  and `og:image`.

## Components and units

All new pure code lives in `src/lib/seo/`, so it can be unit tested without Svelte or Mongo.

| Unit                                           | Purpose                                                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site-url.ts`                                  | `SITE_URL` (from `VITE_SITE_URL`, default `https://aris-maye.com`); `isProductionHost(host)`, true only for `aris-maye.com` and `www.aris-maye.com` |
| `page-seo.ts`                                  | `type PageSeo = { title, description, canonicalPath, robots: 'index' \| 'noindex', image? }`; `canonicalUrl(path)`                                  |
| `item-seo.ts`                                  | `buildItemSeo(item, usedIn)`, `buildItemNotFoundSeo()`, `isIndexableItem(item, usedInCount)`                                                        |
| `static-page-seo.ts`                           | builders for `/`, `/items`, skill pages and the noindex personal pages                                                                              |
| `fit-text.ts`                                  | the title/description length rules (drop segments, never cut a word in half)                                                                        |
| `sitemap.ts`                                   | `buildSitemap(urls): string`, `buildSitemapIndex(sitemapUrls): string`, `chunkSitemapUrls(urls, max = 50000)`                                       |
| `robots.ts`                                    | `buildRobots(host): string`                                                                                                                         |
| `src/lib/components/global/seo-head.svelte`    | renders one `PageSeo` into `<svelte:head>`: title, description, canonical, robots meta, og/twitter title/description/url/image                      |
| `src/lib/components/items/item-used-in.svelte` | the "Used in" card                                                                                                                                  |

`isIndexableItem` is the only rule for item indexability. The item page's robots tag and the sitemap
query must agree with it, and the tests hold them to that.

## Data changes

- `getGameItemById` additionally selects `_id`, `creationSpecs.requiredSkills` and
  `creationSpecs.experienceGranted`. This is enough to build the title and description without the full
  tree.
- New `getRecipesUsingItem(objectId, limit = 50)` in `game-item-mongo-service.server.ts`. It finds items
  where `creationSpecs.ingredients.item` equals the given `_id` and returns
  `{ id, name, icon, skill, level }[]` (the skill and level come from the primary spec), sorted by level
  then name, with items that have no skill data last. It also returns a `total` count, so "Show all N" is accurate when the list is capped.
- `/api/game-item` returns `{ ...item, usedIn: { items, total } }`. The item page's existing request
  carries everything, so nothing new is requested on load.
- New schema index: `osrsboxItemSchema.index({ 'creationSpecs.ingredients.item': 1 })`. Mongoose builds
  it on connect, the same way it builds the existing indexes.
- New `getIndexableItemIds()` for the sitemap:
    1. ids of items with `creationSpecs.0` present,
    2. `distinct('creationSpecs.ingredients.item')` mapped to item ids,
    3. the union of 1 and 2, deduplicated and sorted.

## "Used in" section

- A card below the creation card on `/items/[id]`, titled "Used in".
- Each row shows the icon, the item name (linking to `/items/{id}`), and a skill badge with the level,
  in the same style as `home-item-row`.
- It shows the first 10. When `total > 10`, a "Show all {total}" button reveals the rest it already has.
  If `total` is over 50, a muted line says only the lowest-level 50 are shown.
- No prices. The linked page has the profit figures.
- If there are no rows, there's no card.
- The rows are part of the server-rendered HTML, which the audit checks.

## Routes

- `src/routes/sitemap.xml/+server.ts`: `/`, `/items`, each `/items/{skill}` slug from `skillTreePages`,
  and each `/items/{id}` from `getIndexableItemIds()`. All URLs use `SITE_URL`, whichever host serves
  the request. No `lastmod`. `Content-Type: application/xml`,
  `Cache-Control: public, max-age=0, s-maxage=3600`. Above 50,000 URLs it serves an index and
  `/sitemap-{n}.xml` chunks. That isn't expected, but the builder handles it.
- `src/routes/robots.txt/+server.ts`:
    - Production host:

        ```
        User-agent: *
        Allow: /
        Disallow: /api/

        Sitemap: https://aris-maye.com/sitemap.xml
        ```

    - Any other host: `User-agent: *` / `Disallow: /`.

- `hooks.server.ts`: when `!isProductionHost(url.host)`, set `X-Robots-Tag: noindex, nofollow` on every
  response.

## Error handling

- Item not found, or the request fails: `buildItemNotFoundSeo()` (noindex). Because the item page's
  state is filled after the promise resolves, the head updates when the outcome lands.
- `getRecipesUsingItem` failing must not fail the item page. The endpoint logs it and returns
  `usedIn: { items: [], total: 0 }`. This can make an ingredient page briefly `noindex`. That is
  acceptable, and better than a 500.
- Sitemap query failing: respond 503 with `Retry-After: 3600`, never an empty 200. An empty sitemap
  would tell Google the site has no pages.

## Verification

Per the standing instruction to verify these features as thoroughly as possible.

### 1. Unit tests (`bun test`, under `src/lib/seo/*.test.ts`)

- `item-seo`: exact title and description for each of the three item cases plus not-found. Titles are
  60 characters or fewer and descriptions 70 to 160. Covers long names, missing skill data,
  multi-skill specs, and names with `&`, `'` or `"`.
- `fit-text`: drops segments in order and never cuts a word in half.
- `page-seo`: `canonicalUrl` removes query strings and trailing slashes and always uses `SITE_URL`.
- `isIndexableItem`: all four combinations of has-recipe and is-used-in.
- `sitemap`: the output parses as XML, special characters are escaped, there are no duplicates,
  every `<loc>` is absolute and on `SITE_URL`, and chunking at 50,000 produces a valid index.
- `robots` / `isProductionHost`: `aris-maye.com`, `www.aris-maye.com`,
  `deploy-preview-33--aris-maye.netlify.app`, `aris-maye.netlify.app`, `localhost:5173`.
- Guard: every `src/routes/**/+page.svelte` imports and renders `SeoHead`.
- Guard: `src/routes/+layout.svelte` no longer renders `<title>` or `og:title`, so the tags can't appear twice.

### 2. Database check (`scripts/verify-used-in-index.ts`, read-only)

- The `creationSpecs.ingredients.item_1` index exists.
- `explain()` on the "Used in" query shows `IXSCAN`, not `COLLSCAN`.
- Prints `total` for iron ore, logs and nature rune, for a by-hand comparison against the wiki.
- Prints how many ids `getIndexableItemIds()` returns.

### 3. Full-site audit (`scripts/verify-seo.ts <baseUrl> [--production]`)

This runs against a real build: locally with `vite build && vite preview` and real Mongo, and again on
the deploy preview. It exits non-zero on any failure.

- `robots.txt` matches what the host should get: production rules with `--production`, `Disallow: /`
  otherwise.
- `sitemap.xml` validates against the sitemaps.org 0.9 XSD with `xmllint --schema`. The XSD is
  vendored in `scripts/fixtures/` so the check doesn't need the network. Every `<loc>` is on
  `https://aris-maye.com`. The script prints the count.
- For every sitemap URL, with its path re-pointed at `<baseUrl>`, using limited concurrency:
    - status 200
    - exactly one each of `<title>`, `meta[name=description]`, `link[rel=canonical]` and
      `meta[property=og:title]`
    - canonical equal to the sitemap `<loc>`
    - robots meta `index`
    - a title no other page in the sitemap uses
    - a description of 70 to 160 characters
- Ingredient-only pages from the sitemap contain the "Used in" card markup in their server-rendered HTML.
- Pages that should be noindex: 10 item ids that fail `isIndexableItem` (from the DB script's output or
  an `--noindex-ids` argument), plus `/favorites`, `/hidden`, `/my-character` and `/items/new`, all
  have robots meta `noindex`.
- Without `--production`, every response has `X-Robots-Tag: noindex`.

### 4. Browser check

- Client-side clicks between item pages update the tab title, with no stale title from the deferred load.
- "Used in" renders, "Show all" expands, and the links go to the right items.

This is done by Claude with a browser tool if one is connected, and is otherwise on the PR's manual test list.

### 5. After the production deploy (owner)

- Submit `https://aris-maye.com/sitemap.xml` in Google Search Console.
- Use URL Inspection on one craftable page, one ingredient-only page and one noindex page.
- Check that the sitemap's discovered-URL count matches the audit's count.

## Decisions made during implementation

Real data showed cases the design above didn't anticipate. The code follows these, and they take
precedence over the sections above where the two differ.

- **Copies are never indexed.** 5,547 of the 9,736 items with recipes are noted, placeholder or
  `duplicate` copies carrying the real item's recipes (for example Iron bar 2351, noted 2352,
  placeholder 13887). `isItemCopy` and `INDEXABLE_ITEM_FILTER` keep them out of the sitemap and
  out of "Used in", and their pages are noindex.
- **One indexed page per item name.** 322 names were shared by 881 indexable pages (lit and
  unlit lanterns, minigame copies of potions). Only one per name is indexed: the GE-tradeable
  one, then the lowest id. Live prices are deliberately not part of this choice, so it can't
  change from hour to hour. `pickPrimaryItemId` decides it, for both the sitemap and the item
  page.
- **"Used in" lists each recipe name once**, linking to that name's indexed item. `total` counts
  distinct names.
- **`/api/game-item?fields=price`** skips the "Used in" and namesake lookups. The item page uses
  it for the nature rune's price.
- **`+error.svelte`** renders a noindex title, because the layout no longer sets one.
- **Env var:** `VITE_SITE_URL`, not `PUBLIC_SITE_URL` (see the plan).

Result on the `osrsbox` database: 4,898 indexable item pages, 4,906 sitemap URLs in total.

## Out of scope

- OG images (PR 2), so `og:image` stays the static thumbnail.
- JSON-LD structured data.
- Slugs in item URLs (`/items/2-cannonball`).
- Showing untradeable items on the browse page.
