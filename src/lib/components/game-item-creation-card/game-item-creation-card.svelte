<script lang="ts">
    import * as Card from '$lib/components/ui/card';
    import { Skeleton } from '$lib/components/ui/skeleton';
    import GameItemTree from '$lib/components/game-item-creation-card/game-item-tree.svelte';
    import GameItemCreationXpTags from '$lib/components/game-item-creation-card/game-item-creation-xp-tags.svelte';
    import GameItemCreationCostTable from '$lib/components/game-item-creation-card/game-item-creation-cost-table.svelte';
    import GameItemCreationProfit from '$lib/components/game-item-creation-card/game-item-creation-profit.svelte';
    import * as Tabs from '$lib/components/ui/tabs';
    import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
    import type { GameItemCreationSpecs, IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

    interface GameItemTreeCardProps {
        gameItem: IOsrsboxItemWithMeta | null;
        loading: boolean;
        renderChart: boolean;
        /**
         * A newer item's tree is on its way while the previous one is still rendered. The card
         * stays as it is — swapping it for skeletons would destroy the chart and lose the
         * animation into the new tree — and says so instead.
         */
        refreshing?: boolean;
        rootClass?: string;
    }

    const { gameItem, loading, renderChart, refreshing = false, rootClass = '' }: GameItemTreeCardProps = $props();
    const creationSpec = $derived(getPrimaryCreationSpec(gameItem));
    const creationSpecs = $derived((gameItem?.creationSpecs ?? []) as GameItemCreationSpecs[]);
    const specOptions = $derived(
        creationSpecs.map((spec, index) => ({
            id: `spec-${index}`,
            label: `Recipe ${index + 1}`,
            spec,
        })),
    );
    let selectedSpecId = $state('');
    // Each recipe's ingredient cost, reported by its cost table so the profit tiles can use it.
    let totalCosts = $state<Record<string, number | null>>({});
    const selectedSpec = $derived(specOptions.find((opt) => opt.id === selectedSpecId)?.spec ?? creationSpec ?? null);

    $effect(() => {
        const firstOptionId = specOptions[0]?.id ?? '';
        if (!specOptions.find((opt) => opt.id === selectedSpecId)) {
            selectedSpecId = firstOptionId;
        }
    });

    const hasIngredients = $derived(renderChart && !!selectedSpec?.ingredients?.length);
</script>

<Card.Root class={rootClass} aria-busy={loading || refreshing}>
    {#if loading}
        <Skeleton class="w-48 max-w-full h-5 ml-5 mt-8 mb-2" />
        <Skeleton class="w-60 max-w-full h-3 ml-5 mt-4 mb-2" />
        <Skeleton class="mx-5 mt-5 h-80" />
    {:else}
        <!-- Header -->
        <Card.Header>
            <Card.Title class="text-xl">How to make it</Card.Title>
            <Card.Description>
                {hasIngredients
                    ? 'What goes into this item, the XP you get for making it, and whether it pays.'
                    : 'This item has no ingredients.'}
                {#if refreshing}
                    <span class="text-muted-foreground/80">· Updating…</span>
                {/if}
            </Card.Description>
        </Card.Header>

        <!-- Body -->
        {#if hasIngredients}
            <Tabs.Root value={selectedSpecId} onValueChange={(val) => (selectedSpecId = val)}>
                <!-- A tab strip with one tab in it is a control with nothing to choose. -->
                {#if specOptions.length > 1}
                    <div class="px-5 mt-2 flex flex-wrap items-center gap-3">
                        <Tabs.List class="flex gap-2 flex-wrap w-fit">
                            {#each specOptions as option (option.id)}
                                <Tabs.Trigger value={option.id}>{option.label}</Tabs.Trigger>
                            {/each}
                        </Tabs.List>
                        <p class="text-xs text-muted-foreground">
                            There are {specOptions.length} ways to make this item.
                        </p>
                    </div>
                {/if}

                {#each specOptions as option (option.id)}
                    <Tabs.Content value={option.id} class="px-5 pb-1">
                        <div class="flex flex-col gap-6 pt-2">
                            <section class="flex flex-col gap-2">
                                <div>
                                    <h4 class="text-sm font-semibold">Recipe tree</h4>
                                    <p class="text-xs text-muted-foreground">
                                        Each item branches out into the ingredients it's made from. Click one to open
                                        its page.
                                    </p>
                                </div>
                                <div class="border rounded-md bg-muted/40 p-3">
                                    <GameItemTree {gameItem} creationSpec={option.spec} />
                                </div>
                            </section>
                            <div class="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
                                <GameItemCreationCostTable
                                    {gameItem}
                                    creationSpec={option.spec}
                                    onTotalChange={(total) => (totalCosts[option.id] = total)}
                                />
                                <div class="flex flex-col gap-6">
                                    <GameItemCreationXpTags {gameItem} creationSpec={option.spec} />
                                    <GameItemCreationProfit {gameItem} totalCost={totalCosts[option.id] ?? null} />
                                </div>
                            </div>
                        </div>
                    </Tabs.Content>
                {/each}
            </Tabs.Root>
        {:else}
            <Card.Content class="px-5 pb-6 text-sm text-muted-foreground">
                <p>We don't have ingredient data for this item yet.</p>
            </Card.Content>
        {/if}
    {/if}
</Card.Root>
