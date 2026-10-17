# Shareable views (traffic PR 3)

The third of five PRs aimed at growing new traffic. PR 1 shipped per-page SEO and a sitemap, and
PR 2 item share images. This PR makes the browse page's view shareable: someone who sets up
"Members only, sorted by ROI, profit mode on" can send the link, and their friend opens exactly
that list.

## Problem

`/items` and `/items/<skill>` keep their filter, sort and profit mode only in `localStorage`
(`aris-maye-items-page-preferences`). The URL never carries them, so a copied link shows the
recipient their _own_ saved settings, not the sender's view. A link is the cheapest way for a
player to recommend the site in Discord or on Reddit, and today it loses the thing they were
recommending.

## Decisions

| Decision                       | Choice                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| What a link carries            | Filter, sort, profit mode. Not page, per-page, skill levels, supplies or Ironman pricing                                                         |
| Link vs the visitor's settings | The link wins for that page, and opening it saves nothing. A control the visitor changes saves as it does today                                  |
| How people get the link        | The address bar updates as settings change (no extra history entries), plus a "Copy link" button                                                 |
| Share image for `/items` links | The default site thumbnail. Only item pages have their own card                                                                                  |
| Canonical for filtered URLs    | Unchanged: `/items` or `/items/<skill>` with no query, so filtered views never compete in search                                                 |
| Approach                       | The URL overrides saved settings inside `game-items-page.svelte`. The URL is not made the only source of truth (that rejected approach is below) |

### Rejected: make the URL the only source of truth

Reading the view in `load` and calling `goto(?…)` on every change would re-run `load` and push
a history entry for each change. That breaks the pagination history (`page.state.itemsPage`) and
means rewriting how the page saves and syncs its settings, for no visible benefit.

## The URL

| Parameter | Values                                                                                      | Left out when      |
| --------- | ------------------------------------------------------------------------------------------- | ------------------ |
| `filter`  | `members`, `f2p`, `equipable`, `stackable`, `quest`, `nonquest`                             | `all`              |
| `sort`    | `roi-desc`, `roi-value-desc`. Legacy `profit-asc` and `profit-desc` map to `roi-value-desc` | `desc`             |
| `profit`  | `1`                                                                                         | profit mode is off |

- A URL with **at least one** of these parameters describes the whole view. A parameter it
  leaves out means that setting's default: `?filter=members` means Members, sort by value,
  profit off.
- A URL with **none** of them means "use my saved settings", as today. A sender whose view is
  all defaults therefore shares a bare URL, and the recipient sees their own saved setup. That
  is accepted: the alternative is cluttering every URL.
- An invalid value is ignored and treated as the default. An ROI sort without `profit=1` falls
  back to `desc`, the rule `normalizeSortSelection` already applies.
- Other query parameters (for example `utm_source`) are kept. Only these three keys are ever
  set or removed, and never duplicated.
- The same rules apply on `/items/<skill>`.

## Units

