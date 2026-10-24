<script lang="ts">
    /**
     * Searches the wearable items, limited to the selected slot when there is one. Picking an item
     * puts it on.
     */
    import { untrack } from 'svelte';
    import { Input } from '$lib/components/ui/input';
    import { itemIconPath } from '$lib/constants/calculators';
    import type { WearableItem } from '$lib/osrs-model/types';
    import { slotSprite } from '$lib/transmog/data';
    import { SLOTS, type Outfit } from '$lib/transmog/outfit';

    interface Props {
        itemList: WearableItem[];
        outfit: Outfit;
        /** Equipment slot to search in, or null for all of them. */
        slot: number | null;
        onpick: (item: WearableItem) => void;
        onremove: (slot: number) => void;
        onclearslot: () => void;
    }

    const { itemList, outfit, slot, onpick, onremove, onclearslot }: Props = $props();

    /** Rows added each time the list is scrolled to the bottom. */
    const PAGE_SIZE = 80;

    let query = $state('');
    const slotInfo = $derived(slot === null ? null : SLOTS.find((s) => s.id === slot));
    const equippedHere = $derived(slot === null ? undefined : outfit.equipment[slot]);

    const matches = $derived.by(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return itemList.filter((item) => {
            if (slot !== null && item.slot !== slot) return false;
            if (item.models[outfit.gender].length === 0) return false;
            const name = item.name.toLowerCase();
            return words.every((w) => name.includes(w));
        });
    });

    /** Names more than one item shares, which get their id shown so they can be told apart. */
    const sharedNames = $derived.by(() => {
        const counts: Record<string, number> = {};
        for (const item of matches) counts[item.name] = (counts[item.name] ?? 0) + 1;
        return counts;
    });

    let limit = $state(PAGE_SIZE);
    // A new search or slot starts back at the first page. Keyed on those inputs rather than
    // `matches`, which is rebuilt every time the outfit changes (e.g. picking an item or body).
    const searchKey = $derived(`${query}|${slot}`);
    $effect(() => {
        void searchKey;
        limit = PAGE_SIZE;
        const el = untrack(() => list);
        if (el) el.scrollTop = 0;
    });

    let list: HTMLUListElement | undefined = $state();
    let sentinel: HTMLLIElement | undefined = $state();
    // Load the next page as the end of the list scrolls into view.
    $effect(() => {
        if (!list || !sentinel) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) limit += PAGE_SIZE;
            },
            { root: list, rootMargin: '0px 0px 200px 0px' },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    });

    let missingIcons = $state<Record<number, boolean>>({});
    const slotKey = (id: number) => SLOTS.find((s) => s.id === id)?.key ?? 'tile';
</script>

<div class="flex min-h-0 flex-col gap-2">
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

    <Input
        type="search"
        placeholder={slotInfo ? `Search ${slotInfo.label.toLowerCase()} items…` : 'Search 5,000+ wearable items…'}
        aria-label="Search items"
        bind:value={query}
    />

    <ul
        bind:this={list}
        class="max-h-80 min-h-0 overflow-y-auto rounded-md border bg-muted/20 md:max-h-[26rem]"
        aria-label="Items"
    >
        {#each matches.slice(0, limit) as item (item.id)}
            {@const worn = outfit.equipment[item.slot] === item.id}
            <li>
                <button
                    type="button"
                    class="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none {worn
                        ? 'bg-primary/10'
                        : ''}"
                    aria-pressed={worn}
                    onclick={() => (worn ? onremove(item.slot) : onpick(item))}
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
                    <span class="min-w-0 flex-1 truncate"
                        >{item.name}{#if sharedNames[item.name] > 1}<span class="text-xs text-muted-foreground">
                                · #{item.id}</span
                            >{/if}</span
                    >
                    {#if worn}
                        <span class="text-xs text-primary">Worn</span>
                    {:else if !item.geTradeable}
                        <span class="text-xs text-muted-foreground">Untradeable</span>
                    {/if}
                </button>
            </li>
        {:else}
            <li class="px-3 py-6 text-center text-sm text-muted-foreground">No wearable items match “{query}”.</li>
        {/each}
        {#if matches.length > limit}
            <li bind:this={sentinel} class="px-3 py-2 text-center text-xs text-muted-foreground">Loading more…</li>
        {/if}
    </ul>
</div>
