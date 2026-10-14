# SEO Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every page its own title, description, canonical URL and robots rule, add a "Used in" section to item pages, and serve `sitemap.xml` and `robots.txt`, all verified by unit tests, a DB check and a full-site audit.

**Architecture:** Pure builders in `src/lib/seo/` produce a `PageSeo` object for each page. Each `+page.svelte` renders it through a shared `<SeoHead>`. `/api/game-item` gains a `usedIn` field backed by a new multikey index. Sitemap and robots are `+server.ts` routes whose logic is in pure, tested functions. Two Bun scripts check the result against the real database and a real build.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, Bun 1.3 (`bun test`, `HTMLRewriter`), Mongoose, adapter-netlify, `xmllint` (preinstalled on macOS).

**Spec:** `docs/superpowers/specs/2026-10-14-seo-foundation-design.md`

## Global Constraints

- Production origin `https://aris-maye.com`, overridable with the `VITE_SITE_URL` env var. The spec said `PUBLIC_SITE_URL`; Task 1 renames it, because this repo reads env through `import.meta.env` and Vite only exposes `VITE_*` there, the same way `src/db/mongo.ts` does.
- Production hosts are exactly `aris-maye.com` and `www.aris-maye.com`. Every other host gets `X-Robots-Tag: noindex, nofollow` and robots.txt `Disallow: /`.
- An item is indexable if it has at least one creation spec **or** is used as an ingredient in one. `isIndexableItem` is the only place that rule lives.
- Titles are 60 characters or fewer. Descriptions on indexable pages are 70 to 160. Text is never cut mid-word unless a single word is longer than the limit.
- No live gp figures in titles or descriptions.
- Robots meta content is exactly `index, follow` or `noindex, follow`.
- Canonical is `SITE_URL` + pathname, with no query string and no trailing slash. The homepage is `https://aris-maye.com/`.
- Sitemap: no `lastmod`. `Content-Type: application/xml`. `Cache-Control: public, max-age=0, s-maxage=3600`. At most 50,000 URLs per file. A failed lookup gives a 503 with `Retry-After: 3600`, never an empty 200.
- "Used in": list capped at 50, sorted by level then name, items with no level last. Show 10 at first, then "Show all {total}". No prices.
- Code style: 4-space indent, single quotes, Prettier (`npx prettier --write <files>`). Comments explain _why_, in full sentences, matching the surrounding files.
- Every commit message ends with:
    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf
    ```
- Work on branch `claude/seo-foundation` (PR #33).

## Review Focus

1. **Client-side click from one item to another:** while the next item loads, the tab must not keep showing the previous item's title. It shows a loading title, then the new item's. This is pinned by `itemPageSeo` tests in Task 2.
2. **Tool ingredients** (hammer, needle, chisel) are used in hundreds of recipes. `total` must be the real count, the list is capped at 50, and the description quotes the real count. This is pinned by a `buildUsedIn` test in Task 3.
3. **Item names with `&`, `'`, `"` or brackets** (e.g. "Saradomin brew(4)", "Zamorak's ...") must come out escaped in the sitemap XML and must not break the length rules. This is pinned in Tasks 2 and 6.
4. **Wrong-case skill URLs** like `/items/Cooking` match the route. The canonical must be the lowercase slug. This is pinned by a `buildSkillSeo` test in Task 2.
5. **A database error while building the sitemap** must give a 503, not an empty sitemap, and a failed "Used in" lookup must still give a 200 with `usedIn` empty. This is pinned in Tasks 6 and 3.

---

### Task 1: Site URL, page SEO types, text fitting

**Files:**

- Create: `src/lib/seo/site-url.ts`, `src/lib/seo/page-seo.ts`, `src/lib/seo/fit-text.ts`
- Test: `src/lib/seo/site-url.test.ts`, `src/lib/seo/page-seo.test.ts`, `src/lib/seo/fit-text.test.ts`
- Modify: `docs/superpowers/specs/2026-10-14-seo-foundation-design.md` (rename `PUBLIC_SITE_URL` to `VITE_SITE_URL`)

**Interfaces:**

- Produces:
    - `SITE_URL: string`, `resolveSiteUrl(raw?: string | null): string`, `isProductionHost(host: string): boolean`
    - `type RobotsDirective = 'index' | 'noindex'`, `type PageSeo = { title: string; description: string; canonicalPath: string; robots: RobotsDirective; image?: string; imageAlt?: string }`
    - `DEFAULT_SHARE_IMAGE`, `DEFAULT_SHARE_IMAGE_ALT`, `canonicalPath(path: string): string`, `canonicalUrl(path: string, base?: string): string`, `robotsContent(r: RobotsDirective): string`
    - `TITLE_MAX = 60`, `DESCRIPTION_MIN = 70`, `DESCRIPTION_MAX = 160`, `truncateAtWord(text: string, max: number): string`, `firstThatFits(candidates: string[], max: number): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/seo/site-url.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { isProductionHost, resolveSiteUrl } from './site-url';

describe('resolveSiteUrl', () => {
    it('defaults to the production domain when unset or blank', () => {
        expect(resolveSiteUrl(undefined)).toBe('https://aris-maye.com');
        expect(resolveSiteUrl('   ')).toBe('https://aris-maye.com');
    });

    it('drops trailing slashes from an override', () => {
        expect(resolveSiteUrl('https://example.test///')).toBe('https://example.test');
    });
});

describe('isProductionHost', () => {
    it.each([
        ['aris-maye.com', true],
        ['www.aris-maye.com', true],
        ['ARIS-MAYE.COM', true],
        ['deploy-preview-33--aris-maye.netlify.app', false],
        ['aris-maye.netlify.app', false],
        ['localhost:5173', false],
        ['aris-maye.com.evil.test', false],
    ])('%s -> %p', (host, expected) => {
        expect(isProductionHost(host)).toBe(expected);
    });
});
```

`src/lib/seo/page-seo.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { canonicalPath, canonicalUrl, robotsContent } from './page-seo';

describe('canonicalPath', () => {
    it.each([
        ['/', '/'],
        ['', '/'],
        ['/items/', '/items'],
        ['/items?skill=cooking&page=2', '/items'],
        ['/items/2#prices', '/items/2'],
        ['items/2', '/items/2'],
        ['/items//', '/items'],
    ])('%p -> %p', (input, expected) => {
        expect(canonicalPath(input)).toBe(expected);
    });
});

describe('canonicalUrl', () => {
    it('keeps the trailing slash only on the homepage', () => {
        expect(canonicalUrl('/', 'https://aris-maye.com')).toBe('https://aris-maye.com/');
        expect(canonicalUrl('/items/2?x=1', 'https://aris-maye.com')).toBe('https://aris-maye.com/items/2');
    });

    it('uses the production domain by default', () => {
        expect(canonicalUrl('/items')).toBe('https://aris-maye.com/items');
    });
});

describe('robotsContent', () => {
    it('spells out both directives', () => {
        expect(robotsContent('index')).toBe('index, follow');
        expect(robotsContent('noindex')).toBe('noindex, follow');
    });
});
```

`src/lib/seo/fit-text.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { firstThatFits, truncateAtWord } from './fit-text';

describe('firstThatFits', () => {
    it('returns the first candidate within the limit', () => {
        expect(firstThatFits(['a long candidate', 'short'], 10)).toBe('short');
        expect(firstThatFits(['fits', 'also fits'], 10)).toBe('fits');
    });

    it('truncates the last candidate at a word when none fit', () => {
        const result = firstThatFits(['one two three four five', 'one two three four'], 12);
        expect(result).toBe('one two…');
        expect(result.length).toBeLessThanOrEqual(12);
    });
});

describe('truncateAtWord', () => {
    it('leaves short text alone', () => {
        expect(truncateAtWord('Cannonball', 60)).toBe('Cannonball');
    });

    it('never ends on a dangling separator', () => {
        expect(truncateAtWord('Rune platebody & Recipe: OSRS', 20)).toBe('Rune platebody…');
    });

    it('hard-cuts only a single word longer than the limit', () => {
        expect(truncateAtWord('Supercalifragilistic', 10)).toBe('Supercali…');
    });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun test src/lib/seo`
Expected: FAIL with "Cannot find module './site-url'" (and the same for the other two).

- [ ] **Step 3: Implement**

`src/lib/seo/site-url.ts`:

```ts
const DEFAULT_SITE_URL = 'https://aris-maye.com';

// Only the real domain is allowed into search results. Deploy previews and the netlify.app alias
// serve the same pages, and if they were indexed they would compete with it as duplicates.
const PRODUCTION_HOSTS = new Set(['aris-maye.com', 'www.aris-maye.com']);

/**
 * The origin every canonical URL and sitemap entry points at, whichever host served the request.
 */
export function resolveSiteUrl(raw?: string | null): string {
    const value = raw?.trim();
    if (!value) return DEFAULT_SITE_URL;
    return value.replace(/\/+$/, '');
}

// Read the same way `src/db/mongo.ts` reads its settings, so this works under Vite (server and
// browser) and under Bun scripts and tests alike.
function readSiteUrlSetting(): string | undefined {
    const viaVite = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SITE_URL : undefined;
    if (viaVite) return viaVite;
    return globalThis.process?.env?.VITE_SITE_URL;
}

export const SITE_URL = resolveSiteUrl(readSiteUrlSetting());

export function isProductionHost(host: string): boolean {
    return PRODUCTION_HOSTS.has(host.trim().toLowerCase());
}
```

`src/lib/seo/page-seo.ts`:

```ts
import { SITE_URL } from './site-url';

export type RobotsDirective = 'index' | 'noindex';

/** Everything a page says about itself to search engines and link previews. */
export type PageSeo = {
    title: string;
    description: string;
    canonicalPath: string;
    robots: RobotsDirective;
    image?: string;
    imageAlt?: string;
};

export const DEFAULT_SHARE_IMAGE = '/other-images/share-thumb.png';
export const DEFAULT_SHARE_IMAGE_ALT =
    'Aris Maye, an Old School RuneScape fortune-teller. Find the best things to make using your skill levels. Powered by real-time GE prices.';

/**
 * The path a page should be known by. Query strings carry filters and fragments carry scroll
 * position, so neither makes a different page.
 */
export function canonicalPath(path: string): string {
    const bare = path.split(/[?#]/)[0] ?? '';
    const rooted = bare.startsWith('/') ? bare : `/${bare}`;
    const trimmed = rooted.replace(/\/+$/, '');
    return trimmed || '/';
}

export function canonicalUrl(path: string, base: string = SITE_URL): string {
    const normalized = canonicalPath(path);
    return normalized === '/' ? `${base}/` : `${base}${normalized}`;
}

export function robotsContent(robots: RobotsDirective): string {
    return robots === 'index' ? 'index, follow' : 'noindex, follow';
}
```

