<script lang="ts">
    import { get, writable } from 'svelte/store';
    import { Loader2Icon } from 'lucide-svelte';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Footer } from '$lib/components/ui/dialog';
    import { buttonVariants } from '$lib/components/ui/button';
    import SkillsGrid from '$lib/components/global/skills-grid.svelte';
    import { toast } from 'svelte-sonner';
    import * as Dialog from '$lib/components/ui/dialog';
    import AccountTypeSelect from '$lib/components/global/account-type-select.svelte';
    import { CharacterProfile } from '$lib/models/player-stats';
    import type { AccountType } from '$lib/models/account-type';
    import { getStoreRoot, getCharacters } from '$lib/stores/character-store.svelte';
    import { fetchCharacterDetailsFromWOM } from '$lib/services/wise-old-man-service';

    let {
        trigger,
        triggerClass = buttonVariants({ variant: 'default' }),
        populateCharacter = '',
        onClose = () => {
            open.set(false);
        },
        onCharacterSelected = () => {},
    } = $props();

    const padding = 'p-2';

    // Controls whether the dialog is open.
    let open = writable(false);

    $effect(() => {
        // If dialog is closed, reset populated stats.
        if (!$open) {
            console.log('closed');
            resetDialog();
            return;
        }

        // If we have a character name to populate, try to find it in the store and populate the stats.
        if (populateCharacter) {
            const found = characters.find((c) => c.name === populateCharacter);
            if (!found) {
                resetDialog();
                return;
            }

            populatedStats.set(cloneProfile(found));
        }
    });

    function resetDialog() {
        populatedStats.set(new CharacterProfile(''));
        isLoading.set(false);
        importedName.set(null);
    }

    // Denotes whether we're in the process of loading/importing character data.
    const isLoading = writable(false);

    // Name of the character last successfully imported, for toast wording on save. Cleared (or left stale but
    // unmatched) if the name is changed afterward, so the save toast only claims "imported" when it's still true.
    const importedName = writable<string | null>(null);

    const characterStore = $derived(getStoreRoot());
    const characters = $derived(getCharacters());

    const populatedStats = writable(new CharacterProfile(''));

    function cloneProfile(profile: CharacterProfile) {
        return new CharacterProfile(profile.name, { ...profile.skillLevels }, profile.id, profile.accountType);
    }

    // Controls whether the buttons in the footer are disabled.
    const footerDisabled = $derived($isLoading || !$populatedStats.name);

    /**
     * Save the character stats from the dialog into the store. If a character with the same name already exists,
     * update it instead of adding a new one.
     */
    function saveCharacterStats() {
        const buffer = get(populatedStats);
        const currentCharactersList = characters;

        // If this character already exists (by name since we won't have an ID to match at this point), update it.
        // Otherwise, add it as new.
        // Note: This means character names must be unique, but that's probably a reasonable constraint, considering
        // they are unique in-game.
        const indexOfThisCharacter = currentCharactersList.findIndex((c: CharacterProfile) => c.name === buffer.name);

        if (indexOfThisCharacter !== -1) {
            const next = [...currentCharactersList];
            next[indexOfThisCharacter] = {
                ...next[indexOfThisCharacter],
                accountType: buffer.accountType,
                skillLevels: buffer.skillLevels,
            };
            characterStore.characters = next;
        } else {
            characterStore.characters = [...currentCharactersList, buffer];
        }

        // Set this character as active, show a toast to the user, and notify parent component of selection.
        characterStore.activeCharacter = buffer.id;
        toast.success(
            get(importedName) === buffer.name
                ? `Character "${buffer.name}" has been imported and saved.`
                : `Character "${buffer.name}" has been saved.`,
        );
        onCharacterSelected();

        // Close the dialog.
        onClose();
    }

    /**
     * Handle the "Import" button click by fetching character details from WOM and populating the dialog.
     */
    async function handleImportClick(): Promise<void> {
        isLoading.set(true);

        try {
            const character = await fetchCharacterDetailsFromWOM($populatedStats.name);
            // Wise Old Man reports levels, not game mode, so preserve the account type the user
            // picked rather than letting the import reset it to the constructor default.
            character.accountType = $populatedStats.accountType;
            populatedStats.set(cloneProfile(character));
            importedName.set(character.name);
        } catch (e) {
            toast.error(`Failed to import character "${$populatedStats.name}". Please check the name and try again.`);
            console.error(e);
        } finally {
            isLoading.set(false);
        }
    }

    function handleAccountTypeChange(next: AccountType) {
        populatedStats.update((current) => {
            const clone = cloneProfile(current);
            clone.accountType = next;
            return clone;
        });
    }

    function handleSkillChange(skill: keyof CharacterProfile['skillLevels'], value: number) {
        populatedStats.update((current) => {
            const next = cloneProfile(current);
            next.skillLevels[skill] = value;
            return next;
        });
    }
</script>

<Dialog.Root bind:open={$open}>
    <Dialog.Trigger class="overflow-x-hidden {triggerClass}">
        {@render trigger?.()}
    </Dialog.Trigger>

    <Dialog.Content>
        <Dialog.Header class={padding}>
            <Dialog.Title>
                Skill levels:
                <span class="text-primary">
                    {$populatedStats.name ? $populatedStats.name : 'New character'}
                </span>
            </Dialog.Title>
            <Dialog.Description>Enter your skills manually or import them from skill trackers.</Dialog.Description>
        </Dialog.Header>

        <form class="flex flex-col gap-6" onsubmit={saveCharacterStats}>
            <div class="max-h-[35vh] overflow-auto pb-1 flex flex-col gap-6 {padding}">
                <div>
                    <Label class="capitalize text-xs" for="character-name">Character name</Label>
                    <Input id="character-name" type="text" required aria-required bind:value={$populatedStats.name} />
                </div>
                <AccountTypeSelect
                    value={$populatedStats.accountType}
                    onChange={handleAccountTypeChange}
                    idPrefix="character-dialog"
                />
                <SkillsGrid
                    skillLevels={$populatedStats.skillLevels}
                    idPrefix="character-dialog"
                    onSkillChange={handleSkillChange}
                />
            </div>
            <Footer class={padding}>
                <Button
                    class="capitalize"
                    variant="ghost"
                    disabled={footerDisabled}
                    onclick={async () => await handleImportClick()}
                >
                    {#if $isLoading}
                        <Loader2Icon class="animate-spin" />
                        Importing, please wait...
                    {:else}
                        Import {$populatedStats.name ? ` "${$populatedStats.name}"` : ''}
                    {/if}
                </Button>
                <Button type="submit" disabled={footerDisabled}>Submit</Button>
            </Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
