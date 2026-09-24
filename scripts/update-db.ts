import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Step = {
    key: string;
    name: string;
    cmd: string[];
    skip?: boolean;
};

const args = process.argv.slice(2);
const dbArg = args.find((arg) => arg.startsWith('--db='));
const masterDbName = dbArg?.split('=')[1] || process.env.OSRSBOX_MASTER_DB || 'osrsbox';

const skipFlags = new Set(
    args
        .filter((arg) => arg.startsWith('--skip-'))
        .map((arg) => arg.replace('--skip-', '').trim())
        .filter(Boolean),
);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const osrsboxDbPath = path.join(repoRoot, 'scripts', 'osrsbox-db');
const osrsboxSummaryPath = path.join(osrsboxDbPath, 'docs', 'items-summary.json');
const backfillPath = path.join(repoRoot, 'scripts', 'backfill-missing-items.ts');
const findCyclesPath = path.join(repoRoot, 'scripts', 'find-ingredient-cycles.ts');

if (!skipFlags.has('grab') && !fs.existsSync(osrsboxDbPath)) {
    console.error(
        `[update-db] Missing ${osrsboxDbPath}. Clone osrsreboxed-db into scripts/osrsbox-db, or pass --skip-grab.`,
    );
    process.exit(1);
}

if (!fs.existsSync(findCyclesPath)) {
    console.warn(`[update-db] Missing ${findCyclesPath}; cycle removal will be skipped.`);
    skipFlags.add('cycles');
}

function loadBackfillTargets(): string[] | null {
    if (!fs.existsSync(backfillPath)) return null;
    const content = fs.readFileSync(backfillPath, 'utf8');
    const start = content.indexOf('const TARGET_ITEM_NAMES');
    if (start < 0) return null;
    const slice = content.slice(start);
    const open = slice.indexOf('[');
    const close = slice.indexOf('\n];');
    if (open < 0 || close < 0) return null;
    const inner = slice.slice(open + 1, close).trim();

    try {
        const list = Function(`return [${inner}];`)() as unknown;
        return Array.isArray(list) ? list.map((value) => String(value)) : null;
    } catch {
        return null;
    }
}

function maybeSkipBackfill() {
    if (skipFlags.has('backfill')) return;
    if (!fs.existsSync(osrsboxSummaryPath)) {
        console.warn(`[update-db] Missing ${osrsboxSummaryPath}; cannot auto-check backfill.`);
        return;
    }

    const targets = loadBackfillTargets();
    if (!targets || targets.length === 0) {
        console.warn(`[update-db] Unable to parse ${backfillPath}; cannot auto-check backfill.`);
        return;
    }

    const summary = JSON.parse(fs.readFileSync(osrsboxSummaryPath, 'utf8')) as Record<
        string,
        { name?: string }
    >;
    const names = new Set(Object.values(summary).map((item) => item.name).filter(Boolean) as string[]);
    const missing = targets.filter((name) => !names.has(name));

    if (missing.length === 0) {
        console.log('[update-db] Backfill not needed; all target items exist in OSRSBox dataset.');
        skipFlags.add('backfill');
    } else {
        console.log(`[update-db] Backfill needed; ${missing.length} target item(s) missing from OSRSBox dataset.`);
    }
}

const baseEnv = {
    ...process.env,
    VITE_MONGO_DB_DB_NAME: masterDbName,
};

const steps: Step[] = [
    {
        key: 'grab',
        name: 'grab-osrsbox-items',
        cmd: ['bun', 'run', 'scripts/grab-osrsbox-items.ts'],
    },
    {
        key: 'backfill',
        name: 'backfill-missing-items',
        cmd: ['bun', 'run', 'scripts/backfill-missing-items.ts'],
    },
    {
        key: 'duplicates',
        name: 'remove-duplicate-items',
        cmd: ['bun', 'run', 'scripts/remove-duplicate-items.ts'],
    },
    {
        // Must run before populate-ingredients: that step scrapes the wiki by page
        // title, and OSRSBox's wiki_name is not a real page title for versioned items.
        key: 'wiki-names',
        name: 'normalize-wiki-names',
        cmd: ['bun', 'run', 'scripts/normalize-wiki-names.ts'],
    },
    {
        key: 'ingredients',
        name: 'populate-ingredients',
        cmd: ['bun', 'run', 'scripts/populate-ingredients.ts'],
    },
    {
        // Runs after populate-ingredients so any links it wrote are checked too. Newly
        // scraped data already picks the canonical document; this repairs older rows
        // that point at an unpriced duplicate.
        key: 'ingredient-links',
        name: 'repair-ingredient-links',
        cmd: ['bun', 'run', 'scripts/repair-ingredient-links.ts'],
    },
    {
        key: 'cycles',
        name: 'remove-cyclic-ingredients',
        cmd: ['bun', 'run', 'scripts/find-ingredient-cycles.ts'],
    },
    {
        key: 'tree-skills',
        name: 'compute-creation-tree-skills',
        cmd: ['bun', 'run', 'scripts/compute-creation-tree-skills.ts'],
    },
];

async function runStep(step: Step) {
    if (skipFlags.has(step.key)) {
        console.log(`[update-db] Skipping ${step.name} (--skip-${step.key}).`);
        return;
    }

    console.log(`[update-db] Running ${step.name}...`);
    const proc = Bun.spawn({
        cmd: step.cmd,
        cwd: repoRoot,
        env: baseEnv,
        stdout: 'inherit',
        stderr: 'inherit',
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        throw new Error(`[update-db] ${step.name} failed with exit code ${exitCode}.`);
    }
}

async function main() {
    console.log(`[update-db] Target DB: ${masterDbName}`);
    maybeSkipBackfill();

    for (const step of steps) {
        await runStep(step);
    }

    console.log('[update-db] All steps completed.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
