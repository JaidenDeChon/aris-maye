<script lang="ts">
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import GuideItemCell from '$lib/components/guides/guide-item-cell.svelte';
    import GuideSection from '$lib/components/guides/guide-section.svelte';
    import GuideTable from '$lib/components/guides/guide-table.svelte';
    import RelatedGuides from '$lib/components/guides/related-guides.svelte';
    import * as Table from '$lib/components/ui/table';
    import { formatGpPerXp, formatGpShort, skillIcon, skillLabel } from '$lib/helpers/homepage';
    import { ironmanSeo } from '$lib/seo/guide-seo';

    const { data } = $props();
    const guide = $derived(data.guide);
</script>

<SeoHead seo={ironmanSeo} />

<GuideHeader
    title="Ironman money making"
    answer="Ways to make money on an Ironman without the Grand Exchange: shops that pay more than an alch, things to make from shop stock, and crafts worth alching."
    computedAt={guide.computedAt}
    source="From shop prices and alch values."
/>

<GuideSection
    title="Sell to shops"
    blurb="Items a shop pays more for than they alch for, with the best-paying shop for each."
>
    <GuideTable
        rowCount={guide.shopSales.length}
        empty="No shop pays more than alching right now."
        caption="Items a shop pays more for than they alch for"
    >
        {#snippet head()}
            <Table.Head>Item</Table.Head>
            <Table.Head>Shop</Table.Head>
            <Table.Head class="text-right">Shop pays</Table.Head>
            <Table.Head class="text-right">Alch value</Table.Head>
            <Table.Head class="text-right">Lowest it pays</Table.Head>
            <Table.Head class="text-right">Sales to lowest</Table.Head>
        {/snippet}
        {#each guide.shopSales as sale (sale.item.id)}
            <Table.Row>
                <Table.Cell><GuideItemCell item={sale.item} /></Table.Cell>
                <Table.Cell class="min-w-40">{sale.shop}</Table.Cell>
                <Table.Cell class="text-right font-semibold tabular-nums text-emerald-500">
                    {formatGpShort(sale.firstPrice)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                    {sale.alchValue > 0 ? formatGpShort(sale.alchValue) : "Can't alch"}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(sale.floorPrice)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                    {sale.salesToFloor && sale.floorPrice < sale.firstPrice ? sale.salesToFloor : '—'}
                </Table.Cell>
            </Table.Row>
        {/each}
    </GuideTable>
</GuideSection>

<GuideSection
    title="Make from shop stock"
    blurb="Every ingredient comes from a shop, and the finished item alchs for more than they cost."
>
    <GuideTable
        rowCount={guide.shopSupplied.length}
        empty="Nothing made from shop stock alchs at a profit right now."
        caption="Things to make from shop stock and alch"
    >
        {#snippet head()}
            <Table.Head>Make</Table.Head>
            <Table.Head class="text-right">Profit each</Table.Head>
            <Table.Head class="text-right">Shop cost of ingredients</Table.Head>
        {/snippet}
        {#each guide.shopSupplied as item (item.id)}
            <Table.Row>
                <Table.Cell><GuideItemCell {item} /></Table.Cell>
                <Table.Cell class="text-right font-semibold tabular-nums text-emerald-500">
                    {formatGpShort(item.creationProfit, true)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(item.creationCost)}</Table.Cell>
            </Table.Row>
        {/each}
    </GuideTable>
</GuideSection>

<GuideSection
    title="Craft to alch"
    blurb="Things to make whose alch value beats what their ingredients are worth to an Ironman."
>
    <GuideTable
        rowCount={guide.craftToAlch.length}
        empty="Nothing alchs for more than its ingredients right now."
        caption="Creations that alch for more than their ingredients"
    >
        {#snippet head()}
            <Table.Head>Make</Table.Head>
            <Table.Head class="text-right">Gained each</Table.Head>
            <Table.Head class="text-right">Ingredients worth</Table.Head>
        {/snippet}
        {#each guide.craftToAlch as item (item.id)}
            <Table.Row>
                <Table.Cell><GuideItemCell {item} /></Table.Cell>
                <Table.Cell class="text-right font-semibold tabular-nums text-emerald-500">
                    {formatGpShort(item.creationProfit, true)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(item.creationCost)}</Table.Cell>
            </Table.Row>
        {/each}
    </GuideTable>
</GuideSection>

<GuideSection
    title="Cheapest Ironman XP"
    blurb="The cheapest thing to make in each skill, counted in alch value lost per XP."
>
    <GuideTable
        rowCount={guide.cheapXp.length}
        empty="No XP methods can be valued right now."
        caption="Cheapest XP per skill for an Ironman"
    >
        {#snippet head()}
            <Table.Head>Skill</Table.Head>
            <Table.Head>Make</Table.Head>
            <Table.Head class="text-right">XP each</Table.Head>
            <Table.Head class="text-right">Value lost per XP</Table.Head>
        {/snippet}
        {#each guide.cheapXp as row (row.skill)}
            <Table.Row>
                <Table.Cell>
                    <span class="flex items-center gap-2 font-medium whitespace-nowrap">
                        <img src={skillIcon(row.skill)} alt="" class="h-4 w-4" />
                        {skillLabel(row.skill)}
                    </span>
                </Table.Cell>
                <Table.Cell><GuideItemCell item={row.item} /></Table.Cell>
                <Table.Cell class="text-right tabular-nums">{row.xp.toLocaleString('en-US')}</Table.Cell>
                <Table.Cell class="text-right font-semibold tabular-nums">
                    {#if row.gpPerXp === 0}
                        <span class="text-emerald-500">Gains value</span>
                    {:else}
                        {formatGpPerXp(row.gpPerXp)}
                    {/if}
                </Table.Cell>
            </Table.Row>
        {/each}
    </GuideTable>
</GuideSection>

<RelatedGuides current="ironman" />
