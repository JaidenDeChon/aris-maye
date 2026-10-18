<script lang="ts">
    import { resolve } from '$app/paths';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import GuideItemCell from '$lib/components/guides/guide-item-cell.svelte';
    import GuideSection from '$lib/components/guides/guide-section.svelte';
    import GuideTable from '$lib/components/guides/guide-table.svelte';
    import RelatedGuides from '$lib/components/guides/related-guides.svelte';
    import * as Table from '$lib/components/ui/table';
    import * as ToggleGroup from '$lib/components/ui/toggle-group';
    import { alchPerLimit, sortAlchPicks, type AlchSort } from '$lib/helpers/guides';
    import { formatGpShort } from '$lib/helpers/homepage';
    import { highAlchSeo } from '$lib/seo/guide-seo';

    const { data } = $props();
    const guide = $derived(data.guide);

    // The server renders profit per cast; the toggle re-sorts the same rows in the browser.
    let sort = $state<AlchSort>('cast');
    const picks = $derived(sortAlchPicks(guide.picks, sort));
</script>

<SeoHead seo={highAlchSeo} />

<GuideHeader
    title="High alch profit list"
    answer="Items you can buy on the Grand Exchange and high alch for more than they cost, after paying for the nature rune."
    computedAt={guide.computedAt}
/>

<GuideSection
    title="Best items to alch"
    blurb={sort === 'cast'
        ? 'Ranked by profit on each cast.'
        : 'Ranked by profit from alching a full buy limit, the most you can buy every 4 hours.'}
>
    {#snippet actions()}
        <ToggleGroup.Root
            type="single"
            value={sort}
            onValueChange={(value) => {
                if (value) sort = value as AlchSort;
            }}
            class="rounded-md border bg-muted/30 p-1"
            aria-label="Sort by"
        >
            <ToggleGroup.Item value="cast" class="h-8 px-3 text-xs">Profit per cast</ToggleGroup.Item>
            <ToggleGroup.Item value="limit" class="h-8 px-3 text-xs">Profit per 4 hours</ToggleGroup.Item>
        </ToggleGroup.Root>
    {/snippet}

    <GuideTable
        rowCount={picks.length}
        empty="No item is profitable to alch at today's prices."
        caption="Most profitable items to high alch"
    >
        {#snippet head()}
            <Table.Head class="w-10">#</Table.Head>
            <Table.Head>Item</Table.Head>
            <Table.Head class="text-right">Profit per cast</Table.Head>
            <Table.Head class="text-right">Buy price</Table.Head>
            <Table.Head class="text-right">Alch value</Table.Head>
            <Table.Head class="text-right">Buy limit</Table.Head>
            <Table.Head class="text-right">Profit per 4 hours</Table.Head>
            <Table.Head class="text-right">Traded today</Table.Head>
        {/snippet}
        {#each picks as pick, index (pick.item.id)}
            <Table.Row data-item-id={pick.item.id} data-profit={pick.profit} data-per-limit={alchPerLimit(pick) ?? ''}>
                <Table.Cell class="text-muted-foreground tabular-nums">{index + 1}</Table.Cell>
                <Table.Cell><GuideItemCell item={pick.item} /></Table.Cell>
                <Table.Cell class="text-right font-semibold tabular-nums text-emerald-500">
                    {formatGpShort(pick.profit, true)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(pick.buyPrice)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(pick.highalch)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums"
                    >{pick.item.buyLimit?.toLocaleString('en-US') ?? '—'}</Table.Cell
                >
                <Table.Cell class="text-right tabular-nums">{formatGpShort(alchPerLimit(pick), true)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">{formatGpShort(pick.item.volume24h)}</Table.Cell>
            </Table.Row>
        {/each}
    </GuideTable>
</GuideSection>

<p class="text-sm text-muted-foreground">
    Training Magic as well? See the
    <a href={resolve('/guides/cheapest-xp/[skill=xpSkill]', { skill: 'magic' })} class="underline hover:text-primary"
        >cheapest Magic XP</a
    >.
</p>

<RelatedGuides current="high-alch" />