| Unit                                              | Purpose                                                                                                                                                                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/helpers/items-view-url.ts`               | `type ItemsView = { filter: string; sort: string; profit: boolean }`, `DEFAULT_ITEMS_VIEW`, `parseItemsView(params): ItemsView \| null`, `applyItemsView(params, view): URLSearchParams`, `isDefaultItemsView(view)`. Pure, with no Svelte imports |
| `src/lib/components/items/game-items-page.svelte` | Starts from the link's view, the `fromLink` flags, URL syncing, and the Copy link button                                                                                                                                                           |
| `scripts/verify-share-links.ts`                   | Committed headless browser check (see Verification)                                                                                                                                                                                                |

The filter and sort value lists move out of the component into `items-view-url.ts`, so the
parser and the dropdowns can't disagree. The component imports them for its options.

## Behaviour

- **First render.** If `parseItemsView(page.url.searchParams)` returns a view, the filter, sort
  and profit controls start from it. Otherwise they start from saved settings. This works in
  the server render too, since `page.url` is available there.
- **Opening a link writes nothing.** Each of the three controls has a `fromLink` flag, set when
  its starting value came from the URL. While it's set:
    - the effect that copies saved settings into the controls (`game-items-page.svelte`, "Keep
      local selection state in sync with persisted preferences") skips that control
    - that effect's line rewriting a stale sort back into saved settings skips it too

    Page number, per-page, supplies and the levels toggle are unaffected.

- **The visitor changes a control.** That control's flag clears and its new value saves, as
  today. The other link-derived controls keep showing their link values and stay unsaved.
  Saved settings only ever change through the visitor's own choices.
- **Turning profit mode off** while an ROI sort came from the link falls back to sort by value,
  as it does today. Because that is the visitor's own change, both values save.
- **Address bar.** An effect watching filter, sort and profit calls SvelteKit's
  `replaceState(pathname + '?' + applyItemsView(page.url.searchParams, view), page.state)`
  whenever the result differs from the current URL. When the view is default, the query is
  dropped (or keeps only the unrelated parameters). Replacing means a filter change adds nothing
  to the back button, and passing `page.state` keeps the pagination history entries.
- **Leaving the page.** Going to another skill through the sidebar loads that page with no
  view parameters, so the visitor's saved settings apply there.
- **Copy link button.** An outline button with a `Link2` icon and the label "Copy link", in the
  toolbar after the per-page select. It copies
  `location.origin + location.pathname + view query` (a deploy preview copies a preview link).
  Success shows the toast "Link copied". If `navigator.clipboard` is missing, or `writeText`
  rejects, the toast is "Couldn't copy. Copy the address bar instead." It wraps under the other
  controls at narrow widths and never causes horizontal scroll.

## Out of scope

- Carrying page, per-page, skill levels, supplies or Ironman pricing in the link.
- Per-filter share images.
- `navigator.share` on mobile.

## Verification

### 1. Unit tests (`src/lib/helpers/items-view-url.test.ts`)

- Every filter and sort value, alone and combined, survives a parse and write round-trip.
- `null` when no view parameters are present. A partial link fills the rest with defaults.
- Invalid `filter` and `sort` values become defaults. Legacy sort names map. An ROI sort without
  `profit=1` falls back to `desc`.
- Default values are left out, so a default view writes an empty query.
- Unrelated parameters survive a write. Our keys are never duplicated, even if the input has them
  twice.

### 2. Committed browser check (`scripts/verify-share-links.ts`, `bun run verify-share-links <baseUrl>`)

It uses `playwright-core` (devDependency) with Playwright's headless Chromium. The header gives
the install command, and the script finds an already-cached browser on its own. Before the first
load it fills `aris-maye-items-page-preferences` with a known saved setup (`f2p`, `desc`, profit
off), then checks:

1. **The link wins.** `/items?filter=members&sort=roi-desc&profit=1` shows Members, "Sort by ROI
   (percentage)" and profit on. The intercepted `/api/game-items` request carries
   `filter=members`, `order=roi-desc` and `profitMode=1`.
2. **Saved settings are untouched.** The saved-preferences entry in `localStorage` is
   byte-for-byte unchanged once the page settles.
3. **Changing a control.** Choose "Sort by value". The URL becomes `?filter=members&profit=1`,
   `history.length` is unchanged, the saved sort is `desc`, and the saved filter is still `f2p`.
4. **Pagination history.** Going to page 2 adds one history entry. Back returns to page 1, and
   the URL still has the view parameters.
5. **Bare URL.** `/items` shows the saved setup (`f2p`, sort by value), and its request carries
   `filter=f2p`.
6. **Invalid parameters.** `?filter=bogus&sort=roi-desc` shows All items and sort by value.
7. **Copy link.** With clipboard permission granted, the clipboard holds exactly
   `origin + '/items?filter=members&profit=1'`, and the "Link copied" toast appears.
8. **Skill pages.** `/items/smithing?filter=members` shows Members. Clicking another skill in the
   sidebar shows the saved `f2p` setup.
9. **SEO unchanged.** For `/items?filter=members&profit=1`, the canonical is
   `https://aris-maye.com/items`, the robots meta is `index, follow` and `og:image` is the
   default thumbnail.
10. **Mobile (390px).** `document.documentElement.scrollWidth <= innerWidth`, and Copy link is
    visible. Screenshots of the toolbar at 390px and 1280px are saved for review.

It exits non-zero on any failure.

### 3. Negative control

Temporarily disable the `fromLink` guard in the sync effect, rebuild, and run the check. Check 2
or check 1 must fail, then pass again once the guard is restored.

### 4. Regression

- `bun test` passes.
- `svelte-check` shows no new errors compared with `main`.
- ESLint and Prettier are clean on the changed files.
- `verify-seo` sampled against a local build passes.

### 5. Deploy preview

- `verify-share-links` against the PR's Netlify preview.
- Manual (owner): share a filtered preview link in Discord and open it in a private window. It
  should open the same view.

## Decisions made during implementation

- **The address bar matches the screen from the moment the page is ready.** A bare `/items`
  with saved settings becomes, for example, `/items?filter=f2p`, and invalid or legacy values are
  rewritten to what is shown. This uses `replaceState`, so there's no extra history entry and
  nothing is saved. SvelteKit refuses `replaceState` until the router has started, so the first
  write waits for `afterNavigate` and a timeout. A reload of such a URL opens it as a link: the
  screen is the same, but those controls stop following saved-settings changes from another tab
  until the visitor touches them.
- **Sort is judged against the profit mode on screen.** While profit mode comes from the link, an
  ROI sort the visitor picks is kept, and the saved-settings rewrite of a "stale" ROI sort is
  skipped. Otherwise it would be checked against the saved profit setting and flipped back to
  sort by value.
- **Turning profit off saves the sort only if the sort changed.** A link-derived sort that
  survives the toggle stays unsaved.
- Option lists and sort normalisation live in `items-view-url.ts`, and the component imports them.
- **The browser check opens a fresh 390px page for the mobile check.** The pagination picks its
  mobile layout when the page loads, so resizing a desktop page reports 27px of overflow that a
  real phone never sees.
- **The view is read from the address bar, not `page.url`.** SvelteKit's `replaceState` leaves
  `page.url` on the URL the page loaded with, and stores that old URL in the history entry, so
  Back from an item page would otherwise bring back the original link's view while the address bar
  showed the visitor's later choice. The server render still uses `page.url`.
- **Both routes remount the page on every real navigation** (`{#key page.url.href}`), so following
  the sidebar's Browse items or the same skill from a shared view opens saved settings. Pagination
  and view changes are shallow and don't remount it.
- **A shared link opens on page 1,** not the visitor's saved page number, so they see the list from
  the top.
- **The address bar also re-syncs after Back/Forward between pagination entries** and after any
  navigation, since a view change replaces only the current entry.
