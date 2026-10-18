/**
 * Checks the guide pages against a running site: the tables are in the server HTML a crawler
 * gets, unknown skills are 404s, the market share image renders, the high alch sort works, nothing
 * logs a hydration error, phones never scroll sideways, and the sidebar and homepage link to the
 * guides.
 *
 *   bun scripts/verify-guide-pages.ts <baseUrl> [--out=<dir>]
 *
 * Needs Playwright's headless Chromium. If you don't have it:  bunx playwright install chromium-headless-shell
 * The newest cached copy is found automatically; set PLAYWRIGHT_CHROMIUM_PATH to use another.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { GUIDE_PAGES, XP_GUIDE_SKILLS } from '../src/lib/constants/guides';

const args = process.argv.slice(2);
const baseUrl = args.find((a) => !a.startsWith('--'))?.replace(/\/+$/, '');
if (!baseUrl) {
    console.error('Usage: bun scripts/verify-guide-pages.ts <baseUrl> [--out=<dir>]');
    process.exit(2);
}
const out = args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? join(tmpdir(), 'verify-guide-pages');
mkdirSync(out, { recursive: true });

/** Every guide URL, the hub included. */
const GUIDE_PATHS = [
    '/guides',
    ...GUIDE_PAGES.map((guide) => guide.path),
    ...XP_GUIDE_SKILLS.map((skill) => `/guides/cheapest-xp/${skill.slug}`),
];
/** The guides with item tables (all but the hub). */
const TABLE_PATHS = GUIDE_PATHS.filter((path) => path !== '/guides');
/** A guide table with fewer rows than this is thin. The overview has one row per skill. */
const minRows = (path: string) => (path === '/guides/cheapest-xp' ? XP_GUIDE_SKILLS.length : 10);

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

/** Table rows in raw HTML that link to an item page. The site writes relative links (`../items/2`). */
function itemRows(html: string): number {
    return html
        .split('<tr')
        .slice(1)
        .filter((row) => /href="[./]*items\/\d+"/.test(row.split('</tr>')[0])).length;
}

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
    const signature = [0x89, 0x50, 0x4e, 0x47];
    if (!signature.every((b, i) => bytes[i] === b)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    return { width: view.getUint32(16), height: view.getUint32(20) };
}

// 1. Crawlable: the server HTML has the tables, with no browser involved.
console.log('\n# Server HTML');
const serverHtml = new Map<string, string>();
for (const path of GUIDE_PATHS) {
    const response = await fetch(`${baseUrl}${path}`);
    const html = await response.text();
    serverHtml.set(path, html);
    check(response.status === 200, `${path} answers 200 (got ${response.status})`);
    if (TABLE_PATHS.includes(path)) {
        const rows = itemRows(html);
        check(rows >= minRows(path), `${path} has ${rows} item rows in its server HTML (want ${minRows(path)}+)`);
    }
}
const hub = serverHtml.get('/guides') ?? '';
for (const guide of GUIDE_PAGES) {
    const slug = guide.path.replace('/guides/', '');
    check(new RegExp(`href="[./]*(guides/)?${slug}"`).test(hub), `The hub links to ${guide.path}`);
}

// 2. Unknown skills.
for (const path of ['/guides/cheapest-xp/woodcutting', '/guides/cheapest-xp/not-a-skill']) {
    const response = await fetch(`${baseUrl}${path}`);
    check(response.status === 404, `${path} answers 404 (got ${response.status})`);
}

