<script lang="ts">
    import HomeBand from './home-band.svelte';
    import HomeItemRow from './home-item-row.svelte';
    import * as ToggleGroup from '$lib/components/ui/toggle-group';
    import { HOMEPAGE_MIN_ROI_PROFIT } from '$lib/constants/homepage';
    import { formatGpShort, formatRoi } from '$lib/helpers/homepage';
    import type { HomepageItem, HomepageSnapshot } from '$lib/models/homepage';

    /** The best things to make right now, ranked three ways. */
    const { snapshot, compact = false }: { snapshot: HomepageSnapshot; compact?: boolean } = $props();

    type Ranking = 'profit' | 'roi' | 'limit';

    let ranking = $state<Ranking>('profit');

    // An Ironman doesn't buy on the GE, so buy limits mean nothing to them.
    const rankings = $derived(
        [
            { value: 'profit' as const, label: 'Profit' },
            { value: 'roi' as const, label: 'Return' },
            ...(snapshot.ironman ? [] : [{ value: 'limit' as const, label: 'Per 4 hours' }]),
        ].filter((option) => itemsFor(option.value).length > 0),
    );

    const blurbs = $derived<Record<Ranking, string>>({
        profit: 'Most profitable items to make',
        roi: `Profit as a share of what the ingredients cost. Only items making at least ${HOMEPAGE_MIN_ROI_PROFIT} gp each count.`,
        limit: 'Profit times how many you can make before an ingredient hits its 4-hour GE buy limit.',
    });

    function itemsFor(which: Ranking): HomepageItem[] {
        if (which === 'roi') return snapshot.topRoi;
        if (which === 'limit') return snapshot.topGpPerLimit;
        return snapshot.topProfit;
    }

    function rowValue(item: HomepageItem): string {
        if (ranking === 'roi') return formatRoi(item.creationRoi);
        if (ranking === 'limit') return formatGpShort(item.gpPerLimit, true);
        return formatGpShort(item.creationProfit, true);
    }

    function rowDetail(item: HomepageItem): string {
        const profit = `${formatGpShort(item.creationProfit, true)} each`;
        if (ranking === 'roi') return `${profit} · costs ${formatGpShort(item.creationCost)}`;
        if (ranking === 'limit') return `${profit} · ${item.craftsPerLimit?.toLocaleString('en-US') ?? '—'} per 4h`;
        return `Costs ${formatGpShort(item.creationCost)} to make`;
    }

    const items = $derived(itemsFor(ranking));
</script>

<HomeBand title="Make right now" blurb={blurbs[ranking]} {compact}>
    {#snippet actions()}
        {#if rankings.length > 1}
            <ToggleGroup.Root
                type="single"
                value={ranking}
                onValueChange={(value) => {
                    if (value) ranking = value as Ranking;
                }}
                class="rounded-md border bg-muted/30 p-1"
            >
                {#each rankings as option (option.value)}
                    <ToggleGroup.Item value={option.value} class="h-8 px-3 text-xs">{option.label}</ToggleGroup.Item>
                {/each}
            </ToggleGroup.Root>
        {/if}
    {/snippet}

    {#if items.length}
        <div class="grid gap-2 md:grid-cols-2">
            {#each items as item, index (item.id)}
                <HomeItemRow {item} rank={index + 1} value={rowValue(item)} tone="positive" detail={rowDetail(item)} />
            {/each}
        </div>
    {:else}
        <p class="text-sm text-muted-foreground">Nothing turns a profit at today's prices.</p>
    {/if}
</HomeBand>
