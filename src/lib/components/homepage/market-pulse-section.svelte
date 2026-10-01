<script lang="ts">
    import HomeBand from './home-band.svelte';
    import HomeItemRow from './home-item-row.svelte';
    import { formatChange, formatGpShort } from '$lib/helpers/homepage';
    import type { HomepageItem, HomepageMarketPulse } from '$lib/models/homepage';

    /**
     * What's trading on the GE right now.
     *
     * The hourly price job builds up a day of trade history before risers and fallers mean
     * anything, so until then those columns say so and show how far along the history is. Most
     * traded only needs one hour.
     */
    const { pulse, compact = false }: { pulse: HomepageMarketPulse; compact?: boolean } = $props();

    const moversReady = $derived(pulse.historyHours >= pulse.hoursNeeded);
    const progress = $derived(Math.min(100, Math.round((pulse.historyHours / pulse.hoursNeeded) * 100)));

    function midPrice(item: HomepageItem): number | null {
        const prices = [item.highPrice, item.lowPrice].filter((p): p is number => typeof p === 'number' && p > 0);
        return prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    }

    function tradedDetail(item: HomepageItem): string {
        const mid = midPrice(item);
        const value = mid !== null && item.volume1h ? ` · ${formatGpShort(mid * item.volume1h)} gp` : '';
        return `Traded this hour${value}`;
    }

    function moverDetail(item: HomepageItem): string {
        return `${formatGpShort(midPrice(item))} gp · ${formatGpShort(item.volume24h)} traded today`;
    }
</script>

{#snippet comingSoon(title: string, body: string)}
    <div class="flex flex-col gap-3 rounded-md border border-dashed bg-muted/20 p-4">
        <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">{title}</span>
            <span
                class="rounded-full border border-primary/40 bg-primary/10 px-2 py-px text-[10px] font-medium uppercase tracking-wide text-primary"
            >
                Coming soon
            </span>
        </div>
        <p class="text-xs text-muted-foreground">{body}</p>
        <div class="flex flex-col gap-1">
            <div
                class="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={pulse.hoursNeeded}
                aria-valuenow={pulse.historyHours}
                aria-label="Trade history collected"
            >
                <div class="h-full rounded-full bg-primary transition-all" style:width={`${progress}%`}></div>
            </div>
            <span class="text-[11px] text-muted-foreground tabular-nums">
                {pulse.historyHours} of {pulse.hoursNeeded} hours of trade data collected
            </span>
        </div>
    </div>
{/snippet}

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
    {#if pulse.historyHours === 0}
        {@render comingSoon(
            'Trading activity',
            "Most traded items and the day's biggest price moves show up here once the hourly price update has collected some trade data.",
        )}
    {:else}
        <div class="grid gap-6 lg:grid-cols-3">
            {@render column('Most traded this hour', pulse.mostTraded, 'traded', 'No trades recorded this hour.')}
            {#if moversReady}
                {@render column('Rising today', pulse.risers, 'rise', 'Nothing busy has risen today.')}
                {@render column('Falling today', pulse.fallers, 'fall', 'Nothing busy has fallen today.')}
            {:else}
                <div class="lg:col-span-2">
                    {@render comingSoon(
                        "Today's risers and fallers",
                        'Price moves need a full day of trade data, so they show up about a day after tracking started.',
                    )}
                </div>
            {/if}
        </div>
    {/if}
</HomeBand>