`src/lib/seo/fit-text.ts`:

```ts
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;

/**
 * Shortens text to `max` characters at a word boundary, ending in an ellipsis. Search engines cut
 * long titles themselves, mid-word; cutting them here first means we choose what goes.
 */
export function truncateAtWord(text: string, max: number): string {
    if (text.length <= max) return text;
    const room = text.slice(0, max - 1);
    const lastSpace = room.lastIndexOf(' ');
    const kept = lastSpace > 0 ? room.slice(0, lastSpace) : room;
    return `${kept.replace(/[\s,:;&-]+$/, '')}…`;
}

/**
 * Picks the first candidate that fits. Callers list their phrasings from fullest to barest, so a
 * long item name drops whole clauses rather than being cut off.
 */
export function firstThatFits(candidates: string[], max: number): string {
    for (const candidate of candidates) {
        if (candidate.length <= max) return candidate;
    }
    return truncateAtWord(candidates[candidates.length - 1] ?? '', max);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun test src/lib/seo`
Expected: PASS, 0 fail. (If `canonicalUrl('/items')` fails, `VITE_SITE_URL` is set in your shell. Unset it.)

- [ ] **Step 5: Update the spec's env var name**

In `docs/superpowers/specs/2026-10-14-seo-foundation-design.md`, replace every `PUBLIC_SITE_URL` with `VITE_SITE_URL`.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/lib/seo docs/superpowers/specs/2026-10-14-seo-foundation-design.md
git add src/lib/seo docs/superpowers/specs/2026-10-14-seo-foundation-design.md
git commit -m "Add the site URL, page SEO types and text fitting helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf"
```

---

### Task 2: Item and static page SEO builders

**Files:**

- Create: `src/lib/models/item-used-in.ts`, `src/lib/seo/item-seo.ts`, `src/lib/seo/static-page-seo.ts`
- Test: `src/lib/seo/item-seo.test.ts`, `src/lib/seo/static-page-seo.test.ts`
- Modify: `src/lib/models/osrsbox-db-item.ts:168-177` (add `usedIn?: ItemUsedIn`)

**Interfaces:**

- Consumes: `PageSeo`, `firstThatFits`, `TITLE_MAX`, `DESCRIPTION_MAX` (Task 1); `getPrimaryCreationSpec` (`src/lib/helpers/creation-specs.ts`); `skillLabel` (`src/lib/helpers/homepage.ts`); `SkillTreePage` (`src/lib/constants/skill-tree-pages.ts`)
- Produces:
    - `type UsedInRecipe = { id: number; name: string; icon: string | null; skill: string | null; level: number | null }`, `type ItemUsedIn = { items: UsedInRecipe[]; total: number }`, `EMPTY_USED_IN`, `USED_IN_LIMIT = 50`
    - `hasRecipe(item)`, `isIndexableItem(item, usedInTotal: number): boolean`
    - `buildItemSeo(item: IOsrsboxItemWithMeta, usedIn: ItemUsedIn): PageSeo`, `buildItemNotFoundSeo(path: string): PageSeo`, `buildItemLoadingSeo(path: string): PageSeo`
    - `itemPageSeo(state: { itemId: string; gameItem: IOsrsboxItemWithMeta | null; loadProblem: 'missing' | 'failed' | null }): PageSeo`
    - `homeSeo`, `itemsSeo`, `favoritesSeo`, `hiddenSeo`, `myCharacterSeo`, `addItemSeo: PageSeo`, `buildSkillSeo(skill: SkillTreePage): PageSeo`

- [ ] **Step 1: Add the "Used in" model**

`src/lib/models/item-used-in.ts`:

```ts
/** One recipe an item goes into, as listed in the item page's "Used in" card. */
export type UsedInRecipe = {
    id: number;
    name: string;
    icon: string | null;
    /** From the spec that uses the ingredient, so a multi-recipe item shows the relevant level. */
    skill: string | null;
    level: number | null;
};

/**
 * `total` counts every recipe, while `items` is capped at `USED_IN_LIMIT`, so tools like a
 * hammer can say how many recipes they're in without sending hundreds of rows.
 */
export type ItemUsedIn = {
    items: UsedInRecipe[];
    total: number;
};

export const USED_IN_LIMIT = 50;

export const EMPTY_USED_IN: ItemUsedIn = { items: [], total: 0 };
```

In `src/lib/models/osrsbox-db-item.ts`, add `import type { ItemUsedIn } from './item-used-in';` at the top, and add `usedIn?: ItemUsedIn;` to the object type in `IOsrsboxItemWithMeta`, after `wikiName?: string | null;`.

- [ ] **Step 2: Write the failing tests**

`src/lib/seo/item-seo.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import type { ItemUsedIn } from '$lib/models/item-used-in';
import { EMPTY_USED_IN } from '$lib/models/item-used-in';
import { buildItemSeo, isIndexableItem, itemPageSeo } from './item-seo';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from './fit-text';

function makeItem(overrides: Partial<IOsrsboxItemWithMeta> = {}): IOsrsboxItemWithMeta {
    return { id: 2, name: 'Cannonball', icon: '', examine: '', ...overrides } as IOsrsboxItemWithMeta;
}

const smithingSpec = {
    requiredSkills: [{ skillName: 'Smithing', skillLevel: 35 }],
    experienceGranted: [{ skillName: 'Smithing', experienceAmount: 25.6 }],
    ingredients: [{ item: 'abc', amount: 1, consumedDuringCreation: true }],
};

function usedIn(total: number, names: string[]): ItemUsedIn {
    return {
        total,
        items: names.map((name, i) => ({ id: 100 + i, name, icon: null, skill: 'Smithing', level: 1 + i })),
    };
}

