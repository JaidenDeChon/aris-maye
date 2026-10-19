<script lang="ts">
    /** Outfits kept in this browser: save the current one under a name, load or delete saved ones. */
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import type { WearableItem } from '$lib/osrs-model/types';
    import { MAX_SAVED_OUTFITS, savedOutfitsStore, type SavedOutfit } from '$lib/stores/transmog-store';
    import { isEmptyOutfit, SLOTS, type Outfit } from '$lib/transmog/outfit';

    interface Props {
        outfit: Outfit;
        items: Map<number, WearableItem>;
        onload: (outfit: Outfit) => void;
    }

    const { outfit, items, onload }: Props = $props();

    let name = $state('');

    /** A default name from the outfit's most eye-catching piece. */
    function suggestName(current: Outfit): string {
        for (const key of ['body', 'head', 'weapon', 'legs', 'cape']) {
            const slot = SLOTS.find((s) => s.key === key)!;
            const id = current.equipment[slot.id];
            const item = id === undefined ? undefined : items.get(id);
            if (item) {
                const others = Object.keys(current.equipment).length - 1;
                return others > 0 ? `${item.name} + ${others} more` : item.name;
            }
        }
        return 'Outfit';
    }

    function save(event: SubmitEvent): void {
        event.preventDefault();
        const entry: SavedOutfit = {
            id: crypto.randomUUID(),
            name: name.trim() || suggestName(outfit),
            outfit: { gender: outfit.gender, equipment: { ...outfit.equipment } },
            savedAt: Date.now(),
        };
        savedOutfitsStore.update((state) => ({ outfits: [entry, ...state.outfits].slice(0, MAX_SAVED_OUTFITS) }));
        name = '';
    }

    function remove(id: string): void {
        savedOutfitsStore.update((state) => ({ outfits: state.outfits.filter((o) => o.id !== id) }));
    }
</script>

<section class="flex flex-col gap-3 rounded-md border bg-muted/20 p-4" aria-labelledby="saved-outfits-heading">
    <h2 id="saved-outfits-heading" class="font-semibold">Saved outfits</h2>
    <form class="flex gap-2" onsubmit={save}>
        <Input
            placeholder={isEmptyOutfit(outfit) ? 'Put something on first' : suggestName(outfit)}
            aria-label="Outfit name"
            maxlength={60}
            disabled={isEmptyOutfit(outfit)}
            bind:value={name}
        />
        <Button type="submit" variant="outline" disabled={isEmptyOutfit(outfit)}>Save</Button>
    </form>
    {#if $savedOutfitsStore.outfits.length === 0}
        <p class="text-sm text-muted-foreground">Saved outfits stay in this browser.</p>
    {:else}
        <ul class="flex max-h-64 flex-col overflow-y-auto">
            {#each $savedOutfitsStore.outfits as saved (saved.id)}
                <li class="flex items-center gap-2 border-b border-border/50 py-1.5 last:border-0">
                    <button
                        type="button"
                        class="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                        onclick={() => onload(saved.outfit)}
                    >
                        {saved.name}
                    </button>
                    <span class="text-xs text-muted-foreground"
                        >{saved.outfit.gender === 'female' ? 'Female' : 'Male'}</span
                    >
                    <button
                        type="button"
                        class="text-xs text-muted-foreground hover:text-destructive"
                        aria-label="Delete {saved.name}"
                        onclick={() => remove(saved.id)}
                    >
                        Delete
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</section>
