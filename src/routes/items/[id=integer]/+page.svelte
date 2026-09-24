<script lang="ts">
    import {
        Star,
        StarOff,
        TrendingUp,
        TrendingDown,
        Package,
        PackageX,
        TriangleAlert,
        ArrowLeftRight,
        Ban,
    } from 'lucide-svelte';
    import { Skeleton } from '$lib/components/ui/skeleton';
    import * as Avatar from '$lib/components/ui/avatar';
    import * as Breadcrumb from '$lib/components/ui/breadcrumb';
    import * as Dialog from '$lib/components/ui/dialog';
    import IconBadge from '$lib/components/global/icon-badge.svelte';
    import StatTile from '$lib/components/global/stat-tile.svelte';
    import FavoriteButton from '$lib/components/global/favorite-button.svelte';
    import GameItemTreeCard from '$lib/components/game-item-creation-card/game-item-creation-card.svelte';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import { formatWithCommas } from '$lib/helpers/format-number';
    import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
    import { fetchItemTree, readItemTreeCache } from '$lib/helpers/item-tree-cache';
    import { isPending, type Deferred } from '$lib/helpers/deferred-page-data';
    import { ITEM_LOAD_DEPENDENCY, type GameItemLoadResult } from '$lib/models/game-item-load';
    import { invalidate } from '$app/navigation';
    import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';
    import Button from '$lib/components/ui/button/button.svelte';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import OsrsboxItemUploadDialog from '$lib/components/dialogs/osrsbox-item-upload-dialog.svelte';
    import {
        bankItemsStore,
        ensureSuppliesForCharacter,
        getSuppliesForCharacter,
        updateSuppliesForCharacter,
    } from '$lib/stores/bank-items-store';
    import { getStoreRoot, getActiveAccountType } from '$lib/stores/character-store.svelte';
    import { canUseGrandExchange } from '$lib/models/account-type';
    import { NATURE_RUNE_FALLBACK_PRICE, alchemyValueAfterRune } from '$lib/constants/alchemy';
    import { toast } from 'svelte-sonner';

    const {
        data,
    }: {
        data: {
            itemId: string;
            // Deferred on a client-side navigation so the route commits immediately; see
            // `deferred-page-data` and the effect that unwraps these below.
            gameItem: Deferred<GameItemLoadResult>;
            natureRunePrice?: Deferred<number | null>;
            showDevControls?: boolean;
        };
    } = $props();

    let loading = $state(false);
    // Seeded synchronously rather than from the effect below, because effects do not run while the
    // page is rendered on the server and that render has to carry the real item.
    const initialResult = isPending(data.gameItem) ? null : data.gameItem;
    let gameItem = $state<IOsrsboxItemWithMeta | null>(initialResult?.status === 'found' ? initialResult.item : null);
    // Set when there is no item to show at all, which is a finished state rather than a slow one:
    // the page says so instead of leaving its skeletons pulsing forever.
    let loadProblem = $state<'missing' | 'failed' | null>(
        initialResult && initialResult.status !== 'found' ? initialResult.status : null,
    );
    let treeItem = $state<IOsrsboxItemWithMeta | null>(null);
    // `treeLoading` is the cold start, where there is nothing on screen yet and the card
    // shows skeletons. `treeRefreshing` is the warm case: the reader moved to another item
    // and the previous tree is still rendered while the new one loads. Keeping them apart is
    // what lets the chart keep its ECharts instance across an item-to-item navigation and
    // animate into the new tree instead of being destroyed and rebuilt from scratch.
    let treeLoading = $state(false);
    let treeRefreshing = $state(false);
    let treeError = $state<string | null>(null);
    const iconSrc = $derived(iconToDataUri(gameItem?.icon));
    const wikiUrl = $derived(() => {
        // The stored URL is authoritative and already carries the version anchor, so an
        // item from a switch-infobox page ("Oak seedling (w)") lands on its own section.
        // Building the link from `wiki_name` instead 404s for those, because OSRSBox
        // synthesises that field as "<page title> (<version>)" — see
        // scripts/WIKI-NAME-NORMALIZATION.md.
        const storedUrl = gameItem?.wiki_url?.trim();
        if (storedUrl) return storedUrl;

        // No stored URL: fall back to the derived page title, then the in-game name.
        // `wiki_name` stays last for the same reason it cannot be trusted above.
        const slug = gameItem?.wiki_page_title ?? gameItem?.name ?? gameItem?.wiki_name ?? gameItem?.wikiName;
        if (!slug) return null;
        return `https://oldschool.runescape.wiki/w/${encodeURIComponent(slug.replaceAll(' ', '_'))}`;
    });
    const geSpread = $derived(() => {
        const high = normalizePrice(gameItem?.highPrice);
        const low = normalizePrice(gameItem?.lowPrice);
        if (high === null || low === null) return null;
        return high - low;
    });
    const highAlchProfit = $derived(() => {
        const alch = gameItem?.highalch;
        const price = normalizePrice(gameItem?.highPrice);
        if (alch === null || alch === undefined || price === null) return null;
        return alch - price;
    });
    const lowAlchProfit = $derived(() => {
        const alch = gameItem?.lowalch;
        const price = normalizePrice(gameItem?.lowPrice);
        if (alch === null || alch === undefined || price === null) return null;
        return alch - price;
    });

    // Which prices apply to the reader. Everything below branches on this one boolean rather than on
    // the account type, so the four Ironman variants cannot drift apart.
    const usesGrandExchange = $derived(canUseGrandExchange(getActiveAccountType()));
    // The rune's price is the same whichever item is on screen, so a response that lands after the
    // reader has moved on is still the right answer and needs no per-navigation guard.
    let natureRuneHighPrice = $state<number | null>(null);
    $effect(() => {
        const incoming = data.natureRunePrice ?? null;
        if (!isPending(incoming)) {
            natureRuneHighPrice = incoming;
            return;
        }
        void incoming.then((price) => {
            natureRuneHighPrice = price ?? null;
        });
    });
    const natureRunePrice = $derived(normalizePrice(natureRuneHighPrice) ?? NATURE_RUNE_FALLBACK_PRICE);

    // What an Ironman actually clears by alching, rather than the alch-versus-market-price figure
    // above. They never bought the item at a market price, so subtracting one tells them nothing.
    const highAlchValue = $derived(() => alchemyValueAfterRune(gameItem?.highalch, natureRunePrice));
    const lowAlchValue = $derived(() => alchemyValueAfterRune(gameItem?.lowalch, natureRunePrice));

    const isTradeableOnGe = $derived(gameItem?.tradeable_on_ge !== false);
    const hasLivePrice = $derived(
        normalizePrice(gameItem?.highPrice) !== null || normalizePrice(gameItem?.lowPrice) !== null,
    );
    // The Grand Exchange card is meaningless for an item that cannot be listed there, and merely
    // deprioritised for an Ironman looking at one that can — it is still real information, just not
    // the number they act on.
    const showGrandExchangeCard = $derived(isTradeableOnGe);
    const collapseGrandExchangeCard = $derived(isTradeableOnGe && !usesGrandExchange);
    let grandExchangeOpen = $state(false);

    // Why a price is missing, so a bare dash never reads as broken data.
    const missingPriceReason = $derived.by(() => {
        if (hasLivePrice) return null;
        if (!isTradeableOnGe) return 'Not tradeable';
        return 'No recent trades';
    });
    const devControlsEnabled = Boolean(data.showDevControls);

    const characterStore = $derived(getStoreRoot());
    const activeCharacterId = $derived(characterStore?.activeCharacter ?? null);
    const suppliesActionsDisabled = $derived(!activeCharacterId);

    function ensureActiveCharacter(): boolean {
        if (activeCharacterId) return true;
        toast.error('Select a character to manage supplies.');
        return false;
    }

    function formatValue(value: number | null | undefined, suffix = ' gp') {
        if (value === null || value === undefined) return '—';
        return `${formatWithCommas(Math.round(value))}${suffix}`;
    }

    function formatPrice(value: number | null | undefined) {
        const normalized = normalizePrice(value);
        if (normalized === null) return '—';
        return `${formatWithCommas(Math.round(normalized))} gp`;
    }

    function formatDelta(value: number | null | undefined) {
        if (value === null || value === undefined) return '—';
        const sign = value > 0 ? '+' : '';
        return `${sign}${formatWithCommas(Math.round(value))} gp`;
    }

    function profitTone(value: number | null | undefined) {
        if (value === null || value === undefined || value === 0) return 'text-foreground';
        return value > 0 ? 'text-emerald-500' : 'text-rose-500';
    }

    function normalizePrice(value: number | null | undefined): number | null {
        if (value === null || value === undefined) return null;
        if (!Number.isFinite(value)) return null;
        if (value <= 0) return null;
        return value;
    }

    let editLoading = $state(false);

    async function handleEdit(openWithItem: (item: Record<string, unknown>) => void) {
        if (!gameItem?.id) return;
        editLoading = true;
        try {
            const resp = await fetch(`/api/osrsbox-items?id=${encodeURIComponent(gameItem.id)}`);
            if (!resp.ok) {
                const message = await resp.text();
                throw new Error(message || 'Failed to load item for editing.');
            }
            const item = (await resp.json()) as Record<string, unknown>;
            openWithItem(item);
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Failed to load item for editing.');
        } finally {
            editLoading = false;
        }
    }

    async function refreshItemFromApi() {
        if (!gameItem?.id) return;
        loading = true;
        try {
            const resp = await fetch(`/api/osrsbox-items?id=${encodeURIComponent(gameItem.id)}`);
            if (!resp.ok) {
                const message = await resp.text();
                throw new Error(message || 'Failed to refresh item.');
            }
            const updated = (await resp.json()) as IOsrsboxItemWithMeta;
            gameItem = updated;
            if (updated?.id !== null && updated?.id !== undefined) {
                // The item was just re-read from the source of truth, so the cached tree for it
                // is stale by definition.
                void fetchItemTree(updated.id, { force: true }).then(
                    (tree) => {
                        if (currentItemId === String(updated.id)) treeItem = tree;
                    },
                    (error) => {
                        console.error('Failed to refresh item tree', error);
                    },
                );
            }
            toast.success('Item updated.');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Failed to refresh item.');
        } finally {
            loading = false;
        }
    }

    // Keyed on the route parameter rather than on the loaded item, because on a client-side
    // navigation the item itself is still in flight when this page takes over the screen.
    let currentItemId: string | null = null;
    // A retry re-runs `load` for the same route, so the id alone cannot tell the two apart. The
    // value `load` handed over is a new object every time it runs, which can.
    let currentItemSource: Deferred<GameItemLoadResult> | null = null;

    /**
     * Put the tree for `itemId` on screen, without disturbing what is already there any more
     * than it has to.
     *
     * A cached tree is applied synchronously, before this function ever suspends, so Svelte
     * sees a single state change and the creation card never flips through its loading
     * branch. That is what already made the back button feel smooth, and requesting the tree
     * the moment a chart node is clicked means a forward navigation usually lands here on a
     * cache hit too. When it does not, the previous tree stays mounted and the card marks
     * itself as refreshing rather than collapsing to skeletons, so the chart animates from
     * the old root to the new one once the response arrives.
     */
    async function applyItemTree(itemId: string) {
        treeError = null;

        const cached = readItemTreeCache(itemId);
        if (cached !== undefined) {
            treeItem = cached;
            treeLoading = false;
            treeRefreshing = false;
            return;
        }

        treeLoading = treeItem === null;
        treeRefreshing = treeItem !== null;

        try {
            const tree = await fetchItemTree(itemId);
            // Another item was routed to while this was in flight; that navigation owns the
            // chart now, so drop this response rather than overwriting the newer tree.
            if (currentItemId !== itemId) return;
            treeItem = tree;
        } catch (error) {
            if (currentItemId !== itemId) return;
            treeError = error instanceof Error ? error.message : 'Failed to load item tree.';
            treeItem = null;
            console.error('Failed to load item tree', error);
        } finally {
            if (currentItemId === itemId) {
                treeLoading = false;
                treeRefreshing = false;
            }
        }
    }

    function applyItemResult(result: GameItemLoadResult) {
        gameItem = result.status === 'found' ? result.item : null;
        loadProblem = result.status === 'found' ? null : result.status;
        loading = false;
    }

    $effect(() => {
        // When routed data arrives, hydrate local state and kick off dependent fetches.
        const itemId = data.itemId ?? null;
        const incoming = data.gameItem ?? null;
        if (itemId === currentItemId && incoming === currentItemSource) return;

        currentItemId = itemId;
        currentItemSource = incoming;

        if (incoming === null) {
            applyItemResult({ status: 'missing' });
        } else if (isPending(incoming)) {
            // The navigation has already committed, so this page owns the screen while its item is
            // still on the wire. Skeletons until it lands.
            gameItem = null;
            loadProblem = null;
            loading = true;
            void incoming.then((result) => {
                if (currentItemSource !== incoming) return;
                applyItemResult(result);
            });
        } else {
            applyItemResult(incoming);
        }

        if (itemId === null) {
            treeItem = null;
            treeError = null;
            treeLoading = false;
            treeRefreshing = false;
            return;
        }

        // The tree is keyed on the same id as the route, so it does not have to wait for the item
        // itself — both requests run side by side.
        void applyItemTree(itemId);
    });

    let retrying = $state(false);

    // Re-runs this page's `load` alone, rather than every load on the page. The effect above picks
    // the new result up, because `load` hands over a value it has not seen before.
    async function retryItemLoad() {
        if (retrying) return;
        retrying = true;
        try {
            await invalidate(ITEM_LOAD_DEPENDENCY);
        } catch (error) {
            console.error('Failed to reload item', error);
            toast.error('Still could not load this item.');
        } finally {
            retrying = false;
        }
    }

    // The skeletons stand for an answer that is still coming. Once one has arrived — even the
    // answer that there is no item — they give way to it.
    const pending = $derived(loading || (!gameItem && !loadProblem));
    const problemCopy = $derived(
        loadProblem === 'missing'
            ? {
                  title: 'Item not found',
                  body: 'No item with this ID exists. It may have been removed from the game, or the link may be wrong.',
              }
            : {
                  title: "Couldn't load this item",
                  body: 'The request did not go through. Check your connection, then try again.',
              },
    );

    const primaryCreationSpec = $derived(getPrimaryCreationSpec(treeItem));
    const renderChart = $derived(!!primaryCreationSpec?.ingredients?.length);

    $effect(() => {
        ensureSuppliesForCharacter(activeCharacterId);
    });

    const bankItems = $derived(getSuppliesForCharacter($bankItemsStore, activeCharacterId));
    const bankEntry = $derived.by(() => {
        const itemId = Number(gameItem?.id);
        if (!Number.isFinite(itemId)) return undefined;
        return bankItems.find((entry) => Number(entry.id) === itemId);
    });
    const isInBank = $derived(Boolean(bankEntry));
    const bankQuantity = $derived(bankEntry?.quantity ?? 0);

    let bankDialogOpen = $state(false);
    let bankDialogMode = $state<'add' | 'remove'>('add');
    let bankQuantityInput = $state('1');

    function openAddToBank() {
        if (!ensureActiveCharacter()) return;
        bankDialogMode = 'add';
        bankQuantityInput = '1';
        bankDialogOpen = true;
    }

    function openRemoveFromBank() {
        if (!ensureActiveCharacter()) return;
        bankDialogMode = 'remove';
        bankDialogOpen = true;
    }

    function parseQuantity(value: string | undefined) {
        const numeric = Math.floor(Number(value ?? ''));
        if (!Number.isFinite(numeric) || numeric <= 0) return 1;
        return numeric;
    }

    function confirmAddToBank() {
        if (!ensureActiveCharacter()) return;
        const itemId = Number(gameItem?.id);
        if (!Number.isFinite(itemId) || !gameItem) return;
        const quantity = parseQuantity(bankQuantityInput);

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

        toast.success(`Added ${quantity}x ${gameItem.name} to your supplies.`);
        bankDialogOpen = false;
    }

    function confirmRemoveFromBank() {
        if (!ensureActiveCharacter()) return;
        const itemId = Number(gameItem?.id);
        if (!Number.isFinite(itemId) || !gameItem) return;
        updateSuppliesForCharacter(activeCharacterId, (items) => items.filter((entry) => Number(entry.id) !== itemId));
        toast.success(`Removed ${gameItem.name} from your supplies.`);
        bankDialogOpen = false;
    }
