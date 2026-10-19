<script lang="ts">
    /**
     * Finds items in colours that go with something you're wearing (or any colour you pick), using
     * scape.fashion's colour matching, and puts them on with a click.
     */
    import { untrack } from 'svelte';
    import WithTooltip from '$lib/components/transmog/with-tooltip.svelte';
    import { itemIconPath } from '$lib/constants/calculators';
    import type { WearableItem } from '$lib/osrs-model/types';
    import { itemMainColour, slotSprite } from '$lib/transmog/data';
    import { SLOTS, VISIBLE_SLOTS, type Outfit } from '$lib/transmog/outfit';
    import {
        fetchItemColours,
        fetchMatches,
        nameIndex,
        toMatches,
        type Match,
        type MatchSource,
    } from '$lib/transmog/scape-fashion';

    interface Props {
        itemList: WearableItem[];
        items: Map<number, WearableItem>;
        outfit: Outfit;
        /** Equipment slot to find items for, or null for all of them. */
        slot: number | null;
        onpick: (item: WearableItem) => void;
        onremove: (slot: number) => void;
        onclearslot: () => void;
    }

    const { itemList, items, outfit, slot, onpick, onremove, onclearslot }: Props = $props();

    const PAGE_SIZE = 40;

    const index = $derived(nameIndex(itemList));
    const slotInfo = $derived(slot === null ? null : SLOTS.find((s) => s.id === slot));
    const equippedHere = $derived(slot === null ? undefined : outfit.equipment[slot]);

    /** Worn items, in equipment tab order. */
    const worn = $derived(
        VISIBLE_SLOTS.flatMap((s) => {
            const id = outfit.equipment[s.id];
            const item = id === undefined ? undefined : items.get(id);
            return item ? [item] : [];
        }),
    );

    type Choice = { kind: 'item'; id: number } | { kind: 'colour'; hex: string };
    let picked = $state<Choice | null>(null);

    /**
     * What to match against: what was picked, while it's still worn; otherwise the first worn item
     * outside the slot being searched, since that's usually the thing to match.
     */
    const choice = $derived.by((): Choice | null => {
        const current = picked;
        if (current?.kind === 'colour') return current;
        if (current?.kind === 'item' && worn.some((i) => i.id === current.id)) return current;
        const first = worn.find((i) => i.slot !== slot) ?? worn[0];
        return first ? { kind: 'item', id: first.id } : null;
    });
    const sourceItem = $derived(choice?.kind === 'item' ? items.get(choice.id) : undefined);

    let tradeableOnly = $state(false);
    let colourInput = $state('#7f1d1d');

    let swatches = $state<string[]>([]);
    /** Set when scape.fashion doesn't know the item, so its main colour is used instead. */
    let usedMainColour = $state(false);
    let matches = $state.raw<Match[]>([]);
    let loading = $state(false);
    let failed = $state(false);
    let unknownColours = $state(false);
    let page = 0;
    let lastPage = 0;
    let source: MatchSource | null = null;
    let seen = new Set<number>();
    let controller: AbortController | null = null;

    const hasMore = $derived(!loading && !failed && source !== null && page < lastPage);

    // Start over whenever what's matched, where, or for which body changes.
    $effect(() => {
        const current = choice;
        const item = sourceItem;
        const target = slot;
        const tradeable = tradeableOnly;
        const gender = outfit.gender;
        untrack(() => start(current, item, target, tradeable, gender));
        return () => controller?.abort();
    });

    async function start(
        current: Choice | null,
        item: WearableItem | undefined,
        target: number | null,
        tradeable: boolean,
        gender: Outfit['gender'],
    ): Promise<void> {
        controller?.abort();
        const own = new AbortController();
        controller = own;
        matches = [];
        swatches = [];
        usedMainColour = false;
        failed = false;
        unknownColours = false;
        source = null;
        page = 0;
        lastPage = 0;
        if (list) list.scrollTop = 0;
        if (!current) return;
        seen = new Set(item ? [item.id] : []);
        loading = true;
        try {
            let next: MatchSource;
            if (current.kind === 'colour') {
                next = { by: 'colour', colour: current.hex };
                swatches = [current.hex];
            } else if (item) {
                const colours = await fetchItemColours(item, own.signal);
                if (colours) {
                    next = { by: 'item', name: item.name };
                    swatches = colours;
                } else {
                    const hex = await itemMainColour(item, gender);
                    if (own.signal.aborted) return;
                    if (!hex) {
                        unknownColours = true;
                        return;
                    }
                    next = { by: 'colour', colour: hex };
                    swatches = [hex];
                    usedMainColour = true;
                }
            } else {
                return;
            }
            const result = await fetchMatches(
                { source: next, slot: target, tradeableOnly: tradeable, page: 0, pageSize: PAGE_SIZE },
                own.signal,
            );
            source = next;
            lastPage = result.lastPage;
            matches = toMatches(result.items, index, gender, seen);
        } catch (error) {
            if (own.signal.aborted) return;
            console.warn('Colour matching failed', error);
            failed = true;
        } finally {
            if (controller === own) loading = false;
        }
    }

    async function loadMore(): Promise<void> {
        if (!hasMore || !source || !controller) return;
        const own = controller;
        loading = true;
        try {
            const result = await fetchMatches(
                { source, slot, tradeableOnly, page: page + 1, pageSize: PAGE_SIZE },
                own.signal,
            );
            page += 1;
            lastPage = result.lastPage;
            matches = [...matches, ...toMatches(result.items, index, outfit.gender, seen)];
        } catch (error) {
            if (own.signal.aborted) return;
            console.warn('Colour matching failed', error);
            failed = true;
        } finally {
            if (controller === own) loading = false;
        }
    }

    function retry(): void {
        start(choice, sourceItem, slot, tradeableOnly, outfit.gender);
    }

    // Load more while the end of the list is in view. Results that aren't wearable get dropped, so
    // one page can come back short and leave the end still showing.
    let list: HTMLUListElement | undefined = $state();
    let sentinel: HTMLLIElement | undefined = $state();
    let atEnd = $state(false);
    $effect(() => {
        if (!list || !sentinel) {
            atEnd = false;
            return;
        }
        const observer = new IntersectionObserver(([entry]) => (atEnd = entry.isIntersecting), {
            root: list,
            rootMargin: '0px 0px 200px 0px',
        });
        observer.observe(sentinel);
        return () => observer.disconnect();
    });
    $effect(() => {
        if (atEnd && hasMore) untrack(loadMore);
    });

    let missingIcons = $state<Record<number, boolean>>({});
    const slotKey = (id: number) => SLOTS.find((s) => s.id === id)?.key ?? 'tile';
    const isSource = (item: WearableItem) => choice?.kind === 'item' && choice.id === item.id;
