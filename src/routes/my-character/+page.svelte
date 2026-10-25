<script lang="ts">
    import PageTitle from '$lib/components/global/page-title.svelte';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { myCharacterSeo } from '$lib/seo/static-page-seo';
    import { toast } from 'svelte-sonner';
    import { Pencil, Plus, Shirt, Trash2, UserCheck } from 'lucide-svelte';
    import { Button } from '$lib/components/ui/button';
    import CharacterPortrait from '$lib/components/transmog/character-portrait.svelte';
    import WithTooltip from '$lib/components/transmog/with-tooltip.svelte';
    import CharacterStatsDialogButton from '$lib/components/dialogs/character-stats-dialog.svelte';
    import EditCharacterDialog from '$lib/components/dialogs/edit-character-dialog.svelte';
    import { resolve } from '$app/paths';
    import type { ICharacterProfile } from '$lib/models/player-stats';
    import { getAccountTypeOption } from '$lib/models/account-type';
    import { combatLevel, skillsAt99, totalLevel } from '$lib/helpers/character-stats';
    import { isEmptyOutfit, outfitParams } from '$lib/transmog/outfit';
    import { getStoreRoot } from '$lib/stores/character-store.svelte';
    import { removeSuppliesForCharacter } from '$lib/stores/bank-items-store';

    const characterStore = $derived(getStoreRoot());
    const characters = $derived(characterStore?.characters ?? []);
    const activeCharacterId = $derived(
        characters.find((c) => String(c.id) === String(characterStore?.activeCharacter))?.id ?? null,
    );

    /** The character whose edit dialog is open. */
    let editingId = $state<ICharacterProfile['id'] | null>(null);
    const editing = $derived(characters.find((c) => c.id === editingId) ?? null);

    function selectCharacter(character: ICharacterProfile) {
        if (characterStore.activeCharacter === character.id) return;
        characterStore.activeCharacter = character.id;
        toast.info(`Character "${character.name}" is now active.`);
    }

    function removeCharacter(character: ICharacterProfile) {
        const next = characters.filter((c) => c.id !== character.id);
        characterStore.characters = next;
        removeSuppliesForCharacter(character.id);
        if (characterStore.activeCharacter === character.id) characterStore.activeCharacter = next[0]?.id;
        toast.info(`Character "${character.name}" has been removed.`);
    }

    /** The headline numbers on a character's card, each with its in-game icon. */
    function characterStats(levels: ICharacterProfile['skillLevels']) {
        return [
            { label: 'Combat level', icon: '/other-images/combat.png', value: combatLevel(levels).toLocaleString() },
            { label: 'Total level', icon: '/skill-images/skills.png', value: totalLevel(levels).toLocaleString() },
        ];
    }

    /** Opens the dressing room in the character's outfit, set to save back to them. */
    function dressingRoomLink(character: ICharacterProfile): string {
        const outfit = character.outfit ? `${outfitParams(character.outfit)}&` : '';
        return `${resolve('/transmog-dressing-room')}?${outfit}character=${encodeURIComponent(character.id)}`;
    }
</script>

<SeoHead seo={myCharacterSeo} />

