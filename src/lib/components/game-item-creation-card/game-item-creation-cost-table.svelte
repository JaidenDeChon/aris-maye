<script lang="ts">
    import * as Table from '$lib/components/ui/table';
    import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
    import { buildCostRows, totalCost, type CostRow, type CostRowKey } from '$lib/helpers/creation-cost-rows';
    import type { GameItemCreationSpecs, IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
    import { bankItemsStore, ensureSuppliesForCharacter, getSuppliesForCharacter } from '$lib/stores/bank-items-store';
    import { getStoreRoot } from '$lib/stores/character-store.svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { resolve } from '$app/paths';

    interface GameItemCreationCostTableProps {
        gameItem: IOsrsboxItemWithMeta | null;
        creationSpec?: GameItemCreationSpecs | null;
        /** Told the cost of what the reader has not ticked as owned, or null when it can't be priced. */
        onTotalChange?: (total: number | null) => void;
    }

    const { gameItem, creationSpec = null, onTotalChange }: GameItemCreationCostTableProps = $props();

    const rootSpec = $derived(creationSpec ?? getPrimaryCreationSpec(gameItem) ?? null);
    const characterStore = $derived(getStoreRoot());
    const activeCharacterId = $derived(characterStore?.activeCharacter ?? null);

    $effect(() => {
        ensureSuppliesForCharacter(activeCharacterId);
    });

    const bankItems = $derived(getSuppliesForCharacter($bankItemsStore, activeCharacterId));
    const suppliesOwned = $derived.by(() => {
        const owned = new SvelteSet<string>();
        for (const entry of bankItems) {
            const id = entry?.id;
            const quantity = Math.floor(Number(entry?.quantity ?? 0));
            if (!Number.isFinite(quantity) || quantity <= 0) continue;
            if (id === null || id === undefined) continue;
            owned.add(String(id));
        }
        return owned;
    });

    // Ticks the reader changed by hand. Anything they have not touched follows their supplies.
    let ownedOverrides = $state<Record<string, boolean>>({});
    // Priced ingredients the reader chose to make instead of buy.
    const makeKeys = new SvelteSet<CostRowKey>();

    function isOwned(key: CostRowKey): boolean {
        return ownedOverrides[String(key)] ?? suppliesOwned.has(String(key));
    }

    const costRows = $derived(buildCostRows(rootSpec, { isOwned, makeKeys }));
    const allChecked = $derived(costRows.every((row) => isOwned(row.key)));
    const selectedTotal = $derived(totalCost(costRows, isOwned));

    $effect(() => {
        onTotalChange?.(costRows.length ? selectedTotal : null);
    });

    function toggleRow(key: CostRowKey) {
        ownedOverrides = { ...ownedOverrides, [String(key)]: !isOwned(key) };
    }

    function toggleAll(value: boolean) {
        const next = { ...ownedOverrides };
        for (const row of costRows) next[String(row.key)] = value;
        ownedOverrides = next;
    }

    function setMade(key: CostRowKey, made: boolean) {
        if (made) makeKeys.add(key);
        else makeKeys.delete(key);
    }

    /**
     * A row's display name, or a placeholder when the tree stopped short of loading it.
     *
     * The builder caps how much of a recipe it materializes, so a deep or heavily
     * cross-linked branch can arrive as a bare id. Such a row has no price either, which
     * already makes the total read as unknown — this just stops the cell rendering blank.
     */
    function rowLabel(row: CostRow): string {
        return row.item?.name ?? 'Unknown item';
    }

    function formatNumber(value: number | null | undefined) {
        if (value === null || value === undefined) return '—';
        return Math.round(value).toLocaleString();
    }

    function formatGp(value: number | null | undefined) {
        if (value === null || value === undefined) return '—';
        return `${formatNumber(value)} gp`;
    }
</script>

<section class="flex flex-col gap-2">
    <div>
        <h4 class="text-sm font-semibold">Ingredients and cost</h4>
    </div>

    {#if !costRows.length}
        <p class="text-sm text-muted-foreground">No cost data available.</p>
    {:else}
        <div class="border rounded-md overflow-hidden">
            <Table.Root class="text-xs sm:text-sm">
                <Table.Header>
                    <Table.Row>
                        <Table.Head class="px-2 sm:px-4 w-10 sm:w-20">
                            <label class="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    aria-label="Mark every ingredient as one you already have"
                                    checked={allChecked}
                                    onchange={(event) => toggleAll((event.currentTarget as HTMLInputElement).checked)}
                                />
                                <span class="text-xs sr-only sm:not-sr-only">Have</span>
                            </label>
                        </Table.Head>
                        <Table.Head class="px-2 sm:px-4">Item</Table.Head>
                        <Table.Head class="px-2 sm:px-4 text-end">Qty</Table.Head>
                        <Table.Head class="px-2 sm:px-4 text-end hidden sm:table-cell">Each</Table.Head>
                        <Table.Head class="px-2 sm:px-4 text-end">Cost</Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#each costRows as row (row.key)}
                        {@const owned = isOwned(row.key)}
                        <Table.Row class={owned ? 'bg-muted/40' : ''}>
                            <Table.Cell class="px-2 sm:px-4 w-10 sm:w-20">
                                <input
                                    type="checkbox"
                                    aria-label={`I already have ${rowLabel(row)}`}
                                    checked={owned}
                                    onchange={() => toggleRow(row.key)}
                                />
                            </Table.Cell>
                            <Table.Cell class="px-2 sm:px-4 font-medium">
                                <!-- Indented under the ingredient it is made into, so a made item reads as a group. -->
                                <div
                                    class="flex flex-wrap items-center gap-x-2 gap-y-1"
                                    style:padding-left={row.depth ? `${row.depth}rem` : undefined}
                                >
                                    {#if row.item.id}
                                        <a
                                            class="text-primary hover:underline {owned ? 'opacity-60' : ''}"
                                            href={resolve(`/items/${row.item.id}`)}
                                            data-sveltekit-preload-data="hover"
                                        >
                                            {rowLabel(row)}
                                        </a>
                                    {:else}
                                        <span class={owned ? 'opacity-60' : ''}>{rowLabel(row)}</span>
                                    {/if}
                                    {#if row.mustMake && !owned}
                                        <span
                                            class="whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
                                        >
                                            Made
                                        </span>
                                    {:else if row.makeable && !owned}
                                        <!-- Buying it and making it are the two ways to get it; counting both
                                             would pay for it twice. -->
                                        <div
                                            class="inline-flex rounded-full border p-0.5 text-[0.65rem] font-medium"
                                            role="group"
                                            aria-label={`Buy or make ${rowLabel(row)}`}
                                        >
                                            {#each [false, true] as makeIt (makeIt)}
                                                <button
                                                    type="button"
                                                    class="rounded-full px-2 py-0.5 transition-colors {row.made ===
                                                    makeIt
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'text-muted-foreground hover:text-foreground'}"
                                                    aria-pressed={row.made === makeIt}
                                                    onclick={() => setMade(row.key, makeIt)}
                                                >
                                                    {makeIt ? 'Make' : 'Buy'}
                                                </button>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            </Table.Cell>
                            <Table.Cell class="px-2 sm:px-4 text-end tabular-nums whitespace-nowrap"
                                >{formatNumber(row.amount)}</Table.Cell
                            >
                            <Table.Cell
                                class="px-2 sm:px-4 text-end tabular-nums whitespace-nowrap hidden sm:table-cell"
                            >
                                {#if row.unitPrice === null}
                                    <span class="text-muted-foreground">No price</span>
                                {:else}
                                    {formatGp(row.unitPrice)}
                                {/if}
                            </Table.Cell>
                            <Table.Cell class="px-2 sm:px-4 text-end tabular-nums whitespace-nowrap">
                                {#if owned}
                                    <span class="text-muted-foreground">Have it</span>
                                {:else if row.made}
                                    <span class="text-muted-foreground">Made</span>
                                {:else if row.totalPrice === null}
                                    <span class="text-muted-foreground">—</span>
                                {:else}
                                    {formatGp(row.totalPrice)}
                                {/if}
                                <!-- Phones have no room for the "Each" column, so the unit price rides
                                     under the cost instead. -->
                                <span class="block whitespace-normal text-xs text-muted-foreground sm:hidden">
                                    {row.unitPrice === null ? 'No price' : `${formatGp(row.unitPrice)} each`}
                                </span>
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                </Table.Body>
                <Table.Footer>
                    <Table.Row>
                        <Table.Cell colspan={2} class="px-2 sm:px-4 font-semibold">Total cost</Table.Cell>
                        <Table.Cell class="hidden sm:table-cell"></Table.Cell>
                        <Table.Cell></Table.Cell>
                        <Table.Cell class="px-2 sm:px-4 text-end font-semibold tabular-nums whitespace-nowrap">
                            {selectedTotal === null ? 'Unknown' : formatGp(selectedTotal)}
                        </Table.Cell>
                    </Table.Row>
                </Table.Footer>
            </Table.Root>
        </div>
        {#if selectedTotal === null}
            <p class="text-xs text-muted-foreground">
                Some ingredients have no price we can use, so the total and the profit can't be worked out.
            </p>
        {/if}
    {/if}
</section>