</script>

<div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold">
            {slotInfo ? `${slotInfo.label} slot` : 'All slots'}
        </h2>
        <div class="flex gap-3 text-xs">
            {#if equippedHere !== undefined && slot !== null}
                <button
                    type="button"
                    class="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onclick={() => onremove(slot)}
                >
                    Take off
                </button>
            {/if}
            {#if slot !== null}
                <button
                    type="button"
                    class="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onclick={onclearslot}
                >
                    Search all slots
                </button>
            {/if}
        </div>
    </div>

    <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground">Match the colours of</span>
        <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Match the colours of">
            {#each worn as item (item.id)}
                <WithTooltip label={item.name}>
                    {#snippet children(props)}
                        <button
                            {...props}
                            type="button"
                            role="radio"
                            aria-checked={isSource(item)}
                            aria-label={item.name}
                            class="flex size-10 items-center justify-center rounded-md border bg-muted/30 hover:border-primary/60 {isSource(
                                item,
                            )
                                ? 'border-primary ring-1 ring-primary'
                                : ''}"
                            onclick={() => (picked = { kind: 'item', id: item.id })}
                        >
                            <img
                                src={missingIcons[item.id] ? slotSprite(slotKey(item.slot)) : itemIconPath(item.id)}
                                alt=""
                                class="max-h-8 max-w-8 [image-rendering:pixelated]"
                                onerror={() => (missingIcons = { ...missingIcons, [item.id]: true })}
                            />
                        </button>
                    {/snippet}
                </WithTooltip>
            {/each}
            <label
                class="relative flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-muted/30 px-2.5 text-sm hover:border-primary/60 {choice?.kind ===
                'colour'
                    ? 'border-primary ring-1 ring-primary'
                    : ''}"
                title="Pick a colour"
            >
                <span class="size-5 rounded-sm border" style:background-color={colourInput}></span>
                A colour
                <input
                    type="color"
                    class="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Pick a colour to match"
                    bind:value={colourInput}
                    onchange={() => (picked = { kind: 'colour', hex: colourInput })}
                    onclick={() => {
                        if (choice?.kind !== 'colour') picked = { kind: 'colour', hex: colourInput };
                    }}
                />
            </label>
        </div>
    </div>

    {#if swatches.length > 0}
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{sourceItem ? sourceItem.name : 'Colour'}</span>
            <div class="flex gap-1">
                {#each swatches as hex, i (i)}
                    <WithTooltip label="Match just this colour">
                        {#snippet children(props)}
                            <button
                                {...props}
                                type="button"
                                class="size-5 rounded-sm border hover:ring-2 hover:ring-primary"
                                style:background-color={hex}
                                aria-label="Match just {hex}"
                                onclick={() => {
                                    colourInput = hex;
                                    picked = { kind: 'colour', hex };
                                }}
                            ></button>
                        {/snippet}
                    </WithTooltip>
                {/each}
            </div>
        </div>
    {/if}
    {#if usedMainColour}
        <p class="text-xs text-muted-foreground">
            scape.fashion doesn't have this item, so these match its main colour.
        </p>
    {/if}

    <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" class="size-4 accent-primary" bind:checked={tradeableOnly} />
        Tradeable only
    </label>

    <ul
        bind:this={list}
        class="max-h-80 min-h-0 overflow-y-auto rounded-md border bg-muted/20 md:max-h-[26rem]"
        aria-label="Matching items"
        aria-busy={loading}
    >
        {#if !choice}
            <li class="px-3 py-6 text-center text-sm text-muted-foreground">
                Put something on, or pick a colour, to find items that go with it.
            </li>
        {:else if failed}
            <li class="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-muted-foreground">
                Couldn't reach scape.fashion.
                <button type="button" class="text-foreground underline underline-offset-2" onclick={retry}>
                    Try again
                </button>
            </li>
        {:else if unknownColours}
            <li class="px-3 py-6 text-center text-sm text-muted-foreground">
                This item has no colours to match. Pick another item or a colour.
            </li>
        {:else}
            {#each matches as { item, colors, match } (item.id)}
                {@const wearing = outfit.equipment[item.slot] === item.id}
                <li>
                    <button
                        type="button"
                        class="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none {wearing
                            ? 'bg-primary/10'
                            : ''}"
                        aria-pressed={wearing}
                        onclick={() => (wearing ? onremove(item.slot) : onpick(item))}
                    >
                        <span class="flex size-8 shrink-0 items-center justify-center">
                            <img
                                src={missingIcons[item.id] ? slotSprite(slotKey(item.slot)) : itemIconPath(item.id)}
                                alt=""
                                loading="lazy"
                                class="max-h-8 max-w-8 [image-rendering:pixelated] {missingIcons[item.id]
                                    ? 'opacity-40'
                                    : ''}"
                                onerror={() => (missingIcons = { ...missingIcons, [item.id]: true })}
                            />
                        </span>
                        <span class="min-w-0 flex-1 truncate">{item.name}</span>
                        <span class="flex shrink-0 gap-0.5" aria-hidden="true">
                            {#each colors as hex, i (i)}
                                <span class="size-3 rounded-[2px] border border-black/10" style:background-color={hex}
                                ></span>
                            {/each}
                        </span>
                        <span class="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                            {#if wearing}
                                <span class="text-primary">Worn</span>
                            {:else}
                                <span class="sr-only">Colour match </span>{Math.round(match * 100)}%
                            {/if}
                        </span>
                    </button>
                </li>
            {:else}
                {#if !loading}
                    <li class="px-3 py-6 text-center text-sm text-muted-foreground">No matches here.</li>
                {/if}
            {/each}
            {#if loading}
                <li class="px-3 py-2 text-center text-xs text-muted-foreground">Finding matches…</li>
            {:else if hasMore}
                <li bind:this={sentinel} class="px-3 py-2 text-center text-xs text-muted-foreground">Loading more…</li>
            {/if}
        {/if}
    </ul>
</div>