</script>

<div class="content-sizing pt-6">
    <Dialog.Root bind:open={bankDialogOpen}>
        <Dialog.Content>
            {#if bankDialogMode === 'add'}
                <Dialog.Header>
                    <Dialog.Title>Add to supplies</Dialog.Title>
                    <Dialog.Description>How many would you like to add?</Dialog.Description>
                </Dialog.Header>
                <div class="space-y-2 py-4">
                    <Label for="supplies-quantity">Quantity</Label>
                    <Input
                        id="supplies-quantity"
                        type="number"
                        min="1"
                        step="1"
                        inputmode="numeric"
                        bind:value={bankQuantityInput}
                        onkeydown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                confirmAddToBank();
                            }
                        }}
                    />
                </div>
                <Dialog.Footer>
                    <Button variant="ghost" onclick={() => (bankDialogOpen = false)}>Cancel</Button>
                    <Button onclick={confirmAddToBank}>Add to supplies</Button>
                </Dialog.Footer>
            {:else}
                <Dialog.Header>
                    <Dialog.Title>Remove from supplies</Dialog.Title>
                    <Dialog.Description>
                        You have {bankQuantity} of these in your supplies. Remove this item?
                    </Dialog.Description>
                </Dialog.Header>
                <Dialog.Footer>
                    <Button variant="ghost" onclick={() => (bankDialogOpen = false)}>Cancel</Button>
                    <Button variant="critical" onclick={confirmRemoveFromBank}>Remove from supplies</Button>
                </Dialog.Footer>
            {/if}
        </Dialog.Content>
    </Dialog.Root>
    <!-- Header -->
    <header>
        <!-- Below `sm` there is not enough width for the breadcrumbs and the actions to share a
             line, so the actions drop onto their own row instead of squeezing the trail. Each row
             is full width there and keeps the edge it sits on above `sm`: the trail stays left,
             the actions stay right. -->
        <div class="flex flex-col gap-3 w-full sm:flex-row sm:justify-between sm:items-center">
            {#if pending}
                <div class="flex gap-5">
                    <Skeleton class="h-4 w-10" />
                    <Skeleton class="h-4 w-10" />
                    <Skeleton class="h-4 w-32" />
                </div>
                <Skeleton class="rounded-full w-10 h-10 self-end sm:self-auto" />
            {:else}
                <!-- Breadcrumbs and actions -->
                <Breadcrumb.Root>
                    <Breadcrumb.List>
                        <!-- Home -->
                        <Breadcrumb.Item>
                            <Breadcrumb.Link href="/">Home</Breadcrumb.Link>
                        </Breadcrumb.Item>

                        <Breadcrumb.Separator />

                        <!-- Items -->
                        <Breadcrumb.Item>
                            <Breadcrumb.Link href="/items">Items</Breadcrumb.Link>
                        </Breadcrumb.Item>

                        <Breadcrumb.Separator />

                        <!-- This page. The trail is the way back out, so it stays whether or not
                             there was an item to put at the end of it. -->
                        <Breadcrumb.Item>
                            <Breadcrumb.Page>{gameItem?.name ?? problemCopy.title}</Breadcrumb.Page>
                        </Breadcrumb.Item>
                    </Breadcrumb.List>
                </Breadcrumb.Root>

                <!-- Every action here acts on an item, so none of them belong on a page without one. -->
                {#if gameItem}
                    <div class="flex flex-wrap items-center justify-end gap-3 w-full sm:w-auto">
                        {#if wikiUrl()}
                            <Button href={wikiUrl()} target="_blank" rel="noreferrer" variant="outline">Wiki</Button>
                        {/if}
                        {#if devControlsEnabled}
                            <OsrsboxItemUploadDialog triggerClass="inline-flex" onCreated={refreshItemFromApi}>
                                {#snippet trigger({ openWithItem, triggerClass })}
                                    <Button
                                        variant="outline"
                                        class={triggerClass}
                                        disabled={!gameItem || editLoading}
                                        onclick={() => gameItem && handleEdit(openWithItem)}
                                    >
                                        Edit
                                    </Button>
                                {/snippet}
                            </OsrsboxItemUploadDialog>
                        {/if}
                        {#if isInBank}
                            <Button
                                variant="outline"
                                onclick={openRemoveFromBank}
                                aria-disabled={suppliesActionsDisabled}
                                class={suppliesActionsDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                            >
                                Remove from supplies
                            </Button>
                        {:else}
                            <Button
                                variant="outline"
                                onclick={openAddToBank}
                                aria-disabled={suppliesActionsDisabled}
                                class={suppliesActionsDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                            >
                                Add to supplies
                            </Button>
                        {/if}
                        <FavoriteButton {gameItem} />
                    </div>
                {/if}
            {/if}
        </div>

        <!-- Item name, description, color -->
        <!-- py-3 makes up for py-3 from .content-sizing -->
        <div class="flex gap-6 my-4 py-3">
            <!-- Item image -->
            {#if pending}
                <Skeleton class="h-16 w-16 rounded-full" />
            {:else if !gameItem}
                <div
                    class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground"
                >
                    {#if loadProblem === 'missing'}
                        <PackageX class="h-7 w-7" />
                    {:else}
                        <TriangleAlert class="h-7 w-7" />
                    {/if}
                </div>
            {:else}
                <Avatar.Root class="p-3 bg-muted border item-card__img-background h-16 w-16">
                    {#if gameItem.icon}
                        <Avatar.Image
                            src={iconSrc}
                            alt={gameItem.name}
                            class="item-page__item-image object-contain animate-fade-in"
                        />
                    {:else}
                        <Avatar.Fallback class="animate-fade-in-delayed"
                            >{gameItem.name?.substring(0, 2)}</Avatar.Fallback
                        >
                    {/if}
                </Avatar.Root>
            {/if}

            <!-- Name and description -->
            <div class="flex flex-col gap-2 justify-center">
                {#if pending}
                    <Skeleton class="h-7 w-52 mb-2" />
                    <Skeleton class="h-3 w-36" />
                {:else if !gameItem}
                    <h1 class="text-2xl font-bold animate-fade-in">{problemCopy.title}</h1>
                    <p class="text-muted-foreground text-sm animate-fade-in">{problemCopy.body}</p>
                    <div class="mt-2 flex flex-wrap items-center gap-3">
                        <Button href="/items" variant="outline">Browse items</Button>
                        <!-- Only offered where a second attempt could land differently. A missing
                             item will still be missing. -->
                        {#if loadProblem === 'failed'}
                            <Button onclick={retryItemLoad} disabled={retrying}>
                                {retrying ? 'Trying…' : 'Try again'}
                            </Button>
                        {/if}
                    </div>
                {:else}
                    <h1 class="text-2xl font-bold animate-fade-in">{gameItem.name}</h1>
                    <p class="text-muted-foreground text-sm animate-fade-in">
                        {gameItem.examine}
                    </p>
                {/if}
            </div>
        </div>
    </header>

    <!-- Everything below describes an item. Gated on the problem rather than on the item itself,
         because while one is still on its way these sections are what carry the skeletons; it is
         only once the answer is in and there is no item that they have nothing to say. -->
    {#if !loadProblem}
        <div class="flex gap-3 flex-wrap">
            <IconBadge text={gameItem?.members ? 'Members' : 'Free to play'}>
                {#snippet icon()}
                    <!-- Members indicator -->
                    {#if gameItem?.members}
                        <Star class="size-5 p-0.5 fill-primary text-transparent" />
                    {:else}
                        <StarOff class="size-5 p-0.5 text-muted-foreground" />
                    {/if}
                {/snippet}
            </IconBadge>
            {#if gameItem}
                <IconBadge text={isTradeableOnGe ? 'Sold on the GE' : 'Not sold on the GE'}>
                    {#snippet icon()}
                        {#if isTradeableOnGe}
                            <ArrowLeftRight class="size-5 p-0.5 text-primary" />
                        {:else}
                            <Ban class="size-5 p-0.5 text-muted-foreground" />
                        {/if}
                    {/snippet}
                </IconBadge>
            {/if}
        </div>

        <!-- Item tree card -->
        {#if treeError}
            <p class="text-sm text-rose-500 mt-4">Failed to load ingredient data.</p>
        {/if}
        <GameItemTreeCard
            rootClass="mt-4 pb-5"
            gameItem={treeItem}
            loading={treeLoading}
            refreshing={treeRefreshing}
            {renderChart}
        />

        <!-- Prices. Each number carries a line saying what it is, because "high" and "low" on
             their own do not say which side of a trade they come from. -->
        <div class="grid gap-4 lg:grid-cols-2 mt-6">
            {#if pending}
                <Skeleton class="h-56 w-full" />
                <Skeleton class="h-56 w-full" />
            {:else}
                {#if showGrandExchangeCard}
                    <section
                        class="border rounded-lg bg-card shadow-sm overflow-hidden {collapseGrandExchangeCard
                            ? 'lg:order-last opacity-80'
                            : ''}"
                    >
                        <div class="flex items-start justify-between gap-3 p-4 border-b">
                            <div class="flex items-center gap-3">
                                <img
                                    src="/other-images/grand-exchange.png"
                                    alt=""
                                    class="h-7 w-7 drop-shadow shrink-0"
                                />
                                <h3 class="text-lg font-semibold leading-tight">Grand Exchange</h3>
                            </div>
                            {#if collapseGrandExchangeCard}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onclick={() => (grandExchangeOpen = !grandExchangeOpen)}
                                >
                                    {grandExchangeOpen ? 'Hide' : 'Show'} prices
                                </Button>
                            {/if}
                        </div>
                        {#if !collapseGrandExchangeCard || grandExchangeOpen}
                            <div class="grid grid-cols-2 gap-3 p-4">
                                <StatTile
                                    label="Buy price"
                                    value={missingPriceReason ?? formatPrice(gameItem?.highPrice)}
                                    tone={missingPriceReason ? 'muted' : 'neutral'}
                                >
                                    {#snippet icon()}<TrendingUp class="h-4 w-4" />{/snippet}
                                </StatTile>
                                <StatTile
                                    label="Sell price"
                                    value={missingPriceReason ?? formatPrice(gameItem?.lowPrice)}
                                    tone={missingPriceReason ? 'muted' : 'neutral'}
                                >
                                    {#snippet icon()}<TrendingDown class="h-4 w-4" />{/snippet}
                                </StatTile>
                                {#if usesGrandExchange}
                                    <StatTile
                                        label="Margin"
                                        value={formatValue(geSpread())}
                                        hint="Buy price minus sell price"
                                    >
                                        {#snippet icon()}<ArrowLeftRight class="h-4 w-4" />{/snippet}
                                    </StatTile>
                                {/if}
                                <StatTile
                                    label="Buy limit"
                                    value={formatValue(gameItem?.buyLimit ?? gameItem?.buy_limit, '')}
                                    hint="Most you can buy every 4 hours"
                                >
                                    {#snippet icon()}<Package class="h-4 w-4" />{/snippet}
                                </StatTile>
                            </div>
                        {/if}
                    </section>
                {/if}

                <section class="border rounded-lg bg-card shadow-sm overflow-hidden">
                    <div class="flex items-center gap-3 p-4 border-b">
                        <img src="/spell-images/high-level-alchemy.png" alt="" class="h-7 w-7 drop-shadow shrink-0" />
                        <div>
                            <h3 class="text-lg font-semibold leading-tight">Alchemy and shops</h3>
                            <p class="text-xs text-muted-foreground">Fixed values set by the game</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 p-4">
                        <StatTile label="High alch" value={formatValue(gameItem?.highalch)}>
                            {#snippet icon()}
                                <img src="/spell-images/high-level-alchemy.png" alt="" class="h-4 w-4 drop-shadow" />
                            {/snippet}
                            {@render alchNote(normalizePrice(gameItem?.highPrice), highAlchProfit(), highAlchValue())}
                        </StatTile>
                        <StatTile label="Low alch" value={formatValue(gameItem?.lowalch)}>
                            {#snippet icon()}
                                <img src="/spell-images/low-level-alchemy.png" alt="" class="h-4 w-4 drop-shadow" />
                            {/snippet}
                            {@render alchNote(normalizePrice(gameItem?.lowPrice), lowAlchProfit(), lowAlchValue())}
                        </StatTile>
                        <StatTile
                            label="Base value"
                            value={formatValue(gameItem?.cost)}
                            hint="Shop prices and alch values are worked out from this"
                        >
                            {#snippet icon()}
                                <img src="/other-images/pot.png" alt="" class="h-4 w-4 drop-shadow" />
                            {/snippet}
                        </StatTile>
                    </div>
                </section>
            {/if}
        </div>
    {/if}
</div>

<!-- What an alch actually leaves you with. A Grand Exchange player compares it with buying the item;
     an Ironman never bought it, so the only cost they pay is the rune. -->
{#snippet alchNote(buyPrice: number | null, profit: number | null, valueAfterRune: number | null)}
    {#if usesGrandExchange}
        {#if buyPrice !== null && profit !== null}
            <p class="text-xs text-muted-foreground">
                Profit if you buy one at {formatValue(buyPrice)}:
                <span class="font-medium {profitTone(profit)}">{formatDelta(profit)}</span>
            </p>
        {/if}
    {:else if valueAfterRune !== null}
        <p class="text-xs text-muted-foreground">
            After a nature rune ({formatValue(natureRunePrice)}):
            <span class="font-medium {profitTone(valueAfterRune)}">{formatValue(valueAfterRune)}</span>
        </p>
    {/if}
{/snippet}

<style>
    :global(.item-page__item-image) {
        filter: drop-shadow(2px 2px 5px rgba(0, 0, 0, 0.4));
    }
</style>
