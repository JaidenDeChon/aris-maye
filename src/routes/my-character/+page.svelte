<script lang="ts">
    import { onMount } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { Loader2Icon, Plus, Trash2 } from 'lucide-svelte';
    import * as Dialog from '$lib/components/ui/dialog';
    import * as Command from '$lib/components/ui/command';
    import * as Table from '$lib/components/ui/table';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import * as Accordion from '$lib/components/ui/accordion';
    import SkillsGrid from '$lib/components/global/skills-grid.svelte';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import { resolve } from '$app/paths';
    import AccountTypeSelect from '$lib/components/global/account-type-select.svelte';
    import { CharacterProfile, type ICharacterProfile } from '$lib/models/player-stats';
    import type { AccountType } from '$lib/models/account-type';
    import type { IGameItem } from '$lib/models/game-item';
    import { getStoreRoot } from '$lib/stores/character-store.svelte';
    import {
        bankItemsStore,
        ensureSuppliesForCharacter,
        getSuppliesForCharacter,
        updateSuppliesForCharacter,
    } from '$lib/stores/bank-items-store';
    import { fetchCharacterDetailsFromWOM } from '$lib/services/wise-old-man-service';
    import { defaultSkillLevels } from '$lib/constants/default-skill-levels';

    const characterStore = $derived(getStoreRoot());
    const characters = $derived(characterStore?.characters ?? []);
    const activeCharacter = $derived.by(() => {
        if (!characters.length) return undefined;

        const targetId = characterStore?.activeCharacter;
        if (targetId === undefined || targetId === null) return undefined;

        return characters.find((c) => String(c.id) === String(targetId));
    });
    const activeCharacterLabel = $derived(activeCharacter?.name ?? 'None selected');
    const activeCharacterId = $derived(activeCharacter?.id ?? null);
    const hasActiveCharacter = $derived(Boolean(activeCharacterId));

    function ensureActiveCharacter(): boolean {
        if (activeCharacterId) return true;
        toast.error('Select a character to manage supplies.');
        return false;
    }

    const createDraft = (
        name = '',
        skillLevels: ICharacterProfile['skillLevels'] = defaultSkillLevels,
        id?: ICharacterProfile['id'],
        accountType?: ICharacterProfile['accountType'],
    ): ICharacterProfile => {
        const profile = new CharacterProfile(name, { ...skillLevels }, id, accountType);
        return {
            id: profile.id,
            name: profile.name,
            accountType: profile.accountType,
            skillLevels: { ...profile.skillLevels },
        };
    };

    let draft = $state(createDraft());
    let importLoading = $state(false);
    let bankDialogOpen = $state(false);
    let searchQuery = $state('');
    let searchResults = $state([] as IGameItem[]);
    let searchLoading = $state(false);
    let quantityById = $state<Record<string, string>>({});
    $effect(() => {
        ensureSuppliesForCharacter(activeCharacterId);
    });

    const bankItems = $derived(getSuppliesForCharacter($bankItemsStore, activeCharacterId));
    const bankQuantityById = $derived.by(() => {
        const map: Record<number, number> = {};
        bankItems.forEach((entry) => {
            const id = Number(entry.id);
            if (!Number.isFinite(id)) return;
            map[id] = entry.quantity;
        });
        return map;
    });
    let bankItemsLoading = $state(false);
    let bankItemDetails = $state([] as IGameItem[]);
    let bankEditQuantityById = $state<Record<string, string>>({});
    let bankItemIdsKey = $state('');
    let bankItemsReady = $state(false);

    let debounceId: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;
    let bankAbort: AbortController | null = null;

    onMount(() => {
        bankItemsReady = true;
    });

    $effect(() => {
        if (activeCharacter) {
            draft = createDraft(
                activeCharacter.name,
                { ...activeCharacter.skillLevels },
                activeCharacter.id,
                activeCharacter.accountType,
            );
            return;
        }

        draft = createDraft();
    });

    const trimmedName = $derived(draft.name.trim());
    const canSave = $derived(Boolean(trimmedName) && !importLoading);
    const canImport = $derived(Boolean(trimmedName) && !importLoading);

    $effect(() => {
        if (bankDialogOpen) return;
        searchQuery = '';
        searchResults = [];
        searchLoading = false;
        if (abortController) abortController.abort();
    });

    async function fetchSearch(query: string) {
        const trimmed = query.trim();
        if (!trimmed) {
            searchResults = [];
            searchLoading = false;
            if (abortController) abortController.abort();
            return;
        }

        if (abortController) abortController.abort();
        abortController = new AbortController();

        searchLoading = true;
        try {
            const resp = await fetch(`/api/search-items?q=${encodeURIComponent(trimmed)}&limit=150`, {
                signal: abortController.signal,
            });
            const data: IGameItem[] = await resp.json();
            searchResults = data;
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                console.error('Search failed', error);
            }
        } finally {
            searchLoading = false;
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
        if (currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === next[key])) {
            return;
        }

        bankEditQuantityById = next;
    });

    $effect(() => {
        if (typeof window === 'undefined') return;
        const ids = bankItems.map((entry) => String(entry.id)).filter(Boolean);
        const nextIdsKey = ids.join('|');
        if (nextIdsKey === bankItemIdsKey) return;
        bankItemIdsKey = nextIdsKey;
        if (!ids.length) {
            if (bankAbort) bankAbort.abort();
            bankItemDetails = [];
            bankItemsLoading = false;
            return;
        }

        if (bankAbort) bankAbort.abort();
        const controller = new AbortController();
        bankAbort = controller;
        bankItemsLoading = bankItemDetails.length === 0;

        const orderMap = new Map(ids.map((id, index) => [Number(id), index]));

        fetch(`/api/game-items?id=${ids.join('&id=')}`, { signal: controller.signal })
            .then((resp) => resp.json())
            .then((data: IGameItem[]) => {
                if (controller.signal.aborted) return;
                bankItemDetails = [...data].sort((a, b) => {
                    const aIndex = orderMap.get(Number(a.id)) ?? 0;
                    const bIndex = orderMap.get(Number(b.id)) ?? 0;
                    return aIndex - bIndex;
                });
            })
            .catch((error) => {
                if ((error as Error).name !== 'AbortError') {
                    console.error('Failed to load supplies', error);
                }
            })
            .finally(() => {
                if (bankAbort === controller) bankAbort = null;
                bankItemsLoading = false;
            });
    });

    function saveCharacter(event?: SubmitEvent) {
        event?.preventDefault();

        if (!trimmedName) {
            toast.error('Character name is required.');
            return;
        }

        const duplicate = characters.find(
            (character) => character.name.toLowerCase() === trimmedName.toLowerCase() && character.id !== draft.id,
        );
        if (duplicate) {
            toast.error(`A character named "${trimmedName}" already exists.`);
            return;
        }

        const next = [...characters];
        const updated = {
            ...draft,
            name: trimmedName,
            accountType: draft.accountType,
            skillLevels: { ...draft.skillLevels },
        };
        const existingIndex = next.findIndex((character) => character.id === updated.id);
        if (existingIndex !== -1) {
            next[existingIndex] = updated;
        } else {
            next.push(updated);
        }

        characterStore.characters = next;
        characterStore.activeCharacter = updated.id;
        toast.success(`Character "${trimmedName}" has been saved.`);
    }

    async function handleImportClick() {
        if (!trimmedName || importLoading) return;
        importLoading = true;

        try {
            const imported = await fetchCharacterDetailsFromWOM(trimmedName);
            draft = createDraft(trimmedName, { ...imported.skillLevels }, draft.id, draft.accountType);
            toast.success(`Imported skill levels for "${trimmedName}".`);
        } catch (error) {
            console.error(error);
            toast.error(`Failed to import "${trimmedName}". Please check the name and try again.`);
        } finally {
            importLoading = false;
        }
    }

    function handleAccountTypeChange(next: AccountType) {
        draft.accountType = next;
    }

    function handleSkillChange(skill: keyof ICharacterProfile['skillLevels'], value: number) {
        draft.skillLevels[skill] = value;
    }

    function updateQuantity(itemId: IGameItem['id'], value: string) {
        quantityById = { ...quantityById, [String(itemId)]: value };
    }

    function parseQuantity(value: string | undefined) {
        const numeric = Math.floor(Number(value ?? ''));
        if (!Number.isFinite(numeric) || numeric <= 0) return 1;
        return numeric;
    }

    function openSuppliesDialog() {
        if (!ensureActiveCharacter()) return;
        bankDialogOpen = true;
    }

    function addToBank(item: IGameItem) {
        if (!ensureActiveCharacter()) return;
        const quantity = parseQuantity(quantityById[String(item.id)]);
        const itemId = Number(item.id);
        if (!Number.isFinite(itemId)) return;

        updateSuppliesForCharacter(activeCharacterId, (items) => {
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
        toast.success(`Added ${quantity}x ${item.name} to your supplies.`);
    }

    function updateBankEditQuantity(itemId: IGameItem['id'], value: string) {
        bankEditQuantityById = { ...bankEditQuantityById, [String(itemId)]: value };
    }

    function commitBankQuantity(itemId: IGameItem['id']) {
        if (!ensureActiveCharacter()) {
            const id = Number(itemId);
            if (!Number.isFinite(id)) return;
            const currentQuantity = bankQuantityById[id] ?? 1;
            bankEditQuantityById = { ...bankEditQuantityById, [String(itemId)]: String(currentQuantity) };
            return;
        }

        const id = Number(itemId);
        if (!Number.isFinite(id)) return;
        const currentQuantity = bankQuantityById[id] ?? 1;
        const raw = bankEditQuantityById[String(itemId)];
        const parsed = Math.floor(Number(raw));

        if (!Number.isFinite(parsed) || parsed <= 0) {
            bankEditQuantityById = { ...bankEditQuantityById, [String(itemId)]: String(currentQuantity) };
            return;
        }

        if (parsed === currentQuantity) {
            bankEditQuantityById = { ...bankEditQuantityById, [String(itemId)]: String(parsed) };
            return;
        }

        updateSuppliesForCharacter(activeCharacterId, (items) =>
            items.map((entry) => (Number(entry.id) === id ? { ...entry, quantity: parsed } : entry)),
        );
    }

    function removeBankItem(itemId: IGameItem['id']) {
        if (!ensureActiveCharacter()) return;
        const id = Number(itemId);
        if (!Number.isFinite(id)) return;
        updateSuppliesForCharacter(activeCharacterId, (items) => items.filter((entry) => Number(entry.id) !== id));
    }
</script>

<div class="content-sizing pt-6 pb-10 space-y-8">
    <header class="space-y-2">
        <h1 class="text-3xl font-bold">My character</h1>
        <p class="text-muted-foreground">Update your skill levels and supplies.</p>
    </header>

    <Accordion.Root type="multiple" class="rounded-lg border" value={['supplies']}>
        <Accordion.Item value="skills">
            <Accordion.Trigger class="px-6">
                <div class="flex w-full flex-col gap-2 text-left pr-4 sm:flex-row sm:items-center sm:justify-between">
                    <span class="text-xl font-semibold">Skills</span>
                    <span class="text-sm text-muted-foreground">Active: {activeCharacterLabel}</span>
                </div>
            </Accordion.Trigger>
            <Accordion.Content class="px-6">
                <div class="space-y-6 pt-2">
                    <p class="text-sm text-muted-foreground">
                        Enter your skill levels manually or import them from Wise Old Man.
                    </p>

                    <form class="space-y-6" onsubmit={saveCharacter}>
                        <div>
                            <Label class="capitalize text-xs" for="my-character-name">Character name</Label>
                            <Input id="my-character-name" type="text" required aria-required bind:value={draft.name} />
                        </div>

                        <AccountTypeSelect
                            value={draft.accountType}
                            onChange={handleAccountTypeChange}
                            idPrefix="my-character"
                        />

                        <SkillsGrid
                            skillLevels={draft.skillLevels}
                            idPrefix="my-character"
                            onSkillChange={handleSkillChange}
                        />

                        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p class="text-xs text-muted-foreground">
                                {#if activeCharacter}
                                    Editing {activeCharacter.name}.
                                {:else}
                                    No character selected yet. Saving will create one and set it as active.
                                {/if}
                            </p>
                            <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <Button type="button" variant="ghost" disabled={!canImport} onclick={handleImportClick}>
                                    {#if importLoading}
                                        <Loader2Icon class="animate-spin" />
                                        Importing, please wait...
                                    {:else}
                                        Import {trimmedName ? `"${trimmedName}"` : ''}
                                    {/if}
                                </Button>
                                <Button type="submit" disabled={!canSave}>Save changes</Button>
                            </div>
                        </div>
                    </form>
                </div>
            </Accordion.Content>
        </Accordion.Item>

        <Accordion.Item value="supplies">
            <Accordion.Trigger class="px-6">
                <div class="flex w-full flex-col gap-2 text-left pr-4 sm:flex-row sm:items-center sm:justify-between">
                    <span class="text-xl font-semibold">Supplies</span>
                    <span class="text-sm text-muted-foreground">Local supplies snapshot</span>
                </div>
            </Accordion.Trigger>
            <Accordion.Content class="px-6">
                <div class="space-y-4 pt-2">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p class="text-sm text-muted-foreground">Add items to your supplies.</p>
                        <Button
                            onclick={openSuppliesDialog}
                            aria-disabled={!hasActiveCharacter}
                            class={!hasActiveCharacter ? 'opacity-50 cursor-not-allowed' : ''}
                        >
                            Add supplies
                        </Button>
                    </div>

                    {#if !bankItemsReady}
                        <p class="text-xs text-muted-foreground">Loading supplies…</p>
                    {:else if bankItemsLoading}
                        <p class="text-xs text-muted-foreground">Loading supplies…</p>
                    {:else if bankItemDetails.length === 0}
                        <div class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                            No supplies added yet.
                        </div>
                    {:else}
                        <div class="overflow-hidden rounded-lg border bg-card">
                            <Table.Root>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.Head>Item</Table.Head>
                                        <Table.Head class="text-right">Quantity</Table.Head>
                                        <Table.Head class="text-right">Actions</Table.Head>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {#each bankItemDetails as item (item.id)}
                                        <Table.Row>
                                            <Table.Cell class="font-medium">
                                                <a
                                                    href={resolve(`/items/${item.id}`)}
                                                    class="inline-flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:underline"
                                                    data-sveltekit-preload-data="hover"
                                                >
                                                    <span
                                                        class="inline-flex h-8 w-8 items-center justify-center rounded bg-muted border"
                                                    >
                                                        {#if item.icon}
                                                            <img
                                                                src={iconToDataUri(item.icon)}
                                                                alt={item.name}
                                                                class="h-6 w-6 object-contain"
                                                            />
                                                        {:else}
                                                            <span class="text-xs text-muted-foreground">
                                                                {item.name.slice(0, 2)}
                                                            </span>
                                                        {/if}
                                                    </span>
                                                    <div class="flex min-w-0 flex-col text-left">
                                                        <span class="truncate text-sm font-medium">{item.name}</span>
                                                        {#if item.examine}
                                                            <span class="line-clamp-1 text-xs text-muted-foreground">
                                                                {item.examine}
                                                            </span>
                                                        {/if}
                                                    </div>
                                                </a>
                                            </Table.Cell>
                                            <Table.Cell class="text-end">
                                                <div class="flex justify-end">
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        step="1"
                                                        inputmode="numeric"
                                                        class="h-8 w-24 text-right"
                                                        value={bankEditQuantityById[String(item.id)] ?? '1'}
                                                        oninput={(event) =>
                                                            updateBankEditQuantity(
                                                                item.id,
                                                                (event.currentTarget as HTMLInputElement).value,
                                                            )}
                                                        onblur={() => commitBankQuantity(item.id)}
                                                        onkeydown={(event) => {
                                                            if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                commitBankQuantity(item.id);
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </Table.Cell>
                                            <Table.Cell class="text-end">
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="critical"
                                                    onclick={() => removeBankItem(item.id)}
                                                    aria-label={`Remove ${item.name}`}
                                                >
                                                    <Trash2 class="h-4 w-4" />
                                                </Button>
                                            </Table.Cell>
                                        </Table.Row>
                                    {/each}
                                </Table.Body>
                            </Table.Root>
                        </div>
                    {/if}
                </div>
            </Accordion.Content>
        </Accordion.Item>
    </Accordion.Root>

    <Dialog.Root bind:open={bankDialogOpen}>
        <Dialog.Content class="p-0">
            <Command.Root class="w-full rounded-lg border">
                <Command.Input placeholder="Search items..." bind:value={searchQuery} />

                <Command.List>
                    {#if searchLoading}
                        <Command.Empty>Searching...</Command.Empty>
                    {:else if searchResults.length > 0}
                        <Command.Group heading="Items">
                            {#each searchResults as item (item.id)}
                                <Command.Item value={item.name} class="!cursor-default">
                                    <div class="flex w-full items-center gap-3">
                                        <span
                                            class="inline-flex h-9 w-9 items-center justify-center rounded bg-muted border"
                                        >
                                            {#if item.icon}
                                                <img
                                                    src={iconToDataUri(item.icon)}
                                                    alt={item.name}
                                                    class="h-6 w-6 object-contain"
                                                />
                                            {:else}
                                                <span class="text-xs text-muted-foreground"
                                                    >{item.name.slice(0, 2)}</span
                                                >
                                            {/if}
                                        </span>
                                        <div class="flex flex-col text-left min-w-0">
                                            <span class="text-sm font-medium truncate">{item.name}</span>
                                            {#if item.examine}
                                                <span class="text-xs text-muted-foreground line-clamp-1"
                                                    >{item.examine}</span
                                                >
                                            {/if}
                                        </div>
                                        <div class="ml-auto flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min="1"
                                                step="1"
                                                inputmode="numeric"
                                                class="h-8 w-20"
                                                value={quantityById[String(item.id)] ?? '1'}
                                                oninput={(event) =>
                                                    updateQuantity(
                                                        item.id,
                                                        (event.currentTarget as HTMLInputElement).value,
                                                    )}
                                                onkeydown={(event) => {
                                                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                                                        event.stopPropagation();
                                                    }
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        addToBank(item);
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="default"
                                                onclick={() => addToBank(item)}
                                                aria-label={`Add ${item.name}`}
                                            >
                                                <Plus class="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </Command.Item>
                            {/each}
                        </Command.Group>
                    {:else if !searchQuery.trim()}
                        <Command.Empty>Start typing to search items.</Command.Empty>
                    {:else}
                        <Command.Empty>No results found.</Command.Empty>
                    {/if}
                </Command.List>
            </Command.Root>
        </Dialog.Content>
    </Dialog.Root>
</div>