function expectWithinLimits(seo: { title: string; description: string }) {
    expect(seo.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(seo.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    expect(seo.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
}

describe('isIndexableItem', () => {
    it.each([
        [true, 0, true],
        [true, 3, true],
        [false, 3, true],
        [false, 0, false],
    ])('recipe=%p usedIn=%p -> %p', (recipe, total, expected) => {
        const item = makeItem({ creationSpecs: recipe ? [smithingSpec as never] : [] });
        expect(isIndexableItem(item, total)).toBe(expected);
    });
});

describe('buildItemSeo', () => {
    it('names the skill and level for an item with a recipe', () => {
        const seo = buildItemSeo(makeItem({ creationSpecs: [smithingSpec as never] }), EMPTY_USED_IN);
        expect(seo.title).toBe('Cannonball Profit & Recipe: OSRS Smithing 35');
        expect(seo.description).toBe(
            'How to make Cannonball in OSRS: needs Smithing 35, gives 25.6 Smithing XP. See ingredient costs and profit from live GE prices, updated hourly.',
        );
        expect(seo.robots).toBe('index');
        expect(seo.canonicalPath).toBe('/items/2');
        expectWithinLimits(seo);
    });

    it('drops the skill tail before the recipe wording when the name is long', () => {
        const name = 'Dragonfire ward (uncharged) ornament kit';
        const seo = buildItemSeo(makeItem({ name, creationSpecs: [smithingSpec as never] }), EMPTY_USED_IN);
        expect(seo.title).toBe(`${name} Profit & Recipe`);
        expectWithinLimits(seo);
    });

    it('leaves the skill out when the recipe has no skill data', () => {
        const spec = { ...smithingSpec, requiredSkills: [], experienceGranted: [] };
        const seo = buildItemSeo(makeItem({ creationSpecs: [spec as never] }), EMPTY_USED_IN);
        expect(seo.title).toBe('Cannonball Profit & Recipe');
        expect(seo.description.startsWith('How to make Cannonball in OSRS. ')).toBe(true);
        expectWithinLimits(seo);
    });

    it('describes an ingredient-only item by what it goes into', () => {
        const seo = buildItemSeo(makeItem({ name: 'Iron ore' }), usedIn(12, ['Iron bar', 'Steel bar']));
        expect(seo.title).toBe('Iron ore: OSRS Price & What You Can Make With It');
        expect(seo.description).toBe(
            'Iron ore is used in 12 OSRS recipes, including Iron bar and Steel bar. See its live GE price and what you can make with it.',
        );
        expect(seo.robots).toBe('index');
        expectWithinLimits(seo);
    });

    it('reads naturally when an ingredient has a single use', () => {
        const seo = buildItemSeo(makeItem({ name: 'Ball of wool' }), usedIn(1, ['Amulet of strength']));
        expect(seo.description.startsWith('Ball of wool is used to make Amulet of strength in OSRS.')).toBe(true);
        expectWithinLimits(seo);
    });

    it('quotes the real count for a tool used in hundreds of recipes', () => {
        const seo = buildItemSeo(makeItem({ name: 'Hammer' }), usedIn(312, ['Bronze dagger', 'Bronze axe']));
        expect(seo.description).toContain('312 OSRS recipes');
    });

    it('marks an item with neither a recipe nor a use as noindex', () => {
        const seo = buildItemSeo(makeItem({ name: 'Bucket' }), EMPTY_USED_IN);
        expect(seo.title).toBe('Bucket: OSRS GE Price');
        expect(seo.robots).toBe('noindex');
    });

    it.each(["Zamorak's unholy book & quill", 'Saradomin brew(4)', 'Ring of "luck"'])(
        'keeps %p within limits',
        (name) => {
            const seo = buildItemSeo(makeItem({ name, creationSpecs: [smithingSpec as never] }), EMPTY_USED_IN);
            expectWithinLimits(seo);
            expect(seo.title.startsWith(name)).toBe(true);
        },
    );
});

describe('itemPageSeo', () => {
    const cannonball = makeItem({ creationSpecs: [smithingSpec as never] });

    it('shows a loading title rather than the previous item while the next one loads', () => {
        const seo = itemPageSeo({ itemId: '99', gameItem: cannonball, loadProblem: null });
        expect(seo.title).toBe('Loading item · Aris Maye');
        expect(seo.canonicalPath).toBe('/items/99');
    });

    it('uses the item once it matches the route', () => {
        const seo = itemPageSeo({ itemId: '2', gameItem: cannonball, loadProblem: null });
        expect(seo.title).toBe('Cannonball Profit & Recipe: OSRS Smithing 35');
    });

    it('marks a missing or failed item as noindex', () => {
        for (const loadProblem of ['missing', 'failed'] as const) {
            const seo = itemPageSeo({ itemId: '2', gameItem: null, loadProblem });
            expect(seo.title).toBe('Item not found · Aris Maye');
            expect(seo.robots).toBe('noindex');
        }
    });
});
```

`src/lib/seo/static-page-seo.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { skillTreePages } from '$lib/constants/skill-tree-pages';
import {
    addItemSeo,
    buildSkillSeo,
    favoritesSeo,
    hiddenSeo,
    homeSeo,
    itemsSeo,
    myCharacterSeo,
} from './static-page-seo';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from './fit-text';

describe('static page SEO', () => {
    it.each([
        ['home', homeSeo],
        ['items', itemsSeo],
        ...skillTreePages.map((skill) => [skill.slug, buildSkillSeo(skill)] as const),
    ])('%s is indexable and within limits', (_, seo) => {
        expect(seo.robots).toBe('index');
        expect(seo.title.length).toBeLessThanOrEqual(TITLE_MAX);
        expect(seo.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
        expect(seo.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    });

    it('titles skill pages by skill', () => {
        const cooking = skillTreePages.find((s) => s.slug === 'cooking')!;
        expect(buildSkillSeo(cooking).title).toBe('Best OSRS Cooking Money Makers & Profits');
    });

    it('uses the lowercase slug as the canonical path whatever the URL casing', () => {
        const cooking = skillTreePages.find((s) => s.slug === 'cooking')!;
        expect(buildSkillSeo(cooking).canonicalPath).toBe('/items/cooking');
    });

    it('keeps personal pages out of the index', () => {
        for (const seo of [favoritesSeo, hiddenSeo, myCharacterSeo, addItemSeo]) {
            expect(seo.robots).toBe('noindex');
        }
    });

    it('gives every fixed page a different title', () => {
        const titles = [homeSeo, itemsSeo, favoritesSeo, hiddenSeo, myCharacterSeo, addItemSeo].map((s) => s.title);
        expect(new Set(titles).size).toBe(titles.length);
    });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `bun test src/lib/seo`
Expected: FAIL with "Cannot find module './item-seo'" and "./static-page-seo".

- [ ] **Step 4: Implement**

`src/lib/seo/item-seo.ts`:

```ts
import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
import { skillLabel } from '$lib/helpers/homepage';
import { EMPTY_USED_IN, type ItemUsedIn } from '$lib/models/item-used-in';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
import { DESCRIPTION_MAX, TITLE_MAX, firstThatFits } from './fit-text';
import type { PageSeo } from './page-seo';

type ItemPageState = {
    itemId: string;
    gameItem: IOsrsboxItemWithMeta | null;
    loadProblem: 'missing' | 'failed' | null;
};

export function hasRecipe(item: Pick<IOsrsboxItemWithMeta, 'creationSpecs'>): boolean {
    return (item.creationSpecs?.length ?? 0) > 0;
}

/**
 * The only rule for whether an item page belongs in search results. The sitemap query selects
 * the same set, so the two must change together.
 */
export function isIndexableItem(item: Pick<IOsrsboxItemWithMeta, 'creationSpecs'>, usedInTotal: number): boolean {
    return hasRecipe(item) || usedInTotal > 0;
}

function formatXp(amount: number): string {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function recipeFacts(item: IOsrsboxItemWithMeta) {
    const spec = getPrimaryCreationSpec(item);
    const requirement = spec?.requiredSkills?.find(
        (req) => req.skillName && typeof req.skillLevel === 'number' && Number.isFinite(req.skillLevel),
    );
    const xp = spec?.experienceGranted?.find(
        (grant) => grant.skillName && typeof grant.experienceAmount === 'number' && grant.experienceAmount > 0,
    );
    return {
        skill: requirement ? skillLabel(requirement.skillName) : null,
        level: requirement?.skillLevel ?? null,
        xp: xp ? `${formatXp(xp.experienceAmount)} ${skillLabel(xp.skillName)} XP` : null,
    };
}

function recipeSeo(item: IOsrsboxItemWithMeta, path: string): PageSeo {
    const { name } = item;
    const { skill, level, xp } = recipeFacts(item);
    const skillTail = skill && level !== null ? `: OSRS ${skill} ${level}` : '';
    const needs = skill && level !== null ? `: needs ${skill} ${level}` : '';
    const gives = xp ? `, gives ${xp}` : '';
    const lead = `How to make ${name} in OSRS${needs}${gives}.`;

    return {
        title: firstThatFits(
            [`${name} Profit & Recipe${skillTail}`, `${name} Profit & Recipe`, `${name} Profit`],
            TITLE_MAX,
        ),
        description: firstThatFits(
            [
                `${lead} See ingredient costs and profit from live GE prices, updated hourly.`,
                `${lead} See costs and profit from live GE prices.`,
                lead,
            ],
            DESCRIPTION_MAX,
        ),
        canonicalPath: path,
        robots: 'index',
    };
}

function ingredientSeo(item: IOsrsboxItemWithMeta, usedIn: ItemUsedIn, path: string): PageSeo {
    const { name } = item;
    const [first, second] = usedIn.items.map((recipe) => recipe.name);
    const tail = ' See its live GE price and what you can make with it.';

    // A single use reads better named outright than as "1 recipes, including ...".
    const candidates =
        usedIn.total === 1 && first
            ? [`${name} is used to make ${first} in OSRS.${tail}`, `${name} is used to make ${first} in OSRS.`]
            : [
                  `${name} is used in ${usedIn.total} OSRS recipes, including ${second ? `${first} and ${second}` : first}.${tail}`,
                  `${name} is used in ${usedIn.total} OSRS recipes.${tail}`,
                  `${name} is used in ${usedIn.total} OSRS recipes.`,
              ];

    return {
        title: firstThatFits([`${name}: OSRS Price & What You Can Make With It`, `${name}: OSRS Price`], TITLE_MAX),
        description: firstThatFits(candidates, DESCRIPTION_MAX),
        canonicalPath: path,
        robots: 'index',
    };
}

function priceOnlySeo(item: IOsrsboxItemWithMeta, path: string): PageSeo {
    const { name } = item;
    return {
        title: firstThatFits([`${name}: OSRS GE Price`], TITLE_MAX),
        description: firstThatFits(
            [
                `${name} in OSRS: live Grand Exchange price, high and low alch values and base value, updated hourly.`,
                `${name}: live OSRS Grand Exchange price and alch values.`,
            ],
            DESCRIPTION_MAX,
        ),
        canonicalPath: path,
        robots: 'noindex',
    };
}

export function buildItemSeo(item: IOsrsboxItemWithMeta, usedIn: ItemUsedIn): PageSeo {
    const path = `/items/${item.id}`;
    if (hasRecipe(item)) return recipeSeo(item, path);
    if (usedIn.total > 0) return ingredientSeo(item, usedIn, path);
    return priceOnlySeo(item, path);
}

export function buildItemNotFoundSeo(path: string): PageSeo {
    return {
        title: 'Item not found · Aris Maye',
        description:
            "We couldn't find that item. Browse OSRS items to see live GE prices, recipes and profit for everything you can make.",
        canonicalPath: path,
        robots: 'noindex',
    };
}

export function buildItemLoadingSeo(path: string): PageSeo {
    return {
        title: 'Loading item · Aris Maye',
        description: 'Live OSRS Grand Exchange prices, recipes and profit for this item, updated hourly.',
        canonicalPath: path,
        robots: 'noindex',
    };
}

/**
 * What the item page says about itself at any moment. The item kept in state can still be the
 * previous one while a client-side navigation loads the next, so it only counts once its id
 * matches the route.
 */
export function itemPageSeo({ itemId, gameItem, loadProblem }: ItemPageState): PageSeo {
    const path = `/items/${itemId}`;
    if (loadProblem) return buildItemNotFoundSeo(path);
    if (!gameItem || String(gameItem.id) !== String(itemId)) return buildItemLoadingSeo(path);
    return buildItemSeo(gameItem, gameItem.usedIn ?? EMPTY_USED_IN);
}
```

`src/lib/seo/static-page-seo.ts`:

```ts
import type { SkillTreePage } from '$lib/constants/skill-tree-pages';
import type { PageSeo } from './page-seo';

export const homeSeo: PageSeo = {
    title: 'Aris Maye: Find the Best OSRS Items to Craft & Profit',
    description: 'Find the best things to make using your skill levels, powered by real-time GE prices on Aris Maye.',
    canonicalPath: '/',
    robots: 'index',
};

export const itemsSeo: PageSeo = {
    title: 'OSRS Money Making & Crafting Profits, Updated Hourly',
    description:
        'Every OSRS item you can make, ranked by profit from live Grand Exchange prices and filtered to your skill levels.',
    canonicalPath: '/items',
    robots: 'index',
};

export function buildSkillSeo(skill: SkillTreePage): PageSeo {
    return {
        title: `Best OSRS ${skill.title} Money Makers & Profits`,
        description: `The most profitable things to make with ${skill.title} in OSRS, ranked by live GE prices and filtered to your levels.`,
        // The route matches any casing, so the slug, not the URL, decides the canonical.
        canonicalPath: `/items/${skill.slug}`,
        robots: 'index',
    };
}

// These pages show what is stored in the visitor's own browser, so a crawler would only ever see
// an empty state. They stay out of the index.
export const favoritesSeo: PageSeo = {
    title: 'Favorites · Aris Maye',
    description: 'The OSRS items you have starred on Aris Maye, with live Grand Exchange prices.',
    canonicalPath: '/favorites',
    robots: 'noindex',
};

export const hiddenSeo: PageSeo = {
    title: 'Hidden items · Aris Maye',
    description: 'The OSRS items you have hidden from your lists on Aris Maye.',
    canonicalPath: '/hidden',
    robots: 'noindex',
};

export const myCharacterSeo: PageSeo = {
    title: 'My character · Aris Maye',
    description: 'Your OSRS characters, skill levels and supplies, used to filter what you can make on Aris Maye.',
    canonicalPath: '/my-character',
    robots: 'noindex',
};

export const addItemSeo: PageSeo = {
    title: 'Add item · Aris Maye',
    description: 'Add an OSRS item to Aris Maye.',
    canonicalPath: '/items/new',
    robots: 'noindex',
};
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `bun test src/lib/seo`
Expected: PASS. If a length assertion fails, adjust the fallback candidates, not the test limits.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/lib/seo src/lib/models/item-used-in.ts src/lib/models/osrsbox-db-item.ts
git add src/lib/seo src/lib/models/item-used-in.ts src/lib/models/osrsbox-db-item.ts
git commit -m "Build titles, descriptions and robots rules for each page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf"
```

---

### Task 3: "Used in" data and the item endpoint

**Files:**

- Create: `src/lib/helpers/item-used-in.ts`
- Test: `src/lib/helpers/item-used-in.test.ts`
- Modify: `src/lib/services/game-item-mongo-service.server.ts` (around `getGameItemById`, line 284), `src/lib/models/mongo-schemas/osrsbox-db-item-schema.ts:155-158`, `src/routes/api/game-item/+server.ts`

**Interfaces:**

- Consumes: `ItemUsedIn`, `UsedInRecipe`, `EMPTY_USED_IN`, `USED_IN_LIMIT` (Task 2)
- Produces:
    - `type RecipeDoc`, `toUsedInRecipe(doc: RecipeDoc, ingredientId: string): UsedInRecipe`, `buildUsedIn(docs: RecipeDoc[], ingredientId: string, limit?: number): ItemUsedIn`, `loadUsedInSafely(load: () => Promise<ItemUsedIn>): Promise<ItemUsedIn>`
    - `getRecipesUsingItem(itemObjectId: unknown): Promise<ItemUsedIn>`, `getIndexableItemIds(): Promise<number[]>` (service)
    - `/api/game-item` response gains `usedIn: ItemUsedIn` and `creationSpecs` (requiredSkills, experienceGranted, ingredients)

- [ ] **Step 1: Write the failing tests**

`src/lib/helpers/item-used-in.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { buildUsedIn, loadUsedInSafely, toUsedInRecipe, type RecipeDoc } from './item-used-in';

const ORE = 'ore0000000000000000000a';
const COAL = 'coal000000000000000000b';

function doc(id: number, name: string, specs: RecipeDoc['creationSpecs']): RecipeDoc {
    return { id, name, icon: null, creationSpecs: specs };
}

describe('toUsedInRecipe', () => {
    it('takes the level from the spec that actually uses the ingredient', () => {
        const recipe = toUsedInRecipe(
            doc(1, 'Steel bar', [
                { requiredSkills: [{ skillName: 'Smithing', skillLevel: 99 }], ingredients: [{ item: COAL }] },
                { requiredSkills: [{ skillName: 'Smithing', skillLevel: 30 }], ingredients: [{ item: ORE }] },
            ]),
            ORE,
        );
        expect(recipe).toEqual({ id: 1, name: 'Steel bar', icon: null, skill: 'Smithing', level: 30 });
    });

    it('leaves skill and level empty when the spec has none', () => {
        const recipe = toUsedInRecipe(doc(1, 'Thing', [{ requiredSkills: [], ingredients: [{ item: ORE }] }]), ORE);
        expect(recipe.skill).toBeNull();
        expect(recipe.level).toBeNull();
    });
});

describe('buildUsedIn', () => {
    const spec = (level: number | null) => [
        {
            requiredSkills: level === null ? [] : [{ skillName: 'Smithing', skillLevel: level }],
            ingredients: [{ item: ORE }],
        },
    ];

    it('sorts by level, then name, with unlevelled recipes last', () => {
        const result = buildUsedIn(
            [doc(1, 'Zeta', spec(10)), doc(2, 'Alpha', spec(10)), doc(3, 'None', spec(null)), doc(4, 'Low', spec(1))],
            ORE,
        );
        expect(result.items.map((r) => r.name)).toEqual(['Low', 'Alpha', 'Zeta', 'None']);
    });

    it('counts every recipe but caps the list, so tools report their real total', () => {
        const docs = Array.from({ length: 312 }, (_, i) => doc(i + 1, `Item ${i}`, spec(i % 99)));
        const result = buildUsedIn(docs, ORE, 50);
        expect(result.total).toBe(312);
        expect(result.items).toHaveLength(50);
    });

    it('lists an item once even if the query returns it twice', () => {
        const result = buildUsedIn([doc(1, 'Steel bar', spec(30)), doc(1, 'Steel bar', spec(30))], ORE);
        expect(result.total).toBe(1);
    });
});

describe('loadUsedInSafely', () => {
    it('falls back to empty when the lookup fails, so the item page still loads', async () => {
        const result = await loadUsedInSafely(async () => {
            throw new Error('mongo down');
        });
        expect(result).toEqual({ items: [], total: 0 });
    });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun test src/lib/helpers/item-used-in.test.ts`
Expected: FAIL with "Cannot find module './item-used-in'".

- [ ] **Step 3: Implement the helper**

`src/lib/helpers/item-used-in.ts`:

```ts
import { EMPTY_USED_IN, USED_IN_LIMIT, type ItemUsedIn, type UsedInRecipe } from '$lib/models/item-used-in';

/** The slice of an item document the "Used in" query reads. */
export type RecipeDoc = {
    id: number;
    name: string;
    icon?: string | null;
    creationSpecs?: Array<{
        requiredSkills?: Array<{ skillName?: string; skillLevel?: number }>;
        ingredients?: Array<{ item: unknown }>;
    }>;
};

export function toUsedInRecipe(doc: RecipeDoc, ingredientId: string): UsedInRecipe {
    const specs = doc.creationSpecs ?? [];
    // An item can have several recipes; the level that matters is the one for the recipe that
    // takes this ingredient.
    const spec = specs.find((s) => s.ingredients?.some((i) => String(i.item) === ingredientId)) ?? specs[0];
    const requirement = spec?.requiredSkills?.find((r) => r.skillName && typeof r.skillLevel === 'number');
    return {
        id: doc.id,
        name: doc.name,
        icon: doc.icon ?? null,
        skill: requirement?.skillName ?? null,
        level: requirement?.skillLevel ?? null,
    };
}

function compareUsedIn(a: UsedInRecipe, b: UsedInRecipe): number {
    if (a.level === null && b.level !== null) return 1;
    if (b.level === null && a.level !== null) return -1;
    if (a.level !== b.level) return (a.level ?? 0) - (b.level ?? 0);
    return a.name.localeCompare(b.name);
}

export function buildUsedIn(docs: RecipeDoc[], ingredientId: string, limit = USED_IN_LIMIT): ItemUsedIn {
    const seen = new Set<number>();
    const rows: UsedInRecipe[] = [];
    for (const doc of docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        rows.push(toUsedInRecipe(doc, ingredientId));
    }
    rows.sort(compareUsedIn);
    return { items: rows.slice(0, limit), total: rows.length };
}

/**
 * "Used in" is extra. If it fails, the item page should still load with it left out, rather than
 * the whole item failing with it.
 */
export async function loadUsedInSafely(load: () => Promise<ItemUsedIn>): Promise<ItemUsedIn> {
    try {
        return await load();
    } catch (error) {
        console.error('Failed to load "Used in" recipes', error);
        return { ...EMPTY_USED_IN, items: [] };
    }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun test src/lib/helpers/item-used-in.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the index**

In `src/lib/models/mongo-schemas/osrsbox-db-item-schema.ts`, after the `volume1h` index (line 158), add:

```ts
// Serves the item page's "Used in" lookup and the sitemap's ingredient list, which would
// otherwise scan every item's recipes.
osrsboxItemSchema.index({ 'creationSpecs.ingredients.item': 1 });
```

- [ ] **Step 6: Add the service functions and widen `getGameItemById`**

In `src/lib/services/game-item-mongo-service.server.ts`:

1. Add imports at the top with the others:
    ```ts
    import { buildUsedIn, type RecipeDoc } from '$lib/helpers/item-used-in';
    import type { ItemUsedIn } from '$lib/models/item-used-in';
    ```
2. In `getGameItemById`'s `.select({...})`, add after `wiki_page_title: 1,`:
    ```ts
                // Enough of the recipes to title and describe the page, without the full tree.
                'creationSpecs.requiredSkills': 1,
                'creationSpecs.experienceGranted': 1,
                'creationSpecs.ingredients': 1,
    ```
    First run `grep -rn "getGameItemById" src netlify scripts` and confirm the only caller is `src/routes/api/game-item/+server.ts`. The item page reads recipes from `treeItem`, not `gameItem` (`+page.svelte:373`), so the extra fields don't change what it renders.
3. Add, directly after `getGameItemById`:

    ```ts
    /**
     * The recipes that take this item as an ingredient, for the item page's "Used in" card.
     * @param itemObjectId - The ingredient's Mongo `_id`, which is what recipes reference.
     */
    export async function getRecipesUsingItem(itemObjectId: unknown): Promise<ItemUsedIn> {
        const docs = await OsrsboxItemModel.find({
            'creationSpecs.ingredients.item': itemObjectId,
            _id: { $ne: itemObjectId },
        })
            .select({
                _id: 0,
                id: 1,
                name: 1,
                icon: 1,
                'creationSpecs.requiredSkills': 1,
                'creationSpecs.ingredients.item': 1,
            })
            .lean<RecipeDoc[]>()
            .exec();
        return buildUsedIn(docs, String(itemObjectId));
    }

    /**
     * Every item id whose page belongs in the sitemap: items with a recipe, plus items used as an
     * ingredient. This must select the same set as `isIndexableItem`.
     */
    export async function getIndexableItemIds(): Promise<number[]> {
        const [craftable, ingredientRefs] = await Promise.all([
            OsrsboxItemModel.find({ 'creationSpecs.0': { $exists: true } })
                .select({ _id: 0, id: 1 })
                .lean<{ id: number }[]>()
                .exec(),
            OsrsboxItemModel.distinct('creationSpecs.ingredients.item').exec(),
        ]);
        const ingredients = ingredientRefs.length
            ? await OsrsboxItemModel.find({ _id: { $in: ingredientRefs } })
                  .select({ _id: 0, id: 1 })
                  .lean<{ id: number }[]>()
                  .exec()
            : [];
        const ids = new Set<number>();
        for (const { id } of [...craftable, ...ingredients]) {
            if (Number.isInteger(id)) ids.add(id);
        }
        return [...ids].sort((a, b) => a - b);
    }
    ```

- [ ] **Step 7: Return `usedIn` from the endpoint**

Replace `src/routes/api/game-item/+server.ts` with:

```ts
import type { RequestHandler } from '@sveltejs/kit';
import { getGameItemById, getRecipesUsingItem } from '$lib/services/game-item-mongo-service.server';
import { loadUsedInSafely } from '$lib/helpers/item-used-in';

export const GET: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) {
        return new Response('Missing "id" query parameter.', { status: 400 });
    }

    const item = await getGameItemById(id);
    if (!item) {
        return new Response('Item not found.', { status: 404 });
    }

    // Carried on the same response so the item page's title, robots tag and "Used in" card are all
    // in its server render, with no second request.
    const usedIn = await loadUsedInSafely(() => getRecipesUsingItem((item as { _id?: unknown })._id));

    return new Response(JSON.stringify({ ...item, usedIn }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
```

- [ ] **Step 8: Type-check, test, smoke-test**

Run: `bun run check && bun test`
Expected: 0 errors, all tests pass.

Then run `bun run dev` in the background and `curl -s 'http://localhost:5173/api/game-item?id=440' | bun -e 'const j=await Bun.stdin.json(); console.log(j.name, j.usedIn.total, j.usedIn.items.slice(0,3))'` (440 is Iron ore).
Expected: `Iron ore` with a non-zero total and rows such as Iron bar. Stop the dev server.

- [ ] **Step 9: Format and commit**

```bash
npx prettier --write src/lib/helpers/item-used-in.ts src/lib/helpers/item-used-in.test.ts src/lib/services/game-item-mongo-service.server.ts src/lib/models/mongo-schemas/osrsbox-db-item-schema.ts src/routes/api/game-item/+server.ts
git add -A src/lib/helpers src/lib/services src/lib/models src/routes/api/game-item
git commit -m "Return the recipes an item is used in from the item endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf"
```

---

### Task 4: `<SeoHead>` on every page except the item page

**Files:**

- Create: `src/lib/components/global/seo-head.svelte`
- Test: `src/lib/seo/seo-coverage.test.ts`
- Modify: `src/routes/+layout.svelte:13-20,39-56`, `src/routes/+page.svelte`, `src/routes/items/+page.svelte`, `src/routes/items/[skill=skill]/+page.svelte`, `src/routes/favorites/+page.svelte`, `src/routes/hidden/+page.svelte`, `src/routes/my-character/+page.svelte`, `src/routes/items/new/+page.svelte` (currently empty)

**Interfaces:**

- Consumes: `PageSeo`, `canonicalUrl`, `robotsContent`, `DEFAULT_SHARE_IMAGE`, `DEFAULT_SHARE_IMAGE_ALT`, `SITE_URL` (Task 1); the static builders (Task 2)
- Produces: `<SeoHead seo={PageSeo} />`

- [ ] **Step 1: Write the failing guard tests**

`src/lib/seo/seo-coverage.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routesDir = join(import.meta.dir, '../../routes');
const pages = [...new Glob('**/+page.svelte').scanSync({ cwd: routesDir })];

describe('SEO coverage', () => {
    it('finds the route pages', () => {
        expect(pages.length).toBeGreaterThanOrEqual(8);
    });

    // A page without SeoHead would ship with no title at all now that the layout no longer
    // provides one.
    it.each(pages)('%s renders SeoHead', (page) => {
        const source = readFileSync(join(routesDir, page), 'utf8');
        expect(source).toContain("import SeoHead from '$lib/components/global/seo-head.svelte'");
        expect(source).toMatch(/<SeoHead\s/);
    });

    it('leaves per-page tags out of the layout, so none appear twice', () => {
        const layout = readFileSync(join(routesDir, '+layout.svelte'), 'utf8');
        for (const tag of [
            '<title>',
            'name="description"',
            'og:title',
            'og:description',
            'og:url',
            'og:image',
            'twitter:title',
        ]) {
            expect(layout).not.toContain(tag);
        }
    });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun test src/lib/seo/seo-coverage.test.ts`
Expected: FAIL on every page and on the layout.

- [ ] **Step 3: Create the component**

`src/lib/components/global/seo-head.svelte`:

```svelte
<script lang="ts">
    import {
        DEFAULT_SHARE_IMAGE,
        DEFAULT_SHARE_IMAGE_ALT,
        canonicalUrl,
        robotsContent,
        type PageSeo,
    } from '$lib/seo/page-seo';
    import { SITE_URL } from '$lib/seo/site-url';

    /**
     * The tags a page uses to describe itself to search engines and link previews. Each page
     * renders exactly one; the layout keeps only the tags that are the same everywhere.
     */
    const { seo }: { seo: PageSeo } = $props();

    const url = $derived(canonicalUrl(seo.canonicalPath));
    const image = $derived(`${SITE_URL}${seo.image ?? DEFAULT_SHARE_IMAGE}`);
    const imageAlt = $derived(seo.imageAlt ?? DEFAULT_SHARE_IMAGE_ALT);
</script>

<svelte:head>
    <title>{seo.title}</title>
    <meta name="description" content={seo.description} />
    <link rel="canonical" href={url} />
    <meta name="robots" content={robotsContent(seo.robots)} />

    <meta property="og:title" content={seo.title} />
    <meta property="og:description" content={seo.description} />
    <meta property="og:url" content={url} />
    <meta property="og:image" content={image} />
    <meta property="og:image:alt" content={imageAlt} />

    <meta name="twitter:title" content={seo.title} />
    <meta name="twitter:description" content={seo.description} />
    <meta name="twitter:image" content={image} />
</svelte:head>
```

- [ ] **Step 4: Cut the layout down to the shared tags**

In `src/routes/+layout.svelte`, delete the `shareTitle`, `shareDescription`, `shareImageAlt`, `baseUrl` and `shareImageUrl` constants (lines 14-20). Replace the whole `<svelte:head>` block (lines 39-56) with:

```svelte
<svelte:head>
    <!-- Only the tags that are the same on every page. Each page renders its own title,
         description, canonical and share tags through SeoHead. -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Aris Maye" />
    <meta name="twitter:card" content="summary_large_image" />
</svelte:head>
```

Keep `src/routes/+layout.server.ts` as it is (`baseUrl` there is now unused but harmless). `data` is still used for `showDevControls`.

- [ ] **Step 5: Add `<SeoHead>` to each page**

`src/routes/+page.svelte`: add the imports in the script and the tag above `<SiteHero>`:

```svelte
import SeoHead from '$lib/components/global/seo-head.svelte'; import {homeSeo} from '$lib/seo/static-page-seo';
```

```svelte
<SeoHead seo={homeSeo} />
```

`src/routes/items/+page.svelte`:

```svelte
<script lang="ts">
    import GameItemsPage from '$lib/components/items/game-items-page.svelte';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { itemsSeo } from '$lib/seo/static-page-seo';
</script>

<SeoHead seo={itemsSeo} />

<GameItemsPage heading="Browse items" />
```

`src/routes/items/[skill=skill]/+page.svelte`:

```svelte
<script lang="ts">
    import GameItemsPage from '$lib/components/items/game-items-page.svelte';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { buildSkillSeo } from '$lib/seo/static-page-seo';

    const { data } = $props();
    const skill = $derived(data.skill);
    const seo = $derived(buildSkillSeo(data.skill));
</script>

<SeoHead {seo} />

{#key skill?.slug ?? 'all'}
    <GameItemsPage {skill} />
{/key}
```

`src/routes/favorites/+page.svelte`: add to the script block's imports

```svelte
import SeoHead from '$lib/components/global/seo-head.svelte'; import {favoritesSeo} from '$lib/seo/static-page-seo';
```

and right after `</script>`:

```svelte
<SeoHead seo={favoritesSeo} />
```

`src/routes/hidden/+page.svelte`: add to the script block's imports

```svelte
import SeoHead from '$lib/components/global/seo-head.svelte'; import {hiddenSeo} from '$lib/seo/static-page-seo';
```

and right after `</script>`:

```svelte
<SeoHead seo={hiddenSeo} />
```

`src/routes/my-character/+page.svelte`: add to the script block's imports

```svelte
import SeoHead from '$lib/components/global/seo-head.svelte'; import {myCharacterSeo} from '$lib/seo/static-page-seo';
```

and right after `</script>` (line 353):

```svelte
<SeoHead seo={myCharacterSeo} />
```

`src/routes/items/new/+page.svelte` (empty today):

```svelte
<script lang="ts">
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { addItemSeo } from '$lib/seo/static-page-seo';
</script>

<SeoHead seo={addItemSeo} />
```

The item page (`src/routes/items/[id=integer]/+page.svelte`) is left for Task 5. Its guard case will keep failing until then. That is expected.

- [ ] **Step 6: Run the guard and the checks**

Run: `bun test src/lib/seo/seo-coverage.test.ts`
Expected: every case passes except `items/[id=integer]/+page.svelte renders SeoHead`.

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/components/global/seo-head.svelte src/lib/seo/seo-coverage.test.ts src/routes
git add src/lib/components/global/seo-head.svelte src/lib/seo/seo-coverage.test.ts src/routes
git commit -m "Give each page its own title, description, canonical and robots tag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf"
```

---

### Task 5: Item page SEO and the "Used in" card

**Files:**

- Create: `src/lib/components/items/item-used-in.svelte`
- Modify: `src/routes/items/[id=integer]/+page.svelte` (imports near line 1-41, `refreshItemFromApi` near line 222, markup after line 441 and near the end of the `{#if !loadProblem}` block, around line 776)

**Interfaces:**

- Consumes: `itemPageSeo` (Task 2), `SeoHead` (Task 4), `ItemUsedIn` (Task 2), `gameItem.usedIn` from the endpoint (Task 3), `skillIcon`/`skillLabel` (`$lib/helpers/homepage`), `iconToDataUri`
- Produces: `<ItemUsedIn usedIn={ItemUsedIn} />`, which renders a `<section data-seo-used-in>` (the audit in Task 9 looks for this attribute)

- [ ] **Step 1: Create the card**

`src/lib/components/items/item-used-in.svelte`:

```svelte
<script lang="ts">
    import { resolve } from '$app/paths';
    import { Button } from '$lib/components/ui/button';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import { skillIcon, skillLabel } from '$lib/helpers/homepage';
    import type { ItemUsedIn } from '$lib/models/item-used-in';

    /**
     * The recipes this item goes into. For an ingredient like an ore this is the main thing its
     * page has to say, and the links let readers (and crawlers) follow it to the things it makes.
     */
    const { usedIn }: { usedIn: ItemUsedIn } = $props();

    const INITIAL_ROWS = 10;
    let expanded = $state(false);
    const visible = $derived(expanded ? usedIn.items : usedIn.items.slice(0, INITIAL_ROWS));
    const canExpand = $derived(!expanded && usedIn.items.length > INITIAL_ROWS);
    const isCapped = $derived(usedIn.total > usedIn.items.length);
</script>

<section data-seo-used-in class="border rounded-lg bg-card shadow-sm overflow-hidden mt-6">
    <div class="flex items-baseline gap-3 p-4 border-b">
        <h3 class="text-lg font-semibold leading-tight">Used in</h3>
        <span class="text-sm text-muted-foreground">
            {usedIn.total}
            {usedIn.total === 1 ? 'recipe' : 'recipes'}
        </span>
    </div>
    <ul class="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        {#each visible as recipe (recipe.id)}
            <li>
                <a
                    href={resolve(`/items/${recipe.id}`)}
                    class="group flex min-w-0 items-center gap-3 rounded-md border bg-muted/30 p-3 transition-colors hover:border-primary/60 hover:bg-muted/60"
                >
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-background/60">
                        {#if recipe.icon}
                            <img
                                src={iconToDataUri(recipe.icon)}
                                alt=""
                                class="max-h-8 max-w-8 drop-shadow"
                                loading="lazy"
                            />
                        {/if}
                    </span>
                    <span class="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary"
                        >{recipe.name}</span
                    >
                    {#if recipe.skill}
                        <span class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <img src={skillIcon(recipe.skill)} alt="" class="h-4 w-4" />
                            {skillLabel(recipe.skill)}
                            {recipe.level}
                        </span>
                    {/if}
                </a>
            </li>
        {/each}
    </ul>
    {#if canExpand}
        <div class="px-4 pb-4">
            <Button variant="outline" size="sm" onclick={() => (expanded = true)}>Show all {usedIn.total}</Button>
        </div>
    {/if}
    {#if expanded && isCapped}
        <p class="px-4 pb-4 text-xs text-muted-foreground">
            Showing the {usedIn.items.length} lowest-level recipes.
        </p>
    {/if}
</section>
```

- [ ] **Step 2: Wire SEO and the card into the item page**

In `src/routes/items/[id=integer]/+page.svelte`:

1. Add to the imports:
    ```ts
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import ItemUsedIn from '$lib/components/items/item-used-in.svelte';
    import { itemPageSeo } from '$lib/seo/item-seo';
    ```
2. Under the `let loadProblem = $state(...)` declaration, add:
    ```ts
    // Rebuilt as the item lands. During the server render it's already the real item, which is
    // what crawlers read; on a client-side click it reads "Loading" until the new item arrives.
    const seo = $derived(itemPageSeo({ itemId: data.itemId, gameItem, loadProblem }));
    ```
3. In `refreshItemFromApi`, replace `gameItem = updated;` with:
    ```ts
    // The edit endpoint doesn't carry "Used in", so keep what the page already has.
    gameItem = { ...updated, usedIn: gameItem?.usedIn };
    ```
4. Directly after the `</script>` on line 441, add `<SeoHead {seo} />`.
5. Inside the `{#if !loadProblem}` block, after the closing `</div>` of the prices grid and before that block's `{/if}`, the end of the file reads:

    ```svelte
                    </section>
                {/if}
            </div>
        {/if}
    </div>
    ```

    Change it to:

    ```svelte
                    </section>
                {/if}
            </div>

            {#if gameItem?.usedIn?.total}
                <ItemUsedIn usedIn={gameItem.usedIn} />
            {/if}
        {/if}
    </div>
    ```

- [ ] **Step 3: Run the guard, tests and checks**

Run: `bun test && bun run check && bun run lint`
Expected: everything passes, including `items/[id=integer]/+page.svelte renders SeoHead`.

- [ ] **Step 4: Smoke-test the server render**

Run `bun run dev` in the background, then:

```bash
curl -s http://localhost:5173/items/440 | grep -o '<title>[^<]*</title>\|data-seo-used-in\|<meta name="robots"[^>]*>'
curl -s http://localhost:5173/items/2 | grep -o '<title>[^<]*</title>\|<meta name="robots"[^>]*>'
```

Expected:

- Iron ore (440): "Iron ore: OSRS Price & What You Can Make With It", `data-seo-used-in`, and `index, follow`.
- Cannonball (2): a "Cannonball Profit & Recipe…" title with `index, follow`.

Stop the dev server.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/components/items/item-used-in.svelte 'src/routes/items/[id=integer]/+page.svelte'
git add src/lib/components/items/item-used-in.svelte 'src/routes/items/[id=integer]/+page.svelte'
git commit -m "Item page: its own title and robots tag, plus a Used in card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf"
```

---

### Task 6: Sitemap

**Files:**

- Create: `src/lib/seo/sitemap.ts`, `src/routes/sitemap.xml/+server.ts`, `src/routes/sitemap-[page=integer].xml/+server.ts`, `scripts/fixtures/sitemap-0.9.xsd`, `scripts/fixtures/siteindex-0.9.xsd`
- Test: `src/lib/seo/sitemap.test.ts`

**Interfaces:**

- Consumes: `canonicalUrl`, `SITE_URL` (Task 1), `skillTreePages`, `getIndexableItemIds` (Task 3)
- Produces: `SITEMAP_MAX_URLS = 50000`, `sitemapUrls(itemIds: number[], base?: string): string[]`, `buildSitemap(urls: string[]): string`, `buildSitemapIndex(urls: string[]): string`, `chunkSitemapUrls(urls: string[], max?: number): string[][]`, `renderSitemapResponse(loadIds: () => Promise<number[]>, page: number | null, base?: string): Promise<Response>`

- [ ] **Step 1: Vendor the official schemas**

```bash
mkdir -p scripts/fixtures
curl -fsSL https://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd -o scripts/fixtures/sitemap-0.9.xsd
curl -fsSL https://www.sitemaps.org/schemas/sitemap/0.9/siteindex.xsd -o scripts/fixtures/siteindex-0.9.xsd
head -5 scripts/fixtures/sitemap-0.9.xsd
```

Expected: an XML schema header (`<?xml ...` / `<xsd:schema`), not an HTML error page.

- [ ] **Step 2: Write the failing tests**

`src/lib/seo/sitemap.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { skillTreePages } from '$lib/constants/skill-tree-pages';
import {
    SITEMAP_MAX_URLS,
    buildSitemap,
    buildSitemapIndex,
    chunkSitemapUrls,
    renderSitemapResponse,
    sitemapUrls,
} from './sitemap';

const BASE = 'https://aris-maye.com';
const fixtures = join(import.meta.dir, '../../../scripts/fixtures');

// Validates against the official sitemaps.org schema, not just "looks like XML".
function xmllint(xml: string, schema: string) {
    const result = Bun.spawnSync(['xmllint', '--noout', '--schema', join(fixtures, schema), '-'], {
        stdin: new TextEncoder().encode(xml),
    });
    return { ok: result.exitCode === 0, output: result.stderr.toString() };
}

describe('sitemapUrls', () => {
    it('lists the homepage, items, every skill page and each item once', () => {
        const urls = sitemapUrls([2, 440, 2], BASE);
        expect(urls[0]).toBe(`${BASE}/`);
        expect(urls).toContain(`${BASE}/items`);
        for (const skill of skillTreePages) expect(urls).toContain(`${BASE}/items/${skill.slug}`);
        expect(urls.filter((u) => u === `${BASE}/items/2`)).toHaveLength(1);
        expect(new Set(urls).size).toBe(urls.length);
    });
});

describe('buildSitemap', () => {
    it('produces a sitemap that passes the official schema', () => {
        const check = xmllint(buildSitemap(sitemapUrls([2, 440], BASE)), 'sitemap-0.9.xsd');
        expect(check.output).toContain('validates');
        expect(check.ok).toBe(true);
    });

    it('escapes characters that are special in XML', () => {
        const xml = buildSitemap([`${BASE}/items?a=1&b='2'`]);
        expect(xml).toContain('<loc>https://aris-maye.com/items?a=1&amp;b=&apos;2&apos;</loc>');
        expect(xmllint(xml, 'sitemap-0.9.xsd').ok).toBe(true);
    });
});

describe('chunkSitemapUrls / buildSitemapIndex', () => {
    it('splits past the 50,000-URL limit and indexes the parts', () => {
        const urls = Array.from({ length: SITEMAP_MAX_URLS + 5 }, (_, i) => `${BASE}/items/${i}`);
        const chunks = chunkSitemapUrls(urls);
        expect(chunks.map((c) => c.length)).toEqual([SITEMAP_MAX_URLS, 5]);
        const index = buildSitemapIndex([`${BASE}/sitemap-1.xml`, `${BASE}/sitemap-2.xml`]);
        expect(xmllint(index, 'siteindex-0.9.xsd').ok).toBe(true);
    });
});

describe('renderSitemapResponse', () => {
    it('serves XML with an hour of CDN caching', async () => {
        const response = await renderSitemapResponse(async () => [2], null, BASE);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/xml');
        expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=3600');
        expect(await response.text()).toContain(`<loc>${BASE}/items/2</loc>`);
    });

    // An empty 200 would tell search engines the site has no pages.
    it('answers 503 when the database fails, never an empty sitemap', async () => {
        const response = await renderSitemapResponse(
            async () => {
                throw new Error('mongo down');
            },
            null,
            BASE,
        );
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('3600');
    });

    it('serves an index and numbered parts when there are too many URLs', async () => {
        const ids = Array.from({ length: SITEMAP_MAX_URLS + 10 }, (_, i) => i + 1);
        const index = await renderSitemapResponse(async () => ids, null, BASE);
        expect(await index.text()).toContain(`<loc>${BASE}/sitemap-2.xml</loc>`);
        const part = await renderSitemapResponse(async () => ids, 2, BASE);
        expect(part.status).toBe(200);
        const missing = await renderSitemapResponse(async () => ids, 3, BASE);
        expect(missing.status).toBe(404);
    });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `bun test src/lib/seo/sitemap.test.ts`
Expected: FAIL with "Cannot find module './sitemap'".

- [ ] **Step 4: Implement**

`src/lib/seo/sitemap.ts`:

```ts
import { skillTreePages } from '$lib/constants/skill-tree-pages';
import { canonicalUrl } from './page-seo';
import { SITE_URL } from './site-url';

/** The sitemaps.org limit for one file. */
export const SITEMAP_MAX_URLS = 50_000;

const HEADERS = {
    'Content-Type': 'application/xml',
    // Prices move hourly, the set of pages much less often, so the CDN can serve one copy an hour.
    'Cache-Control': 'public, max-age=0, s-maxage=3600',
};

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function sitemapUrls(itemIds: number[], base: string = SITE_URL): string[] {
    const paths = ['/', '/items', ...skillTreePages.map((skill) => `/items/${skill.slug}`)];
    for (const id of itemIds) paths.push(`/items/${id}`);
    return [...new Set(paths.map((path) => canonicalUrl(path, base)))];
}

// No <lastmod>: every item's price changes hourly, and search engines ignore dates that always move.
export function buildSitemap(urls: string[]): string {
    const entries = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function buildSitemapIndex(sitemapUrlList: string[]): string {
    const entries = sitemapUrlList.map((url) => `  <sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

export function chunkSitemapUrls(urls: string[], max = SITEMAP_MAX_URLS): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < urls.length; i += max) chunks.push(urls.slice(i, i + max));
    return chunks.length ? chunks : [[]];
}

/**
 * The response for `/sitemap.xml` (`page` null) or `/sitemap-{page}.xml`.
 */
export async function renderSitemapResponse(
    loadIds: () => Promise<number[]>,
    page: number | null,
    base: string = SITE_URL,
): Promise<Response> {
    let ids: number[];
    try {
        ids = await loadIds();
    } catch (error) {
        console.error('Failed to build the sitemap', error);
        // An empty sitemap would tell search engines the site has no pages; a 503 tells them to
        // come back later and keep what they have.
        return new Response('Sitemap temporarily unavailable.', {
            status: 503,
            headers: { 'Retry-After': '3600', 'Content-Type': 'text/plain' },
        });
    }

    const chunks = chunkSitemapUrls(sitemapUrls(ids, base));

    if (page === null) {
        const body =
            chunks.length === 1
                ? buildSitemap(chunks[0])
                : buildSitemapIndex(chunks.map((_, i) => `${base}/sitemap-${i + 1}.xml`));
        return new Response(body, { headers: HEADERS });
    }

    const chunk = chunks.length > 1 ? chunks[page - 1] : undefined;
    if (!chunk) return new Response('Not found.', { status: 404 });
    return new Response(buildSitemap(chunk), { headers: HEADERS });
}
```

`src/routes/sitemap.xml/+server.ts`:

```ts
import type { RequestHandler } from '@sveltejs/kit';
import { renderSitemapResponse } from '$lib/seo/sitemap';
import { getIndexableItemIds } from '$lib/services/game-item-mongo-service.server';

export const GET: RequestHandler = () => renderSitemapResponse(getIndexableItemIds, null);
```

`src/routes/sitemap-[page=integer].xml/+server.ts`:

```ts
import type { RequestHandler } from '@sveltejs/kit';
import { renderSitemapResponse } from '$lib/seo/sitemap';
import { getIndexableItemIds } from '$lib/services/game-item-mongo-service.server';

// Only used if the site ever passes 50,000 indexable pages; until then `/sitemap.xml` is the
// whole list and every numbered part is a 404.
export const GET: RequestHandler = ({ params }) => renderSitemapResponse(getIndexableItemIds, Number(params.page));
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `bun test src/lib/seo/sitemap.test.ts`
Expected: PASS, with xmllint reporting `- validates` for each schema check.

- [ ] **Step 6: Smoke-test against real data**

Run `bun run dev` in the background, then:

```bash
curl -s -D - http://localhost:5173/sitemap.xml -o /tmp/claude-sitemap.xml | grep -i 'content-type\|cache-control'
xmllint --noout --schema scripts/fixtures/sitemap-0.9.xsd /tmp/claude-sitemap.xml
grep -c '<loc>' /tmp/claude-sitemap.xml
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/sitemap-1.xml
```

Expected:

- `application/xml`
- `/tmp/claude-sitemap.xml validates`
- a count in the thousands (record it for the PR)
- `404` for `sitemap-1.xml`

Stop the dev server. (Use the session scratchpad instead of `/tmp` if you have one.)

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/seo/sitemap.ts src/lib/seo/sitemap.test.ts src/routes/sitemap.xml 'src/routes/sitemap-[page=integer].xml'
git add src/lib/seo/sitemap.ts src/lib/seo/sitemap.test.ts src/routes/sitemap.xml 'src/routes/sitemap-[page=integer].xml' scripts/fixtures
git commit -m "Serve a sitemap of the homepage, skill pages and indexable items

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf"
```

---

### Task 7: robots.txt and the noindex header for other hosts

**Files:**

- Create: `src/lib/seo/robots.ts`, `src/routes/robots.txt/+server.ts`
- Test: `src/lib/seo/robots.test.ts`
- Modify: `src/hooks.server.ts`

**Interfaces:**

- Consumes: `isProductionHost`, `SITE_URL` (Task 1)
- Produces: `buildRobots(host: string, base?: string): string`, `noindexHeaderFor(host: string): string | null`

- [ ] **Step 1: Write the failing tests**

`src/lib/seo/robots.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { buildRobots, noindexHeaderFor } from './robots';

describe('buildRobots', () => {
    it('opens the production site, except the API, and points at the sitemap', () => {
        expect(buildRobots('aris-maye.com', 'https://aris-maye.com')).toBe(
            'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://aris-maye.com/sitemap.xml\n',
        );
        expect(buildRobots('www.aris-maye.com', 'https://aris-maye.com')).toContain('Sitemap:');
    });

    it.each(['deploy-preview-33--aris-maye.netlify.app', 'aris-maye.netlify.app', 'localhost:5173'])(
        'closes %s entirely',
        (host) => {
            expect(buildRobots(host)).toBe('User-agent: *\nDisallow: /\n');
        },
    );
});

describe('noindexHeaderFor', () => {
    it('sends no header on production and noindex everywhere else', () => {
        expect(noindexHeaderFor('aris-maye.com')).toBeNull();
        expect(noindexHeaderFor('deploy-preview-33--aris-maye.netlify.app')).toBe('noindex, nofollow');
    });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun test src/lib/seo/robots.test.ts`
Expected: FAIL with "Cannot find module './robots'".

- [ ] **Step 3: Implement**

`src/lib/seo/robots.ts`:

```ts
import { SITE_URL, isProductionHost } from './site-url';

export function buildRobots(host: string, base: string = SITE_URL): string {
    if (!isProductionHost(host)) return 'User-agent: *\nDisallow: /\n';
    return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`;
}

/**
 * Deploy previews and the netlify.app alias serve the same pages as the real domain. A header on
 * every response keeps them out of search results even when a crawler skips robots.txt.
 */
export function noindexHeaderFor(host: string): string | null {
    return isProductionHost(host) ? null : 'noindex, nofollow';
}
```

`src/routes/robots.txt/+server.ts`:

```ts
import type { RequestHandler } from '@sveltejs/kit';
import { buildRobots } from '$lib/seo/robots';

export const GET: RequestHandler = ({ url }) =>
    new Response(buildRobots(url.host), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=0, s-maxage=3600',
        },
    });
```

Replace the `handle` in `src/hooks.server.ts` with:

```ts
// Set up preloading etc.
export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event, {
        preload: ({ type, path }) => {
            // Preload ttf fonts. (osrs font)
            return type === 'font' || path.endsWith('.ttf');
        },
    });

    const noindex = noindexHeaderFor(event.url.host);
    if (noindex) response.headers.set('X-Robots-Tag', noindex);
    return response;
};
```

and add `import { noindexHeaderFor } from '$lib/seo/robots';` to its imports.

- [ ] **Step 4: Run the tests, the checks, and a smoke test**

Run: `bun test && bun run check`
Expected: all pass, 0 errors.

Confirm there's no `static/robots.txt` that would take precedence: `ls static/robots.txt` should give "No such file".

Run `bun run dev` in the background, then:

```bash
curl -s http://localhost:5173/robots.txt
curl -s -D - -o /dev/null http://localhost:5173/items | grep -i x-robots-tag
```

Expected: `Disallow: /` (localhost isn't production) and `x-robots-tag: noindex, nofollow`.

Stop the dev server.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/seo/robots.ts src/lib/seo/robots.test.ts src/routes/robots.txt src/hooks.server.ts
git add src/lib/seo/robots.ts src/lib/seo/robots.test.ts src/routes/robots.txt src/hooks.server.ts
git commit -m "Add robots.txt and keep non-production hosts out of search results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf"
```

---

### Task 8: Database check script

**Files:**

- Create: `scripts/verify-used-in-index.ts`
- Modify: `package.json` (`scripts`)

**Interfaces:**

- Consumes: `startMongo` (`src/db/mongo.ts`), `OsrsboxItemModel`, `getRecipesUsingItem`, `getIndexableItemIds` (Task 3)
- Produces: console report, the `--noindex-ids=` line Task 9 uses, and exit code 0 or 1

- [ ] **Step 1: Write the script**

`scripts/verify-used-in-index.ts`:

```ts
/**
 * Read-only checks for the "Used in" index and the sitemap's item set, against whichever
 * database `.env` points at. Pass `--create-index` to build the index if it's missing. The app
 * would build it on its next connect anyway; this just lets you do it on purpose.
 *
 *   bun run --env-file .env scripts/verify-used-in-index.ts [--create-index]
 */
import mongoose from 'mongoose';
import { startMongo } from '../src/db/mongo';

// Mongoose builds a model's indexes as soon as it's compiled and connected. Switch that off before
// the model is imported (hence the dynamic imports), so this script only writes when asked to.
mongoose.set('autoIndex', false);
const { OsrsboxItemModel } = await import('../src/lib/models/mongo-schemas/osrsbox-db-item-schema');
const { getIndexableItemIds, getRecipesUsingItem } = await import('../src/lib/services/game-item-mongo-service.server');

const INDEX_NAME = 'creationSpecs.ingredients.item_1';
const failures: string[] = [];

await startMongo();

const indexes = await OsrsboxItemModel.collection.indexes();
let hasIndex = indexes.some((index) => index.name === INDEX_NAME);
if (!hasIndex && process.argv.includes('--create-index')) {
    await OsrsboxItemModel.collection.createIndex({ 'creationSpecs.ingredients.item': 1 });
    hasIndex = true;
    console.log(`Created ${INDEX_NAME}.`);
}
console.log(`Index ${INDEX_NAME}: ${hasIndex ? 'present' : 'MISSING'}`);
if (!hasIndex) failures.push(`${INDEX_NAME} is missing (re-run with --create-index).`);

for (const name of ['Iron ore', 'Logs', 'Nature rune']) {
    const item = await OsrsboxItemModel.findOne({ name, placeholder: false, noted: false })
        .select({ _id: 1, id: 1 })
        .lean();
    if (!item) {
        failures.push(`Could not find "${name}".`);
        continue;
    }
    const plan = await OsrsboxItemModel.find({ 'creationSpecs.ingredients.item': item._id }).explain('queryPlanner');
    const usesIndex = JSON.stringify(plan).includes('IXSCAN');
    const usedIn = await getRecipesUsingItem(item._id);
    console.log(
        `${name} (#${item.id}): used in ${usedIn.total} recipes, plan ${usesIndex ? 'IXSCAN' : 'COLLSCAN'}; first: ${usedIn.items
            .slice(0, 5)
            .map((r) => `${r.name} (${r.skill ?? '?'} ${r.level ?? '?'})`)
            .join(', ')}`,
    );
    if (!usesIndex) failures.push(`"${name}" lookup does not use the index.`);
    if (usedIn.total === 0) failures.push(`"${name}" is used in nothing, which is not plausible.`);
}

const indexable = await getIndexableItemIds();
console.log(`Indexable item pages (sitemap): ${indexable.length}`);
if (indexable.length === 0) failures.push('No indexable items.');

// A few pages that should be noindex, for the full-site audit.
const ingredientRefs = await OsrsboxItemModel.distinct('creationSpecs.ingredients.item');
const plain = await OsrsboxItemModel.find({
    'creationSpecs.0': { $exists: false },
    _id: { $nin: ingredientRefs },
    placeholder: false,
    noted: false,
})
    .select({ _id: 0, id: 1 })
    .limit(10)
    .lean<{ id: number }[]>();
console.log(`--noindex-ids=${plain.map((p) => p.id).join(',')}`);

await mongoose.disconnect();

if (failures.length) {
    console.error(`\nFAIL\n- ${failures.join('\n- ')}`);
    process.exit(1);
}
console.log('\nPASS');
```

Add to `package.json` `scripts`:

```json
        "verify-used-in-index": "bun run --env-file .env scripts/verify-used-in-index.ts",
        "verify-seo": "bun run --env-file .env scripts/verify-seo.ts",
```

- [ ] **Step 2: Run it**

Run: `bun run verify-used-in-index`
Expected:

- `Index … present`. If it says `MISSING`, run once with `-- --create-index` and note in the PR which database `.env` points at, so the other database (preview or production) gets it too.
- Three `IXSCAN` lines. Check their recipe names against the wiki's "Uses" for each item.
- A sitemap count that matches Task 6's `<loc>` count, minus the 2 + 6 fixed pages.
- `PASS`.

Save the printed `--noindex-ids=…` line for Task 9.

- [ ] **Step 3: Format and commit**

```bash
npx prettier --write scripts/verify-used-in-index.ts package.json
git add scripts/verify-used-in-index.ts package.json
git commit -m "Add a read-only check for the Used in index and sitemap item set

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf"
```

---

### Task 9: Full-site SEO audit

**Files:**

- Create: `scripts/verify-seo.ts`

**Interfaces:**

- Consumes: the running site (sitemap, robots, pages), `scripts/fixtures/*.xsd` (Task 6), the `--noindex-ids` from Task 8, and the `data-seo-used-in` attribute (Task 5)
- Produces: a pass/fail report and exit code 0 or 1

- [ ] **Step 1: Write the script**

`scripts/verify-seo.ts`:

```ts
/**
 * Audits a running Aris Maye: robots.txt, the sitemap (against the official schema) and the head
 * tags of every page in it.
 *
 *   bun scripts/verify-seo.ts <baseUrl> [--production] [--noindex-ids=1,2] [--concurrency=8] [--sample=N]
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
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
        // One retry, for serverless cold starts.
        if (response.status < 500 || attempt === 1) return response;
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
    usedIn: boolean;
};

async function readHead(html: string): Promise<Head> {
    const head: Head = { titles: [], descriptions: [], canonicals: [], ogTitles: [], robots: [], usedIn: false };
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
        .on('meta[name="robots"]', { element: (e) => void head.robots.push(e.getAttribute('content') ?? '') })
        .on('[data-seo-used-in]', { element: () => void (head.usedIn = true) })
        .transform(new Response(html))
        .text();
    head.titles = head.titles.map(decode);
    head.descriptions = head.descriptions.map(decode);
    head.canonicals = head.canonicals.map(decode);
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

    const title = head.titles[0] ?? '';
    check(title.length > 0 && title.length <= 60, `${path}: title length ${title.length} ("${title}")`);
    const owner = titleOwners.get(title);
    check(!owner, `${path}: title "${title}" also used by ${owner}`);
    titleOwners.set(title, path);

    const description = head.descriptions[0] ?? '';
    check(description.length >= 70 && description.length <= 160, `${path}: description length ${description.length}`);

    // Ingredient-only pages exist in the index because of their "Used in" card, so it must be in
    // the server-rendered HTML that crawlers read.
    if (/ is used (in \d+|to make) /.test(description)) {
        ingredientPages++;
        check(head.usedIn, `${path}: ingredient page has no Used in card in its server render`);
    }
}

await pool(targets, auditIndexable);
console.log(`Audited ${targets.length} pages (${ingredientPages} ingredient-only)`);

// 4. pages that must stay out of the index
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
```

- [ ] **Step 2: Build and run it against a local preview**

```bash
bun run build
bun run preview -- --port 4173   # run in the background
bun scripts/verify-seo.ts http://localhost:4173 --noindex-ids=<ids from Task 8>
```

Expected:

- `Sitemap: N URLs`, where N matches Task 6
- `Audited N pages (… ingredient-only)`
- `PASS`

If `bun run preview` can't serve with adapter-netlify, use `bun run dev` on `:5173` and say so in the PR.

Fix every failure at its cause (builder, component or route). Don't loosen the audit. Usual suspects are a duplicate title (two items with the same name) and a description under 70 characters. For duplicate names, append ` (#{id})` in `buildItemSeo` when needed, with a unit test, and only if the audit shows real collisions.

- [ ] **Step 3: Run it as a negative control**

Temporarily remove `/items`'s SeoHead, rebuild, and confirm the audit catches it. Restart the preview after each build:

```bash
sed -i '' 's#<SeoHead seo={itemsSeo} />##' src/routes/items/+page.svelte && bun run build
bun scripts/verify-seo.ts http://localhost:4173 --sample=5
git checkout src/routes/items/+page.svelte && bun run build
bun scripts/verify-seo.ts http://localhost:4173 --sample=5
```

Expected: the broken run FAILs with `/items: 0 <title> tags`. After the restore and rebuild, it passes again. This proves the audit can fail.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write scripts/verify-seo.ts
git add scripts/verify-seo.ts
git commit -m "Add a full-site SEO audit: robots, sitemap schema, and every page's head

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RCTnxqNQX2y2D4aiXpnamf"
```

---

### Task 10: Browser check, deploy preview, PR

**Files:**

- Modify: PR #33 description (via `gh pr edit`)

- [ ] **Step 1: Full local gate**

Run: `bun test && bun run check && bun run lint`
Expected: all pass. Paste the summary lines into the PR.

- [ ] **Step 2: Browser check**

If a browser tool is available (load the `anthropic-skills:built-in-browser` or `anthropic-skills:chrome-browser` skill first), open the local preview and:

1. Go to `/items/440` (Iron ore). Check that "Used in" renders, "Show all" appears when there are more than 10, and clicking it expands the list.
2. Click a "Used in" row. The tab title changes to the new item's title, never staying on "Iron ore …". Use the back button and check the title is Iron ore's again.
3. From `/items`, click into an item card and check the title changes the same way.

If there's no browser tool, these three steps go on the PR's manual test list instead.

- [ ] **Step 3: Push and audit the deploy preview**

```bash
git push
gh pr checks 33 --watch   # or wait for the Netlify deploy-preview comment
bun scripts/verify-seo.ts https://deploy-preview-33--aris-maye.netlify.app --noindex-ids=<ids from Task 8>
```

Expected: PASS in non-production mode, which also proves the preview sends `X-Robots-Tag: noindex` and `Disallow: /`. The deploy-preview database may differ from `.env`'s. If `Used in` totals look off there, run `verify-used-in-index` against that database before trusting the result.

- [ ] **Step 4: Update the PR description**

Rewrite PR #33's body with `gh pr edit 33 --body-file <file>` (keep the 🤖 footer and session link). It should include:

- What shipped, with a link to the spec and plan
- Verification results: test count, the sitemap URL count, the `verify-used-in-index` output (index present, IXSCAN, the totals), and the local and deploy-preview `verify-seo` summaries, including the negative control
- **Manual test list (owner):** the browser steps from Step 2 if Claude couldn't run them; a share of a deploy-preview item URL in a Discord DM (title and description should be the item's, image is still the static thumbnail until PR 2)
- **After merging to production (owner):**
    1. `bun scripts/verify-seo.ts https://aris-maye.com --production --noindex-ids=…`
    2. Submit `https://aris-maye.com/sitemap.xml` in Google Search Console
    3. Run URL Inspection on one craftable page, one ingredient-only page and one noindex page
    4. Check that the discovered-URL count matches the audit's count after Google processes the sitemap
    5. Confirm the `creationSpecs.ingredients.item_1` index exists on the production database (`verify-used-in-index` with production `.env`)
