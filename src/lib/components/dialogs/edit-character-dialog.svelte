<script lang="ts">
    /**
     * Edits one character: their name, account type and skill levels on one tab, the supplies they
     * have on hand on the other.
     */
    import { Loader2Icon, Plus, Search, Trash2 } from 'lucide-svelte';
    import { toast } from 'svelte-sonner';
    import { resolve } from '$app/paths';
    import AccountTypeSelect from '$lib/components/global/account-type-select.svelte';
    import SkillsGrid from '$lib/components/global/skills-grid.svelte';
    import { Button } from '$lib/components/ui/button';
    import * as Dialog from '$lib/components/ui/dialog';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import * as Tabs from '$lib/components/ui/tabs';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import type { AccountType } from '$lib/models/account-type';
    import type { IGameItem } from '$lib/models/game-item';
    import { CharacterProfile, type ICharacterProfile } from '$lib/models/player-stats';
    import {
        bankItemsStore,
        ensureSuppliesForCharacter,
        getSuppliesForCharacter,
        updateSuppliesForCharacter,
    } from '$lib/stores/bank-items-store';
    import { getStoreRoot } from '$lib/stores/character-store.svelte';
    import { fetchCharacterDetailsFromWOM } from '$lib/services/wise-old-man-service';

    interface Props {
        /** The character being edited; the dialog is open while this is set. */
        character: ICharacterProfile | null;
        onclose: () => void;
    }

    const { character, onclose }: Props = $props();

    const characterStore = $derived(getStoreRoot());
    const characters = $derived(characterStore?.characters ?? []);
    const characterId = $derived(character?.id ?? null);

    let tab = $state<'skills' | 'supplies'>('skills');

    // Skills

    const createDraft = (from: ICharacterProfile): ICharacterProfile => {
        const profile = new CharacterProfile(from.name, { ...from.skillLevels }, from.id, from.accountType);
        return {
            id: profile.id,
            name: profile.name,
            accountType: profile.accountType,
            skillLevels: { ...profile.skillLevels },
        };
    };

    let draft = $state<ICharacterProfile | null>(null);
    let importLoading = $state(false);

    // A fresh copy each time the dialog opens for a character, on the skills tab.
    let draftFor: ICharacterProfile['id'] | null = null;
    $effect(() => {
        if (!character) {
            draftFor = null;
            return;
        }
        if (draftFor === character.id) return;
        draftFor = character.id;
        draft = createDraft(character);
        tab = 'skills';
        searchQuery = '';
    });

    const trimmedName = $derived(draft?.name.trim() ?? '');
    const canSave = $derived(Boolean(trimmedName) && !importLoading);

    function saveCharacter(event: SubmitEvent) {
        event.preventDefault();
        if (!draft) return;

        if (!trimmedName) {
            toast.error('Enter a character name.');
            return;
        }

        const duplicate = characters.find(
            (c) => c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== draft!.id,
        );
        if (duplicate) {
            toast.error(`You already have a character called "${trimmedName}".`);
            return;
        }

        characterStore.characters = characters.map((c) =>
            c.id === draft!.id
                ? {
                      // Keep what the form doesn't edit, like the character's outfit.
                      ...c,
                      name: trimmedName,
                      accountType: draft!.accountType,
                      skillLevels: { ...draft!.skillLevels },
                  }
                : c,
        );
        toast.success(`Saved ${trimmedName}.`);
    }

    async function handleImportClick() {
        if (!draft || !trimmedName || importLoading) return;
        importLoading = true;

        try {
            const imported = await fetchCharacterDetailsFromWOM(trimmedName);
            draft = createDraft({ ...draft, name: trimmedName, skillLevels: { ...imported.skillLevels } });
            toast.success(`Imported ${trimmedName}'s skill levels. Save to keep them.`);
        } catch (error) {
            console.error(error);
            toast.error(`Couldn't import "${trimmedName}". Check the name and try again.`);
        } finally {
            importLoading = false;
        }
    }

    function handleAccountTypeChange(next: AccountType) {
        if (draft) draft.accountType = next;
    }

    function handleSkillChange(skill: keyof ICharacterProfile['skillLevels'], value: number) {
        if (draft) draft.skillLevels[skill] = value;
    }

    // Supplies

    let searchQuery = $state('');
    let searchResults = $state([] as IGameItem[]);
    let searchLoading = $state(false);
    let quantityById = $state<Record<string, string>>({});
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    let searchAbort: AbortController | null = null;

    $effect(() => {
        if (characterId) ensureSuppliesForCharacter(characterId);
    });

    const bankItems = $derived(characterId ? getSuppliesForCharacter($bankItemsStore, characterId) : []);
    const bankQuantityById = $derived.by(() => {
        const map: Record<number, number> = {};
        bankItems.forEach((entry) => {
            const id = Number(entry.id);
            if (Number.isFinite(id)) map[id] = entry.quantity;
        });
        return map;
    });
    let bankItemsLoading = $state(false);
    let bankItemDetails = $state([] as IGameItem[]);
    let bankEditQuantityById = $state<Record<string, string>>({});
    let bankItemIdsKey = '';
    let bankAbort: AbortController | null = null;

    async function fetchSearch(query: string) {
        const trimmed = query.trim();
        searchAbort?.abort();
        if (!trimmed) {
            searchResults = [];
            searchLoading = false;
            return;
        }

        const controller = new AbortController();
        searchAbort = controller;
        searchLoading = true;
        try {
            const resp = await fetch(`/api/search-items?q=${encodeURIComponent(trimmed)}&limit=150`, {
                signal: controller.signal,
            });
            searchResults = (await resp.json()) as IGameItem[];
        } catch (error) {
            if ((error as Error).name !== 'AbortError') console.error('Search failed', error);
        } finally {
            if (searchAbort === controller) searchLoading = false;
        }
    }

    $effect(() => {
        const value = searchQuery;
        if (debounceId) clearTimeout(debounceId);
        debounceId = setTimeout(() => fetchSearch(value), 200);
    });

    $effect(() => {
        const current = bankEditQuantityById;
        const next: Record<string, string> = {};
        bankItems.forEach((entry) => {
            const key = String(entry.id);
            const fallback = Number.isFinite(entry.quantity) ? String(entry.quantity) : '1';
            next[key] = current[key] ?? fallback;
        });

        const currentKeys = Object.keys(current);
        const nextKeys = Object.keys(next);
        if (currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === next[key])) return;
        bankEditQuantityById = next;
    });

    $effect(() => {
        const ids = bankItems.map((entry) => String(entry.id)).filter(Boolean);
        const nextIdsKey = ids.join('|');
        if (nextIdsKey === bankItemIdsKey) return;
        bankItemIdsKey = nextIdsKey;
        bankAbort?.abort();
        if (!ids.length) {
            bankItemDetails = [];
            bankItemsLoading = false;
            return;
        }

        const controller = new AbortController();
        bankAbort = controller;
        bankItemsLoading = bankItemDetails.length === 0;
        const orderMap = new Map(ids.map((id, index) => [Number(id), index]));

        fetch(`/api/game-items?id=${ids.join('&id=')}`, { signal: controller.signal })
            .then((resp) => resp.json())
            .then((data: IGameItem[]) => {
                if (controller.signal.aborted) return;
                bankItemDetails = [...data].sort(
                    (a, b) => (orderMap.get(Number(a.id)) ?? 0) - (orderMap.get(Number(b.id)) ?? 0),
                );
            })
            .catch((error) => {
                if ((error as Error).name !== 'AbortError') console.error('Failed to load supplies', error);
            })
            .finally(() => {
                if (bankAbort === controller) {
                    bankAbort = null;
                    bankItemsLoading = false;
                }
            });
    });

    function parseQuantity(value: string | undefined) {
        const numeric = Math.floor(Number(value ?? ''));
        return !Number.isFinite(numeric) || numeric <= 0 ? 1 : numeric;
    }

    function addToBank(item: IGameItem) {
        if (!characterId) return;
        const quantity = parseQuantity(quantityById[String(item.id)]);
        const itemId = Number(item.id);
        if (!Number.isFinite(itemId)) return;

        updateSuppliesForCharacter(characterId, (items) => {
            const existing = items.find((entry) => Number(entry.id) === itemId);
            return existing
                ? items.map((entry) =>
                      Number(entry.id) === itemId
                          ? { ...entry, quantity: Math.max(1, entry.quantity + quantity) }
                          : entry,
                  )
                : [...items, { id: itemId, quantity }];
        });

        quantityById = { ...quantityById, [String(item.id)]: String(quantity) };
        toast.success(`Added ${quantity.toLocaleString()} × ${item.name} to ${character?.name}'s supplies.`);
    }

    function commitBankQuantity(itemId: IGameItem['id']) {
        if (!characterId) return;
        const id = Number(itemId);
        if (!Number.isFinite(id)) return;
        const currentQuantity = bankQuantityById[id] ?? 1;
        const parsed = Math.floor(Number(bankEditQuantityById[String(itemId)]));

        if (!Number.isFinite(parsed) || parsed <= 0 || parsed === currentQuantity) {
            const kept = Number.isFinite(parsed) && parsed > 0 ? parsed : currentQuantity;
            bankEditQuantityById = { ...bankEditQuantityById, [String(itemId)]: String(kept) };
            return;
        }

        updateSuppliesForCharacter(characterId, (items) =>
            items.map((entry) => (Number(entry.id) === id ? { ...entry, quantity: parsed } : entry)),
        );
    }

    function removeBankItem(itemId: IGameItem['id']) {
        if (!characterId) return;
        const id = Number(itemId);
        if (!Number.isFinite(id)) return;
        updateSuppliesForCharacter(characterId, (items) => items.filter((entry) => Number(entry.id) !== id));
    }
