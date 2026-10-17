# Shareable Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the browse page's filter, sort and profit mode in the URL, so a copied link opens the sender's view without touching the recipient's saved settings.

**Architecture:** A pure helper (`items-view-url.ts`) parses and writes the three URL parameters. `game-items-page.svelte` starts from the link's view when there is one, guards each link-derived control with a `fromLink` flag so it is never written to saved settings until the visitor changes it, mirrors the view into the address bar with `replaceState`, and adds a Copy link button. A committed Playwright script checks the behaviour in a real browser.

**Tech Stack:** SvelteKit 2.49, Svelte 5 runes, Bun 1.3 (`bun test`), bits-ui selects/switches/pagination, svelte-sonner toasts, `@lucide/svelte` icons, `playwright-core` with Playwright's cached headless Chromium.

**Spec:** `docs/superpowers/specs/2026-10-16-shareable-views-design.md`

## Global Constraints

- URL keys are exactly `filter`, `sort`, `profit`. Written in that order, after any unrelated parameters, never duplicated.
- `filter` values: `members`, `f2p`, `equipable`, `stackable`, `quest`, `nonquest`; left out when `all`.
- `sort` values: `roi-desc`, `roi-value-desc`; legacy `profit-asc` / `profit-desc` map to `roi-value-desc`; left out when `desc`. An ROI sort without `profit=1` falls back to `desc`.
- `profit`: `1`; left out when profit mode is off.
- A URL with at least one key is a whole view (missing keys = defaults). A URL with none means saved settings.
- Opening a link writes nothing to `aris-maye-items-page-preferences`. Only the visitor's own control changes save, one control at a time.
- Canonical, robots and `og:image` for `/items` and `/items/<skill>` are unchanged (`https://aris-maye.com/items`, `index, follow`, `https://aris-maye.com/other-images/share-thumb.png`).
- Copy: button label "Copy link"; toasts "Link copied" and "Couldn't copy. Copy the address bar instead."
- Run SvelteKit commands with `NODE_OPTIONS=--no-experimental-webstorage` (Node 25's method-less global `localStorage` crashes SSR otherwise).
- Quote URLs in zsh commands.

## Decision made while planning (record in the spec in Task 5)

SvelteKit 2.49's `replaceState` throws `Cannot call replaceState(...) before router is initialized` when called during hydration (`node_modules/@sveltejs/kit/src/runtime/client/client.js:2317`). So the address-bar effect **skips its first run**: it starts updating the URL with the first change after load. Consequences, both acceptable: a bare `/items` with saved `f2p` stays bare until the visitor changes something (Copy link still copies the full view), and an invalid link such as `?filter=bogus` is not rewritten until a change.

## Review Focus

1. **Mixed link and saved state.** The link turns profit on, saved settings have it off, and the visitor picks "Sort by ROI (value)". The sort must stay on ROI (value). The sync effect must not normalise it against the _saved_ profit setting and flip it back to `desc`. Covered by browser check 3b and the `effectiveProfit` code in Task 3.
2. **Profit toggled while sort came from the link and doesn't change.** The link is `?filter=members&profit=1` (sort `desc`) and the visitor turns profit off. Only `profitMode` saves; the saved sort is left alone. Covered by browser check 3c and Task 3's `handleProfitModeToggle`.
3. **Unrelated parameters such as `utm_source`.** They survive the address-bar rewrite. Covered by a unit test and browser check 1b.
4. **Duplicate or empty keys** such as `?filter=members&filter=f2p` or `?sort=`. The first value wins, an empty value means the default, and the output never repeats a key. Covered by unit tests.
5. **Hydration.** A link URL loaded directly must not throw on mount, and the server-rendered controls must match the client. Covered by browser check 1, which fails on any `pageerror` or console error mentioning `replaceState`.

---

## File Structure

| File                                                          | Responsibility                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/helpers/items-view-url.ts` (create)                  | Option lists, `ItemsView`, parse/write/normalise. Pure, no Svelte. |
| `src/lib/helpers/items-view-url.test.ts` (create)             | Unit tests                                                         |
| `src/lib/components/items/game-items-page.svelte`             | Link-derived start, `fromLink` guards, URL sync, Copy link button  |
| `scripts/verify-share-links.ts` (create)                      | Committed headless browser check                                   |
| `package.json`                                                | `playwright-core` devDependency, `verify-share-links` script       |
| `docs/superpowers/specs/2026-10-16-shareable-views-design.md` | "Decisions made during implementation" section                     |

---

### Task 1: `items-view-url.ts` helper

**Files:**

- Create: `src/lib/helpers/items-view-url.ts`
- Test: `src/lib/helpers/items-view-url.test.ts`

**Interfaces:**

- Produces:
    - `FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }>`
    - `SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }>`
    - `PROFIT_SORT_VALUES: readonly string[]`
    - `type ItemsView = { filter: string; sort: string; profit: boolean }`
    - `DEFAULT_ITEMS_VIEW: ItemsView`
    - `normalizeSort(value: string | null | undefined, profitEnabled: boolean): string`
    - `parseItemsView(params: URLSearchParams): ItemsView | null`
    - `applyItemsView(params: URLSearchParams, view: ItemsView): URLSearchParams` (returns a new object; never mutates its input)
    - `itemsViewPath(pathname: string, params: URLSearchParams, view: ItemsView): string`, giving `pathname` plus `?query` when the query isn't empty
    - `isDefaultItemsView(view: ItemsView): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/helpers/items-view-url.test.ts
