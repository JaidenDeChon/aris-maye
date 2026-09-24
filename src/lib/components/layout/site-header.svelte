<script lang="ts">
    import * as Command from '$lib/components/ui/command';
    import * as Dialog from '$lib/components/ui/dialog';
    import * as Sidebar from '$lib/components/ui/sidebar';
    import { buttonVariants } from '$lib/components/ui/button';
    import { Search } from 'lucide-svelte';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import { afterNavigate } from '$app/navigation';
    import { resolve } from '$app/paths';
    import type { IGameItem } from '$lib/models/game-item';
    import { addRecentSearch, recentSearchesStore, type RecentSearchEntry } from '$lib/stores/recent-searches-store';

    let searchQuery = $state('');
    let searchDialogOpen = $state(false);
    let searchResults = $state([] as IGameItem[]);
    let searchLoading = $state(false);
    const recentSearches = $derived(
        ($recentSearchesStore.recentSearches ?? []).filter((entry) => entry?.item?.id !== undefined),
    );

    let debounceId: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;

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

    // Debounce search as query changes.
    $effect(() => {
        const value = searchQuery;
        if (debounceId) clearTimeout(debounceId);
        debounceId = setTimeout(() => fetchSearch(value), 200);
    });

    afterNavigate(() => {
        searchDialogOpen = false;
    });

    function handleRecentSearchSelect(entry: RecentSearchEntry) {
        searchQuery = entry.query || entry.item.name || '';
        addRecentSearch(searchQuery, entry.item);
        searchDialogOpen = false;
    }

    function handleSearchResultSelect(item: IGameItem) {
        addRecentSearch(searchQuery, item);
        searchDialogOpen = false;
    }
</script>

<header class="flex w-full h-16 sticky top-0 border-border border-b custom-bg-blur z-30">
    <div class="py-4 px-8 w-full flex gap-3 items-center">
        <Sidebar.Trigger
            class={buttonVariants({
                class: 'h-10 w-10 min-h-10 min-w-10 text-foreground border border-input rounded-md bg-background/70 hover:bg-muted/55 transition-colors',
            })}
        />

        <a href={resolve('/')} aria-label="logo and home link">
            <span class="rs-font-with-shadow text-primary text-xl">Aris Maye</span>
        </a>

        <!-- Button that looks like search bar; opens command modal. -->
        <Dialog.Root bind:open={searchDialogOpen}>
            <Dialog.Trigger
                class="h-10 w-10 ml-auto flex items-center justify-start text-xs text-muted-foreground p-3 border border-input rounded-md bg-background/70 hover:text-foreground hover:bg-muted/55 transition-colors lg:w-full lg:ml-0 lg:absolute lg:left-1/2 lg:transform lg:-translate-x-1/2 lg:max-w-72"
            >
                <Search class="h-4 w-4" />
                <span class="text-muted-foreground ml-3 hidden lg:block">Search...</span>
            </Dialog.Trigger>

            <Dialog.Content class="p-0">
                <Command.Root class="w-full rounded-lg border">
                    <Command.Input placeholder="Search..." bind:value={searchQuery} />

                    <Command.List>
                        {#if searchLoading}
                            <Command.Empty>Searching...</Command.Empty>
                        {:else if searchResults.length > 0}
                            <Command.Group heading="Items">
                                {#each searchResults as item (item.id)}
                                    <Command.LinkItem
                                        href={`/items/${item.id}`}
                                        class="cursor-pointer"
                                        data-sveltekit-preload-data="hover"
                                        onclick={() => handleSearchResultSelect(item)}
                                    >
                                        <div
                                            class="flex items-center gap-3"
                                            role="button"
                                            tabindex="0"
                                            onkeydown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    handleSearchResultSelect(item);
                                                }
                                            }}
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
                                                    <span class="text-xs text-muted-foreground"
                                                        >{item.name.slice(0, 2)}</span
                                                    >
                                                {/if}
                                            </span>
                                            <div class="flex flex-col text-left">
                                                <span class="text-sm font-medium">{item.name}</span>
                                                {#if item.examine}
                                                    <span class="text-xs text-muted-foreground line-clamp-1"
                                                        >{item.examine}</span
                                                    >
                                                {/if}
                                            </div>
                                        </div>
                                    </Command.LinkItem>
                                {/each}
                            </Command.Group>
                        {:else if recentSearches.length > 0}
                            <Command.Group heading="Recent searches">
                                {#each recentSearches as entry (entry.item.id)}
                                    <Command.LinkItem
                                        href={`/items/${entry.item.id}`}
                                        class="cursor-pointer"
                                        data-sveltekit-preload-data="hover"
                                        onclick={() => handleRecentSearchSelect(entry)}
                                    >
                                        <div
                                            class="flex items-center gap-3"
                                            role="button"
                                            tabindex="0"
                                            onkeydown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    handleRecentSearchSelect(entry);
                                                }
                                            }}
                                        >
                                            <span
                                                class="inline-flex h-8 w-8 items-center justify-center rounded bg-muted border"
                                            >
                                                {#if entry.item.icon}
                                                    <img
                                                        src={iconToDataUri(entry.item.icon)}
                                                        alt={entry.item.name}
                                                        class="h-6 w-6 object-contain"
                                                    />
                                                {:else}
                                                    <span class="text-xs text-muted-foreground"
                                                        >{entry.item.name.slice(0, 2)}</span
                                                    >
                                                {/if}
                                            </span>
                                            <div class="flex flex-col text-left">
                                                <span class="text-sm font-medium">{entry.item.name}</span>
                                                {#if entry.item.examine}
                                                    <span class="text-xs text-muted-foreground line-clamp-1"
                                                        >{entry.item.examine}</span
                                                    >
                                                {/if}
                                            </div>
                                        </div>
                                    </Command.LinkItem>
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
</header>