</script>

{#snippet itemLabel(item: IGameItem)}
    <span class="inline-flex size-9 shrink-0 items-center justify-center rounded border bg-muted">
        {#if item.icon}
            <img src={iconToDataUri(item.icon)} alt="" class="size-6 object-contain" />
        {:else}
            <span class="text-xs text-muted-foreground">{item.name.slice(0, 2)}</span>
        {/if}
    </span>
    <span class="flex min-w-0 flex-col text-left">
        <span class="truncate text-sm font-medium">{item.name}</span>
        {#if item.examine}
            <span class="line-clamp-1 text-xs text-muted-foreground">{item.examine}</span>
        {/if}
    </span>
{/snippet}

<Dialog.Root
    open={character !== null}
    onOpenChange={(open) => {
        if (!open) onclose();
    }}
>
    <Dialog.Content class="flex max-h-[90dvh] max-w-2xl flex-col gap-4 overflow-hidden p-0">
        <Dialog.Header class="px-6 pt-6">
            <Dialog.Title>{character?.name ?? 'Character'}</Dialog.Title>
            <Dialog.Description>Update this character's skill levels and supplies.</Dialog.Description>
        </Dialog.Header>

        {#if draft}
            <Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col">
                <div class="px-6">
                    <Tabs.List class="grid w-full grid-cols-2">
                        <Tabs.Trigger value="skills">Skills</Tabs.Trigger>
                        <Tabs.Trigger value="supplies">
                            Supplies{bankItems.length ? ` (${bankItems.length})` : ''}
                        </Tabs.Trigger>
                    </Tabs.List>
                </div>

                <!-- data-[state=inactive]:hidden, because flex would otherwise override the hidden attribute. -->
                <Tabs.Content value="skills" class="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
                    <form class="flex min-h-0 flex-1 flex-col" onsubmit={saveCharacter}>
                        <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-4 pb-2">
                            <div>
                                <Label class="text-xs" for="edit-character-name">Character name</Label>
                                <Input
                                    id="edit-character-name"
                                    type="text"
                                    required
                                    aria-required
                                    bind:value={draft.name}
                                />
                            </div>
                            <AccountTypeSelect
                                value={draft.accountType}
                                onChange={handleAccountTypeChange}
                                idPrefix="edit-character"
                            />
                            <SkillsGrid
                                skillLevels={draft.skillLevels}
                                idPrefix="edit-character"
                                onSkillChange={handleSkillChange}
                            />
                        </div>
                        <div class="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" disabled={!canSave} onclick={handleImportClick}>
                                {#if importLoading}
                                    <Loader2Icon class="animate-spin" />
                                    Importing…
                                {:else}
                                    Import from Wise Old Man
                                {/if}
                            </Button>
                            <Button type="submit" disabled={!canSave}>Save changes</Button>
                        </div>
                    </form>
                </Tabs.Content>

                <Tabs.Content
                    value="supplies"
                    class="mt-0 flex min-h-0 flex-1 flex-col gap-3 px-6 pt-4 pb-6 data-[state=inactive]:hidden"
                >
                    <div class="relative">
                        <Search
                            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            type="search"
                            class="pl-9"
                            placeholder="Search items to add…"
                            aria-label="Search items to add"
                            bind:value={searchQuery}
                        />
                    </div>

                    <div class="min-h-0 flex-1 overflow-y-auto">
                        {#if searchQuery.trim()}
                            {#if searchLoading && searchResults.length === 0}
                                <p class="py-6 text-center text-sm text-muted-foreground">Searching…</p>
                            {:else if searchResults.length === 0}
                                <p class="py-6 text-center text-sm text-muted-foreground">No items found.</p>
                            {:else}
                                <ul class="flex flex-col divide-y rounded-md border">
                                    {#each searchResults as item (item.id)}
                                        <li class="flex items-center gap-3 p-2">
                                            <div class="flex min-w-0 flex-1 items-center gap-3">
                                                {@render itemLabel(item)}
                                            </div>
                                            <Input
                                                type="number"
                                                min="1"
                                                step="1"
                                                inputmode="numeric"
                                                class="h-9 w-20"
                                                aria-label="How many {item.name}"
                                                value={quantityById[String(item.id)] ?? '1'}
                                                oninput={(event) =>
                                                    (quantityById = {
                                                        ...quantityById,
                                                        [String(item.id)]: event.currentTarget.value,
                                                    })}
                                                onkeydown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        addToBank(item);
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                class="size-9 shrink-0"
                                                aria-label="Add {item.name}"
                                                onclick={() => addToBank(item)}
                                            >
                                                <Plus />
                                            </Button>
                                        </li>
                                    {/each}
                                </ul>
                            {/if}
                        {:else if bankItemsLoading}
                            <p class="py-6 text-center text-sm text-muted-foreground">Loading supplies…</p>
                        {:else if bankItemDetails.length === 0}
                            <p class="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                No supplies yet. Search above to add the items {character?.name} has on hand.
                            </p>
                        {:else}
                            <ul class="flex flex-col divide-y rounded-md border">
                                {#each bankItemDetails as item (item.id)}
                                    <li class="flex items-center gap-3 p-2">
                                        <a
                                            href={resolve(`/items/${item.id}`)}
                                            class="flex min-w-0 flex-1 items-center gap-3 rounded-md hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                            data-sveltekit-preload-data="hover"
                                        >
                                            {@render itemLabel(item)}
                                        </a>
                                        <Input
                                            type="number"
                                            min="1"
                                            step="1"
                                            inputmode="numeric"
                                            class="h-9 w-24 text-right"
                                            aria-label="How many {item.name}"
                                            value={bankEditQuantityById[String(item.id)] ?? '1'}
                                            oninput={(event) =>
                                                (bankEditQuantityById = {
                                                    ...bankEditQuantityById,
                                                    [String(item.id)]: event.currentTarget.value,
                                                })}
                                            onblur={() => commitBankQuantity(item.id)}
                                            onkeydown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    commitBankQuantity(item.id);
                                                }
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            class="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                                            aria-label="Remove {item.name}"
                                            onclick={() => removeBankItem(item.id)}
                                        >
                                            <Trash2 />
                                        </Button>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                </Tabs.Content>
            </Tabs.Root>
        {/if}
    </Dialog.Content>
</Dialog.Root>
