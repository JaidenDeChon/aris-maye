<script lang="ts">
    import HomeBand from './home-band.svelte';
    import HomeItemRow from './home-item-row.svelte';
    import { formatChange, formatGpShort } from '$lib/helpers/homepage';
    import type { HomepageItem, HomepageMarketPulse } from '$lib/models/homepage';

    /**
     * What's trading on the GE right now. The hourly price job keeps a day of trade history for
     * every item, backfilling any hours it's missing, so all three columns have data from its
     * first run.
     */
    const { pulse, compact = false }: { pulse: HomepageMarketPulse; compact?: boolean } = $props();

    /** The day's median price, falling back to the latest high and low for an item without one yet. */
    function typicalPrice(item: HomepageItem): number | null {
        if (item.typicalPrice24h) return item.typicalPrice24h;
        const prices = [item.highPrice, item.lowPrice].filter((p): p is number => typeof p === 'number' && p > 0);
        return prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    }

    function tradedDetail(item: HomepageItem): string {
        const mid = typicalPrice(item);
        const value = mid !== null && item.volume1h ? ` · ${formatGpShort(mid * item.volume1h)} gp` : '';
        return `Traded this hour${value}`;
    }

    function moverDetail(item: HomepageItem): string {
        return `${formatGpShort(typicalPrice(item))} gp · ${formatGpShort(item.volume24h)} traded today`;
    }
</script>

{#snippet column(title: string, items: HomepageItem[], render: 'traded' | 'rise' | 'fall', empty: string)}
    <div class="flex min-w-0 flex-col gap-2">
        <h3 class="text-sm font-semibold">{title}</h3>
        {#each items as item (item.id)}
            {#if render === 'traded'}
                <HomeItemRow {item} value={formatGpShort(item.volume1h)} detail={tradedDetail(item)} />
            {:else}
                <HomeItemRow
                    {item}
                    value={formatChange(item.priceChange24h)}
                    tone={render === 'rise' ? 'positive' : 'negative'}
                    detail={moverDetail(item)}
                />
            {/if}
        {:else}
            <p class="text-sm text-muted-foreground">{empty}</p>
        {/each}
    </div>
{/snippet}

<HomeBand title="Market pulse" blurb="What's trading on the Grand Exchange" {compact} showSeeAll={false}>
    <div class="grid gap-6 lg:grid-cols-3">
        {@render column('Most traded this hour', pulse.mostTraded, 'traded', 'No trades recorded this hour.')}
        {@render column('Rising today', pulse.risers, 'rise', 'Nothing busy has risen today.')}
        {@render column('Falling today', pulse.fallers, 'fall', 'Nothing busy has fallen today.')}
    </div>
</HomeBand>
