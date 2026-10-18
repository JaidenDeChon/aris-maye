<script lang="ts">
    import ItemCard from '$lib/components/global/item-card.svelte';
    import * as Pagination from '$lib/components/ui/pagination';
    import * as Select from '$lib/components/ui/select';
    import { Label } from '$lib/components/ui/label';
    import { Switch } from '$lib/components/ui/switch';
    import { onDestroy, untrack } from 'svelte';
    import { afterNavigate, pushState, replaceState } from '$app/navigation';
    import { page } from '$app/state';
    import { browser } from '$app/environment';
    import { defaultSkillLevels } from '$lib/constants/default-skill-levels';
    import type { SkillTreePage } from '$lib/constants/skill-tree-pages';
    import { activeIsIronman, getStoreRoot } from '$lib/stores/character-store.svelte';
    import { getAccountTypeOption } from '$lib/models/account-type';
    import { bankItemsStore, ensureSuppliesForCharacter, getSuppliesForCharacter } from '$lib/stores/bank-items-store';
    import { filterItemsStore } from '$lib/stores/filter-items-by-player-levels';
    import { itemsPagePreferences } from '$lib/stores/items-page-preferences';
    import {
        FILTER_OPTIONS as filterOptions,
        PROFIT_SORT_VALUES as profitSortValues,
        SORT_OPTIONS as sortOptions,
        itemsViewPath,
        normalizeSort,
        parseItemsView,
        type ItemsView,
    } from '$lib/helpers/items-view-url';
    import { Button } from '$lib/components/ui/button';
    import Link2 from '@lucide/svelte/icons/link-2';
    import { toast } from 'svelte-sonner';
    import type { IGameItem } from '$lib/models/game-item';
    import type { CharacterProfile } from '$lib/models/player-stats';

    const perPageOptions = [12, 24, 48, 96, 192];

    function normalizeSkillLevels(skillLevels?: CharacterProfile['skillLevels'], hasCharacter = true) {
        if (!hasCharacter) return undefined;

        const levels = skillLevels ?? defaultSkillLevels;

        const normalized: Record<string, number> = {};
        Object.entries(levels).forEach(([skill, level]) => {
            const numericLevel = Math.max(0, Math.floor(Number(level)));
            if (!Number.isFinite(numericLevel)) return;
            normalized[skill.toLowerCase()] = numericLevel;
        });

        if (!Object.keys(normalized).length) return undefined;
        return normalized;
    }

    const characterStore = $derived(getStoreRoot());
    const characters = $derived(characterStore?.characters ?? []);
    const activeCharacter = $derived.by(() => {
        if (!characters.length) return undefined;

        const targetId = characterStore?.activeCharacter;
        if (targetId === undefined || targetId === null) return undefined;

        return characters.find((c) => String(c.id) === String(targetId));
    });
    const activeSkillLevels = $derived(normalizeSkillLevels(activeCharacter?.skillLevels, Boolean(activeCharacter)));
    // Pricing follows the active character rather than a page toggle, so browsing, an item page and
    // search cannot disagree about which prices the reader is looking at.
    const ironmanMode = $derived(activeIsIronman());
    const activeAccountType = $derived(getAccountTypeOption(activeCharacter?.accountType));
    let skillFilterChecked = $state($filterItemsStore.filterItemsByPlayerLevels);
    const skillFilterEnabled = $derived(Boolean(skillFilterChecked && activeSkillLevels));
    const skillLevelsForQuery = $derived(skillFilterEnabled ? activeSkillLevels : undefined);

    const props = $props<{ heading?: string; skill?: SkillTreePage | null }>();
    const headingProp = $derived(props.heading ?? 'Browse items');
    const skill = $derived(props.skill ?? null);
    const skillSlug = $derived(skill?.slug ?? null);
    const headingLabel = $derived(skill?.title ?? headingProp);

    let loading = $state(true);
    let fetchedItems = $state([] as IGameItem[]);
    import { hiddenStore } from '$lib/stores/hidden-store';
    const hiddenIds = $derived($hiddenStore.hidden ?? []);
    $effect(() => {
        ensureSuppliesForCharacter(activeCharacter?.id ?? null);
    });

    const bankItems = $derived(getSuppliesForCharacter($bankItemsStore, activeCharacter?.id ?? null));
    let totalItems = $state(0);
    // The address bar, not page.url: replaceState (below) leaves page.url on the URL the page was
    // loaded with, and Back to a replaced entry navigates to that old URL while the address bar
    // shows the replaced one. On the server there is only page.url.
    const addressBarUrl = () => (browser ? new URL(location.href) : page.url);
    // A shared link's filter, sort and profit mode win over saved settings for this page. Each flag
    // stays set until the visitor changes that control, and while it is set the control is never
    // written to, or overwritten from, saved settings. The routes remount this component on every
    // real navigation, so reading the URL once here is enough.
    const linkView = untrack(() => parseItemsView(addressBarUrl().searchParams));
    // A link shows its list from the top, not from the visitor's own saved page.
    const opensOnFirstPage = untrack(() => Boolean(skillSlug) || linkView !== null);
    let currentPage = $state(opensOnFirstPage ? 1 : Number($itemsPagePreferences.page) || 1);
    // The page a history entry represents when it has no page recorded on it — i.e. the one this
    // view opens on. Skill routes and links always open on page 1.
    const historyBasePage = untrack(() => (opensOnFirstPage ? 1 : Number($itemsPagePreferences.page) || 1));
    let perPageSelected = $state($itemsPagePreferences.perPage || '12');
    let filterFromLink = linkView !== null;
    let sortFromLink = linkView !== null;
    let profitFromLink = linkView !== null;
    let filterSelected = $state(linkView?.filter ?? ($itemsPagePreferences.filter || 'all'));
    let sortOrderSelected = $state(
        linkView?.sort ??
            normalizeSortSelection($itemsPagePreferences.sortOrder, $itemsPagePreferences.profitMode ?? false),
    );
    let useSuppliesChecked = $state($itemsPagePreferences.useSupplies ?? false);
    let profitModeChecked = $state(linkView?.profit ?? $itemsPagePreferences.profitMode ?? false);
    const perPageValue = $derived(Number(perPageSelected) || 12);
    const perPageLabel = $derived(`${perPageValue}`);
    const filterLabel = $derived(
        filterOptions.find((option) => option.value === filterSelected)?.label ?? 'Filter items',
    );
    const sortLabel = $derived(sortOptions.find((option) => option.value === sortOrderSelected)?.label ?? 'Sort items');
    const profitModeEnabled = $derived(profitModeChecked);
    const profitContextLabel = $derived.by(() => {
        const base = ironmanMode ? 'Ironman profit' : 'Profit';
        return profitModeEnabled && useSuppliesChecked ? `${base} (supplies)` : base;
    });
    const suppliesParam = $derived.by(() => {
        if (!useSuppliesChecked) return null;
        const entries: Array<[string, number]> = [];
        for (const entry of bankItems) {
            const id = entry?.id;
            const quantity = Math.floor(Number(entry?.quantity ?? 0));
            if (!Number.isFinite(quantity) || quantity <= 0) continue;
            if (id === null || id === undefined) continue;
            entries.push([String(id), quantity]);
        }
        if (!entries.length) return null;
        entries.sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify(Object.fromEntries(entries));
    });
    const suppliesActive = $derived(useSuppliesChecked);
    const skillToggleDisabled = $derived(useSuppliesChecked);
    let listAbort: AbortController | null = null;
    let lastSkillSlug: string | null = null;
    const isMobile = $derived(typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
    const cacheSkipKey = 'aris-maye:items-cache:skip';
    let skipCacheOnce = $state(false);
    let forceLoading = $state(false);
    if (typeof window !== 'undefined') {
        const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const navType = navEntry?.type;
        const legacyNavType = (performance as Performance & { navigation?: { type?: number } }).navigation?.type;
        const shouldSkipForReload = navType === 'reload' || legacyNavType === 1;
        const skipFlag = sessionStorage.getItem(cacheSkipKey);
        if (skipFlag) sessionStorage.removeItem(cacheSkipKey);
        skipCacheOnce = shouldSkipForReload || Boolean(skipFlag);

        const markSkip = () => {
            try {
                sessionStorage.setItem(cacheSkipKey, '1');
            } catch {
                // ignore storage failures
            }
        };
        window.addEventListener('beforeunload', markSkip);
        onDestroy(() => {
            window.removeEventListener('beforeunload', markSkip);
        });
    }

    $effect(() => {
        if ($filterItemsStore.filterItemsByPlayerLevels !== skillFilterChecked) {
            skillFilterChecked = $filterItemsStore.filterItemsByPlayerLevels;
        }
    });

    // Keep local selection state in sync with persisted preferences (e.g., when storage events fire).
    // Controls that came from a shared link are left alone (see linkView).
    $effect(() => {
        if (!filterFromLink && $itemsPagePreferences.filter !== filterSelected) {
            filterSelected = $itemsPagePreferences.filter || 'all';
        }
        if (!sortFromLink) {
            const prefOrder = $itemsPagePreferences.sortOrder || 'desc';
            // While profit mode comes from the link, judge the sort against what is on screen, not
            // the saved setting, or an ROI sort picked under the link's profit mode would flip back.
            const profitEnabled = profitFromLink ? profitModeChecked : ($itemsPagePreferences.profitMode ?? false);
            const normalizedOrder = normalizeSortSelection(prefOrder, profitEnabled);
            if (normalizedOrder !== sortOrderSelected) {
                sortOrderSelected = normalizedOrder;
            }
            if (!profitFromLink && normalizedOrder !== prefOrder) {
                itemsPagePreferences.set({ ...$itemsPagePreferences, sortOrder: normalizedOrder });
            }
        }
        if ($itemsPagePreferences.perPage !== perPageSelected) {
            perPageSelected = $itemsPagePreferences.perPage || '12';
        }
        if ($itemsPagePreferences.useSupplies !== useSuppliesChecked) {
            useSuppliesChecked = $itemsPagePreferences.useSupplies ?? false;
        }
        if (!profitFromLink && $itemsPagePreferences.profitMode !== profitModeChecked) {
            profitModeChecked = $itemsPagePreferences.profitMode ?? false;
        }
    });

    const currentView: ItemsView = $derived({
        filter: filterSelected,
        sort: sortOrderSelected,
        profit: profitModeChecked,
    });

    // Mirror the view into the address bar, including saved settings on a bare URL, so what's on screen
    // is always what the address bar shares. replaceState adds nothing to the back button, and passing
    // page.state keeps the pagination entries. SvelteKit refuses replaceState until the router has
    // started, which is only after the first load's afterNavigate callbacks, hence the timeout.
    // It also re-runs after each navigation and each Back/Forward between pagination entries
    // (page.state), since those can put a different URL in the address bar than what is shown.
    let addressBarReady = $state(false);
    let navigations = $state(0);
    afterNavigate(() => {
        setTimeout(() => {
            addressBarReady = true;
            navigations++;
        });
    });
    $effect(() => {
        const view = currentView;
        void navigations;
        void page.state;
        if (!addressBarReady) return;
        untrack(() => {
            const current = addressBarUrl();
            const next = itemsViewPath(current.pathname, current.searchParams, view);
            if (next === current.pathname + current.search) return;
            // The path is the address bar's own, so it's already resolved.
            // eslint-disable-next-line svelte/no-navigation-without-resolve
            replaceState(next, { ...page.state });
        });
    });

    async function copyViewLink() {
        const link = location.origin + itemsViewPath(location.pathname, new URLSearchParams(), currentView);
        try {
            if (!navigator.clipboard) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(link);
            toast.success('Link copied');
        } catch {
            toast.error("Couldn't copy. Copy the address bar instead.");
        }
    }

    // Reset pagination whenever a skill-specific route is entered.
    $effect(() => {
        const nextSkillSlug = skillSlug;
        if (nextSkillSlug && nextSkillSlug !== lastSkillSlug) {
            currentPage = 1;
            itemsPagePreferences.set({ ...$itemsPagePreferences, page: 1 });
        } else if (!nextSkillSlug && lastSkillSlug) {
            currentPage = Number($itemsPagePreferences.page) || 1;
        }
        lastSkillSlug = nextSkillSlug;
    });

    async function loadPage(
        page: number,
        perPageValue: number,
        filter: string,
        sortOrder: string,
        skillLevels?: Record<string, number>,
        skill?: string | null,
        supplies?: string | null,
        suppliesEnabled?: boolean,
        profitMode?: boolean,
        ironman?: boolean,
    ) {
        if (listAbort) listAbort.abort();
        const controller = new AbortController();
        listAbort = controller;
        const shouldForceLoading = forceLoading;
        const cacheKey = buildItemsCacheKey({
            page,
            perPageValue,
            filter,
            sortOrder,
            skillLevels,
            skill,
            supplies,
            suppliesEnabled,
            profitMode,
            ironman,
        });
        const cached = !skipCacheOnce && !shouldForceLoading ? readItemsCache(cacheKey) : null;
        skipCacheOnce = false;
        if (shouldForceLoading) {
            fetchedItems = [];
            totalItems = 0;
        }
        if (cached) {
            fetchedItems = cached.items;
            totalItems = cached.total;
        }
        loading = !cached;
        try {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity
            const searchParams = new URLSearchParams({
                page: page.toString(),
                perPage: perPageValue.toString(),
                filter,
                order: sortOrder,
            });

            if (skillLevels && Object.keys(skillLevels).length) {
                searchParams.set('skillLevels', JSON.stringify(skillLevels));
            }

            if (skill) {
                searchParams.set('skill', skill);
            }

            if (supplies) {
                searchParams.set('supplies', supplies);
            }
            if (suppliesEnabled) {
                searchParams.set('suppliesActive', '1');
            }
            if (profitMode) {
                searchParams.set('profitMode', '1');
            }
            if (ironman) {
                searchParams.set('ironman', '1');
            }

            const response = await fetch(`/api/game-items?${searchParams.toString()}`, {
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch items (status ${response.status})`);
            }
            const data: { items?: IGameItem[]; total?: number; page?: number; perPage?: number } =
                await response.json();
            if (!Array.isArray(data.items)) {
                throw new Error('Invalid items payload');
            }
            if (controller.signal.aborted) return;
            fetchedItems = data.items;
            totalItems = data.total ?? 0;
            writeItemsCache(cacheKey, {
                items: data.items,
                total: data.total ?? 0,
                page: data.page ?? page,
                perPage: data.perPage ?? perPageValue,
            });
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                console.error('Failed to fetch game items', error);
            }
        } finally {
            if (listAbort === controller) {
                listAbort = null;
                if (shouldForceLoading) forceLoading = false;
                loading = false;
            }
        }
    }

    // Fetch whenever pagination inputs change.
    $effect(() => {
        void loadPage(
            currentPage,
            perPageValue,
            filterSelected,
            sortOrderSelected,
            skillLevelsForQuery,
            skillSlug,
            suppliesParam,
            suppliesActive,
            profitModeEnabled,
            ironmanMode,
        );
    });

    const gameItems = $derived.by(() => {
        const hiddenSet = new Set(hiddenIds);
        return fetchedItems.filter((gi) => !hiddenSet.has(gi.id as unknown as number));
    });

    // Persist current page when it changes without creating feedback loops.
    $effect(() => {
        const nextPage = currentPage; // track
        itemsPagePreferences.update((prefs) => ({ ...prefs, page: nextPage }));
    });

    // Follow browser back/forward. Each pagination click pushes a history entry recording its page
    // (see handlePaginationPageChange), so whichever entry we land on tells us what to show;
    // SvelteKit restores that entry's scroll position itself. Reading currentPage untracked keeps
    // this from re-running — and snapping the page back — when a filter or sort resets it to 1.
    // A derived, so replaceState handing over a new page.state with the same page number doesn't
    // re-run this and undo a filter or sort change's reset to page 1.
    const entryPage = $derived(page.state.itemsPage ?? historyBasePage);
    $effect(() => {
        const target = entryPage;
        untrack(() => {
            if (target !== currentPage) currentPage = target;
        });
    });

    // Runs only when the reader picks a page in the pagination widget, never when this component
    // resets currentPage itself, so only real pagination adds to the browser's history.
    function handlePaginationPageChange(nextPage: number) {
        if (page.state.itemsPage !== nextPage) pushState('', { itemsPage: nextPage });
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function handlePerPageChange(value: string) {
        const next = value || '12';
        perPageSelected = next;
        itemsPagePreferences.set({ ...$itemsPagePreferences, perPage: next });
        currentPage = 1;
        itemsPagePreferences.set({ ...$itemsPagePreferences, page: 1 });
    }

    function handleFilterChange(value: string) {
        filterFromLink = false;
        filterSelected = value || 'all';
        itemsPagePreferences.set({ ...$itemsPagePreferences, filter: filterSelected });
        currentPage = 1;
        itemsPagePreferences.set({ ...$itemsPagePreferences, page: 1 });
    }

    function normalizeSortSelection(value?: string | null, profitEnabled = profitModeChecked) {
        return normalizeSort(value, profitEnabled);
    }

    function handleSortChange(value: string) {
        sortFromLink = false;
        const normalized = normalizeSortSelection(value, profitModeEnabled);
        sortOrderSelected = normalized;
        itemsPagePreferences.update((prefs) => ({ ...prefs, sortOrder: normalized }));
        currentPage = 1;
        itemsPagePreferences.update((prefs) => ({ ...prefs, page: 1 }));
    }

    function applySkillFilterToggle(value: boolean) {
        skillFilterChecked = value;
        filterItemsStore.set({ ...$filterItemsStore, filterItemsByPlayerLevels: value });
        // Reset pagination to trigger the reload.
        currentPage = 1;
        itemsPagePreferences.set({ ...$itemsPagePreferences, page: 1 });
    }

    function applySuppliesToggle(value: boolean) {
        useSuppliesChecked = value;
        itemsPagePreferences.set({ ...$itemsPagePreferences, useSupplies: value });
        skipCacheOnce = true;
        forceLoading = true;
        if (value && activeSkillLevels && !skillFilterChecked) {
            skillFilterChecked = true;
            filterItemsStore.set({ ...$filterItemsStore, filterItemsByPlayerLevels: true });
        }
        currentPage = 1;
        itemsPagePreferences.set({ ...$itemsPagePreferences, page: 1 });
    }

    function handleProfitModeToggle(value: boolean) {
        const nextSortOrder = normalizeSortSelection(sortOrderSelected, value);
        if (nextSortOrder !== sortOrderSelected) {
            sortOrderSelected = nextSortOrder;
            // Losing an ROI sort is a consequence of the visitor's own toggle, so it saves too.
            sortFromLink = false;
        }
        profitModeChecked = value;
        profitFromLink = false;
        itemsPagePreferences.update((prefs) => ({
            ...prefs,
            profitMode: value,
            ...(sortFromLink ? {} : { sortOrder: nextSortOrder }),
        }));
        skipCacheOnce = true;
        forceLoading = true;
        currentPage = 1;
        itemsPagePreferences.update((prefs) => ({ ...prefs, page: 1 }));
    }

    type ItemsCacheEntry = {
        items: IGameItem[];
        total: number;
        page: number;
        perPage: number;
        cachedAt: number;
    };

    function normalizeRecord(record?: Record<string, number> | null): Record<string, number> | null {
        if (!record) return null;
        const entries = Object.entries(record)
            .map(([key, value]) => [key, Math.floor(Number(value))] as const)
            .filter(([, value]) => Number.isFinite(value));
        if (!entries.length) return null;
        entries.sort((a, b) => a[0].localeCompare(b[0]));
        return Object.fromEntries(entries);
    }

    function buildItemsCacheKey(params: {
        page: number;
        perPageValue: number;
        filter: string;
        sortOrder: string;
        skillLevels?: Record<string, number>;
        skill?: string | null;
        supplies?: string | null;
        suppliesEnabled?: boolean;
        profitMode?: boolean;
        ironman?: boolean;
    }) {
        if (typeof window === 'undefined') return '';
        const normalizedSkills = normalizeRecord(params.skillLevels);
        const payload = {
            page: params.page,
            perPage: params.perPageValue,
            filter: params.filter,
            sortOrder: params.sortOrder,
            skill: params.skill ?? null,
            skillLevels: normalizedSkills,
            supplies: params.supplies ?? null,
            useSupplies: params.suppliesEnabled ?? useSuppliesChecked,
            profitMode: params.profitMode ?? profitModeChecked,
            ironman: params.ironman ?? ironmanMode,
        };
        return `aris-maye:items-cache:${JSON.stringify(payload)}`;
    }

    function readItemsCache(cacheKey: string): ItemsCacheEntry | null {
        if (!cacheKey || typeof window === 'undefined') return null;
        try {
            const raw = sessionStorage.getItem(cacheKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as ItemsCacheEntry;
            if (!parsed || !Array.isArray(parsed.items)) return null;
            return parsed;
        } catch (error) {
            console.warn('Failed to read items cache', error);
            return null;
        }
    }

    function writeItemsCache(
        cacheKey: string,
        data: { items: IGameItem[]; total: number; page: number; perPage: number },
    ) {
        if (!cacheKey || typeof window === 'undefined') return;
        try {
            const entry: ItemsCacheEntry = { ...data, cachedAt: Date.now() };
            sessionStorage.setItem(cacheKey, JSON.stringify(entry));
        } catch (error) {
            console.warn('Failed to write items cache', error);
        }
    }
</script>

<div class="items-page pt-6 pb-8">
    <div class="content-sizing">
        <div class="flex items-center mb-4 gap-3">
            {#if skill}
                <img src={skill.icon} alt={`${headingLabel} icon`} class="h-8 w-8" />
            {/if}
            <h1 class="text-3xl font-bold">{headingLabel}</h1>
        </div>
    </div>

    {#if ironmanMode}
        <div class="content-sizing">
            <div class="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <span class="font-semibold">You're in {activeAccountType.label} mode.</span>
                <span class="text-muted-foreground">
                    The GP values shown in Ironman mode are derived from alchemy and base shop values (e.g. before the
                    shop value of an item drops from selling multiple).
                </span>
            </div>
        </div>
    {/if}

    <div class="border-b border-border">
        <div class="content-sizing">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm py-2">
                <div class="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <div class="min-w-[180px] sm:w-[210px]">
                        <Select.Root type="single" bind:value={filterSelected} onValueChange={handleFilterChange}>
                            <Select.Trigger>{filterLabel}</Select.Trigger>
                            <Select.Content>
                                <Select.Group>
                                    {#each filterOptions as option (option.value)}
                                        <Select.Item value={option.value}>{option.label}</Select.Item>
                                    {/each}
                                </Select.Group>
                            </Select.Content>
                        </Select.Root>
                    </div>
                    <div class="min-w-[180px] sm:w-[210px]">
                        <Select.Root type="single" bind:value={sortOrderSelected} onValueChange={handleSortChange}>
                            <Select.Trigger>{sortLabel}</Select.Trigger>
                            <Select.Content>
                                <Select.Group>
                                    {#each sortOptions as option (option.value)}
                                        <Select.Item
                                            value={option.value}
                                            disabled={profitSortValues.includes(option.value) && !profitModeEnabled}
                                        >
                                            {option.label}
                                        </Select.Item>
                                    {/each}
                                </Select.Group>
                            </Select.Content>
                        </Select.Root>
                    </div>
                </div>

                <div
                    class="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:text-right"
                >
                    <div class="min-w-[170px] sm:w-[190px]">
                        <Select.Root type="single" bind:value={perPageSelected} onValueChange={handlePerPageChange}>
                            <Select.Trigger>{perPageLabel} items per page</Select.Trigger>
                            <Select.Content>
                                <Select.Group>
                                    {#each perPageOptions as option (option)}
                                        <Select.Item value={option.toString()}>{option}</Select.Item>
                                    {/each}
                                </Select.Group>
                            </Select.Content>
                        </Select.Root>
                    </div>
                    <Button variant="outline" onclick={copyViewLink}>
                        <Link2 class="h-4 w-4" />
                        Copy link
                    </Button>
                </div>
            </div>
        </div>
    </div>

    <div class="border-b border-border mb-4">
        <div class="content-sizing">
            <div class="flex w-full flex-col items-start gap-2 py-2">
                <div class="flex items-center gap-2">
                    <Switch
                        id="skill-filter-switch"
                        checked={skillFilterChecked}
                        onCheckedChange={applySkillFilterToggle}
                        aria-label="Filter by my skill levels"
                        disabled={skillToggleDisabled}
                    />
                    <Label
                        for="skill-filter-switch"
                        class={`cursor-pointer select-none text-sm ${skillToggleDisabled ? 'opacity-60' : ''}`}
                    >
                        Filter by my skill levels
                    </Label>
                </div>
                <div class="flex items-center gap-2">
                    <Switch
                        id="supplies-profit-switch"
                        checked={useSuppliesChecked}
                        onCheckedChange={applySuppliesToggle}
                        aria-label="Only show what I have supplies for"
                    />
                    <Label for="supplies-profit-switch" class="cursor-pointer select-none text-sm">
                        Only show what I have supplies for
                    </Label>
                </div>
                <div class="flex items-center gap-2">
                    <Switch
                        id="profit-mode-switch"
                        checked={profitModeEnabled}
                        onCheckedChange={handleProfitModeToggle}
                        aria-label="Enable profit mode"
                    />
                    <Label for="profit-mode-switch" class="cursor-pointer select-none text-sm">
                        Show profit <span class="text-xs text-muted-foreground">(enables ROI sorting)</span>
                    </Label>
                </div>
            </div>
        </div>
    </div>

    <div class="content-sizing">
        {#snippet pagination()}
            <div class="max-w-24 mx-auto">
                <Pagination.Root
                    class="item-page-pagination"
                    bind:page={currentPage}
                    count={totalItems}
                    perPage={perPageValue}
                    onPageChange={handlePaginationPageChange}
                >
                    {#snippet children({ pages, currentPage })}
                        <Pagination.Content>
                            <Pagination.Item>
                                <Pagination.PrevButton />
                            </Pagination.Item>
                            {#each isMobile ? pages.filter((p) => {
                                      const last = pages[pages.length - 1];
                                      const lastVal = last && last.type !== 'ellipsis' ? last.value : undefined;
                                      if (p.type === 'ellipsis') return false;
                                      const val = p.value;
                                      return val === 1 || val === currentPage || (lastVal !== undefined && val === lastVal) || val === currentPage - 1 || val === currentPage + 1;
                                  }) : pages as page (page.key)}
                                {#if page.type === 'ellipsis'}
                                    <Pagination.Item>
                                        <Pagination.Ellipsis />
                                    </Pagination.Item>
                                {:else}
                                    <Pagination.Item>
                                        <Pagination.Link {page} isActive={currentPage === page.value}>
                                            {page.value}
                                        </Pagination.Link>
                                    </Pagination.Item>
                                {/if}
                            {/each}
                            <Pagination.Item>
                                <Pagination.NextButton />
                            </Pagination.Item>
                        </Pagination.Content>
                    {/snippet}
                </Pagination.Root>
            </div>
        {/snippet}

        <div class="mb-6">
            {@render pagination()}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {#if loading}
                {#each Array.from({ length: perPageValue }, (_, i) => i) as index (index)}
                    <ItemCard {loading} />
                {/each}
            {:else}
                {#each gameItems as item (item.id)}
                    <ItemCard
                        {item}
                        linkToItemPage
                        allowHide={true}
                        allowFavorite={true}
                        showProfit={profitModeEnabled}
                        profitContext={profitContextLabel}
                        ironman={ironmanMode}
                    />
                {/each}
            {/if}
        </div>

        <div class="mt-8">
            {@render pagination()}
        </div>
    </div>
</div>
