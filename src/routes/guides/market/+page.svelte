<script lang="ts">
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import StatTile from '$lib/components/global/stat-tile.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import GuideItemCell from '$lib/components/guides/guide-item-cell.svelte';
    import GuideSection from '$lib/components/guides/guide-section.svelte';
    import GuideTable from '$lib/components/guides/guide-table.svelte';
    import RelatedGuides from '$lib/components/guides/related-guides.svelte';
    import * as Table from '$lib/components/ui/table';
    import * as Tabs from '$lib/components/ui/tabs';
    import { GUIDE_ROWS } from '$lib/constants/guides';
    import {
        MOVERS_MIN_GP_PER_DAY,
        MOVERS_MIN_TRADED_HOURS,
        MOVERS_MIN_TRADES_PER_DAY,
        MOVERS_PRICE_HOURS,
        PRICE_CHANGE_MIN_HOURS,
    } from '$lib/constants/market';
    import { formatChange, formatGpShort } from '$lib/helpers/homepage';
    import type { MarketItem } from '$lib/models/guides';
    import { buildMarketSeo } from '$lib/seo/guide-seo';
    import { buildMarketShareCard } from '$lib/seo/market-share-card';
    import { marketShareImagePath } from '$lib/seo/share-image';

    const { data } = $props();
    const report = $derived(data.report);
    const card = $derived(buildMarketShareCard(report));
    const seo = $derived(card ? buildMarketSeo(marketShareImagePath(report.computedAt), card.alt) : buildMarketSeo());
    const enoughHistory = $derived(report.historyHours >= PRICE_CHANGE_MIN_HOURS);
    const { summary } = $derived(report);
</script>

<SeoHead {seo} />

{#snippet moverTable(items: MarketItem[], caption: string, empty: string)}
    <GuideTable rowCount={items.length} {empty} {caption}>
        {#snippet head()}
            <Table.Head class="w-10">#</Table.Head>
            <Table.Head>Item</Table.Head>
            <Table.Head class="text-right">Change</Table.Head>
            <Table.Head class="text-right">Price</Table.Head>
            <Table.Head class="text-right">Traded today</Table.Head>
            <Table.Head class="text-right">GP traded</Table.Head>
        {/snippet}
        {#each items as item, index (item.id)}
            <Table.Row>
                <Table.Cell class="text-muted-foreground tabular-nums">{index + 1}</Table.Cell>
                <Table.Cell><GuideItemCell {item} /></Table.Cell>
                <Table.Cell
                    class="text-right font-semibold tabular-nums {(item.priceChange24h ?? 0) > 0
                        ? 'text-emerald-500'
                        : 'text-rose-500'}"
                >
                    {formatChange(item.priceChange24h)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(item.typicalPrice24h)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(item.volume24h)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(item.gpTraded24h)}</Table.Cell>
            </Table.Row>
        {/each}
    </GuideTable>
{/snippet}

{#snippet tradedTable(items: MarketItem[], caption: string)}
    <GuideTable rowCount={items.length} empty="No trades recorded today." {caption}>
        {#snippet head()}
            <Table.Head class="w-10">#</Table.Head>
            <Table.Head>Item</Table.Head>
            <Table.Head class="text-right">GP traded</Table.Head>
            <Table.Head class="text-right">Traded today</Table.Head>
            <Table.Head class="text-right">Price</Table.Head>
            <Table.Head class="text-right">Change</Table.Head>
        {/snippet}
        {#each items as item, index (item.id)}
            <Table.Row>
                <Table.Cell class="text-muted-foreground tabular-nums">{index + 1}</Table.Cell>
                <Table.Cell><GuideItemCell {item} /></Table.Cell>
                <Table.Cell class="text-right font-semibold tabular-nums">{formatGpShort(item.gpTraded24h)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(item.volume24h)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(item.typicalPrice24h)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums text-muted-foreground">
                    {formatChange(item.priceChange24h)}
                </Table.Cell>
            </Table.Row>
        {/each}
    </GuideTable>
{/snippet}

<GuideHeader
    title="GE market report"
    answer="What rose, what fell and what changed hands most on the Grand Exchange over the last 24 hours."
    computedAt={report.computedAt}
/>

<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
    <StatTile label="GP traded today" value={formatGpShort(summary.gpTraded24h)} hint="Across every tradeable item" />
    <StatTile
        label="Rising"
        value={summary.rising.toLocaleString('en-US')}
        tone="positive"
        hint="Busy items up on the day"
    />
    <StatTile
        label="Falling"
        value={summary.falling.toLocaleString('en-US')}
        tone="negative"
        hint="Busy items down on the day"
    />
    <StatTile
        label="Median change"
        value={formatChange(summary.medianChange)}
        tone={(summary.medianChange ?? 0) > 0 ? 'positive' : (summary.medianChange ?? 0) < 0 ? 'negative' : 'neutral'}
        hint="Half of busy items moved more"
    />
</div>

{#if enoughHistory}
    <GuideSection title="Biggest risers" blurb="Busy items whose price went up the most today.">
        {@render moverTable(report.risers, 'Biggest risers today', 'Nothing busy has risen today.')}
    </GuideSection>

    <GuideSection title="Biggest fallers" blurb="Busy items whose price dropped the most today.">
        {@render moverTable(report.fallers, 'Biggest fallers today', 'Nothing busy has fallen today.')}
    </GuideSection>
{:else}
    <p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Risers and fallers need a full day of trade history, and there are only {report.historyHours} hours so far. Check
        back later today.
    </p>
{/if}

<GuideSection title="Most traded" blurb="The {GUIDE_ROWS.market} items that changed hands most today.">
    <Tabs.Root value="gp" class="min-w-0">
        <Tabs.List>
            <Tabs.Trigger value="gp">By GP traded</Tabs.Trigger>
            <Tabs.Trigger value="count">By number traded</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="gp" class="mt-3">
            {@render tradedTable(report.mostTradedByGp, 'Most traded today by GP value')}
        </Tabs.Content>
        <Tabs.Content value="count" class="mt-3">
            {@render tradedTable(report.mostTradedByCount, 'Most traded today by number of items')}
        </Tabs.Content>
    </Tabs.Root>
</GuideSection>

<GuideSection title="How we work this out">
    <div class="flex max-w-prose flex-col gap-3 text-sm text-muted-foreground">
        <p>
            Every hour we record how much of each item traded on the Grand Exchange and at what price, keeping the last
            24 hours. An item's change compares the middle price of its last {MOVERS_PRICE_HOURS} traded hours with its first
            {MOVERS_PRICE_HOURS}, so one odd trade at either end can't set it.
        </p>
        <p>
            Only busy items count as risers or fallers: at least {formatGpShort(MOVERS_MIN_GP_PER_DAY)} gp and
            {MOVERS_MIN_TRADES_PER_DAY} trades a day, spread over at least {MOVERS_MIN_TRADED_HOURS} of the 24 hours. Without
            that, an item that sells three times a day could top the fallers list because one player dumped it cheap. Measuring
            gold instead of a trade count means a 1.5B item that trades a dozen times a day counts, while feathers need far
            more trades.
        </p>
        <p>
            "GP traded" is the number traded times the day's middle price. The busiest items by count are usually cheap
            runes and ammunition, which is why the GP list comes first.
        </p>
    </div>
</GuideSection>

<RelatedGuides current="market" />
