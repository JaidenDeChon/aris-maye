/**
 * Audits a running Aris Maye: robots.txt, the sitemap (against the official schema) and the head
 * tags of every page in it.
 *
 *   bun scripts/verify-seo.ts <baseUrl> [--production] [--noindex-ids=1,2] [--concurrency=8] [--sample=N]
 *       [--report=failures.txt]
 *
 * Sitemap URLs always name https://aris-maye.com. Their paths are fetched from <baseUrl>, so the
 * same check runs against a local preview, a deploy preview or production. Pass --production
 * only when <baseUrl> is the real domain.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'https://aris-maye.com';
const fixtures = join(import.meta.dir, 'fixtures');

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const baseUrl = args.find((a) => !a.startsWith('--'))?.replace(/\/+$/, '');
if (!baseUrl) {
    console.error(
        'Usage: bun scripts/verify-seo.ts <baseUrl> [--production] [--noindex-ids=1,2] [--concurrency=8] [--sample=N]',
    );
    process.exit(2);
}
const production = args.includes('--production');
const noindexIds = (option('noindex-ids') ?? '').split(',').filter(Boolean);
const concurrency = Number(option('concurrency') ?? 8);
const sample = option('sample') ? Number(option('sample')) : null;
const reportPath = option('report');

let checks = 0;
const failures: string[] = [];
function check(ok: boolean, message: string) {
    checks++;
    if (!ok) failures.push(message);
}

function decode(text: string): string {
    return text
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

async function get(path: string): Promise<Response> {
    const url = `${baseUrl}${path}`;
    for (let attempt = 0; ; attempt++) {
        try {
            const fetched = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
            // Read the body here so a body that stalls past the timeout is caught below too.
            const response = new Response(await fetched.arrayBuffer(), fetched);
            // One retry, for serverless cold starts.
            if (response.status < 500 || attempt === 1) return response;
        } catch (error) {
            // A timeout or dropped connection is a result to report, not a reason to stop the audit.
            if (attempt === 1) {
                const reason = error instanceof Error ? error.message : String(error);
                return new Response(reason, { status: 599, statusText: 'Request failed' });
            }
        }
    }
}

function checkRobotsHeader(response: Response, path: string) {
    const header = response.headers.get('x-robots-tag') ?? '';
    if (production) check(!header.includes('noindex'), `${path}: production response sends X-Robots-Tag "${header}"`);
    else check(header.includes('noindex'), `${path}: non-production response lacks X-Robots-Tag noindex`);
}

type Head = {
    titles: string[];
    descriptions: string[];
    canonicals: string[];
    ogTitles: string[];
    robots: string[];
    ogImages: string[];
    usedIn: boolean;
};

async function readHead(html: string): Promise<Head> {
    const head: Head = {
        titles: [],
        descriptions: [],
        canonicals: [],
        ogTitles: [],
        robots: [],
        ogImages: [],
        usedIn: false,
    };
    await new HTMLRewriter()
        .on('head > title', {
            element() {
                head.titles.push('');
            },
            text(chunk) {
                head.titles[head.titles.length - 1] += chunk.text;
            },
        })
        .on('meta[name="description"]', {
            element: (e) => void head.descriptions.push(e.getAttribute('content') ?? ''),
        })
        .on('link[rel="canonical"]', { element: (e) => void head.canonicals.push(e.getAttribute('href') ?? '') })
        .on('meta[property="og:title"]', { element: (e) => void head.ogTitles.push(e.getAttribute('content') ?? '') })
        .on('meta[property="og:image"]', { element: (e) => void head.ogImages.push(e.getAttribute('content') ?? '') })
        .on('meta[name="robots"]', { element: (e) => void head.robots.push(e.getAttribute('content') ?? '') })
        .on('[data-seo-used-in]', { element: () => void (head.usedIn = true) })
        .transform(new Response(html))
        .text();
    head.titles = head.titles.map(decode);
    head.descriptions = head.descriptions.map(decode);
    head.canonicals = head.canonicals.map(decode);
    head.ogImages = head.ogImages.map(decode);
    return head;
}

async function pool<T>(items: T[], worker: (item: T) => Promise<void>) {
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (next < items.length) await worker(items[next++]);
        }),
    );
}

function xmllint(xml: string, schema: string): boolean {
    const file = join(mkdtempSync(join(tmpdir(), 'verify-seo-')), 'sitemap.xml');
    writeFileSync(file, xml);
    const result = Bun.spawnSync(['xmllint', '--noout', '--schema', join(fixtures, schema), file]);
    if (result.exitCode !== 0) console.error(result.stderr.toString());
    return result.exitCode === 0;
}

const locsOf = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));

// 1. robots.txt
const robots = await get('/robots.txt');
const robotsText = await robots.text();
checkRobotsHeader(robots, '/robots.txt');
if (production) {
    check(robotsText.includes('Disallow: /api/'), 'robots.txt: missing Disallow: /api/');
    check(robotsText.includes(`Sitemap: ${SITE}/sitemap.xml`), 'robots.txt: missing Sitemap line');
    check(!/^Disallow: \/$/m.test(robotsText), 'robots.txt: production disallows everything');
} else {
    check(/^Disallow: \/$/m.test(robotsText), 'robots.txt: non-production host is not fully disallowed');
}

// 2. sitemap.xml, plus parts if it's an index
const sitemap = await get('/sitemap.xml');
const sitemapXml = await sitemap.text();
check(sitemap.status === 200, `/sitemap.xml: status ${sitemap.status}`);
check((sitemap.headers.get('content-type') ?? '').includes('xml'), '/sitemap.xml: not served as XML');
checkRobotsHeader(sitemap, '/sitemap.xml');

let locs: string[] = [];
if (sitemapXml.includes('<sitemapindex')) {
    check(xmllint(sitemapXml, 'siteindex-0.9.xsd'), '/sitemap.xml: index fails the sitemaps.org schema');
    for (const part of locsOf(sitemapXml)) {
        const path = new URL(part).pathname;
        const xml = await (await get(path)).text();
        check(xmllint(xml, 'sitemap-0.9.xsd'), `${path}: fails the sitemaps.org schema`);
        locs.push(...locsOf(xml));
    }
} else {
    check(xmllint(sitemapXml, 'sitemap-0.9.xsd'), '/sitemap.xml: fails the sitemaps.org schema');
    locs = locsOf(sitemapXml);
}
check(locs.length > 0, 'sitemap lists no URLs');
check(new Set(locs).size === locs.length, 'sitemap has duplicate URLs');
for (const loc of locs) check(loc === `${SITE}/` || loc.startsWith(`${SITE}/`), `sitemap URL off-domain: ${loc}`);
console.log(`Sitemap: ${locs.length} URLs`);

// 3. every page in the sitemap
const targets = sample
    ? locs.slice(0, 8).concat(
          locs
              .slice(8)
              .sort(() => Math.random() - 0.5)
              .slice(0, sample),
      )
    : locs;
const titleOwners = new Map<string, string>();
let ingredientPages = 0;
const itemImages: string[] = [];

async function auditIndexable(loc: string) {
    const path = new URL(loc).pathname;
    const response = await get(path);
    check(response.status === 200, `${path}: status ${response.status}`);
    if (response.status !== 200) return;
    checkRobotsHeader(response, path);
    const head = await readHead(await response.text());

    check(head.titles.length === 1, `${path}: ${head.titles.length} <title> tags`);
    check(head.descriptions.length === 1, `${path}: ${head.descriptions.length} description tags`);
    check(head.canonicals.length === 1, `${path}: ${head.canonicals.length} canonical tags`);
    check(head.ogTitles.length === 1, `${path}: ${head.ogTitles.length} og:title tags`);
    check(head.canonicals[0] === loc, `${path}: canonical "${head.canonicals[0]}" is not "${loc}"`);
    check(
        head.robots.length === 1 && head.robots[0] === 'index, follow',
        `${path}: robots "${head.robots.join(' | ')}"`,
    );

    // Share images come from the host that served the page, and item pages each have their own.
    const image = head.ogImages[0] ?? '';
    check(head.ogImages.length === 1, `${path}: ${head.ogImages.length} og:image tags`);
    check(image.startsWith(`${new URL(baseUrl).origin}/`), `${path}: og:image "${image}" is on another host`);
    const itemId = path.match(/^\/items\/(\d+)$/)?.[1];
    if (itemId) {
        check(image.includes(`/og/items/${itemId}.png`), `${path}: og:image "${image}" is not the item's own`);
        itemImages.push(new URL(image).pathname + new URL(image).search);
    }

    const title = head.titles[0] ?? '';
    check(title.length > 0 && title.length <= 60, `${path}: title length ${title.length} ("${title}")`);
    const owner = titleOwners.get(title);
    check(!owner, `${path}: title "${title}" also used by ${owner}`);
    titleOwners.set(title, path);

    const description = head.descriptions[0] ?? '';
    check(description.length >= 70 && description.length <= 160, `${path}: description length ${description.length}`);

    // Ingredient-only pages exist in the index because of their "Used in" card, so it must be in
    // the server-rendered HTML that crawlers read.
    // "including X and Y" must name two different recipes.
    const including = description.match(/including (.+) and (.+?)\. /);
    check(!including || including[1] !== including[2], `${path}: description repeats "${including?.[1]}"`);

    if (/ is used (in \d+|to make) /.test(description)) {
        ingredientPages++;
        check(head.usedIn, `${path}: ingredient page has no Used in card in its server render`);
    }
}

let done = 0;
await pool(targets, async (loc) => {
    await auditIndexable(loc);
    if (++done % 500 === 0) console.log(`  …${done}/${targets.length}`);
});
console.log(`Audited ${targets.length} pages (${ingredientPages} ingredient-only)`);

// 4. a sample of item share images: each must be a 1200×630 PNG
const imageSample = itemImages.sort(() => Math.random() - 0.5).slice(0, 20);
await pool(imageSample, async (path) => {
    const response = await get(path);
    const bytes = new Uint8Array(await response.arrayBuffer());
    check(response.status === 200, `${path}: status ${response.status}`);
    check(
        response.headers.get('content-type') === 'image/png',
        `${path}: served as ${response.headers.get('content-type')}`,
    );
    // A PNG's width and height are the first two fields of its IHDR chunk, at bytes 16 and 20.
    const view = new DataView(bytes.buffer);
    const size = bytes.length >= 24 ? `${view.getUint32(16)}×${view.getUint32(20)}` : 'unreadable';
    check(size === '1200×630', `${path}: image is ${size}`);
});
console.log(`Fetched ${imageSample.length} item share images`);

// 5. pages that must stay out of the index
const noindexPaths = [
    '/favorites',
    '/hidden',
    '/my-character',
    '/items/new',
    ...noindexIds.map((id) => `/items/${id}`),
];
if (!noindexIds.length) console.warn('No --noindex-ids given; only personal pages are checked for noindex.');
await pool(noindexPaths, async (path) => {
    const response = await get(path);
    check(response.status === 200, `${path}: status ${response.status}`);
    const head = await readHead(await response.text());
    check(
        head.robots.length === 1 && head.robots[0] === 'noindex, follow',
        `${path}: robots "${head.robots.join(' | ')}"`,
    );
    check(head.titles.length === 1, `${path}: ${head.titles.length} <title> tags`);
});

console.log(`\n${checks} checks, ${failures.length} failed`);
if (reportPath) {
    writeFileSync(reportPath, failures.length ? failures.join('\n') + '\n' : '');
    console.log(`Every failure written to ${reportPath}`);
}
if (failures.length) {
    console.error(
        failures
            .slice(0, 50)
            .map((f) => `- ${f}`)
            .join('\n'),
    );
    if (failures.length > 50) console.error(`…and ${failures.length - 50} more`);
    process.exit(1);
}
console.log('PASS');
