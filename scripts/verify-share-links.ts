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
// The share image comes from whichever host served the page (see seo-head.svelte), so only its path is fixed.
const DEFAULT_IMAGE_PATH = '/other-images/share-thumb.png';
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
// A disabled or missing option is a failed check, not a reason to stop the run.
async function choose(p: Page, triggerIndex: number, option: string) {
    await triggers(p).nth(triggerIndex).click();
    const item = p.locator('[role="option"]', { hasText: option }).first();
    const enabled = (await item.count()) > 0 && (await item.getAttribute('data-disabled')) === null;
    check(enabled, `option "${option}" can be chosen`);
    if (enabled) await item.click();
    else await p.keyboard.press('Escape');
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
const copyButton = page.getByRole('button', { name: 'Copy link' });
check((await copyButton.count()) === 1, '7. there is one Copy link button');
if ((await copyButton.count()) === 1) await copyButton.click();
await page.waitForTimeout(300);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check(
    clip === `${new URL(baseUrl).origin}/items?filter=members&profit=1`,
    `7. clipboard holds the view link (${clip})`,
);
check(await page.getByText('Link copied').isVisible(), '7. "Link copied" toast appears');

// 5. Bare URL uses saved settings and writes them into the address bar (saved: f2p, sort desc)
// Back to the known saved setup: check 3b left an ROI sort saved with profit off, which the page
// rightly cleans up on a bare load, and that cleanup isn't what this check is about.
await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: PREFS_KEY, value: SAVED });
const savedBeforeBare = await saved(page);
errors.length = 0;
// Count history at commit, before any page script runs: a fresh navigation after Back drops the
// forward entries, so the count from before the goto can't be compared.
await page.goto(`${baseUrl}/items?utm_source=check`, { waitUntil: 'commit' });
const beforeBare = await page.evaluate(() => history.length);
await settle(page);
check((await triggerText(page, 0)) === 'Free to play', '5. bare URL shows saved filter');
check((await triggerText(page, 1)) === 'Sort by value', '5. bare URL shows saved sort');
check(lastApi()?.get('filter') === 'f2p', '5. bare URL request carries filter=f2p');
check(
    pathAndQuery(page) === '/items?utm_source=check&filter=f2p',
    `5. address bar shows the saved view (${pathAndQuery(page)})`,
);
check((await page.evaluate(() => history.length)) === beforeBare, '5. the rewrite adds no history entry');
check((await saved(page)) === savedBeforeBare, '5. the rewrite saves nothing');
check(!errors.some((e) => /replaceState|hydrat/i.test(e)), `5. no replaceState errors (${errors.join(' | ')})`);

// 6. Invalid parameters show defaults and are cleaned out of the address bar
await page.goto(`${baseUrl}/items?filter=bogus&sort=roi-desc`);
await settle(page);
check((await triggerText(page, 0)) === 'All items', '6. invalid filter shows All items');
check((await triggerText(page, 1)) === 'Sort by value', '6. ROI sort without profit shows sort by value');
check(pathAndQuery(page) === '/items', `6. address bar drops the invalid view (${pathAndQuery(page)})`);
await page.goto(`${baseUrl}/items?sort=profit-desc&profit=1`);
await settle(page);
check(
    pathAndQuery(page) === '/items?sort=roi-value-desc&profit=1',
    `6. legacy sort is rewritten (${pathAndQuery(page)})`,
);

// 8. Skill pages
await page.goto(`${baseUrl}/items/smithing?filter=members`);
await settle(page);
check((await triggerText(page, 0)) === 'Members only', '8. skill page link shows Members only');
// Sidebar links are relative (../items/crafting), so match the end of the href.
await page.locator('a[href$="/items/crafting"]').first().click();
await page.waitForURL((url) => url.pathname === '/items/crafting');
await settle(page);
check((await triggerText(page, 0)) === 'Free to play', '8. sidebar skill shows saved f2p');
check(
    pathAndQuery(page) === '/items/crafting?filter=f2p',
    `8. skill page address bar shows saved view (${pathAndQuery(page)})`,
);

// Each check below starts from the known saved setup, so their order doesn't matter.
async function resetSaved(p: Page, overrides: Record<string, unknown> = {}) {
    const value = JSON.stringify({ ...JSON.parse(SAVED), ...overrides });
    await p.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: PREFS_KEY, value });
}
// 'none' when no page is selected, e.g. a saved page number beyond the last page.
async function selectedPage(p: Page) {
    const selected = p.locator('[data-pagination-page][data-selected]');
    return (await selected.count()) ? (await selected.first().innerText()).trim() : 'none';
}
const filterValue: Record<string, string> = {
    'All items': 'all',
    'Members only': 'members',
    'Free to play': 'f2p',
    Equipable: 'equipable',
};
// The address bar's filter, read the way the page reads it (absent means all).
const urlFilter = (p: Page) => new URL(p.url()).searchParams.get('filter') ?? 'all';

