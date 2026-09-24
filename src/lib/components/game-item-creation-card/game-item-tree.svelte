<script lang="ts">
    import * as echarts from 'echarts/core';
    import { TreeChart, type TreeSeriesOption } from 'echarts/charts';
    import { TooltipComponent, type TooltipComponentOption } from 'echarts/components';
    import { CanvasRenderer } from 'echarts/renderers';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import type { ComposeOption, EChartsType } from 'echarts/core';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import type { IngredientTreeNode } from '$lib/components/game-item-creation-card/types';
    import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
    import { fetchItemTree, prefetchItemTree } from '$lib/helpers/item-tree-cache';
    import { MAX_ITEM_TREE_DEPTH } from '$lib/constants/item-tree';
    import { bankItemsStore, ensureSuppliesForCharacter, getSuppliesForCharacter } from '$lib/stores/bank-items-store';
    import { getStoreRoot } from '$lib/stores/character-store.svelte';
    import { Label } from '$lib/components/ui/label';
    import { Switch } from '$lib/components/ui/switch';
    import type {
        GameItemCreationIngredient,
        GameItemCreationSpecs,
        IOsrsboxItemWithMeta,
    } from '$lib/models/osrsbox-db-item';

    const {
        gameItem,
        creationSpec: creationSpecOverride = null,
    }: { gameItem: IOsrsboxItemWithMeta | null; creationSpec?: GameItemCreationSpecs | null } = $props();

    echarts.use([TreeChart, TooltipComponent, CanvasRenderer]);

    type ECOption = ComposeOption<TreeSeriesOption | TooltipComponentOption>;
    type ThemeColors = { muted: string; border: string };
    type TreeDatum = NonNullable<TreeSeriesOption['data']>[number] & {
        id?: string | number;
        tooltipData?: {
            name: string;
            examine?: string;
            icon?: string;
        };
        itemId?: string | number | null;
        nodeKey?: string | number;
        hasLazyChildren?: boolean;
    };

    const NODE_SYMBOL_SIZE = 54;
    const DEFAULT_THEME_COLORS: ThemeColors = {
        muted: 'hsl(60 4.8% 95.9%)',
        border: 'hsl(20 5.9% 90%)',
    };

    let themeColors = $state<ThemeColors>(DEFAULT_THEME_COLORS);
    let renderTools = $state(true);
    let collapseNodesOnClick = $state(false);
    let isMobile = $state(false);
    let expandedSupplyNodes = $state<Record<string, boolean>>({});
    let expandedItemCache = $state<Record<string, IOsrsboxItemWithMeta>>({});
    let expandedItemFetches = $state<Record<string, boolean>>({});

    const characterStore = $derived(getStoreRoot());
    const activeCharacterId = $derived(characterStore?.activeCharacter ?? null);
    $effect(() => {
        ensureSuppliesForCharacter(activeCharacterId);
    });
    const bankItems = $derived(getSuppliesForCharacter($bankItemsStore, activeCharacterId));
    const suppliesOwned = $derived.by(() => {
        const owned = new Set<string>();
        for (const entry of bankItems) {
            const id = entry?.id;
            const quantity = Math.floor(Number(entry?.quantity ?? 0));
            if (!Number.isFinite(quantity) || quantity <= 0) continue;
            if (id === null || id === undefined) continue;
            owned.add(String(id));
        }
        return owned;
    });

    let lastRootId: string | number | null = null;
    $effect(() => {
        const nextRootId = gameItem?.id ?? null;
        if (nextRootId !== lastRootId) {
            expandedSupplyNodes = {};
            expandedItemCache = {};
            expandedItemFetches = {};
            lastRootId = nextRootId;
        }
    });

    const rootNode = $derived(
        buildRootNode(gameItem, creationSpecOverride, renderTools, suppliesOwned, expandedSupplyNodes, true),
    );
    const missingItemIds = $derived.by(() => {
        const ids = new Set<string>();
        if (rootNode) {
            collectMissingItemIds(rootNode, ids);
        }
        return Array.from(ids);
    });
    const chartOption = $derived(buildChartOption(rootNode, themeColors, isMobile, collapseNodesOnClick));

    let chartContainer = $state<HTMLDivElement | null>(null);
    let chartInstance = $state<EChartsType | null>(null);

    function buildRootNode(
        item: IOsrsboxItemWithMeta | null,
        overrideSpec: GameItemCreationSpecs | null,
        includeTools: boolean,
        supplies: Set<string>,
        expandedNodes: Record<string, boolean>,
        allowSupplyCollapse: boolean,
    ): IngredientTreeNode | null {
        if (!item) return null;

        const visited = new Set<string | number>([item.id ?? 'root']);
        const creationSpec = overrideSpec ?? getPrimaryCreationSpec(item);
        const children = buildChildren(
            creationSpec?.ingredients ?? [],
            `${item.id}`,
            1,
            visited,
            includeTools,
            supplies,
            expandedNodes,
            allowSupplyCollapse,
        );

        return {
            key: item.id ?? 'root',
            data: { item, depth: 0 },
            children,
            leaf: !children.length,
        };
    }

    function buildChildren(
        ingredients: GameItemCreationSpecs['ingredients'],
        parentKey: string | number,
        depth: number,
        visited: Set<string | number>,
        includeTools: boolean,
        supplies: Set<string>,
        expandedNodes: Record<string, boolean>,
        allowSupplyCollapse: boolean,
    ): IngredientTreeNode[] {
        if (!ingredients || depth > MAX_ITEM_TREE_DEPTH) return [];

        return ingredients
            .filter((ingredient) => !shouldSkipIngredient(ingredient, includeTools))
            .map((ingredient, index) =>
                buildNodeFromIngredient(
                    ingredient,
                    parentKey,
                    depth,
                    index,
                    visited,
                    includeTools,
                    supplies,
                    expandedNodes,
                    allowSupplyCollapse,
                ),
            );
    }

    function buildNodeFromIngredient(
        ingredient: GameItemCreationIngredient,
        parentKey: string | number,
        depth: number,
        index: number,
        visited: Set<string | number>,
        includeTools: boolean,
        supplies: Set<string>,
        expandedNodes: Record<string, boolean>,
        allowSupplyCollapse: boolean,
    ): IngredientTreeNode {
        const rawItem = ingredient.item as unknown;
        const { item: resolvedItem, itemId: resolvedItemId } = extractItemDescriptor(rawItem);
        const ingredientItem =
            resolvedItemId !== null && resolvedItemId !== undefined
                ? (expandedItemCache[String(resolvedItemId)] ?? resolvedItem)
                : resolvedItem;
        const ingredientId = resolvedItemId ?? `unknown-${index}`;
        const key = `${parentKey}-${ingredientId}-${index}`;

        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const nextVisited = new Set<string | number>(visited);

        // Stop cycles: if we've seen this id in the current path, don't recurse further.
        const alreadyVisited = nextVisited.has(ingredientId);
        if (!alreadyVisited) nextVisited.add(ingredientId);

        const creationSpec =
            !alreadyVisited && depth < MAX_ITEM_TREE_DEPTH && ingredientItem
                ? getPrimaryCreationSpec(ingredientItem)
                : undefined;
        const hasPotentialChildren = Boolean(creationSpec?.ingredients?.length);
        const itemIdForSupply =
            ingredientItem?.id ?? (resolvedItemId !== null && resolvedItemId !== undefined ? resolvedItemId : null);
        const isSupplyItem =
            itemIdForSupply !== null && itemIdForSupply !== undefined && supplies.has(String(itemIdForSupply));
        const isExpandedSupply = isSupplyItem && Boolean(expandedNodes[String(key)]);
        const shouldLazyCollapse = allowSupplyCollapse && isSupplyItem && hasPotentialChildren && !isExpandedSupply;
        const nextAllowSupplyCollapse = allowSupplyCollapse && !isExpandedSupply;

        const children =
            alreadyVisited || !creationSpec || shouldLazyCollapse
                ? []
                : buildChildren(
                      creationSpec.ingredients ?? [],
                      key,
                      depth + 1,
                      nextVisited,
                      includeTools,
                      supplies,
                      expandedNodes,
                      nextAllowSupplyCollapse,
                  );

        return {
            key,
            data: {
                item: ingredientItem,
                itemId:
                    ingredientItem?.id ??
                    (resolvedItemId !== null && resolvedItemId !== undefined ? resolvedItemId : undefined),
                amount: ingredient.amount,
                consumedDuringCreation: ingredient.consumedDuringCreation,
                depth,
                hasLazyChildren: shouldLazyCollapse,
            },
            children,
            leaf: !children.length && !hasPotentialChildren,
        };
    }

    function extractItemDescriptor(raw: unknown): { item?: IOsrsboxItemWithMeta; itemId: string | number | null } {
        if (!raw) return { itemId: null };
        if (typeof raw === 'string' || typeof raw === 'number') {
            return { itemId: raw };
        }
        if (typeof raw !== 'object') return { itemId: null };

        const maybeItem = raw as IOsrsboxItemWithMeta & { _id?: unknown; id?: unknown };
        const hasName = 'name' in maybeItem && typeof maybeItem.name === 'string';
        const directId = typeof maybeItem.id === 'string' || typeof maybeItem.id === 'number' ? maybeItem.id : null;
        const objectId = extractObjectId(maybeItem._id ?? (raw as { $oid?: unknown }).$oid ?? raw);
        const itemId = directId ?? objectId;

        if (hasName) {
            return { item: maybeItem, itemId };
        }

        return { itemId };
    }

    function extractObjectId(value: unknown): string | null {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (typeof value !== 'object') return null;

        const direct = (value as { $oid?: unknown }).$oid;
        if (typeof direct === 'string') return direct;

        const nested = (value as { _id?: unknown })._id;
        if (nested && nested !== value) {
            return extractObjectId(nested);
        }

        return null;
    }

    function collectMissingItemIds(node: IngredientTreeNode, sink: Set<string>) {
        const itemId = node.data.itemId;
        const itemName = node.data.item?.name;
        if ((!node.data.item || !itemName) && itemId !== null && itemId !== undefined) {
            sink.add(String(itemId));
        }
        for (const child of node.children ?? []) {
            collectMissingItemIds(child, sink);
        }
    }

    function shouldSkipIngredient(ingredient: GameItemCreationIngredient, includeTools: boolean): boolean {
        if (!includeTools && ingredient.consumedDuringCreation === false) return true;

        return false;
    }

    function resolveThemeColors(): ThemeColors {
        if (typeof window === 'undefined') return DEFAULT_THEME_COLORS;

        const styles = getComputedStyle(document.documentElement);
        const muted = styles.getPropertyValue('--muted').trim();
        const border = styles.getPropertyValue('--border').trim();

        return {
            muted: muted ? `hsl(${muted})` : DEFAULT_THEME_COLORS.muted,
            border: border ? `hsl(${border})` : DEFAULT_THEME_COLORS.border,
        };
    }

    function buildChartOption(
        node: IngredientTreeNode | null,
        colors: ThemeColors,
        mobile: boolean,
        allowCollapse: boolean,
    ): ECOption | null {
        if (!node) return null;

        const orient = mobile ? 'TB' : 'LR';
        const position = mobile
            ? { top: '4%', bottom: '10%', left: '8%', right: '8%' }
            : { top: '6%', bottom: '6%', left: '6%', right: '12%' };

        return {
            tooltip: {
                trigger: 'item',
                triggerOn: 'mousemove',
                backgroundColor: 'transparent',
                borderWidth: 0,
                padding: 0,
                extraCssText: 'box-shadow:none;',
                formatter: (params) => {
                    const data = (params?.data as TreeDatum | undefined)?.tooltipData;
                    return buildTooltipContent(data, colors);
                },
            },
            series: [
                {
                    type: 'tree',
                    layout: 'orthogonal',
                    orient,
                    data: [toEChartsNode(node)],
                    ...position,
                    roam: true,
                    symbol: undefined,
                    symbolSize: NODE_SYMBOL_SIZE,
                    initialTreeDepth: allowCollapse ? -1 : 3,
                    animationDurationUpdate: 400,
                    expandAndCollapse: allowCollapse,
                    lineStyle: {
                        color: withAlpha(colors.border || DEFAULT_THEME_COLORS.border, 0.92),
                        width: 1.6,
                    },
                    emphasis: { focus: 'descendant' },
                    label: { show: false },
                    leaves: { label: { show: false } },
                },
            ],
        };
    }

    function withAlpha(color: string, alpha: number): string {
        if (color.startsWith('hsl(') && color.endsWith(')')) {
            return color.replace(')', ` / ${alpha})`);
        }
        if (color.startsWith('hsla(') && color.endsWith(')')) {
            return color.replace(/[^,]+(?=\)\s*$)/, `${alpha}`);
        }
        return color;
    }

    function buildIconSymbol(icon: string | null | undefined, colors: ThemeColors, amount?: number | null): string {
        const dataUri = iconToDataUri(icon);
        const mutedFill = colors.muted || DEFAULT_THEME_COLORS.muted;
        const transparentMuted = withAlpha(mutedFill, 0.83);
        const borderStroke = colors.border || DEFAULT_THEME_COLORS.border;
        const amountDisplay = amount && amount > 1 ? (amount > 999 ? '999+' : `${Math.round(amount)}`) : null;
        const badge = amountDisplay
            ? `
                <g>
                    <circle cx="54" cy="16" r="11" fill="#facc15" stroke="d97706" stroke-width="1.25" />
                    <text x="54" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#3b2f1a" font-family="inherit">${amountDisplay}</text>
                </g>
            `
            : '';
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
                <defs>
                    <filter id="iconShadow" x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="1" dy="2" stdDeviation="1.8" flood-color="rgba(0,0,0,0.3)" />
                    </filter>
                    <clipPath id="clip">
                        <circle cx="36" cy="36" r="29" />
                    </clipPath>
                </defs>
                <circle cx="36" cy="36" r="30" fill="${transparentMuted}" stroke="${borderStroke}" stroke-width="1.4" stroke-opacity="0.95" />
                <image href="${dataUri}" x="12" y="12" width="48" height="48" preserveAspectRatio="xMidYMid meet" clip-path="url(#clip)" filter="url(#iconShadow)" />
                ${badge}
            </svg>
        `;

        return `image://data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    function toEChartsNode(node: IngredientTreeNode): TreeDatum {
        const name = node.data.item?.name ?? 'Unknown item';
        const iconSymbol = buildIconSymbol(node.data.item?.icon, themeColors, node.data.amount);
        const tooltipData = {
            name,
            examine: node.data.item?.examine ?? '',
            icon: iconToDataUri(node.data.item?.icon),
        };

        return {
            id: String(node.key),
            name,
            value: node.data.amount,
            symbol: iconSymbol,
            symbolSize: NODE_SYMBOL_SIZE,
            tooltipData,
            itemId: node.data.item?.id ?? node.data.itemId ?? null,
            nodeKey: node.key,
            hasLazyChildren: node.data.hasLazyChildren,
            children: node.children?.map(toEChartsNode) ?? [],
        };
    }

    function escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function buildTooltipContent(data: TreeDatum['tooltipData'] | undefined, colors: ThemeColors): string {
        if (!data) return '';
        const name = escapeHtml(data.name);
        const examine = data.examine ? escapeHtml(data.examine) : '';
        const icon = data.icon ?? '';
        const bg = 'hsl(var(--card))';
        const border = colors.border || DEFAULT_THEME_COLORS.border;

        return `
            <div style="
                display:flex;
                align-items:flex-start;
                gap:0.75rem;
                padding:0.6rem 0.75rem;
                border-radius:0.75rem;
                background:${bg};
                border:1px solid ${border};
                box-shadow:0 10px 25px rgba(0,0,0,0.12);
                max-width:16rem;
                min-width:14rem;
                word-break:break-word;
                white-space:normal;
            ">
                <div style="
                    flex-shrink:0;
                    height:48px;
                    width:48px;
                    border-radius:9999px;
                    background:${withAlpha(colors.muted || DEFAULT_THEME_COLORS.muted, 0.9)};
                    border:1px solid ${border};
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    overflow:hidden;
                ">
                    ${
                        icon
                            ? `<img src="${icon}" alt="${name}" style="height:80%;width:80%;object-fit:contain;filter:drop-shadow(1px 2px 3px rgba(0,0,0,0.35));" />`
                            : `<span style="font-weight:700;color:hsl(var(--muted-foreground));font-size:0.8rem;">${name.slice(0, 2)}</span>`
                    }
                </div>
                <div style="display:flex;flex-direction:column;gap:0.35rem;min-width:0;word-break:break-word;overflow-wrap:anywhere;white-space:normal;">
                    <div style="font-weight:600;font-size:0.875rem;line-height:1.45;color:hsl(var(--foreground));">${name}</div>
                    ${
                        examine
                            ? `<div style="font-size:0.6875rem;line-height:1.35;color:hsl(var(--muted-foreground));word-break:break-word;overflow-wrap:anywhere;white-space:normal;">${examine}</div>`
                            : ''
                    }
                </div>
            </div>
        `;
    }

    onMount(() => {
        themeColors = resolveThemeColors();
        const mq = window.matchMedia('(max-width: 768px)');
        const handleMq = (event: MediaQueryListEvent | MediaQueryList) => {
            isMobile = event.matches;
        };
        handleMq(mq);
        mq.addEventListener('change', handleMq);

        if (!chartContainer) return;

        const initChart = () => {
            if (!chartContainer || chartInstance) return;
            if (chartContainer.clientWidth === 0 || chartContainer.clientHeight === 0) return;
            chartInstance = echarts.init(chartContainer);
            if (chartOption) {
                chartInstance.setOption(chartOption);
            }
            chartInstance.on('click', handleNodeClick);
            chartInstance.getZr().setCursorStyle('pointer');
        };

        const themeObserver = new MutationObserver(() => {
            themeColors = resolveThemeColors();
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'style'],
        });

        const resizeObserver = new ResizeObserver(() => {
            if (!chartContainer) return;
            if (chartContainer.clientWidth === 0 || chartContainer.clientHeight === 0) return;
            initChart();
            chartInstance?.resize();
        });
        resizeObserver.observe(chartContainer);
        initChart();

        return () => {
            resizeObserver.disconnect();
            themeObserver.disconnect();
            mq.removeEventListener('change', handleMq);
            chartInstance?.off('click', handleNodeClick);
            chartInstance?.dispose();
            chartInstance = null;
        };
    });

    $effect(() => {
        if (!chartInstance) return;

        if (!chartOption) {
            chartInstance.clear();
            return;
        }

        chartInstance.setOption(chartOption, true);
    });

    async function fetchExpandedItem(itemId: string | number) {
        const key = String(itemId);
        if (expandedItemCache[key] || expandedItemFetches[key]) return;
        expandedItemFetches = { ...expandedItemFetches, [key]: true };
        try {
            // Shared with the item page's tree loader, so a branch expanded here is already in
            // hand if the reader then opens that item.
            const item = (await fetchItemTree(key)) as (IOsrsboxItemWithMeta & { _id?: unknown }) | null;
            if (!item || item.id === null || item.id === undefined) return;
            const nextCache = { ...expandedItemCache };
            nextCache[key] = item;
            nextCache[String(item.id)] = item;
            const objectId = extractObjectId(item._id);
            if (objectId) nextCache[objectId] = item;
            expandedItemCache = nextCache;
        } catch (error) {
            console.error('Failed to fetch expanded item tree', error);
        } finally {
            const { [key]: _ignored, ...rest } = expandedItemFetches;
            expandedItemFetches = rest;
        }
    }

    $effect(() => {
        for (const id of missingItemIds) {
            void fetchExpandedItem(id);
        }
    });

    function handleNodeClick(params: { data?: TreeDatum; event?: { event?: MouseEvent } }) {
        const itemId = params?.data?.itemId;
        if (!itemId) return;

        const nativeEvent = params?.event?.event;
        const hasModifier = Boolean(
            nativeEvent?.altKey || nativeEvent?.metaKey || nativeEvent?.ctrlKey || nativeEvent?.shiftKey,
        );
        if (collapseNodesOnClick && params?.data?.hasLazyChildren && params?.data?.nodeKey && !hasModifier) {
            const key = String(params.data.nodeKey);
            if (!expandedSupplyNodes[key]) {
                expandedSupplyNodes = { ...expandedSupplyNodes, [key]: true };
            }
            void fetchExpandedItem(itemId);
            return;
        }

        const hasChildren = Array.isArray(params?.data?.children) && params.data.children.length > 0;
        if (collapseNodesOnClick && hasChildren) {
            if (hasModifier) {
                openItemPage(itemId);
            }
            return;
        }

        openItemPage(itemId);
    }

    /**
     * Navigate to an item's page, starting its tree request first.
     *
     * The destination page is this same chart with a new root, and it only animates between
     * the two if it can swap its data in one step. Kicking the tree fetch off here runs it
     * alongside the route's own load, so the tree is usually cached by the time the page asks
     * for it and the chart glides to the new root instead of being rebuilt.
     */
    function openItemPage(itemId: string | number) {
        prefetchItemTree(itemId);
        goto(resolve(`/items/${itemId}`));
    }
