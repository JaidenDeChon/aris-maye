<script lang="ts">
    /**
     * The equipment tab: the game's stone slots with their empty-slot outlines, showing what's
     * equipped. `grid` lays them out as in game; `strip` puts the visible slots in one scrolling row
     * for small screens.
     */
    import { itemIconPath } from '$lib/constants/calculators';
    import type { WearableItem } from '$lib/osrs-model/types';
    import { slotSprite } from '$lib/transmog/data';
    import { SLOTS, VISIBLE_SLOTS, type Outfit, type SlotInfo } from '$lib/transmog/outfit';

    interface Props {
        outfit: Outfit;
        items: Map<number, WearableItem>;
        /** The slot the item list is showing, or null for every slot. */
        selected: number | null;
        layout: 'grid' | 'strip';
        onselect: (slot: number | null) => void;
    }

    const { outfit, items, selected, layout, onselect }: Props = $props();

    const shown = $derived(layout === 'grid' ? SLOTS : VISIBLE_SLOTS);
    /** Icons the site doesn't have, so the slot falls back to the item's name. */
    let missingIcons = $state<Record<number, boolean>>({});

    function label(slot: SlotInfo): string {
        if (!slot.visible) return `${slot.label} slot: rings and ammo don't show on your character`;
        const id = outfit.equipment[slot.id];
        const item = id === undefined ? undefined : items.get(id);
        return item ? `${slot.label}: ${item.name}` : `${slot.label}: empty`;
    }
</script>

<div
    class={layout === 'grid'
        ? 'mx-auto grid w-fit grid-cols-[repeat(3,3rem)] grid-rows-[repeat(5,3rem)] gap-x-4 gap-y-1.5'
        : 'flex gap-1.5 overflow-x-auto pb-1'}
    role="group"
    aria-label="Equipment slots"
>
    {#each shown as slot (slot.id)}
        {@const id = outfit.equipment[slot.id]}
        {@const item = id === undefined ? undefined : items.get(id)}
        <button
            type="button"
            class="relative size-12 shrink-0 rounded-sm bg-cover outline-none transition [image-rendering:pixelated] focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50
                {selected === slot.id ? 'ring-2 ring-primary' : 'hover:brightness-125'}"
            style:grid-row={layout === 'grid' ? slot.row : undefined}
            style:grid-column={layout === 'grid' ? slot.column : undefined}
            style:background-image="url({slotSprite('tile')})"
            disabled={!slot.visible}
            aria-pressed={selected === slot.id}
            aria-label={label(slot)}
            title={label(slot)}
            onclick={() => onselect(selected === slot.id ? null : slot.id)}
        >
            {#if item && !missingIcons[item.id]}
                <img
                    src={itemIconPath(item.id)}
                    alt=""
                    class="absolute inset-0 m-auto max-h-9 max-w-9 [image-rendering:pixelated]"
                    onerror={() => (missingIcons = { ...missingIcons, [item.id]: true })}
                />
            {:else if item}
                <span
                    class="absolute inset-0.5 flex items-center justify-center overflow-hidden text-center text-[0.55rem] leading-tight text-white"
                >
                    {item.name}
                </span>
            {:else}
                <img
                    src={slotSprite(slot.key)}
                    alt=""
                    class="absolute inset-0 m-auto size-9 opacity-80 [image-rendering:pixelated]"
                />
            {/if}
        </button>
    {/each}
</div>
