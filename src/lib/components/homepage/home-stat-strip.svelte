<script lang="ts">
    import { resolve } from '$app/paths';
    import StatTile from '$lib/components/global/stat-tile.svelte';
    import { formatChange, formatGpShort, formatRoi } from '$lib/helpers/homepage';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import type { HomepageItem, HomepageSnapshot } from '$lib/models/homepage';

    /** The headline numbers across the top of the homepage, each linking to its item. */
    const { snapshot }: { snapshot: HomepageSnapshot } = $props();

    type Tile = {
        label: string;
        value: string;
        item: Pick<HomepageItem, 'id' | 'name' | 'icon'>;
        tone?: 'positive' | 'negative' | 'neutral';
    };

    /** Whichever of today's top riser and top faller moved further. */
    function biggestMover(): HomepageItem | null {
        const riser = snapshot.marketPulse?.risers[0];
        const faller = snapshot.marketPulse?.fallers[0];
        if (!riser || !faller) return riser ?? faller ?? null;
        return Math.abs(faller.priceChange24h ?? 0) > Math.abs(riser.priceChange24h ?? 0) ? faller : riser;
    }

    const tiles = $derived.by(() => {
        const list: Tile[] = [];
        const profit = snapshot.topProfit[0];
        if (profit) {
            list.push({
                label: snapshot.ironman ? 'Best Ironman profit' : 'Best profit per item',
                value: formatGpShort(profit.creationProfit, true),
                item: profit,
            });
        }
        const roi = snapshot.topRoi[0];
        if (roi) list.push({ label: 'Best return', value: formatRoi(roi.creationRoi), item: roi });
        const perLimit = snapshot.topGpPerLimit[0];
        if (perLimit) {
            list.push({
                label: 'Most gp per 4 hours',
                value: formatGpShort(perLimit.gpPerLimit, true),
                item: perLimit,
            });
        }
        const alch = snapshot.alchPicks[0];
        if (alch) list.push({ label: 'Best alch', value: formatGpShort(alch.profit, true), item: alch.item });
        const traded = snapshot.marketPulse?.mostTraded[0];
        if (traded) {
            list.push({
                label: 'Most traded this hour',
                value: formatGpShort(traded.volume1h),
                item: traded,
                tone: 'neutral',
            });
        }
        const mover = biggestMover();
        if (mover) {
            list.push({
                label: 'Biggest mover today',
                value: formatChange(mover.priceChange24h),
                item: mover,
                tone: (mover.priceChange24h ?? 0) < 0 ? 'negative' : 'positive',
            });
        }
        return list;
    });
    // Up to four tiles fit one row on desktop; more wrap into two even rows.
    const columns = $derived(tiles.length > 4 ? Math.ceil(tiles.length / 2) : tiles.length);
</script>

<!--
    On phones the strip scrolls sideways and bleeds past the page padding, so the next card peeks in.
    `scroll-px-8` makes snapping respect that padding, so the first card lines up with the page
    content instead of snapping to the screen edge.
-->
{#if tiles.length}
    <div
        class="-mx-8 flex snap-x scroll-px-8 gap-3 overflow-x-auto px-8 pt-1 pb-4 [contain:inline-size] md:mx-0 md:grid md:scroll-px-0 md:overflow-visible md:px-0 md:pb-1"
        style:grid-template-columns={`repeat(${columns}, minmax(0, 1fr))`}
    >
        {#each tiles as tile (tile.label)}
            <a
                href={resolve(`/items/${tile.item.id}`)}
                class="min-w-[11rem] shrink-0 snap-start rounded-md transition-transform hover:-translate-y-0.5 md:min-w-0"
            >
                <StatTile label={tile.label} value={tile.value} hint={tile.item.name} tone={tile.tone ?? 'positive'}>
                    {#snippet icon()}
                        {#if tile.item.icon}
                            <img src={iconToDataUri(tile.item.icon)} alt="" class="max-h-5 max-w-5 drop-shadow" />
                        {/if}
                    {/snippet}
                </StatTile>
            </a>
        {/each}
    </div>
{/if}
