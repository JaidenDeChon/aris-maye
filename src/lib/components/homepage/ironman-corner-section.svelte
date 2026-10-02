<script lang="ts">
    import HomeBand from './home-band.svelte';
    import HomeItemRow from './home-item-row.svelte';
    import CheapXpRow from './cheap-xp-row.svelte';
    import { formatGpShort } from '$lib/helpers/homepage';
    import type { HomepageIronmanCorner } from '$lib/models/homepage';
    import type { Snippet } from 'svelte';

    /**
     * Money-makers for accounts that can't use the GE.
     *
     * For an Ironman profile the page's main sections are already valued the Ironman way, so the
     * crafting and XP lists here would repeat them; `ironman` drops those and keeps what's unique
     * to this corner.
     */
    const {
        corner,
        ironman = false,
        compact = false,
    }: { corner: HomepageIronmanCorner; ironman?: boolean; compact?: boolean } = $props();

    const showCrafting = $derived(!ironman && corner.craftToAlch.length > 0);
    const showXp = $derived(!ironman && corner.cheapXp.length > 0);

    function salesDetail(sale: HomepageIronmanCorner['shopSales'][number]): string {
        const alch = sale.alchValue > 0 ? `alch ${formatGpShort(sale.alchValue)}` : 'no alch';
        const drop =
            sale.salesToFloor && sale.floorPrice < sale.firstPrice
                ? ` · ${sale.salesToFloor} sales to ${formatGpShort(sale.floorPrice)}`
                : '';
        return `${sale.shop} · ${alch}${drop}`;
    }
</script>

{#snippet block(title: string, blurb: string, body: Snippet)}
    <div class="flex min-w-0 flex-col gap-2">
        <div>
            <h3 class="text-sm font-semibold">{title}</h3>
            <p class="text-xs text-muted-foreground">{blurb}</p>
        </div>
        {@render body()}
    </div>
{/snippet}

<HomeBand title="Ironman corner" blurb="Money-makers that don't touch the Grand Exchange" {compact} showSeeAll={false}>
    <div class="grid gap-6 lg:grid-cols-2">
        {#snippet salesBody()}
            {#each corner.shopSales as sale (sale.item.id)}
                <HomeItemRow
                    item={sale.item}
                    value={formatGpShort(sale.firstPrice)}
                    tone="positive"
                    detail={salesDetail(sale)}
                />
            {:else}
                <p class="text-sm text-muted-foreground">No shop pays more than alching right now.</p>
            {/each}
        {/snippet}
        {@render block('Sell to shops', 'Items a shop pays more for than they alch for.', salesBody)}

        {#snippet suppliedBody()}
            {#each corner.shopSupplied as item (item.id)}
                <HomeItemRow
                    {item}
                    value={formatGpShort(item.creationProfit, true)}
                    tone="positive"
                    detail={`Ingredients cost ${formatGpShort(item.creationCost)} from shops`}
                />
            {:else}
                <p class="text-sm text-muted-foreground">Nothing made from shop stock alchs at a profit.</p>
            {/each}
        {/snippet}
        {@render block(
            'Make from shop stock',
            'Every ingredient comes from a shop, and the result alchs for more.',
            suppliedBody,
        )}

        {#if showCrafting}
            {#snippet craftBody()}
                {#each corner.craftToAlch as item (item.id)}
                    <HomeItemRow
                        {item}
                        value={formatGpShort(item.creationProfit, true)}
                        tone="positive"
                        detail="Alch value gained per item"
                    />
                {/each}
            {/snippet}
            {@render block('Craft to alch', 'Creations that alch for more than their ingredients.', craftBody)}
        {/if}

        {#if showXp}
            {#snippet xpBody()}
                {#each corner.cheapXp as row (row.skill)}
                    <CheapXpRow {row} />
                {/each}
            {/snippet}
            {@render block('Cheapest Ironman XP', 'Alch value lost per XP, by skill.', xpBody)}
        {/if}
    </div>
</HomeBand>