// 11. Returning to the view the page was loaded with updates the address bar again
await resetSaved(page);
await page.goto(`${baseUrl}/items`);
await settle(page);
await choose(page, 0, 'All items');
check(pathAndQuery(page) === '/items', `11. back to All items clears the filter (${pathAndQuery(page)})`);
await choose(page, 0, 'Free to play');
check(pathAndQuery(page) === '/items?filter=f2p', `11. back to the loaded view restores it (${pathAndQuery(page)})`);
await page.goto(`${baseUrl}/items?filter=members`);
await settle(page);
await choose(page, 0, 'Free to play');
await choose(page, 0, 'Members only');
check(
    pathAndQuery(page) === '/items?filter=members',
    `11. link view chosen again shows in the URL (${pathAndQuery(page)})`,
);

// 12. A view change on a later page goes back to page 1
await page.goto(`${baseUrl}/items?filter=members`);
await settle(page);
await page.locator('[data-pagination-page]', { hasText: /^2$/ }).first().click();
await settle(page);
await choose(page, 0, 'Free to play');
check((await selectedPage(page)) === '1', '12. filter change on page 2 shows page 1');
check(lastApi()?.get('page') === '1', `12. and requests page 1 (${lastApi()?.get('page')})`);

// 13. Back from an item page shows the view the visitor left, matching the address bar
await resetSaved(page);
await page.goto(`${baseUrl}/items?filter=members&profit=1`);
await settle(page);
await choose(page, 0, 'Equipable');
await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) => /\/items\/\d+$/.test(a.href));
    link?.click();
});
await page.waitForURL((url) => /\/items\/\d+$/.test(url.pathname));
await settle(page);
await page.goBack();
await settle(page);
check((await triggerText(page, 0)) === 'Equipable', `13. Back shows Equipable (${await triggerText(page, 0)})`);
check(urlFilter(page) === 'equipable', `13. address bar matches (${pathAndQuery(page)})`);
check(lastApi()?.get('filter') === 'equipable', `13. request matches (${lastApi()?.get('filter')})`);

// 14. The sidebar's Browse items, from a link view, opens saved settings
await resetSaved(page);
await page.goto(`${baseUrl}/items?filter=members&profit=1`);
await settle(page);
await page.locator('a[href$="/items"]', { hasText: 'Browse items' }).first().click();
await page.waitForURL((url) => url.pathname === '/items' && url.searchParams.get('filter') !== 'members');
await settle(page);
check(
    (await triggerText(page, 0)) === 'Free to play',
    `14. Browse items shows saved f2p (${await triggerText(page, 0)})`,
);
check(!(await profitOn(page)), '14. and saved profit mode (off)');
check(pathAndQuery(page) === '/items?filter=f2p', `14. address bar shows saved view (${pathAndQuery(page)})`);

// 15. A link opens on page 1, whatever page the visitor last saved
await resetSaved(page, { page: 7 });
await page.goto(`${baseUrl}/items?filter=quest`);
await settle(page);
check(lastApi()?.get('page') === '1', `15. link requests page 1 (${lastApi()?.get('page')})`);
check((await selectedPage(page)) === '1', '15. link shows page 1');

// 16. Back across pagination after a view change: the address bar matches the screen
await resetSaved(page);
await page.goto(`${baseUrl}/items?filter=members`);
await settle(page);
await page.locator('[data-pagination-page]', { hasText: /^2$/ }).first().click();
await settle(page);
await choose(page, 0, 'Free to play');
await page.goBack();
await settle(page);
const shown = filterValue[await triggerText(page, 0)];
check(urlFilter(page) === shown, `16. address bar (${urlFilter(page)}) matches the screen (${shown})`);

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
check(
    Boolean(head.image) && new URL(head.image!).pathname === DEFAULT_IMAGE_PATH,
    `9. og:image is the default thumbnail (${head.image})`,
);
const html = await (await fetch(`${baseUrl}/items?filter=members&profit=1`)).text();
check(
    html.includes('<link rel="canonical" href="https://aris-maye.com/items"'),
    '9. server-rendered canonical is /items',
);

// 10. Mobile
await page.screenshot({ path: join(shots, 'toolbar-1280.png'), clip: { x: 0, y: 0, width: 1280, height: 400 } });
// A fresh phone-sized page, not a resized desktop one: the pagination picks its mobile layout at
// load, so resizing would report overflow a real phone never sees.
const phone = await context.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(`${baseUrl}/items?filter=members&profit=1`);
await settle(phone);
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check(overflow <= 0, `10. no horizontal scroll at 390px (${overflow}px over)`);
check(await phone.getByRole('button', { name: 'Copy link' }).isVisible(), '10. Copy link is visible at 390px');
await phone.screenshot({ path: join(shots, 'toolbar-390.png'), fullPage: false });

await browser.close();
console.log(`\n${checks - failures.length}/${checks} checks passed. Screenshots in ${shots}`);
if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
}
