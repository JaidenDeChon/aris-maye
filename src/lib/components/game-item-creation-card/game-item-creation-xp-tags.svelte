<script lang="ts">
    import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
    import type { GameItemCreationSpecs, IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

    interface GameItemCreationXpTagsProps {
        gameItem: IOsrsboxItemWithMeta | null;
        creationSpec?: GameItemCreationSpecs | null;
    }

    const { gameItem, creationSpec = null }: GameItemCreationXpTagsProps = $props();

    type SkillXpRow = { skillName: string; totalXp: number; level?: number };

    const creationSpecs = $derived(
        creationSpec ? [creationSpec] : ((gameItem?.creationSpecs ?? []) as GameItemCreationSpecs[]),
    );
    const xpSummaries = $derived(buildXpSummaries(creationSpecs));
    const rows = $derived(xpSummaries[0]?.rows ?? []);

    function formatXp(value: number | null | undefined) {
        if (value === null || value === undefined) return '—';
        return Math.round(value).toLocaleString();
    }

    function buildXpSummaries(
        specs: GameItemCreationSpecs[],
    ): { id: string; label: string; rows: SkillXpRow[]; requiredLevels: Record<string, number> }[] {
        if (!specs?.length) return [];

        return specs.map((spec, index) => {
            const requiredLevels = buildRequiredLevels(spec);
            const rows = buildXpRows(spec, requiredLevels);
            const label = specs.length === 1 ? 'XP' : `Spec ${index + 1}`;
            return { id: `xp-spec-${index}`, label, rows, requiredLevels };
        });
    }

    function buildRequiredLevels(spec: GameItemCreationSpecs): Record<string, number> {
        const levels: Record<string, number> = {};
        const seed = spec.treeMinSkills ?? null;
        if (seed) {
            for (const [skill, level] of Object.entries(seed)) {
                addSkillLevel(levels, skill, level);
            }
        }

        accumulateRequiredLevels(spec, levels, new Set());
        return levels;
    }

    function buildXpRows(spec: GameItemCreationSpecs, requiredLevels: Record<string, number>): SkillXpRow[] {
        const totalMap = accumulateExperience(spec, 1, true, new Set());

        const skills = new Set([...totalMap.keys(), ...Object.keys(requiredLevels)]);
        return Array.from(skills)
            .map((skillName) => ({
                skillName,
                totalXp: totalMap.get(skillName) ?? 0,
                level: requiredLevels[skillName],
            }))
            .sort((a, b) => b.totalXp - a.totalXp);
    }

    function accumulateExperience(
        spec: GameItemCreationSpecs,
        multiplier: number,
        includeChildren: boolean,
        visited: Set<string | number>,
    ): Map<string, number> {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const map = new Map<string, number>();

        for (const xp of spec.experienceGranted ?? []) {
            if (!xp?.skillName || xp.experienceAmount === undefined || xp.experienceAmount === null) continue;
            const key = normalizeSkillName(xp.skillName);
            if (!key) continue;
            const amount = xp.experienceAmount * multiplier;
            map.set(key, (map.get(key) ?? 0) + amount);
        }

        if (!includeChildren) return map;

        for (const ingredient of spec.ingredients ?? []) {
            if (!ingredient?.item) continue;
            if (ingredient.consumedDuringCreation === false) continue;

            const amount = ingredient.amount ?? 1;
            const childItem = ingredient.item as IOsrsboxItemWithMeta | undefined;
            const childId = childItem?.id ?? null;
            if (childId !== null) {
                if (visited.has(childId)) continue;
                visited.add(childId);
            }

            const childSpec = getPrimaryCreationSpec(childItem);
            if (childSpec) {
                const childMap = accumulateExperience(childSpec, multiplier * amount, true, visited);
                for (const [skill, value] of childMap.entries()) {
                    map.set(skill, (map.get(skill) ?? 0) + value);
                }
            }

            if (childId !== null) visited.delete(childId);
        }

        return map;
    }

    // Skills with an icon in `static/skill-images`. Anything else just goes without one.
    const SKILLS_WITH_ICONS = new Set([
        'agility',
        'attack',
        'construction',
        'cooking',
        'crafting',
        'defence',
        'farming',
        'firemaking',
        'fishing',
        'fletching',
        'herblore',
        'hitpoints',
        'hunter',
        'magic',
        'mining',
        'prayer',
        'ranged',
        'runecrafting',
        'slayer',
        'smithing',
        'strength',
        'thieving',
        'woodcutting',
    ]);

    function skillIcon(name: string): string | null {
        const key = normalizeSkillName(name);
        return key && SKILLS_WITH_ICONS.has(key) ? `/skill-images/${key}.png` : null;
    }

    function normalizeSkillName(name: string | null | undefined): string | null {
        if (!name) return null;
        const trimmed = name.trim().toLowerCase();
        return trimmed.length ? trimmed : null;
    }

    function formatSkillLabel(name: string): string {
        const normalized = normalizeSkillName(name) ?? name;
        return normalized
            .split(' ')
            .map((segment) => (segment ? `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}` : segment))
            .join(' ');
    }

    function addSkillLevel(target: Record<string, number>, skill: string | null | undefined, level: number | null) {
        const key = normalizeSkillName(skill ?? '');
        if (!key) return;
        const numeric = Math.max(0, Math.floor(Number(level ?? 0)));
        if (!Number.isFinite(numeric)) return;
        const current = target[key] ?? 0;
        if (numeric > current) target[key] = numeric;
    }

    function accumulateRequiredLevels(
        spec: GameItemCreationSpecs,
        target: Record<string, number>,
        visited: Set<string | number>,
    ) {
        for (const req of spec.requiredSkills ?? []) {
            if (!req?.skillName || typeof req.skillLevel !== 'number') continue;
            addSkillLevel(target, req.skillName, req.skillLevel);
        }

        for (const ingredient of spec.ingredients ?? []) {
            if (!ingredient?.item) continue;
            if (ingredient.consumedDuringCreation === false) continue;

            const childItem = ingredient.item as IOsrsboxItemWithMeta | undefined;
            const childId = childItem?.id ?? null;
            if (childId !== null) {
                if (visited.has(childId)) continue;
                visited.add(childId);
            }

            const childSpec = getPrimaryCreationSpec(childItem);
            if (childSpec) {
                accumulateRequiredLevels(childSpec, target, visited);
            }

            if (childId !== null) visited.delete(childId);
        }
    }
</script>

<section class="flex flex-col gap-2">
    <div>
        <h4 class="text-sm font-semibold">Skills and XP</h4>
        <p class="text-xs text-muted-foreground">
            For making it from scratch, including any ingredients you make along the way.
        </p>
    </div>
    {#if !rows.length}
        <p class="text-sm text-muted-foreground">No experience data available.</p>
    {:else}
        <ul class="grid gap-2">
            {#each rows as row (row.skillName)}
                <li class="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
                    {#if skillIcon(row.skillName)}
                        <img
                            src={skillIcon(row.skillName)}
                            alt=""
                            class="h-6 w-6 shrink-0 object-contain drop-shadow"
                        />
                    {/if}
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium leading-tight">{formatSkillLabel(row.skillName)}</p>
                        <p class="text-xs text-muted-foreground">
                            {row.level ? `Needs level ${row.level}` : 'No level needed'}
                        </p>
                    </div>
                    <p class="text-sm font-semibold text-primary tabular-nums whitespace-nowrap">
                        {formatXp(row.totalXp)} XP
                    </p>
                </li>
            {/each}
        </ul>
    {/if}
</section>
