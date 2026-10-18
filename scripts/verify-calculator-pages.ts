/**
 * Checks the calculator pages against a running site: the results are in the server HTML a crawler
 * gets, a shared goal renders on the server, typing updates the results and the address bar, a
 * saved character fills in the current level, the GE tax figures are right, icons are cached,
 * unknown skills are 404s, nothing logs a hydration error, phones never scroll sideways, and the
 * sidebar, guides and skill pages link to the calculators.
 *
 *   bun scripts/verify-calculator-pages.ts <baseUrl> [--out=<dir>]
 *
 * Needs Playwright's headless Chromium. If you don't have it:  bunx playwright install chromium-headless-shell
 * The newest cached copy is found automatically; set PLAYWRIGHT_CHROMIUM_PATH to use another.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { XP_GUIDE_SKILLS } from '../src/lib/constants/guides';
import { xpForLevel } from '../src/lib/helpers/xp-table';

const args = process.argv.slice(2);
const baseUrl = args.find((a) => !a.startsWith('--'))?.replace(/\/+$/, '');
if (!baseUrl) {
    console.error('Usage: bun scripts/verify-calculator-pages.ts <baseUrl> [--out=<dir>]');
    process.exit(2);
}
const out =
    args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? join(tmpdir(), 'verify-calculator-pages');
mkdirSync(out, { recursive: true });

const SKILL_PATHS = XP_GUIDE_SKILLS.map((skill) => `/calculators/${skill.slug}`);
const ALL_PATHS = ['/calculators', ...SKILL_PATHS, '/calculators/ge-tax'];
const fmt = (n: number) => n.toLocaleString('en-US');

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

/** The text of the element carrying a `data-testid`, from raw HTML. */
function testIdText(html: string, id: string): string | undefined {
    return html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`))?.[1]?.trim();
}

// 1. Crawlable.
console.log('\n# Server HTML');
const serverHtml = new Map<string, string>();
for (const path of ALL_PATHS) {
    const response = await fetch(`${baseUrl}${path}`);
    const html = await response.text();
    serverHtml.set(path, html);
    check(response.status === 200, `${path} answers 200 (got ${response.status})`);
}
for (const path of SKILL_PATHS) {
    const html = serverHtml.get(path) ?? '';
    const rows = itemRows(html);
    check(rows >= 10, `${path} has ${rows} item rows in its server HTML (want 10+)`);
    check(
        testIdText(html, 'xp-needed') === fmt(xpForLevel(99)),
        `${path} shows ${fmt(xpForLevel(99))} XP needed for 1 to 99 (got ${testIdText(html, 'xp-needed')})`,
    );
    const kb = Math.round(html.length / 1024);
    console.log(`     ${path}: ${kb} KB of HTML`);
}
const hub = serverHtml.get('/calculators') ?? '';
for (const path of [...SKILL_PATHS, '/calculators/ge-tax']) {
    const slug = path.replace('/calculators/', '');
    check(new RegExp(`href="[./]*(calculators/)?${slug}"`).test(hub), `The hub links to ${path}`);
}

// 2. A shared goal.
{
    const path = '/calculators/herblore?from=50&to=70';
    const html = await (await fetch(`${baseUrl}${path}`)).text();
    const expected = fmt(xpForLevel(70) - xpForLevel(50));
    check(testIdText(html, 'xp-needed') === expected, `${path} server-renders ${expected} XP needed`);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
    check(canonical.endsWith('/calculators/herblore'), `${path} is canonical to the bare path (${canonical})`);
}

// 6. GE tax, in the server HTML.
console.log('\n# GE tax');
{
    const html = await (await fetch(`${baseUrl}/calculators/ge-tax?price=1000&qty=100&buy=900`)).text();
    const got = ['tax-each', 'tax-total', 'tax-received', 'tax-profit'].map((id) => testIdText(html, id));
    check(
        JSON.stringify(got) === JSON.stringify(['20 gp', '2,000 gp', '98,000 gp', '8,000 gp']),
        `1,000 gp × 100 bought at 900 shows 20 / 2,000 / 98,000 / 8,000 (got ${got.join(' / ')})`,
    );
}

// 7. Icons.
console.log('\n# Icons');
{
    const src = serverHtml.get('/calculators/herblore')?.match(/<img src="([^"]*\/icons\/items\/\d+\.png[^"]*)"/)?.[1];
    check(Boolean(src), `The herblore table uses the icon endpoint (${src})`);
    if (src) {
        const response = await fetch(new URL(src.replaceAll('&amp;', '&'), `${baseUrl}/calculators/herblore`));
        check(
            response.status === 200 && /^image\//.test(response.headers.get('content-type') ?? ''),
            `An icon answers 200 with an image (${response.status} ${response.headers.get('content-type')})`,
        );
        check(
            // Netlify drops the space after the comma.
            response.headers.get('cache-control')?.replaceAll(' ', '') === 'public,max-age=86400',
            `The icon's Cache-Control is a day (${response.headers.get('cache-control')})`,
        );
        // Netlify strips its own CDN header from what reaches the browser, so only check it locally.
        const cdn = response.headers.get('netlify-cdn-cache-control');
        if (cdn !== null) check(cdn.includes('max-age=31536000'), `The icon's CDN cache is a year (${cdn})`);
    }
    const missing = await fetch(`${baseUrl}/icons/items/99999999.png`);
    check(missing.status === 404, `An unknown icon is a 404 (got ${missing.status})`);
}

