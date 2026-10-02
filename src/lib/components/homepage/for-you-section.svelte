<script lang="ts">
    import HomeItemRow from './home-item-row.svelte';
    import { Skeleton } from '$lib/components/ui/skeleton';
    import { activeIsIronman, getStoreRoot } from '$lib/stores/character-store.svelte';
    import { bankItemsStore, getSuppliesForCharacter } from '$lib/stores/bank-items-store';
    import { formatGpPerXp, formatGpShort, pickSkillToTrain, skillIcon, skillLabel } from '$lib/helpers/homepage';
    import { HOMEPAGE_ALMOST_UNLOCKED_LEVELS } from '$lib/constants/homepage';
    import type { HomepageAlmostUnlocked, HomepageBestXp } from '$lib/models/homepage';
    import type { IGameItem } from '$lib/models/game-item';
    import type { Snippet } from 'svelte';

    /**
     * Picks for the visitor's active character: what they can make now, what's a few levels away,
     * what their bank covers, and which skill to train next.
     *
     * Profiles live in the browser, so this renders nothing on the server and fills in after load.
     */

    const PICK_COUNT = 4;

    const characterStore = $derived(getStoreRoot());
    const activeCharacter = $derived(
        characterStore?.characters?.find((c) => String(c.id) === String(characterStore?.activeCharacter)),
    );
    const ironman = $derived(activeIsIronman());
    const skillLevels = $derived.by(() => {
        if (!activeCharacter) return null;
        const levels: Record<string, number> = {};
        for (const [skill, level] of Object.entries(activeCharacter.skillLevels ?? {})) {
            const numeric = Math.floor(Number(level));
            if (Number.isFinite(numeric)) levels[skill.toLowerCase()] = numeric;
        }
        return levels;
    });
    const suppliesParam = $derived.by(() => {
        if (!activeCharacter) return null;
        const entries = getSuppliesForCharacter($bankItemsStore, activeCharacter.id)
            .filter((entry) => entry?.id !== undefined && Number(entry.quantity) > 0)
            .map((entry) => [String(entry.id), Math.floor(Number(entry.quantity))] as const)
            .sort((a, b) => a[0].localeCompare(b[0]));
        return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null;
    });

    let loading = $state(true);
    let bestEarners = $state<IGameItem[]>([]);
    let fromBank = $state<IGameItem[]>([]);
    let almostUnlocked = $state<HomepageAlmostUnlocked[]>([]);
    let bestXp = $state<HomepageBestXp[]>([]);

    const skillToTrain = $derived(pickSkillToTrain(almostUnlocked));
    const profitLabel = $derived(ironman ? 'Ironman profit' : 'profit');

    async function fetchItems(params: Record<string, string>, signal: AbortSignal): Promise<IGameItem[]> {
        const search = new URLSearchParams({
            page: '1',
            perPage: String(PICK_COUNT),
            order: 'roi-value-desc',
            ...params,
        });
        const response = await fetch(`/api/game-items?${search}`, { signal });
        if (!response.ok) return [];
        const body = (await response.json()) as { items?: IGameItem[] };
        return (body.items ?? []).filter((item) => (item.creationProfit ?? 0) > 0);
    }

    $effect(() => {
        if (!skillLevels) return;
        const levels = JSON.stringify(skillLevels);
        const supplies = suppliesParam;
        const ironmanFlag: Record<string, string> = ironman ? { ironman: '1' } : {};
        const controller = new AbortController();
        loading = true;

        Promise.all([
            fetchItems({ skillLevels: levels, ...ironmanFlag }, controller.signal),
            supplies
                ? fetchItems({ skillLevels: levels, supplies, suppliesActive: '1', ...ironmanFlag }, controller.signal)
                : Promise.resolve([]),
            fetch(`/api/homepage/almost-unlocked?${new URLSearchParams({ skillLevels: levels, ...ironmanFlag })}`, {
                signal: controller.signal,
            }).then((response) => (response.ok ? (response.json() as Promise<HomepageAlmostUnlocked[]>) : [])),
            fetch(`/api/homepage/best-xp?${new URLSearchParams({ skillLevels: levels, ...ironmanFlag })}`, {
                signal: controller.signal,
            }).then((response) => (response.ok ? (response.json() as Promise<HomepageBestXp[]>) : [])),
        ])
            .then(([earners, bank, almost, xp]) => {
                bestEarners = earners;
                fromBank = bank;
                almostUnlocked = almost;
                bestXp = xp;
                loading = false;
            })
            .catch((error) => {
                if (error?.name === 'AbortError') return;
                console.error('Failed to load homepage picks', error);
                loading = false;
            });

        return () => controller.abort();
    });

    function xpCostText(row: HomepageBestXp): string {
        if (row.gpPerXp === null) return 'Cost unknown';
        if (row.gpPerXp === 0) {
            const earned = Math.max(0, row.item.creationProfit ?? 0) / row.xp;
            return earned > 0 ? `Profitable · +${formatGpPerXp(earned)}` : 'Free';
        }
        return `Costs ${formatGpPerXp(row.gpPerXp)}`;
    }

    function shortfallText(entry: HomepageAlmostUnlocked): string {
        return entry.shortfalls.map((s) => `${skillLabel(s.skill)} ${s.need} (${s.need - s.have} to go)`).join(', ');
    }
