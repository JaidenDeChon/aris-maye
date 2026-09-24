<script lang="ts">
    import { writable } from 'svelte/store';
    import { toast } from 'svelte-sonner';
    import { User, ChevronsUpDown, Plus, X, Pencil } from 'lucide-svelte';
    import { buttonVariants } from '$lib/components/ui/button';
    import { getStoreRoot } from '$lib/stores/character-store.svelte';
    import { getAccountTypeOption, isIronmanAccount } from '$lib/models/account-type';
    import { removeSuppliesForCharacter } from '$lib/stores/bank-items-store';
    import { Button } from '$lib/components/ui/button';
    import * as Sidebar from '$lib/components/ui/sidebar';
    import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
    import CharacterStatsDialogButton from '$lib/components/dialogs/character-stats-dialog.svelte';
    import type { CharacterProfile } from '$lib/models/player-stats';

    const sidebar = Sidebar.useSidebar();

    // Controls whether the character switcher dropdown/popover is open.
    let open = writable(false);

    const store = $derived(getStoreRoot());
    const characterList = $derived(store.characters);

    const activeCharacter = $derived.by(() => {
        const activeId = store.activeCharacter;
        return store.characters.find((c) => activeId === c.id);
    });
    const activeCharacterName = $derived(activeCharacter?.name || 'My character');

    // The mode has to be visible wherever the character is. Reading shop-and-alchemy numbers while
    // believing they are Grand Exchange numbers is the one failure this feature can't afford.
    const activeAccountType = $derived(getAccountTypeOption(activeCharacter?.accountType));
    const showAccountBadge = $derived(Boolean(activeCharacter) && isIronmanAccount(activeCharacter?.accountType));

    /**
     * Remove a character from the character list. If the removed character is the active character, sets the active
     * character to the first character in the list.
     * @param character
     */
    function removeCharacter(character: CharacterProfile): undefined {
        // Compute next list and persist it.
        const next = store.characters.filter((c) => c.id !== character.id);
        store.characters = next;
        removeSuppliesForCharacter(character.id);

        toast.info(`Character "${character.name}" has been removed.`);

        // If there are no characters left, clear active and exit.
        if (next.length === 0) {
            store.activeCharacter = undefined;
            return undefined;
        }

        // If the removed character was active, set the first remaining as active.
        if (store.activeCharacter === character.id) {
            const nextCharacter = next[0];
            if (nextCharacter) {
                // Wait for just a second so the user can see removal happen first, followed by the selection.
                setTimeout(() => {
                    selectCharacter(nextCharacter, false);
                }, 1000);
            }
        }
    }

    /**
     * Set the selected character as the active character.
     * @param character {CharacterProfile} The character to set as active.
     */
    function selectCharacter(character: CharacterProfile, closeDropdown = true): void {
        if (store.activeCharacter === character.id) {
            if (closeDropdown) closeCharacterSelection();
            return;
        }

        store.activeCharacter = character.id;
        toast.info(`Character "${character.name}" is now active.`);
        if (closeDropdown) closeCharacterSelection();
    }

    /**
     * Close the character selection dropdown.
     */
    function closeCharacterSelection() {
        open.set(false);
    }
</script>

<DropdownMenu.Root bind:open={$open}>
    <DropdownMenu.Trigger>
        {#snippet child({ props })}
            <Sidebar.MenuButton
                {...props}
                size="lg"
                class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
                <div
                    class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
                >
                    <User />
                </div>
                <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-semibold">Select Character</span>
                    <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span class="truncate">{activeCharacterName}</span>
                        {#if showAccountBadge}
                            <span
                                class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                title="{activeAccountType.label} — prices don't use the Grand Exchange"
                            >
                                {activeAccountType.shortLabel}
                            </span>
                        {/if}
                    </span>
                </div>
                <ChevronsUpDown class="ml-auto" />
            </Sidebar.MenuButton>
        {/snippet}
    </DropdownMenu.Trigger>

    <DropdownMenu.Content
        class="w-[--bits-dropdown-menu-anchor-width] min-w-56 rounded-lg"
        align="start"
        side={sidebar.isMobile ? 'bottom' : 'right'}
        sideOffset={4}
    >
        <DropdownMenu.Label class="text-muted-foreground text-xs">Characters</DropdownMenu.Label>

        <div class="flex flex-col gap-2">
            {#each characterList as character (character.id ?? character.name)}
                <div class="flex gap-1">
                    <!-- "Add character" button -->
                    <Button
                        variant="ghost"
                        class="flex-1 !justify-start gap-1.5"
                        onclick={() => selectCharacter(character)}
                    >
                        <span class="truncate">{character.name}</span>
                        {#if isIronmanAccount(character.accountType)}
                            <span
                                class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                            >
                                {getAccountTypeOption(character.accountType).shortLabel}
                            </span>
                        {/if}
                    </Button>

                    <!-- Remove character from store's `characters` list. -->
                    <CharacterStatsDialogButton
                        onCharacterSelected={closeCharacterSelection}
                        triggerClass="{buttonVariants({ variant: 'ghost' })} !justify-start"
                        populateCharacter={character.name}
                    >
                        {#snippet trigger()}
                            <Pencil />
                        {/snippet}
                    </CharacterStatsDialogButton>

                    <!-- Remove character from store's `characters` list. -->
                    <Button variant="ghost" size="icon" onclick={() => removeCharacter(character)}>
                        <X />
                    </Button>
                </div>
            {/each}
        </div>

        <DropdownMenu.Separator />

        <!-- "Add character" button -->
        <CharacterStatsDialogButton
            onCharacterSelected={closeCharacterSelection}
            triggerClass="{buttonVariants({ variant: 'ghost' })} w-full !justify-start"
        >
            {#snippet trigger()}
                <div class="bg-background flex size-6 items-center justify-center rounded-md border">
                    <Plus class="size-4" />
                </div>
                <span class="text-muted-foreground font-medium">Add character</span>
            {/snippet}
        </CharacterStatsDialogButton>
    </DropdownMenu.Content>
</DropdownMenu.Root>