// 8. Unknown skills.
for (const path of ['/calculators/woodcutting', '/calculators/not-a-skill']) {
    const response = await fetch(`${baseUrl}${path}`);
    check(response.status === 404, `${path} answers 404 (got ${response.status})`);
}

const browser: Browser = await chromium.launch({ executablePath: findChromium() });

/** A fresh page that records page errors, console errors and hydration warnings. */
async function openPage(width: number, height: number, init?: () => void) {
    const context = await browser.newContext({ viewport: { width, height } });
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (msg) => {
        // An icon that 404s is handled by the page, so it isn't a problem here.
        if (/Failed to load resource/.test(msg.text())) return;
        if (msg.type() === 'error' || /hydrat/i.test(msg.text())) problems.push(msg.text());
    });
    return { page, problems, close: () => context.close() };
}

async function settle(page: Page) {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
}

const xpNeededText = (page: Page) => page.getByTestId('xp-needed').innerText();

// 3. Typing.
console.log('\n# Typing');
{
    const { page, close } = await openPage(1280, 900);
    await page.goto(`${baseUrl}/calculators/herblore?from=50&to=70`);
    await settle(page);
    const before = await page.locator('tr[data-item-id]').first().getAttribute('data-count');
    await page.locator('#goal-to').fill('80');
    await page.waitForTimeout(600);
    const expected = fmt(xpForLevel(80) - xpForLevel(50));
    check((await xpNeededText(page)) === expected, `Typing 80 as the target shows ${expected} XP needed`);
    const after = await page.locator('tr[data-item-id]').first().getAttribute('data-count');
    check(Number(after) > Number(before), `The counts went up (${before} → ${after})`);
    check(new URL(page.url()).search === '?from=50&to=80', `The address bar reads ?from=50&to=80 (${page.url()})`);

    await page.getByRole('radio', { name: 'XP' }).first().click();
    await page.waitForTimeout(600);
    check(
        (await page.locator('#goal-from').inputValue()) === String(xpForLevel(50)),
        'Switching Current to XP keeps the same place (level 50 is 101,333 XP)',
    );
    check(new URL(page.url()).search === '?fromXp=101333&to=80', `The address bar follows (${page.url()})`);
    await close();
}