</script>

{#snippet column(title: string, blurb: string, body: Snippet)}
    <div class="flex flex-col gap-2 min-w-0">
        <div>
            <h3 class="text-sm font-semibold">{title}</h3>
            <p class="text-xs text-muted-foreground">{blurb}</p>
        </div>
        {@render body()}
    </div>
{/snippet}

{#snippet skeletonRows()}
    {#each { length: 3 }, index (index)}
        <Skeleton class="h-[62px] w-full" />
    {/each}
{/snippet}

{#if activeCharacter}
    <section class="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4 md:p-6">
        <div class="flex flex-col gap-1">
            <h2 class="rs-font-with-shadow dark:rs-font text-2xl md:text-3xl text-primary">
                For {activeCharacter.name}
            </h2>
            <p class="text-sm text-muted-foreground">
                Based on {activeCharacter.name}'s levels{suppliesParam ? ' and bank' : ''}{ironman
                    ? ', valued the Ironman way'
                    : ''}.
            </p>
        </div>

        {#if !loading && skillToTrain}
            <div class="flex items-center gap-3 rounded-md border bg-background/60 p-3">
                <img src={skillIcon(skillToTrain.skill)} alt="" class="h-8 w-8 shrink-0" />
                <p class="text-sm">
                    <span class="font-semibold">Train {skillLabel(skillToTrain.skill)} next.</span>
                    {skillToTrain.levelsAway}
                    {skillToTrain.levelsAway === 1 ? 'level' : 'levels'} gets you to {skillToTrain.targetLevel}, which
                    unlocks {skillToTrain.best.name} at
                    <span class="font-semibold text-emerald-500"
                        >{formatGpShort(skillToTrain.best.creationProfit, true)}</span
                    >
                    each{skillToTrain.unlockCount > 1
                        ? ` and ${skillToTrain.unlockCount - 1} more money-maker${skillToTrain.unlockCount > 2 ? 's' : ''}`
                        : ''}.
                </p>
            </div>
        {/if}

        <!-- Three lists sit in a row; with the bank's as a fourth, they make two rows of two. -->
        <div class="grid gap-6 {suppliesParam ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}">
            {#snippet earnersBody()}
                {#if loading}
                    {@render skeletonRows()}
                {:else if bestEarners.length}
                    {#each bestEarners as item (item.id)}
                        <HomeItemRow
                            {item}
                            value={formatGpShort(item.creationProfit, true)}
                            tone="positive"
                            detail={`Costs ${formatGpShort(item.creationCost)} to make`}
                        />
                    {/each}
                {:else}
                    <p class="text-sm text-muted-foreground">Nothing you can make turns a profit today.</p>
                {/if}
            {/snippet}
            {@render column('Your best earners', `Top ${profitLabel} at your current levels.`, earnersBody)}

            {#snippet almostBody()}
                {#if loading}
                    {@render skeletonRows()}
                {:else if almostUnlocked.length}
                    {#each almostUnlocked.slice(0, PICK_COUNT) as entry (entry.item.id)}
                        <HomeItemRow
                            item={entry.item}
                            value={formatGpShort(entry.item.creationProfit, true)}
                            tone="positive"
                            detail={shortfallText(entry)}
                        />
                    {/each}
                {:else}
                    <p class="text-sm text-muted-foreground">
                        Nothing more profitable unlocks in the next {HOMEPAGE_ALMOST_UNLOCKED_LEVELS} levels.
                    </p>
                {/if}
            {/snippet}
            {@render column(
                'Almost unlocked',
                `Money-makers within ${HOMEPAGE_ALMOST_UNLOCKED_LEVELS} levels of your stats.`,
                almostBody,
            )}

            {#snippet xpBody()}
                {#if loading}
                    {@render skeletonRows()}
                {:else if bestXp.length}
                    {#each bestXp.slice(0, PICK_COUNT) as row (row.skill)}
                        <HomeItemRow
                            item={row.item}
                            value={`${row.xp.toLocaleString('en-US')} xp`}
                            detail={xpCostText(row)}
                        >
                            <span class="flex items-center gap-1 text-xs text-muted-foreground">
                                <img src={skillIcon(row.skill)} alt="" class="h-3.5 w-3.5" />
                                {skillLabel(row.skill)}
                            </span>
                        </HomeItemRow>
                    {/each}
                {:else}
                    <p class="text-sm text-muted-foreground">Nothing you can make gives XP yet.</p>
                {/if}
            {/snippet}
            {@render column('Best XP', 'The most XP per action you can get right now.', xpBody)}

            {#if suppliesParam}
                {#snippet bankBody()}
                    {#if loading}
                        {@render skeletonRows()}
                    {:else if fromBank.length}
                        {#each fromBank as item (item.id)}
                            <HomeItemRow
                                {item}
                                value={formatGpShort(item.creationProfit, true)}
                                tone="positive"
                                detail="All in your bank"
                            />
                        {/each}
                    {:else}
                        <p class="text-sm text-muted-foreground">Your bank doesn't cover a full recipe yet.</p>
                    {/if}
                {/snippet}
                {@render column('From your bank', 'What you can make with what you already have.', bankBody)}
            {/if}
        </div>
    </section>
{/if}
