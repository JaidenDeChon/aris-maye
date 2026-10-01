<script lang="ts">
    import { resolve } from '$app/paths';
    import StatTile from '$lib/components/global/stat-tile.svelte';
    import { formatGpShort, formatRoi } from '$lib/helpers/homepage';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import type { HomepageItem, HomepageSnapshot } from '$lib/models/homepage';

    /** The headline numbers across the top of the homepage, each linking to its item. */
    const { snapshot }: { snapshot: HomepageSnapshot } = $props();

    type Tile = { label: string; value: string; item: Pick<HomepageItem, 'id' | 'name' | 'icon'> };

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
        return list;
    });
</script>

{#if tiles.length}
    <div
        class="-mx-8 flex snap-x gap-3 overflow-x-auto px-8 pb-1 [contain:inline-size] md:mx-0 md:grid md:overflow-visible md:px-0"
        style:grid-template-columns={`repeat(${tiles.length}, minmax(0, 1fr))`}
    >
        {#each tiles as tile (tile.label)}
            <a
                href={resolve(`/items/${tile.item.id}`)}
                class="min-w-[11rem] shrink-0 snap-start rounded-md transition-transform hover:-translate-y-0.5 md:min-w-0"
            >
                <StatTile label={tile.label} value={tile.value} hint={tile.item.name} tone="positive">
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