import { describe, expect, it } from 'bun:test';
import {
    DEFAULT_ITEMS_VIEW,
    FILTER_OPTIONS,
    applyItemsView,
    isDefaultItemsView,
    itemsViewPath,
    normalizeSort,
    parseItemsView,
    type ItemsView,
} from './items-view-url';

const params = (query: string) => new URLSearchParams(query);
const write = (view: ItemsView, query = '') => applyItemsView(params(query), view).toString();

describe('parseItemsView', () => {
    it('returns null when the URL carries no view, so saved settings apply', () => {
        expect(parseItemsView(params(''))).toBeNull();
        expect(parseItemsView(params('utm_source=discord'))).toBeNull();
    });

    it('fills the parameters a link leaves out with defaults', () => {
        expect(parseItemsView(params('filter=members'))).toEqual({ filter: 'members', sort: 'desc', profit: false });
        expect(parseItemsView(params('profit=1'))).toEqual({ filter: 'all', sort: 'desc', profit: true });
    });

    it('treats invalid and empty values as defaults', () => {
        expect(parseItemsView(params('filter=bogus&sort=nonsense'))).toEqual(DEFAULT_ITEMS_VIEW);
        expect(parseItemsView(params('filter=&sort=&profit='))).toEqual(DEFAULT_ITEMS_VIEW);
        expect(parseItemsView(params('profit=yes'))).toEqual(DEFAULT_ITEMS_VIEW);
    });

    it('maps legacy sort names', () => {
        expect(parseItemsView(params('sort=profit-asc&profit=1'))?.sort).toBe('roi-value-desc');
        expect(parseItemsView(params('sort=profit-desc&profit=1'))?.sort).toBe('roi-value-desc');
    });

    it('falls back to sort by value when an ROI sort arrives without profit mode', () => {
        expect(parseItemsView(params('sort=roi-desc'))).toEqual({ filter: 'all', sort: 'desc', profit: false });
    });

    it('uses the first value when a key is repeated', () => {
        expect(parseItemsView(params('filter=members&filter=f2p'))?.filter).toBe('members');
    });
});

describe('applyItemsView', () => {
    it('round-trips every filter and sort value, alone and combined', () => {
        const sorts = ['desc', 'roi-desc', 'roi-value-desc'];
        for (const { value: filter } of FILTER_OPTIONS) {
            for (const sort of sorts) {
                for (const profit of [true, false]) {
                    const view = { filter, sort: normalizeSort(sort, profit), profit };
                    const back = parseItemsView(applyItemsView(params(''), view)) ?? DEFAULT_ITEMS_VIEW;
                    expect(back).toEqual(view);
                }
            }
        }
    });

    it('leaves defaults out, so a default view writes an empty query', () => {
        expect(write(DEFAULT_ITEMS_VIEW)).toBe('');
        expect(write({ filter: 'members', sort: 'desc', profit: true })).toBe('filter=members&profit=1');
        expect(write({ filter: 'all', sort: 'roi-desc', profit: true })).toBe('sort=roi-desc&profit=1');
    });

    it('keeps unrelated parameters and never duplicates its own', () => {
        const view = { filter: 'f2p', sort: 'desc', profit: false };
        expect(write(view, 'utm_source=discord&filter=members&filter=quest')).toBe('utm_source=discord&filter=f2p');
        expect(write(DEFAULT_ITEMS_VIEW, 'utm_source=discord&sort=roi-desc&profit=1')).toBe('utm_source=discord');
    });

    it('does not mutate the params it is given', () => {
        const input = params('filter=members');
        applyItemsView(input, DEFAULT_ITEMS_VIEW);
        expect(input.toString()).toBe('filter=members');
    });
});

describe('itemsViewPath', () => {
    it('drops the question mark when there is no query', () => {
        expect(itemsViewPath('/items', params(''), DEFAULT_ITEMS_VIEW)).toBe('/items');
        expect(itemsViewPath('/items/smithing', params(''), { ...DEFAULT_ITEMS_VIEW, filter: 'members' })).toBe(
            '/items/smithing?filter=members',
        );
    });
});

