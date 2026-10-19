<script lang="ts">
    /** What the outfit costs on the Grand Exchange, slot by slot, from the site's hourly prices. */
    import { resolve } from '$app/paths';
    import { formatWithCommas } from '$lib/helpers/format-number';
    import type { WearableItem } from '$lib/osrs-model/types';
    import { SLOTS, type Outfit } from '$lib/transmog/outfit';

    interface Props {
        outfit: Outfit;
        items: Map<number, WearableItem>;
    }

    const { outfit, items }: Props = $props();

    /** Prices fetched so far, by item id; null when the site has no price for it. */
    let prices = $state<Record<number, number | null>>({});
    let failed = $state(false);

    const rows = $derived(
        SLOTS.flatMap((slot) => {
            const id = outfit.equipment[slot.id];
            const item = id === undefined ? undefined : items.get(id);
            return item ? [{ slot: slot.label, item }] : [];
        }),
    );

    $effect(() => {
        const wanted = rows.filter((r) => r.item.geTradeable && !(r.item.id in prices)).map((r) => r.item.id);
        if (wanted.length === 0) return;
        const params = new URLSearchParams(wanted.map((id) => ['id', String(id)]));
        let cancelled = false;
        fetch(`/api/game-items?${params}`)
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((found: { id: number; highPrice?: number | null; lowPrice?: number | null }[]) => {
                if (cancelled) return;
                const next = { ...prices };
                for (const id of wanted) next[id] = null;
                for (const item of found) {
                    const price = item.highPrice ?? item.lowPrice ?? null;
                    next[item.id] = typeof price === 'number' && price > 0 ? price : null;
                }
                prices = next;
                failed = false;
            })
            .catch(() => {
                if (!cancelled) failed = true;
            });
        return () => {
            cancelled = true;
        };
    });

    const total = $derived(rows.reduce((sum, r) => sum + (prices[r.item.id] ?? 0), 0));
    const priced = $derived(rows.filter((r) => typeof prices[r.item.id] === 'number').length);
</script>

<section class="flex flex-col gap-3 rounded-md border bg-muted/20 p-4" aria-labelledby="outfit-cost-heading">
    <h2 id="outfit-cost-heading" class="font-semibold">Outfit cost</h2>
    {#if rows.length === 0}
        <p class="text-sm text-muted-foreground">Put something on to see what it costs on the Grand Exchange.</p>
    {:else}
        <table class="w-full text-sm">
            <tbody>
                {#each rows as { slot, item } (item.id)}
                    <tr class="border-b border-border/50 last:border-0">
                        <td class="py-1.5 pr-3 text-muted-foreground">{slot}</td>
                        <td class="py-1.5 pr-3">
                            {#if item.geTradeable}
                                <a href={resolve(`/items/${item.id}`)} class="hover:underline">{item.name}</a>
                            {:else}
                                {item.name}
                            {/if}
                        </td>
                        <td class="py-1.5 text-right whitespace-nowrap tabular-nums">
                            {#if !item.geTradeable}
                                <span class="text-muted-foreground">Not on the GE</span>
                            {:else if !(item.id in prices)}
                                <span class="text-muted-foreground">…</span>
                            {:else if prices[item.id] === null}
                                <span class="text-muted-foreground">No price</span>
                            {:else}
                                {formatWithCommas(prices[item.id])} gp
                            {/if}
                        </td>
                    </tr>
                {/each}
            </tbody>
            <tfoot>
                <tr>
                    <th scope="row" colspan="2" class="pt-2 text-left font-semibold">Total</th>
                    <td class="pt-2 text-right font-semibold whitespace-nowrap tabular-nums"
                        >{formatWithCommas(total)} gp</td
                    >
                </tr>
            </tfoot>
        </table>
        <p class="text-xs text-muted-foreground">
            {#if failed}
                Prices couldn't be loaded just now.
            {:else if priced < rows.length}
                The total only counts items with a Grand Exchange price.
            {:else}
                From hourly Grand Exchange prices.
            {/if}
        </p>
    {/if}
</section>
