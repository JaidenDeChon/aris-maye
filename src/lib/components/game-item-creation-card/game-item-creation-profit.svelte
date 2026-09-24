<script lang="ts">
    import StatTile from '$lib/components/global/stat-tile.svelte';
    import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

    interface GameItemCreationProfitProps {
        gameItem: IOsrsboxItemWithMeta | null;
        /** What the ingredients cost, as totalled by the cost table next to this. */
        totalCost: number | null;
    }

    const { gameItem, totalCost }: GameItemCreationProfitProps = $props();

    const geValue = $derived(normalizeNumber(gameItem?.highPrice ?? gameItem?.lowPrice));
    const storeValue = $derived(normalizeNumber(gameItem?.cost));
    const highAlchValue = $derived(normalizeNumber(gameItem?.highalch));
    const lowAlchValue = $derived(normalizeNumber(gameItem?.lowalch));

    const options = $derived([
        {
            label: 'Sell on the GE',
            value: geValue,
            icon: '/other-images/grand-exchange.png',
        },
        {
            label: 'Base value',
            value: storeValue,
            icon: '/other-images/pot.png',
        },
        {
            label: 'High alch',
            value: highAlchValue,
            hint: highAlchValue === null ? undefined : 'Not including nature runes',
            icon: '/spell-images/high-level-alchemy.png',
        },
        {
            label: 'Low alch',
            value: lowAlchValue,
            hint: lowAlchValue === null ? undefined : 'Not including nature runes',
            icon: '/spell-images/low-level-alchemy.png',
        },
    ]);

    function normalizeNumber(value: number | null | undefined): number | null {
        return typeof value === 'number' ? value : null;
    }

    function formatDelta(value: number | null, baseline: number | null): string {
        if (value === null || baseline === null) return '—';
        const delta = value - baseline;
        const sign = delta > 0 ? '+' : '';
        return `${sign}${Math.round(delta).toLocaleString()} gp`;
    }

    function deltaTone(value: number | null, baseline: number | null): 'neutral' | 'positive' | 'negative' | 'muted' {
        if (value === null || baseline === null) return 'muted';
        const delta = Math.round(value - baseline);
        if (delta === 0) return 'neutral';
        return delta > 0 ? 'positive' : 'negative';
    }
</script>

<section class="flex flex-col gap-2">
    <div>
        <h4 class="text-sm font-semibold">Profit per item made</h4>
        <p class="text-xs text-muted-foreground">What's left of each sale once the ingredients are paid for.</p>
    </div>
    <div class="grid grid-cols-2 gap-3">
        {#each options as option (option.label)}
            <StatTile
                label={option.label}
                value={formatDelta(option.value, totalCost)}
                tone={deltaTone(option.value, totalCost)}
                hint={option.hint}
            >
                {#snippet icon()}
                    <img src={option.icon} alt="" class="h-4 w-4 drop-shadow" />
                {/snippet}
            </StatTile>
        {/each}
    </div>
</section>