// 3. The market share image.
console.log('\n# Market share image');
const marketHtml = serverHtml.get('/guides/market') ?? '';
const ogImage = marketHtml.match(/<meta property="og:image" content="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
check(
    Boolean(ogImage && /\/og\/guides\/market\.png\?v=\d+&h=\d+$/.test(ogImage)),
    `Market og:image is the hourly card (${ogImage})`,
);
if (ogImage) {
    const response = await fetch(`${baseUrl}${new URL(ogImage).pathname}${new URL(ogImage).search}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const size = pngSize(bytes);
    check(response.headers.get('content-type') === 'image/png', 'Market card is a PNG');
    check(size?.width === 1200 && size?.height === 630, `Market card is 1200x630 (got ${size?.width}x${size?.height})`);
    writeFileSync(join(out, 'market-card.png'), bytes);
    const item = await fetch(`${baseUrl}/og/items/2.png?v=1`);
    if (item.ok) writeFileSync(join(out, 'item-card-for-comparison.png'), new Uint8Array(await item.arrayBuffer()));
}

const browser: Browser = await chromium.launch({ executablePath: findChromium() });

/** A fresh page that records page errors, console errors and hydration warnings. */
async function openPage(width: number, height: number) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error' || /hydrat/i.test(msg.text())) problems.push(msg.text());
    });
    return { page, problems, close: () => context.close() };
}

async function settle(page: Page) {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
}

// 4. The high alch sort toggle.
console.log('\n# High alch sort');
{
    const { page, close } = await openPage(1280, 900);
    await page.goto(`${baseUrl}/guides/high-alch`);
    await settle(page);
    const serverFirst = serverHtml.get('/guides/high-alch')?.match(/data-item-id="(\d+)"/)?.[1];
    const rowIds = () =>
        page.locator('tr[data-item-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-item-id')));
    check((await rowIds())[0] === serverFirst, 'After hydration the first row matches the server render');

    await page
        .getByRole('radio', { name: 'Profit per 4 hours' })
        .or(page.getByText('Profit per 4 hours', { exact: true }).first())
        .first()
        .click();
    await page.waitForTimeout(200);
    const perLimit = await page
        .locator('tr[data-item-id]')
        .evaluateAll((rows) => rows.map((r) => Number(r.getAttribute('data-per-limit') || -Infinity)));
    const sorted = perLimit.every((value, i) => i === 0 || perLimit[i - 1] >= value);
    check(
        sorted && perLimit[0] === Math.max(...perLimit),
        'Profit per 4 hours puts the biggest profit x buy limit first',
    );
    await close();
}

// 5 and 6. Hydration and mobile width, on every guide.
console.log('\n# Hydration and layout');
for (const path of GUIDE_PATHS) {
    const name = path.replaceAll('/', '_').replace(/^_/, '');
    for (const [width, height] of [
        [390, 844],
        [1280, 900],
    ]) {
        const { page, problems, close } = await openPage(width, height);
        await page.goto(`${baseUrl}${path}`);
        await settle(page);
        if (width === 390) {
            const { scrollWidth, innerWidth } = await page.evaluate(() => ({
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
            }));
            check(
                scrollWidth <= innerWidth,
                `${path} at 390px doesn't scroll sideways (${scrollWidth} <= ${innerWidth})`,
            );
            check(problems.length === 0, `${path} hydrates without errors${problems.length ? `: ${problems[0]}` : ''}`);
            if (path === '/guides/high-alch') {
                const tableScrolls = await page.evaluate(() => {
                    const box = document.querySelector('table')?.parentElement;
                    return box ? box.scrollWidth > box.clientWidth : false;
                });
                check(tableScrolls, 'The high alch table scrolls inside its own box at 390px');
            }
        }
        await page.screenshot({ path: join(out, `${name}-${width}.png`), fullPage: width === 390 });
        await close();
    }
}

// 7. Links from the sidebar and the homepage.
console.log('\n# Links');
{
    const { page, close } = await openPage(1280, 900);
    await page.goto(`${baseUrl}/`);
    await settle(page);
    for (const [label, path] of [
        ['Market report', '/guides/market'],
        ['High alch', '/guides/high-alch'],
        ['Cheapest XP', '/guides/cheapest-xp'],
        ['Ironman money', '/guides/ironman-money-making'],
        ['All guides', '/guides'],
    ] as const) {
        await page.getByRole('link', { name: label, exact: true }).first().click();
        await page.waitForURL((url) => url.pathname === path, { timeout: 15_000 }).catch(() => {});
        check(new URL(page.url()).pathname === path, `Sidebar "${label}" goes to ${path}`);
    }

    await page.goto(`${baseUrl}/`);
    const reportLink = page.getByRole('link', { name: /Full market report/ });
    await reportLink.waitFor({ timeout: 20_000 }).catch(() => {});
    if (await reportLink.count()) {
        await reportLink.first().click();
        await page.waitForURL((url) => url.pathname === '/guides/market', { timeout: 15_000 }).catch(() => {});
        check(
            new URL(page.url()).pathname === '/guides/market',
            'Homepage "Full market report" goes to /guides/market',
        );
    } else {
        check(false, 'The homepage shows a "Full market report" link');
    }

    await page.goto(`${baseUrl}/items/smithing`);
    await settle(page);
    await page.getByRole('link', { name: /Cheapest Smithing XP/ }).click();
    await page
        .waitForURL((url) => url.pathname === '/guides/cheapest-xp/smithing', { timeout: 15_000 })
        .catch(() => {});
    check(
        new URL(page.url()).pathname === '/guides/cheapest-xp/smithing',
        '/items/smithing links to its cheapest XP guide',
    );
    await close();
}

await browser.close();
console.log(`\nScreenshots and cards: ${out}`);
console.log(`${checks - failures.length}/${checks} checks passed.`);
if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