<div class="content-sizing pt-6 pb-10 space-y-8">
    <header class="space-y-2">
        <PageTitle>My characters</PageTitle>
        <p class="text-muted-foreground">Manage your characters here.</p>
    </header>

    <ul class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Characters">
        {#each characters as character (character.id)}
            {@const active = character.id === activeCharacterId}
            {@const dressed = Boolean(character.outfit && !isEmptyOutfit(character.outfit))}
            {@const maxed = skillsAt99(character.skillLevels)}
            {@const accountType = getAccountTypeOption(character.accountType)}
            <li
                class="flex flex-col gap-4 rounded-xl border p-4 text-card-foreground shadow transition-colors sm:p-5 {active
                    ? 'border-primary/60 bg-primary/[0.04]'
                    : 'bg-card'}"
                aria-current={active ? 'true' : undefined}
            >
                <div class="flex gap-4">
                    <CharacterPortrait
                        outfit={character.outfit}
                        alt={dressed ? `${character.name} in their outfit` : character.name}
                        highlighted={active}
                        class="h-36 w-28"
                    />
                    <div class="flex min-w-0 flex-1 flex-col">
                        <h2 class="truncate text-lg font-semibold">{character.name}</h2>
                        <div class="mt-1 flex flex-wrap gap-1">
                            <span
                                class="whitespace-nowrap rounded-full border bg-muted px-1.5 text-[10px] font-medium leading-4 text-muted-foreground"
                            >
                                <!-- Phones get the short name (HCIM, UIM...), so the tags stay on one line. -->
                                <span class="sm:hidden" aria-hidden="true">{accountType.shortLabel}</span>
                                <span class="max-sm:sr-only">{accountType.label}</span>
                            </span>
                            {#if active}
                                <span
                                    class="whitespace-nowrap rounded-full border border-primary bg-primary px-1.5 text-[10px] font-medium leading-4 text-primary-foreground"
                                    >Active</span
                                >
                            {/if}
                        </div>

                        <dl class="mt-auto flex flex-wrap gap-x-6 gap-y-2 pt-3">
                            {#each characterStats(character.skillLevels) as stat (stat.label)}
                                <!-- The label comes first for screen readers, and shows under the number. -->
                                <div class="flex flex-col-reverse">
                                    <dt class="text-xs text-muted-foreground">{stat.label}</dt>
                                    <dd class="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-primary">
                                        <img
                                            src={stat.icon}
                                            alt=""
                                            width="20"
                                            height="20"
                                            class="size-5 object-contain [image-rendering:pixelated]"
                                        />
                                        {stat.value}
                                    </dd>
                                </div>
                            {/each}
                        </dl>
                        {#if maxed > 0}
                            <p class="pt-1 text-xs text-muted-foreground">
                                {maxed === 23
                                    ? 'Maxed: every skill at 99'
                                    : `${maxed} ${maxed === 1 ? 'skill' : 'skills'} at 99`}
                            </p>
                        {/if}
                    </div>
                </div>

                <div class="flex items-center gap-2 border-t pt-4">
                    {#if !active}
                        <Button variant="outline" size="sm" class="gap-1.5" onclick={() => selectCharacter(character)}>
                            <UserCheck />
                            Make active
                        </Button>
                    {/if}
                    <div class="ml-auto flex gap-2">
                        <WithTooltip label="3D Dressing room">
                            {#snippet children(props)}
                                <Button
                                    {...props}
                                    href={dressingRoomLink(character)}
                                    variant="outline"
                                    size="icon"
                                    class="size-9 rounded-full text-muted-foreground"
                                    aria-label="Open {character.name} in the 3D Dressing room"
                                >
                                    <Shirt />
                                </Button>
                            {/snippet}
                        </WithTooltip>
                        <WithTooltip label="Edit character">
                            {#snippet children(props)}
                                <Button
                                    {...props}
                                    variant="outline"
                                    size="icon"
                                    class="size-9 rounded-full text-muted-foreground"
                                    aria-label="Edit {character.name}"
                                    onclick={() => (editingId = character.id)}
                                >
                                    <Pencil />
                                </Button>
                            {/snippet}
                        </WithTooltip>
                        <WithTooltip label="Delete character">
                            {#snippet children(props)}
                                <Button
                                    {...props}
                                    variant="outline"
                                    size="icon"
                                    class="size-9 rounded-full text-muted-foreground hover:text-destructive"
                                    aria-label="Delete {character.name}"
                                    onclick={() => removeCharacter(character)}
                                >
                                    <Trash2 />
                                </Button>
                            {/snippet}
                        </WithTooltip>
                    </div>
                </div>
            </li>
        {/each}
        <li>
            <CharacterStatsDialogButton
                triggerClass="flex h-full min-h-[8rem] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
                {#snippet trigger()}
                    <span class="flex size-10 items-center justify-center rounded-full border bg-background shadow-sm">
                        <Plus class="size-5" />
                    </span>
                    Add character
                {/snippet}
            </CharacterStatsDialogButton>
        </li>
    </ul>

    <EditCharacterDialog character={editing} onclose={() => (editingId = null)} />
</div>
