<script lang="ts">
    import * as Table from '$lib/components/ui/table';
    import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
    import { resolveIngredientUnitPrice } from '$lib/helpers/ingredient-price';
    import type { GameItemCreationSpecs, IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
    import { bankItemsStore, ensureSuppliesForCharacter, getSuppliesForCharacter } from '$lib/stores/bank-items-store';
    import { getStoreRoot } from '$lib/stores/character-store.svelte';
    import { untrack } from 'svelte';
    import { resolve } from '$app/paths';

    interface GameItemCreationCostTableProps {
        gameItem: IOsrsboxItemWithMeta | null;
        creationSpec?: GameItemCreationSpecs | null;
    }

    const { gameItem, creationSpec = null }: GameItemCreationCostTableProps = $props();

    type CostRow = {
        key: string | number;
        item: IOsrsboxItemWithMeta;
        amount: number;
        unitPrice: number | null;
        totalPrice: number | null;
        /** Whether this walk expanded the row into the child rows that carry its real cost. */
        substituted: boolean;
    };

    const rootSpec = $derived(creationSpec ?? getPrimaryCreationSpec(gameItem) ?? null);
    const costRows = $derived(buildCostRows(rootSpec));
    const characterStore = $derived(getStoreRoot());
    const activeCharacterId = $derived(characterStore?.activeCharacter ?? null);

    $effect(() => {
        ensureSuppliesForCharacter(activeCharacterId);
    });

    const bankItems = $derived(getSuppliesForCharacter($bankItemsStore, activeCharacterId));
    const suppliesOwned = $derived.by(() => {
        const owned = new Set<string>();
        for (const entry of bankItems) {
            const id = entry?.id;
            const quantity = Math.floor(Number(entry?.quantity ?? 0));
            if (!Number.isFinite(quantity) || quantity <= 0) continue;
            if (id === null || id === undefined) continue;
            owned.add(String(id));
        }
        return owned;
    });
    const suppliesExpandedOwned = $derived.by(() => {
        const expanded = new Set<string>();
        for (const row of costRows) {
            const itemId = row.item?.id;
            if (itemId === null || itemId === undefined) continue;
            const key = String(itemId);
            if (!suppliesOwned.has(key)) continue;
            const spec = getPrimaryCreationSpec(row.item);
            collectIngredientIds(spec, expanded);
        }
        return expanded;
    });
    // Owned map: checked = already have it, so we should exclude its cost
    let ownedMap = $state<Record<string | number, boolean>>({});

    $effect(() => {
        const prev = untrack(() => ownedMap);
        const next = costRows.map((row) => {
            const existing = prev[row.key];
            if (existing !== undefined) return [row.key, existing];
            const itemId = row.item?.id;
            const supplyKey = itemId === null || itemId === undefined ? null : String(itemId);
            const defaultOwned = supplyKey
                ? suppliesOwned.has(supplyKey) || suppliesExpandedOwned.has(supplyKey)
                : false;
            return [row.key, defaultOwned];
        });
        ownedMap = Object.fromEntries(next);
    });

    const allChecked = $derived(Object.values(ownedMap).every(Boolean));

    const selectedTotal = $derived.by(() => {
        let sum = 0;

        for (const row of costRows) {
            if (ownedMap[row.key]) continue;

            if (row.totalPrice === null) {
                // An untradeable ingredient has no price of its own. Skipping it is only
                // harmless because this walk already expanded it into the child rows that
                // carry the real outlay. With no such rows — no stored recipe, or a cycle
                // cut the walk short — the cost genuinely isn't known, and counting the
                // row as free would report a total, and a profit, that is too good.
                if (row.substituted) continue;
                return null;
            }

            sum += row.totalPrice;
        }

        return sum;
    });

    const geValue = $derived(normalizeNumber(gameItem?.highPrice ?? gameItem?.lowPrice));
    const storeValue = $derived(normalizeNumber(gameItem?.cost));
    const highAlchValue = $derived(normalizeNumber(gameItem?.highalch));
    const lowAlchValue = $derived(normalizeNumber(gameItem?.lowalch));

    function toggleRow(rowKey: string | number) {
        ownedMap = { ...ownedMap, [rowKey]: !ownedMap[rowKey] };
    }

    function toggleAll(value: boolean) {
        ownedMap = Object.fromEntries(costRows.map((row) => [row.key, value]));
    }

    function buildCostRows(spec: GameItemCreationSpecs | null): CostRow[] {
        if (!spec) return [];

        const map = new Map<string | number, CostRow>();
        accumulate(spec, 1, map, new Set());
        return Array.from(map.values()).sort((a, b) => (b.totalPrice ?? 0) - (a.totalPrice ?? 0));
    }

    function accumulate(
        spec: GameItemCreationSpecs,
        multiplier: number,
        map: Map<string | number, CostRow>,
        visited: Set<string | number>,
    ) {
        for (const ing of spec.ingredients ?? []) {
            if (!ing?.item) continue;
            if (ing.consumedDuringCreation === false) continue;

            const item = ing.item as IOsrsboxItemWithMeta;
            const amount = (ing.amount ?? 1) * multiplier;
            const key = item.id ?? item.name ?? crypto.randomUUID();

            const unitPrice = resolveUnitPrice(item);
            const totalPrice = unitPrice !== null ? unitPrice * amount : null;

            const existing = map.get(key);
            if (existing) {
                existing.amount += amount;
                existing.totalPrice =
                    unitPrice !== null && existing.totalPrice !== null
                        ? existing.totalPrice + totalPrice!
                        : (existing.totalPrice ?? totalPrice);
            } else {
                map.set(key, { key, item, amount, unitPrice, totalPrice, substituted: false });
            }

            const childId = item.id ?? null;
            if (childId !== null && visited.has(childId)) continue;

            const childSpec = getPrimaryCreationSpec(item);
            const childConsumes = (childSpec?.ingredients ?? []).some(
                (child) => child?.item && child.consumedDuringCreation !== false,
            );
            if (!childSpec || !childConsumes) continue;

            // Only a recipe that actually contributes rows stands in for this one's price.
            const row = map.get(key);
            if (row) row.substituted = true;

            if (childId !== null) visited.add(childId);
            accumulate(childSpec, amount, map, visited);
            if (childId !== null) visited.delete(childId);
        }
    }

    function collectIngredientIds(spec: GameItemCreationSpecs | null, sink: Set<string>, visited = new Set<string>()) {
        if (!spec) return;
        for (const ing of spec.ingredients ?? []) {
            if (!ing?.item) continue;
            if (ing.consumedDuringCreation === false) continue;

            const item = ing.item as IOsrsboxItemWithMeta;
            const itemId = item.id;
            if (itemId === null || itemId === undefined) continue;
            const key = String(itemId);
            sink.add(key);

            if (visited.has(key)) continue;
            visited.add(key);
            const childSpec = getPrimaryCreationSpec(item);
            if (childSpec) {
                collectIngredientIds(childSpec, sink, visited);
            }
            visited.delete(key);
        }
    }

    function resolveUnitPrice(item?: IOsrsboxItemWithMeta | null): number | null {
        // `cost` is the base game value, not a market price. For an item with no GE
        // market (an untradeable intermediate like "Oak seedling (w)", cost 1) it is
        // not what the player pays, so the price is reported as unknown and the real
        // outlay shows up on the child rows this walk already expands to.
        return resolveIngredientUnitPrice(item);
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

    function normalizeNumber(value: number | null | undefined): number | null {
        return typeof value === 'number' ? value : null;
    }

    function formatDelta(value: number | null, baseline: number | null): string {
        if (value === null || baseline === null) return '—';
        const delta = value - baseline;
        const sign = delta > 0 ? '+' : '';
        return `${sign}${Math.round(delta).toLocaleString()} gp`;
    }
</script>

{#if !costRows.length}
    <p class="text-sm text-muted-foreground p-3">No cost data available.</p>
{:else}
    <Table.Root>
        <Table.Header>
            <Table.Row>
                <Table.Head class="w-16">
                    <input
                        type="checkbox"
                        aria-label="Mark all ingredients as already owned"
                        checked={allChecked}
                        onchange={(event) => toggleAll((event.currentTarget as HTMLInputElement).checked)}
                    />
                </Table.Head>
                <Table.Head>Item (owned?)</Table.Head>
                <Table.Head class="text-end">Qty</Table.Head>
                <Table.Head class="text-end">Unit (GE)</Table.Head>
                <Table.Head class="text-end">Total</Table.Head>
            </Table.Row>
        </Table.Header>
        <Table.Body>
            {#each costRows as row (row.key)}
                <Table.Row>
                    <Table.Cell class="w-16">
                        <input type="checkbox" checked={ownedMap[row.key]} onchange={() => toggleRow(row.key)} />
                    </Table.Cell>
                    <Table.Cell class="font-medium">
                        {#if row.item.id}
                            <a
                                class="text-primary hover:underline"
                                href={resolve(`/items/${row.item.id}`)}
                                data-sveltekit-preload-data="hover"
                            >
                                {rowLabel(row)}
                            </a>
                        {:else}
                            {rowLabel(row)}
                        {/if}
                    </Table.Cell>
                    <Table.Cell class="text-end">{formatNumber(row.amount)}</Table.Cell>
                    <Table.Cell class="text-end">{formatNumber(row.unitPrice)}</Table.Cell>
                    <Table.Cell class="text-end">{formatNumber(ownedMap[row.key] ? 0 : row.totalPrice)}</Table.Cell>
                </Table.Row>
            {/each}
            <Table.Row>
                <Table.Cell colspan={2} class="font-semibold">
                    <div class="inline-flex items-center gap-2">
                        <span class="inline-block h-5 w-5"></span>
                    </div>
                </Table.Cell>
                <Table.Cell class="text-end font-semibold" colspan={3}>{formatNumber(selectedTotal)}</Table.Cell>
            </Table.Row>
            <Table.Row>
                <Table.Cell colspan={2} class="font-semibold">
                    <div class="inline-flex items-center gap-2">
                        <img src="/other-images/grand-exchange.png" alt="Grand Exchange" class="h-5 w-5 drop-shadow" />
                        Profit vs GE (high)
                    </div>
                </Table.Cell>
                <Table.Cell class="text-end font-semibold" colspan={3}>{formatDelta(geValue, selectedTotal)}</Table.Cell
                >
            </Table.Row>
            <Table.Row>
                <Table.Cell colspan={2} class="font-semibold">
                    <div class="inline-flex items-center gap-2">
                        <img src="/other-images/pot.png" alt="General store" class="h-5 w-5 drop-shadow" />
                        Profit vs store
                    </div>
                </Table.Cell>
                <Table.Cell class="text-end font-semibold" colspan={3}
                    >{formatDelta(storeValue, selectedTotal)}</Table.Cell
                >
            </Table.Row>
            <Table.Row>
                <Table.Cell colspan={2} class="font-semibold">
                    <div class="inline-flex items-center gap-2">
                        <img
                            src="/spell-images/high-level-alchemy.png"
                            alt="High alchemy"
                            class="h-5 w-5 drop-shadow"
                        />
                        Profit vs high alch
                    </div>
                </Table.Cell>
                <Table.Cell class="text-end font-semibold" colspan={3}
                    >{formatDelta(highAlchValue, selectedTotal)}</Table.Cell
                >
            </Table.Row>
            <Table.Row>
                <Table.Cell colspan={2} class="font-semibold">
                    <div class="inline-flex items-center gap-2">
                        <img src="/spell-images/low-level-alchemy.png" alt="Low alchemy" class="h-5 w-5 drop-shadow" />
                        Profit vs low alch
                    </div>
                </Table.Cell>
                <Table.Cell class="text-end font-semibold" colspan={3}
                    >{formatDelta(lowAlchValue, selectedTotal)}</Table.Cell
                >
            </Table.Row>
        </Table.Body>
    </Table.Root>
{/if}