describe('isDefaultItemsView', () => {
    it('is true only for all, desc, profit off', () => {
        expect(isDefaultItemsView(DEFAULT_ITEMS_VIEW)).toBe(true);
        expect(isDefaultItemsView({ ...DEFAULT_ITEMS_VIEW, profit: true })).toBe(false);
    });
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `bun test src/lib/helpers/items-view-url.test.ts`
Expected: FAIL with `Cannot find module './items-view-url'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/helpers/items-view-url.ts
/**
 * The part of the browse page's state a shared link carries: filter, sort and profit mode. A URL
 * with any of these keys describes a whole view; one with none means "use my saved settings".
 */

export const FILTER_OPTIONS = [
    { value: 'all', label: 'All items' },
    { value: 'members', label: 'Members only' },
    { value: 'f2p', label: 'Free to play' },
    { value: 'equipable', label: 'Equipable' },
    { value: 'stackable', label: 'Stackable' },
    { value: 'quest', label: 'Quest items' },
    { value: 'nonquest', label: 'Non-quest items' },
] as const;

export const SORT_OPTIONS = [
    { value: 'roi-desc', label: 'Sort by ROI (percentage)' },
    { value: 'roi-value-desc', label: 'Sort by ROI (value)' },
    { value: 'desc', label: 'Sort by value' },
] as const;

// Sort orders that are computed from creation cost, so they need profit mode turned on.
export const PROFIT_SORT_VALUES: readonly string[] = ['roi-desc', 'roi-value-desc'];

// Retired sort orders still sitting in persisted preferences or bookmarked URLs.
const LEGACY_SORT_VALUES: Record<string, string> = {
    'profit-asc': 'roi-value-desc',
    'profit-desc': 'roi-value-desc',
};

const VIEW_KEYS = ['filter', 'sort', 'profit'] as const;

export type ItemsView = { filter: string; sort: string; profit: boolean };

export const DEFAULT_ITEMS_VIEW: ItemsView = { filter: 'all', sort: 'desc', profit: false };

export function normalizeSort(value: string | null | undefined, profitEnabled: boolean): string {
    if (!value) return 'desc';
    const resolved = LEGACY_SORT_VALUES[value] ?? value;
    return PROFIT_SORT_VALUES.includes(resolved) && profitEnabled ? resolved : 'desc';
}

export function parseItemsView(params: URLSearchParams): ItemsView | null {
    if (!VIEW_KEYS.some((key) => params.has(key))) return null;
    const filter = params.get('filter');
    const profit = params.get('profit') === '1';
    return {
        filter: FILTER_OPTIONS.some((option) => option.value === filter) ? filter! : 'all',
        sort: normalizeSort(params.get('sort'), profit),
        profit,
    };
}

export function applyItemsView(params: URLSearchParams, view: ItemsView): URLSearchParams {
    const next = new URLSearchParams(params);
    for (const key of VIEW_KEYS) next.delete(key);
    if (view.filter !== DEFAULT_ITEMS_VIEW.filter) next.append('filter', view.filter);
    if (view.sort !== DEFAULT_ITEMS_VIEW.sort) next.append('sort', view.sort);
    if (view.profit) next.append('profit', '1');
    return next;
}

export function itemsViewPath(pathname: string, params: URLSearchParams, view: ItemsView): string {
    const query = applyItemsView(params, view).toString();
    return query ? `${pathname}?${query}` : pathname;
}

export function isDefaultItemsView(view: ItemsView): boolean {
    return (
        view.filter === DEFAULT_ITEMS_VIEW.filter &&
        view.sort === DEFAULT_ITEMS_VIEW.sort &&
        view.profit === DEFAULT_ITEMS_VIEW.profit
    );
}
```

- [ ] **Step 4: Run the tests and check they pass**

Run: `bun test src/lib/helpers/items-view-url.test.ts`
Expected: PASS, every test

- [ ] **Step 5: Lint, format and commit**

```bash
bunx prettier --write src/lib/helpers/items-view-url.ts src/lib/helpers/items-view-url.test.ts
bunx eslint src/lib/helpers/items-view-url.ts src/lib/helpers/items-view-url.test.ts
git add src/lib/helpers/items-view-url.ts src/lib/helpers/items-view-url.test.ts
git commit -m "Add the items view URL helper for shareable links"
```

---

### Task 2: Committed browser check (written first, fails on the current page)

**Files:**

- Create: `scripts/verify-share-links.ts`
- Modify: `package.json` (devDependency plus a script)

**Interfaces:**

- Consumes: the running app at `<baseUrl>`. Selectors used:
    - `[data-select-trigger]`: the bits-ui select triggers, in the order filter, sort, per page
    - `[role="option"]`
    - `#profit-mode-switch[data-state]`
    - `[data-pagination-page]`
    - `button:has-text("Copy link")`
    - the sidebar's `a[href="/items/mining"]`
- Produces: `bun run verify-share-links <baseUrl>`, which exits 0 only when every check passes. Screenshots go to `$TMPDIR/verify-share-links/`.

- [ ] **Step 1: Add the dependency and script**

```bash
bun add -d playwright-core
```

In `package.json` `scripts`, after `"verify-seo"`, add:

```json
"verify-share-links": "bun scripts/verify-share-links.ts",
```

- [ ] **Step 2: Write the script**

```ts
// scripts/verify-share-links.ts
/**
 * Checks shareable views in a real browser: the link's filter, sort and profit mode win, saved
 * settings stay untouched, the address bar follows changes without adding history, Copy link
 * works, and SEO tags don't change.
 *
 *   bun scripts/verify-share-links.ts <baseUrl>
 *
 * Needs Playwright's headless Chromium. If you don't have it:  bunx playwright install chromium-headless-shell
 * The newest cached copy is found automatically; set PLAYWRIGHT_CHROMIUM_PATH to use another.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const baseUrl = process.argv[2]?.replace(/\/+$/, '');
if (!baseUrl) {
    console.error('Usage: bun scripts/verify-share-links.ts <baseUrl>');
    process.exit(2);
}

const PREFS_KEY = 'aris-maye-items-page-preferences';
// Same key order the store writes, so "unchanged" can be compared byte for byte.
const SAVED = JSON.stringify({
    filter: 'f2p',
    sortOrder: 'desc',
    perPage: '12',
    page: 1,
    useSupplies: false,
    profitMode: false,
});
const DEFAULT_IMAGE = 'https://aris-maye.com/other-images/share-thumb.png';
const shots = join(tmpdir(), 'verify-share-links');
mkdirSync(shots, { recursive: true });

function findChromium(): string {
    if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
    const roots = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')];
    for (const root of roots.filter(existsSync)) {
        const dirs = readdirSync(root)
            .filter((d) => d.startsWith('chromium_headless_shell-'))
            .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
        for (const dir of dirs) {
            for (const sub of readdirSync(join(root, dir))) {
                const binary = join(root, dir, sub, 'chrome-headless-shell');
                if (existsSync(binary)) return binary;
            }
        }
    }
    throw new Error('No headless Chromium found. Run: bunx playwright install chromium-headless-shell');
}

let checks = 0;
const failures: string[] = [];
function check(ok: boolean, message: string) {
    checks++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
    if (!ok) failures.push(message);
}

const browser = await chromium.launch({ executablePath: findChromium() });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin });
// Seed saved settings before any page script runs, once per context (not on every navigation).
await context.addInitScript(
    ({ key, value }) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem(key, value);
            sessionStorage.setItem('seeded', '1');
        }
    },
    { key: PREFS_KEY, value: SAVED },
);

const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
});
const apiRequests: URL[] = [];
page.on('request', (request) => {
    if (request.url().includes('/api/game-items?')) apiRequests.push(new URL(request.url()));
});

async function settle(p: Page) {
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(400);
}
const triggers = (p: Page) => p.locator('[data-select-trigger]');
const triggerText = async (p: Page, index: number) => (await triggers(p).nth(index).innerText()).trim();
const profitOn = async (p: Page) => (await p.locator('#profit-mode-switch').getAttribute('data-state')) === 'checked';
const saved = (p: Page) => p.evaluate((key) => localStorage.getItem(key), PREFS_KEY);
const lastApi = () => apiRequests.at(-1)?.searchParams;
const pathAndQuery = (p: Page) => {
    const url = new URL(p.url());
    return url.pathname + url.search;
};
async function choose(p: Page, triggerIndex: number, option: string) {
    await triggers(p).nth(triggerIndex).click();
    await p.locator('[role="option"]', { hasText: option }).first().click();
    await settle(p);
}

// 1. The link wins
await page.goto(`${baseUrl}/items?filter=members&sort=roi-desc&profit=1&utm_source=check`);
await settle(page);
check((await triggerText(page, 0)) === 'Members only', '1. link filter shows Members only');
check((await triggerText(page, 1)) === 'Sort by ROI (percentage)', '1. link sort shows ROI (percentage)');
check(await profitOn(page), '1. link turns profit mode on');
check(
    lastApi()?.get('filter') === 'members' &&
        lastApi()?.get('order') === 'roi-desc' &&
        lastApi()?.get('profitMode') === '1',
    `1. API request carries the link view (${lastApi()?.toString()})`,
);
check(
    !errors.some((e) => /replaceState|hydrat/i.test(e)),
    `1. no hydration or replaceState errors (${errors.join(' | ')})`,
);

// 2. Saved settings untouched
check((await saved(page)) === SAVED, '2. saved settings are byte-for-byte unchanged after opening a link');

// 3. Changing a control
const historyBefore = await page.evaluate(() => history.length);
await choose(page, 1, 'Sort by value');
check(
    pathAndQuery(page) === '/items?utm_source=check&filter=members&profit=1',
    `3. URL follows the change (${pathAndQuery(page)})`,
);
check((await page.evaluate(() => history.length)) === historyBefore, '3. the change adds no history entry');
const afterSort = JSON.parse((await saved(page)) ?? '{}');
check(afterSort.sortOrder === 'desc' && afterSort.filter === 'f2p', '3. sort saved as desc, saved filter still f2p');
check(afterSort.profitMode === false, '3. link profit mode is not saved');

// 3b. Mixed state: ROI sort chosen while profit comes from the link and is off in saved settings
await choose(page, 1, 'Sort by ROI (value)');
check((await triggerText(page, 1)) === 'Sort by ROI (value)', '3b. ROI (value) stays selected');
check(pathAndQuery(page).includes('sort=roi-value-desc'), '3b. URL carries sort=roi-value-desc');
check(lastApi()?.get('order') === 'roi-value-desc', '3b. API request uses roi-value-desc');

// 3c. Profit turned off while the sort came from the link and doesn't change
await page.goto(`${baseUrl}/items?filter=members&profit=1`);
await settle(page);
const beforeToggle = JSON.parse((await saved(page)) ?? '{}');
await page.locator('#profit-mode-switch').click();
await settle(page);
const afterToggle = JSON.parse((await saved(page)) ?? '{}');
check(afterToggle.profitMode === false, '3c. profit mode saves');
check(afterToggle.sortOrder === beforeToggle.sortOrder, '3c. saved sort is left alone');
check(pathAndQuery(page) === '/items?filter=members', `3c. URL drops profit (${pathAndQuery(page)})`);

// 4. Pagination history
// A fresh link rather than toggling profit back on, which would save profitMode: true and change
// what check 5 expects from saved settings.
await page.goto(`${baseUrl}/items?filter=members&profit=1`);
await settle(page);
const beforePaging = await page.evaluate(() => history.length);
await page.locator('[data-pagination-page]', { hasText: /^2$/ }).first().click();
await settle(page);
check((await page.evaluate(() => history.length)) === beforePaging + 1, '4. page 2 adds one history entry');
await page.goBack();
await settle(page);
check(
    (await page.locator('[data-pagination-page][data-selected]').first().innerText()).trim() === '1',
    '4. back returns to page 1',
);
check(pathAndQuery(page) === '/items?filter=members&profit=1', `4. view params survive back (${pathAndQuery(page)})`);

// 7. Copy link (run here, where the view is known)
await page.getByRole('button', { name: 'Copy link' }).click();
await page.waitForTimeout(300);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check(
    clip === `${new URL(baseUrl).origin}/items?filter=members&profit=1`,
    `7. clipboard holds the view link (${clip})`,
);
check(await page.getByText('Link copied').isVisible(), '7. "Link copied" toast appears');

// 5. Bare URL uses saved settings (saved filter is still f2p, sort desc)
await page.goto(`${baseUrl}/items`);
await settle(page);
check((await triggerText(page, 0)) === 'Free to play', '5. bare URL shows saved filter');
check((await triggerText(page, 1)) === 'Sort by value', '5. bare URL shows saved sort');
check(lastApi()?.get('filter') === 'f2p', '5. bare URL request carries filter=f2p');

// 6. Invalid parameters
await page.goto(`${baseUrl}/items?filter=bogus&sort=roi-desc`);
await settle(page);
check((await triggerText(page, 0)) === 'All items', '6. invalid filter shows All items');
check((await triggerText(page, 1)) === 'Sort by value', '6. ROI sort without profit shows sort by value');

// 8. Skill pages
await page.goto(`${baseUrl}/items/smithing?filter=members`);
await settle(page);
check((await triggerText(page, 0)) === 'Members only', '8. skill page link shows Members only');
await page.locator('a[href="/items/mining"]').first().click();
await page.waitForURL('**/items/mining');
await settle(page);
check((await triggerText(page, 0)) === 'Free to play', '8. sidebar skill shows saved f2p');

// 9. SEO unchanged
await page.goto(`${baseUrl}/items?filter=members&profit=1`);
await settle(page);
const head = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
    image: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
}));
check(head.canonical === 'https://aris-maye.com/items', `9. canonical is /items (${head.canonical})`);
check(head.robots === 'index, follow', `9. robots is index, follow (${head.robots})`);
check(head.image === DEFAULT_IMAGE, `9. og:image is the default thumbnail (${head.image})`);
const html = await (await fetch(`${baseUrl}/items?filter=members&profit=1`)).text();
check(
    html.includes('<link rel="canonical" href="https://aris-maye.com/items"'),
    '9. server-rendered canonical is /items',
);

// 10. Mobile
await page.screenshot({ path: join(shots, 'toolbar-1280.png'), clip: { x: 0, y: 0, width: 1280, height: 400 } });
await page.setViewportSize({ width: 390, height: 844 });
await settle(page);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check(overflow <= 0, `10. no horizontal scroll at 390px (${overflow}px over)`);
check(await page.getByRole('button', { name: 'Copy link' }).isVisible(), '10. Copy link is visible at 390px');
await page.screenshot({ path: join(shots, 'toolbar-390.png'), fullPage: false });

await browser.close();
console.log(`\n${checks - failures.length}/${checks} checks passed. Screenshots in ${shots}`);
if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
}
```

- [ ] **Step 3: Build and serve the current page, then run the check to see it fail**

```bash
NODE_OPTIONS=--no-experimental-webstorage bun run build
NODE_OPTIONS=--no-experimental-webstorage bunx vite preview --port 4173   # run in the background
bun run verify-share-links "http://localhost:4173"
```

Expected: exits 1. Check 1 fails because the page shows Free to play, and check 7 fails because there is no Copy link button. If selectors fail for unrelated reasons (such as a trigger not found), fix the selector now. Check 5 should already pass. While the toolbar markup hasn't changed yet, the only failures should be ones the feature fixes.

- [ ] **Step 4: Format and commit**

```bash
bunx prettier --write scripts/verify-share-links.ts package.json
bunx eslint scripts/verify-share-links.ts
git add scripts/verify-share-links.ts package.json bun.lock
git commit -m "Add a headless browser check for shareable views"
```

---

### Task 3: Start from the link and never save link values

**Files:**

- Modify: `src/lib/components/items/game-items-page.svelte` (lines 20–41 option lists, 98–104 initial state, 166–189 sync effect, 358–418 handlers, 365–372 `normalizeSortSelection`, 526 and 538 option loops, 541 `profitSortValues`)

**Interfaces:**

- Consumes from Task 1: `FILTER_OPTIONS`, `SORT_OPTIONS`, `PROFIT_SORT_VALUES`, `normalizeSort`, `parseItemsView`
- Produces for Task 4: component state `filterSelected`, `sortOrderSelected`, `profitModeChecked` (unchanged names)

- [ ] **Step 1: Replace the local option lists with the helper's**

Delete lines 21–41 (`filterOptions`, `sortOptions`, `profitSortValues` and `legacySortValues`) and add to the imports:

```ts
import {
    FILTER_OPTIONS as filterOptions,
    PROFIT_SORT_VALUES as profitSortValues,
    SORT_OPTIONS as sortOptions,
    normalizeSort,
    parseItemsView,
} from '$lib/helpers/items-view-url';
```

Replace `normalizeSortSelection` (lines 365–372) with:

```ts
function normalizeSortSelection(value?: string | null, profitEnabled = profitModeChecked) {
    return normalizeSort(value, profitEnabled);
}
```

- [ ] **Step 2: Start from the link's view**

Replace lines 98–104 (from `let perPageSelected` through `let profitModeChecked`) with:

```ts
let perPageSelected = $state($itemsPagePreferences.perPage || '12');
// A shared link's filter, sort and profit mode win over saved settings for this page. Each flag
// stays set until the visitor changes that control, and while it is set the control is never
// written to, or overwritten from, saved settings. The skill route remounts this component per
// skill, so reading the URL once here is enough.
const linkView = untrack(() => parseItemsView(page.url.searchParams));
let filterFromLink = linkView !== null;
let sortFromLink = linkView !== null;
let profitFromLink = linkView !== null;
let filterSelected = $state(linkView?.filter ?? ($itemsPagePreferences.filter || 'all'));
let sortOrderSelected = $state(
    linkView?.sort ??
        normalizeSortSelection($itemsPagePreferences.sortOrder, $itemsPagePreferences.profitMode ?? false),
);
let useSuppliesChecked = $state($itemsPagePreferences.useSupplies ?? false);
let profitModeChecked = $state(linkView?.profit ?? $itemsPagePreferences.profitMode ?? false);
```

- [ ] **Step 3: Guard the sync effect**

Replace the body of the effect at lines 166–189 with:

```ts
// Keep local selection state in sync with persisted preferences (e.g., when storage events fire).
// Controls that came from a shared link are left alone (see linkView).
$effect(() => {
    if (!filterFromLink && $itemsPagePreferences.filter !== filterSelected) {
        filterSelected = $itemsPagePreferences.filter || 'all';
    }
    if (!sortFromLink) {
        const prefOrder = $itemsPagePreferences.sortOrder || 'desc';
        // While profit mode comes from the link, judge the sort against what is on screen, not
        // the saved setting, or an ROI sort picked under the link's profit mode would flip back.
        const profitEnabled = profitFromLink ? profitModeChecked : ($itemsPagePreferences.profitMode ?? false);
        const normalizedOrder = normalizeSortSelection(prefOrder, profitEnabled);
        if (normalizedOrder !== sortOrderSelected) {
            sortOrderSelected = normalizedOrder;
        }
        if (!profitFromLink && normalizedOrder !== prefOrder) {
            itemsPagePreferences.set({ ...$itemsPagePreferences, sortOrder: normalizedOrder });
        }
    }
    if ($itemsPagePreferences.perPage !== perPageSelected) {
        perPageSelected = $itemsPagePreferences.perPage || '12';
    }
    if ($itemsPagePreferences.useSupplies !== useSuppliesChecked) {
        useSuppliesChecked = $itemsPagePreferences.useSupplies ?? false;
    }
    if (!profitFromLink && $itemsPagePreferences.profitMode !== profitModeChecked) {
        profitModeChecked = $itemsPagePreferences.profitMode ?? false;
    }
});
```

(The rewrite is skipped while profit comes from the link. Without that, a saved `roi-value-desc` chosen under the link's profit mode would be rewritten to `desc` against the saved `profitMode: false`.)

- [ ] **Step 4: Clear the flag when the visitor changes a control**

In `handleFilterChange`, add `filterFromLink = false;` as the first line.

In `handleSortChange`, add `sortFromLink = false;` as the first line.

Replace `handleProfitModeToggle` with:

```ts
function handleProfitModeToggle(value: boolean) {
    const nextSortOrder = normalizeSortSelection(sortOrderSelected, value);
    const sortChanged = nextSortOrder !== sortOrderSelected;
    if (sortChanged) {
        sortOrderSelected = nextSortOrder;
        // Losing an ROI sort is a consequence of the visitor's own toggle, so it saves too.
        sortFromLink = false;
    }
    profitModeChecked = value;
    profitFromLink = false;
    itemsPagePreferences.update((prefs) => ({
        ...prefs,
        profitMode: value,
        ...(sortFromLink ? {} : { sortOrder: nextSortOrder }),
    }));
    skipCacheOnce = true;
    forceLoading = true;
    currentPage = 1;
    itemsPagePreferences.update((prefs) => ({ ...prefs, page: 1 }));
}
```

- [ ] **Step 5: Type check, lint and format**

```bash
bunx prettier --write src/lib/components/items/game-items-page.svelte
bunx eslint src/lib/components/items/game-items-page.svelte
NODE_OPTIONS=--no-experimental-webstorage bun run check 2>&1 | tail -3
```

Expected: ESLint is clean, and svelte-check shows the same error count as the baseline (32), with none in `game-items-page.svelte`.

- [ ] **Step 6: Rebuild and run the browser check**

```bash
NODE_OPTIONS=--no-experimental-webstorage bun run build   # restart the preview server afterwards
bun run verify-share-links "http://localhost:4173"
```

Expected:

- Pass: checks 1 (apart from the URL parts), 2, 3b's selection and API request, 3c's saved values, 5, 6, 8 and 9.
- Still failing, because Task 4 provides them: the URL checks in 3, 3b, 3c and 4, plus 7 and 10's Copy link.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/items/game-items-page.svelte
git commit -m "Let a shared link set the items view without touching saved settings"
```

---

### Task 4: Address bar sync and the Copy link button

**Files:**

- Modify: `src/lib/components/items/game-items-page.svelte` (imports; a new effect after the sync effect; the toolbar after the per-page select, around line 566)

**Interfaces:**

- Consumes from Task 1: `itemsViewPath`, `type ItemsView`
- Consumes from Task 3: `filterSelected`, `sortOrderSelected`, `profitModeChecked`

- [ ] **Step 1: Imports**

Change `import { pushState } from '$app/navigation';` to `import { pushState, replaceState } from '$app/navigation';`. Then add `itemsViewPath` and `type ItemsView` to the `items-view-url` import, and add:

```ts
import { Button } from '$lib/components/ui/button';
import Link2 from '@lucide/svelte/icons/link-2';
import { toast } from 'svelte-sonner';
```

- [ ] **Step 2: Address bar effect**

Add this after the sync effect:

```ts
const currentView: ItemsView = $derived({
    filter: filterSelected,
    sort: sortOrderSelected,
    profit: profitModeChecked,
});

// Mirror the view into the address bar so it can be copied from there. replaceState adds nothing to
// the back button, and passing page.state keeps the pagination entries. The first run is skipped:
// SvelteKit refuses replaceState during hydration, and the URL already describes the opening view.
let addressBarReady = false;
$effect(() => {
    const view = currentView;
    if (!addressBarReady) {
        addressBarReady = true;
        return;
    }
    untrack(() => {
        const next = itemsViewPath(page.url.pathname, page.url.searchParams, view);
        if (next !== page.url.pathname + page.url.search) replaceState(next, { ...page.state });
    });
});

async function copyViewLink() {
    const link = location.origin + itemsViewPath(location.pathname, new URLSearchParams(), currentView);
    try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(link);
        toast.success('Link copied');
    } catch {
        toast.error("Couldn't copy. Copy the address bar instead.");
    }
}
```

If ESLint's `svelte/prefer-svelte-reactivity` flags `new URLSearchParams()` here, add `// eslint-disable-next-line svelte/prefer-svelte-reactivity` above that line. That's the same exception `loadPage` uses at line 243, since the object is throwaway.

- [ ] **Step 3: The button**

In the right-hand toolbar `div` (the one containing the per-page `Select.Root`), add this after the per-page wrapper `div`:

```svelte
<Button variant="outline" onclick={copyViewLink}>
    <Link2 class="h-4 w-4" />
    Copy link
</Button>
```

That container is `flex-col` below `sm` and `flex-row` from `sm`, so the button stacks under the per-page select on phones.

- [ ] **Step 4: Type check, lint and format**

```bash
bunx prettier --write src/lib/components/items/game-items-page.svelte
bunx eslint src/lib/components/items/game-items-page.svelte
NODE_OPTIONS=--no-experimental-webstorage bun run check 2>&1 | tail -3
```

Expected: clean, still 32 errors, none new.

- [ ] **Step 5: Rebuild and run the full browser check**

```bash
NODE_OPTIONS=--no-experimental-webstorage bun run build   # restart the preview server afterwards
bun run verify-share-links "http://localhost:4173"
```

Expected: every check passes and the script exits 0. Open `$TMPDIR/verify-share-links/toolbar-390.png` and `toolbar-1280.png` and check the button looks right, then show them to the user.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/items/game-items-page.svelte
git commit -m "Keep the items view in the address bar and add a Copy link button"
```

---

### Task 5: Negative control, regression, spec notes, PR

**Files:**

- Modify: `docs/superpowers/specs/2026-10-16-shareable-views-design.md` (append a section)

- [ ] **Step 1: Negative control**

In the sync effect, temporarily change `if (!filterFromLink && $itemsPagePreferences.filter !== filterSelected)` to `if ($itemsPagePreferences.filter !== filterSelected)` and `if (!profitFromLink && $itemsPagePreferences.profitMode !== profitModeChecked)` to `if ($itemsPagePreferences.profitMode !== profitModeChecked)`. Rebuild, restart the preview, run `bun run verify-share-links "http://localhost:4173"`.
Expected: exits 1, with check 1 failing (it shows Free to play and profit off).
Then restore the guards with `git checkout src/lib/components/items/game-items-page.svelte`, rebuild, rerun, and expect exit 0. Record both outputs for the PR.

- [ ] **Step 2: Regression**

```bash
bun test
NODE_OPTIONS=--no-experimental-webstorage bun run check 2>&1 | tail -3
bunx eslint src/lib/helpers/items-view-url.ts src/lib/helpers/items-view-url.test.ts src/lib/components/items/game-items-page.svelte scripts/verify-share-links.ts
bunx prettier --check src/lib/helpers/items-view-url.ts src/lib/helpers/items-view-url.test.ts src/lib/components/items/game-items-page.svelte scripts/verify-share-links.ts package.json docs/superpowers
bun run verify-seo "http://localhost:4173" --sample=200
```

Expected:

- `bun test`: every test passes (the previous count plus the new ones)
- svelte-check: 32 errors, the same as main
- ESLint and Prettier: clean
- verify-seo: 0 failed

- [ ] **Step 3: Record decisions in the spec**

Append to the spec:

```markdown
## Decisions made during implementation

- **The address bar starts updating with the first change, not on load.** SvelteKit refuses
  `replaceState` during hydration, and on load the URL already describes the view. So a bare
  `/items` stays bare until the visitor changes something (Copy link still copies the full view),
  and an invalid link such as `?filter=bogus` is cleaned up on the first change.
- **Sort is judged against the profit mode on screen.** While profit mode comes from the link, an
  ROI sort the visitor picks is kept, and the saved-settings rewrite of a "stale" ROI sort is
  skipped. Otherwise it would be checked against the saved profit setting and flipped back to
  sort by value.
- **Turning profit off saves the sort only if the sort changed.** A link-derived sort that
  survives the toggle stays unsaved.
- Option lists and sort normalisation live in `items-view-url.ts`, and the component imports them.
```

```bash
bunx prettier --write docs/superpowers/specs/2026-10-16-shareable-views-design.md
git add docs/superpowers/specs/2026-10-16-shareable-views-design.md
git commit -m "Spec: record the decisions made during implementation"
```

- [ ] **Step 4: Push and update PR #36**

```bash
git push
gh pr edit 36 --title "Shareable views (traffic PR 3)" --body-file <scratchpad>/pr36.md
```

The body summarises the behaviour and pastes in the browser check output (all checks passing), the negative control (fails, then passes), the regression results and the screenshots. It ends with the attribution lines. Then wait for the Netlify deploy preview, run `bun run verify-share-links "<preview url>"`, add that output to the PR, and hand the owner the manual Discord and private-window check.