</script>

{#if rootNode}
    <div class="game-item-tree-shell">
        <div class="chart-controls">
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <Switch
                        id="show-tools-switch"
                        bind:checked={renderTools}
                        aria-label="Toggle showing creation tools"
                        class="scale-75"
                    />
                    <Label for="show-tools-switch" class="cursor-pointer select-none text-xs font-medium">
                        Show tools (Hammer, Needle, etc)
                    </Label>
                </div>
                <div class="flex items-center gap-2">
                    <Switch
                        id="collapse-nodes-switch"
                        bind:checked={collapseNodesOnClick}
                        aria-label="Toggle collapsing ingredient branches"
                        class="scale-75"
                    />
                    <Label for="collapse-nodes-switch" class="cursor-pointer select-none text-xs font-medium">
                        Collapse ingredients on click
                    </Label>
                </div>
                {#if collapseNodesOnClick}
                    <p class="text-[0.65rem] text-muted-foreground">
                        Tip: hold Alt/Option (or Shift) to open an item page.
                    </p>
                {/if}
            </div>
        </div>
        <div class="game-item-tree-chart" bind:this={chartContainer}></div>
    </div>
{:else}
    <p class="text-sm text-muted-foreground">No ingredient data available for this item.</p>
{/if}

<style>
    .game-item-tree-shell {
        position: relative;
    }

    .chart-controls {
        position: absolute;
        top: 0.75rem;
        left: 0.75rem;
        z-index: 5;
        padding: 0.5rem 0.75rem;
        border-radius: 0.75rem;
        background: color-mix(in srgb, hsl(var(--background)) 80%, transparent);
        border: 1px solid hsl(var(--border));
        backdrop-filter: blur(10px);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    }

    .game-item-tree-chart {
        height: 28rem;
        width: 100%;
    }
</style>
