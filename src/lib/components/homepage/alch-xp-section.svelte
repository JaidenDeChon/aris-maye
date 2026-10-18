<script lang="ts">
    import HomeBand from './home-band.svelte';
    import HomeItemRow from './home-item-row.svelte';
    import CheapXpRow from './cheap-xp-row.svelte';
    import { resolve } from '$app/paths';
    import { formatGpShort } from '$lib/helpers/homepage';
    import type { GuidePath } from '$lib/constants/guides';
    import type { HomepageSnapshot } from '$lib/models/homepage';

    /** Things worth buying to alch, and the cheapest XP each skill can buy. */
    const { snapshot, compact = false }: { snapshot: HomepageSnapshot; compact?: boolean } = $props();

    const showAlch = $derived(!snapshot.ironman && snapshot.alchPicks.length > 0);
</script>

{#snippet guideLink(href: GuidePath, label: string)}
    <a
        href={resolve(href)}
        class="self-start text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
    >
        {label} →
    </a>
{/snippet}

<HomeBand
    title={showAlch ? 'Alching & cheap XP' : 'Cheapest XP'}
    blurb={snapshot.ironman
        ? 'The cheapest way to train each skill by making something, counted in alch value lost.'
        : 'Items worth buying to alch, and the cheapest way to train each skill by making something.'}
    {compact}
    showSeeAll={false}
>
    <div class="grid gap-6 {showAlch ? 'lg:grid-cols-2' : ''}">
        {#if showAlch}
            <div class="flex flex-col gap-2">
                <h3 class="flex items-center gap-2 text-sm font-semibold">
                    <img src="/spell-images/high-level-alchemy.png" alt="" class="h-5 w-5" />
                    Buy to alch
                </h3>
                <p class="text-xs text-muted-foreground">
                    High alch value, less the instant-buy price and a nature rune at
                    {formatGpShort(snapshot.natureRunePrice)} gp.
                </p>
                {#each snapshot.alchPicks as pick (pick.item.id)}
                    <HomeItemRow
                        item={pick.item}
                        value={formatGpShort(pick.profit, true)}
                        tone="positive"
                        detail={`Buy ${formatGpShort(pick.buyPrice)} · alch ${formatGpShort(pick.highalch)} · limit ${pick.item.buyLimit?.toLocaleString('en-US') ?? '—'}`}
                    />
                {/each}
                {@render guideLink('/guides/high-alch', 'Full high alch list')}
            </div>
        {/if}

        <div class="flex flex-col gap-2">
            <h3 class="text-sm font-semibold">Cheapest XP per skill</h3>
            <div class="grid gap-2 {showAlch ? '' : 'md:grid-cols-2'}">
                {#each snapshot.cheapXp as row (row.skill)}
                    <CheapXpRow {row} />
                {/each}
            </div>
            {#if snapshot.ironman}
                {@render guideLink('/guides/ironman-money-making', 'Ironman money making')}
            {:else}
                {@render guideLink('/guides/cheapest-xp', 'Cheapest XP by level')}
            {/if}
        </div>
    </div>
</HomeBand>
