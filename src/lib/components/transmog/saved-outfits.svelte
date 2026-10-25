<script lang="ts">
    /**
     * Outfits kept in this browser. Each character has one outfit, saved under their name; any
     * other name saves a separate outfit. Names are unique, so saving under a name that's taken
     * replaces that outfit. Once an outfit is saved or loaded, changes to it save automatically.
     */
    import { Shirt, User, X } from 'lucide-svelte';
    import { untrack } from 'svelte';
    import { resolve } from '$app/paths';
    import { toast } from 'svelte-sonner';
    import OutfitNameCombobox, { type OutfitNameOption } from './outfit-name-combobox.svelte';
    import { Button } from '$lib/components/ui/button';
    import type { WearableItem } from '$lib/osrs-model/types';
    import { getCharacters, setCharacterOutfit } from '$lib/stores/character-store.svelte';
    import { MAX_SAVED_OUTFITS, savedOutfitsStore, type SavedOutfit } from '$lib/stores/transmog-store';
    import { EMPTY_OUTFIT, isEmptyOutfit, outfitParams, SLOTS, type Outfit } from '$lib/transmog/outfit';

    interface Props {
        outfit: Outfit;
        items: Map<number, WearableItem>;
        onload: (outfit: Outfit) => void;
        /** The character the page was opened for, from a My characters card's link. */
        characterId?: string | null;
    }

    const { outfit, items, onload, characterId = null }: Props = $props();

    /** The saved outfit being edited, whose changes save automatically. */
    type Target = { kind: 'character'; id: string } | { kind: 'outfit'; id: string };

    const characters = $derived(getCharacters());
    const dressed = $derived(characters.filter((c) => c.outfit && !isEmptyOutfit(c.outfit)));
    const named = $derived($savedOutfitsStore.outfits);

    let target = $state<Target | null>(
        untrack(() =>
            characterId && getCharacters().some((c) => String(c.id) === characterId)
                ? { kind: 'character', id: characterId }
                : null,
        ),
    );

    /** The target's name and what's stored for it, or null once it's been deleted. */
    const current = $derived.by(() => {
        if (!target) return null;
        const { kind, id } = target;
        if (kind === 'character') {
            const character = characters.find((c) => String(c.id) === id);
            return character ? { name: character.name, stored: character.outfit ?? EMPTY_OUTFIT } : null;
        }
        const saved = named.find((o) => o.id === id);
        return saved ? { name: saved.name, stored: saved.outfit } : null;
    });

    let name = $state(untrack(() => current?.name ?? ''));

    const options = $derived<OutfitNameOption[]>([
        ...characters.map((c) => ({ name: c.name, kind: 'character' as const })),
        ...named.map((o) => ({ name: o.name, kind: 'outfit' as const })),
    ]);

    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const copy = (o: Outfit): Outfit => ({ gender: o.gender, equipment: { ...o.equipment } });

    // Keep the outfit being edited saved as it changes.
    $effect(() => {
        const edited = outfit;
        untrack(() => {
            if (!target || !current) return;
            if (outfitParams(edited).toString() === outfitParams(current.stored).toString()) return;
            write(target, edited);
        });
    });

    function write(to: Target, value: Outfit): void {
        if (to.kind === 'character') {
            setCharacterOutfit(to.id, value);
            return;
        }
        savedOutfitsStore.update((state) => ({
            outfits: state.outfits.map((o) =>
                o.id === to.id ? { ...o, outfit: copy(value), savedAt: Date.now() } : o,
            ),
        }));
    }

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
        const chosen = name.trim() || suggestName(outfit);

        const character = characters.find((c) => same(c.name, chosen));
        if (character) {
            target = { kind: 'character', id: String(character.id) };
            setCharacterOutfit(character.id, outfit);
            name = character.name;
            toast.success(`Outfit saved to ${character.name}.`);
            return;
        }

        const existing = named.find((o) => same(o.name, chosen));
        const entry: SavedOutfit = {
            id: existing?.id ?? crypto.randomUUID(),
            name: existing?.name ?? chosen,
            outfit: copy(outfit),
            savedAt: Date.now(),
        };
        savedOutfitsStore.update((state) => ({
            outfits: [entry, ...state.outfits.filter((o) => o.id !== entry.id)].slice(0, MAX_SAVED_OUTFITS),
        }));
        target = { kind: 'outfit', id: entry.id };
        name = entry.name;
        toast.success(`Outfit saved as "${entry.name}".`);
    }

    function load(to: Target, saved: Outfit, savedName: string): void {
        target = to;
        name = savedName;
        onload(saved);
    }

    function remove(to: Target): void {
        if (to.kind === 'character') setCharacterOutfit(to.id, null);
        else savedOutfitsStore.update((state) => ({ outfits: state.outfits.filter((o) => o.id !== to.id) }));
        if (target?.kind === to.kind && target.id === to.id) stopEditing();
    }

    function stopEditing(): void {
        target = null;
        name = '';
    }