// 4. A saved character.
console.log('\n# Saved character');
{
    const { page, close } = await openPage(1280, 900, () => {
        localStorage.setItem(
            'aris-maye-characters',
            JSON.stringify({
                activeCharacter: 'verify-calculators',
                characters: [
                    {
                        id: 'verify-calculators',
                        name: 'Verify',
                        accountType: 'main',
                        skillLevels: { herblore: 60, smithing: 1 },
                    },
                ],
            }),
        );
    });
    await page.goto(`${baseUrl}/calculators/herblore`);
    await settle(page);
    check((await page.locator('#goal-from').inputValue()) === '60', 'Current starts at the character’s Herblore 60');
    const expected = fmt(xpForLevel(99) - xpForLevel(60));
    check((await xpNeededText(page)) === expected, `XP needed is 60 to 99 (${expected})`);
    check(new URL(page.url()).search === '', `The URL is left alone (${page.url()})`);

    await page.goto(`${baseUrl}/calculators/herblore?from=10`);
    await settle(page);
    check((await page.locator('#goal-from').inputValue()) === '10', 'A link’s own start wins over the character');
    await close();
}

// 5. The can-use filter.
console.log('\n# Can-use filter');
{
    const { page, close } = await openPage(1280, 900);
    await page.goto(`${baseUrl}/calculators/herblore?from=30`);
    await settle(page);
    const levels = () =>
        page.locator('tr[data-item-id]').evaluateAll((rows) => rows.map((r) => Number(r.getAttribute('data-level'))));
    const all = await levels();
    check(
        all.some((level) => level > 30),
        'Without the filter, methods above level 30 are listed',
    );
    await page.locator('#can-use-switch').click();
    await page.waitForTimeout(600);
    const usable = await levels();
    check(
        usable.length > 0 && usable.every((level) => level <= 30),
        `With it, only methods up to level 30 are left (${usable.length} rows)`,
    );
    check(new URL(page.url()).searchParams.get('can') === '1', `The address bar has can=1 (${page.url()})`);
    await close();
}

// 9. Hydration and mobile width.
console.log('\n# Hydration and layout');
for (const path of ALL_PATHS) {
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
            if (path === '/calculators/herblore') {
                const tableScrolls = await page.evaluate(() => {
                    const box = document.querySelector('table')?.parentElement;
                    return box ? box.scrollWidth > box.clientWidth : false;
                });
                check(tableScrolls, 'The herblore table scrolls inside its own box at 390px');
            }
        }
        await page.screenshot({ path: join(out, `${name}-${width}.png`), fullPage: false });
        await close();
    }
}

// 10. Links.
console.log('\n# Links');
{
    const { page, close } = await openPage(1280, 900);
    async function follow(locator: ReturnType<Page['locator']>, path: string, label: string) {
        await locator.first().click();
        await page.waitForURL((url) => url.pathname === path, { timeout: 15_000 }).catch(() => {});
        check(new URL(page.url()).pathname === path, `${label} goes to ${path}`);
    }

    await page.goto(`${baseUrl}/`);
    await settle(page);
    const menu = (slug: string) => page.locator(`a[data-sidebar="menu-button"][href$="calculators${slug}"]`);
    await follow(menu(''), '/calculators', 'Sidebar "All calculators"');
    await follow(menu('/ge-tax'), '/calculators/ge-tax', 'Sidebar "GE tax"');
    await follow(menu('/smithing'), '/calculators/smithing', 'Sidebar "Smithing" calculator');

    await page.goto(`${baseUrl}/guides/cheapest-xp/herblore`);
    await settle(page);
    await follow(
        page.getByRole('link', { name: 'Herblore calculator' }),
        '/calculators/herblore',
        'The cheapest Herblore XP guide',
    );
    await settle(page);
    await follow(
        page.getByRole('link', { name: /cheapest Herblore XP at every level/ }),
        '/guides/cheapest-xp/herblore',
        'The Herblore calculator',
    );

    await page.goto(`${baseUrl}/items/smithing`);
    await settle(page);
    await follow(page.getByRole('link', { name: /Smithing calculator/ }), '/calculators/smithing', '/items/smithing');
    await close();
}

await browser.close();
console.log(`\nScreenshots: ${out}`);
console.log(`${checks - failures.length}/${checks} checks passed.`);
if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
