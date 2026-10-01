<script lang="ts">
    import HomeBand from './home-band.svelte';
    import HomeItemRow from './home-item-row.svelte';
    import { formatGpPerXp, formatGpShort, skillIcon, skillLabel } from '$lib/helpers/homepage';
    import type { HomepageCheapXp, HomepageSnapshot } from '$lib/models/homepage';

    /** Things worth buying to alch, and the cheapest XP each skill can buy. */
    const { snapshot, compact = false }: { snapshot: HomepageSnapshot; compact?: boolean } = $props();

    /** gp earned per XP on a creation that turns a profit. */
    function xpProfit(row: HomepageCheapXp): number {
        return Math.max(0, row.item.creationProfit ?? 0) / row.xp;
    }

    const showAlch = $derived(!snapshot.ironman && snapshot.alchPicks.length > 0);
</script>

<HomeBand
    title={showAlch ? 'Alching & cheap XP' : 'Cheapest XP'}
    blurb={snapshot.ironman
        ? 'The cheapest way to train each skill by making something, counted in alch value lost.'
        : 'Items worth buying to alch, and the cheapest way to train each skill by making something.'}
    {compact}
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
            </div>
        {/if}

        <div class="flex flex-col gap-2">
            <h3 class="text-sm font-semibold">Cheapest XP per skill</h3>
            <div class="grid gap-2 {showAlch ? '' : 'md:grid-cols-2'}">
                {#each snapshot.cheapXp as row (row.skill)}
                    {@const profitable = row.gpPerXp === 0}
                    <HomeItemRow
                        item={row.item}
                        value={profitable ? `+${formatGpPerXp(xpProfit(row))}` : formatGpPerXp(row.gpPerXp)}
                        tone={profitable ? 'positive' : 'neutral'}
                        detail={`${row.xp.toLocaleString('en-US')} xp each`}
                    >
                        <span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span class="flex items-center gap-1">
                                <img src={skillIcon(row.skill)} alt="" class="h-3.5 w-3.5" />
                                {skillLabel(row.skill)}
                            </span>
                            <span
                                class="rounded-full border px-1.5 py-px text-[10px] font-medium leading-4 {profitable
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'border-border bg-muted text-muted-foreground'}"
                            >
                                {profitable ? 'Profitable' : 'Not profitable'}
                            </span>
                        </span>
                    </HomeItemRow>
                {/each}
            </div>
        </div>
    </div>
</HomeBand>