</script>

{#snippet row(to: Target, label: string, saved: Outfit)}
    {@const editing = target?.kind === to.kind && target.id === to.id}
    <li class="flex items-center gap-2 border-b border-border/50 py-1.5 last:border-0">
        {#if to.kind === 'character'}
            <User class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {:else}
            <Shirt class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {/if}
        <button
            type="button"
            class="min-w-0 flex-1 truncate text-left text-sm hover:underline {editing ? 'font-medium' : ''}"
            aria-current={editing ? 'true' : undefined}
            onclick={() => load(to, saved, label)}
        >
            {label}
        </button>
        {#if editing}
            <span class="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground"
                >Editing</span
            >
        {/if}
        <span class="text-xs text-muted-foreground">{saved.gender === 'female' ? 'Female' : 'Male'}</span>
        <button
            type="button"
            class="text-xs text-muted-foreground hover:text-destructive"
            aria-label="Delete the outfit {to.kind === 'character' ? `saved to ${label}` : label}"
            onclick={() => remove(to)}
        >
            Delete
        </button>
    </li>
{/snippet}

<section class="flex flex-col gap-3 rounded-md border bg-muted/20 p-4" aria-labelledby="saved-outfits-heading">
    <h2 id="saved-outfits-heading" class="font-semibold">Saved outfits</h2>
    <form class="flex gap-2" onsubmit={save}>
        <OutfitNameCombobox
            id="outfit-name"
            label="Character or outfit name"
            bind:value={name}
            {options}
            placeholder={isEmptyOutfit(outfit)
                ? 'Put something on first'
                : characters.length > 0
                  ? 'Pick a character or type a name'
                  : suggestName(outfit)}
            disabled={isEmptyOutfit(outfit) && !target}
        />
        <Button type="submit" variant="outline" disabled={isEmptyOutfit(outfit)}>Save</Button>
    </form>
    {#if current}
        <p class="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
            <span class="min-w-0 flex-1">
                Changes save automatically to
                <span class="font-medium text-foreground">{current.name}</span>.
            </span>
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
                onclick={stopEditing}
            >
                <X class="size-3" aria-hidden="true" />
                Stop saving
            </button>
        </p>
    {/if}
    {#if dressed.length === 0 && named.length === 0}
        <p class="text-sm text-muted-foreground">
            Saved outfits stay in this browser.
            {#if characters.length === 0}
                <a href={resolve('/my-character')} class="underline underline-offset-2 hover:text-foreground"
                    >Add a character</a
                > to save outfits to them too.
            {/if}
        </p>
    {:else}
        <ul class="flex max-h-64 flex-col overflow-y-auto">
            {#each dressed as character (character.id)}
                {@render row({ kind: 'character', id: String(character.id) }, character.name, character.outfit!)}
            {/each}
            {#each named as saved (saved.id)}
                {@render row({ kind: 'outfit', id: saved.id }, saved.name, saved.outfit)}
            {/each}
        </ul>
    {/if}
</section>
