<script lang="ts">
    import { resolve } from '$app/paths';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import GuideItemCell from '$lib/components/guides/guide-item-cell.svelte';
    import GuideSection from '$lib/components/guides/guide-section.svelte';
    import GuideTable from '$lib/components/guides/guide-table.svelte';
    import RelatedGuides from '$lib/components/guides/related-guides.svelte';
    import XpCostCell from '$lib/components/guides/xp-cost-cell.svelte';
    import XpPerXpCell from '$lib/components/guides/xp-per-xp-cell.svelte';
    import * as Table from '$lib/components/ui/table';
    import { cheapestPerSkill } from '$lib/helpers/guides';
    import { skillIcon, skillLabel } from '$lib/helpers/homepage';
    import { cheapestXpSeo } from '$lib/seo/guide-seo';

    const { data } = $props();
    const rows = $derived(cheapestPerSkill(data.guide));
</script>

<SeoHead seo={cheapestXpSeo} />

<GuideHeader
    title="Cheapest XP"
    answer="The cheapest thing to make for XP in each production skill, priced from the Grand Exchange. Pick a skill to see the cheapest methods at every level."
    computedAt={data.guide.computedAt}
/>

<GuideSection title="Cheapest method per skill" blurb="At any level. Some of these need a high level to make.">
    <GuideTable rowCount={rows.length} empty="No XP methods have prices right now." caption="Cheapest XP per skill">
        {#snippet head()}
            <Table.Head>Skill</Table.Head>
            <Table.Head>Make</Table.Head>
            <Table.Head class="text-right">Level</Table.Head>
            <Table.Head class="text-right">XP each</Table.Head>
            <Table.Head class="text-right">Cost each</Table.Head>
            <Table.Head class="text-right">GP per XP</Table.Head>
        {/snippet}
        {#each rows as { skill, method } (skill)}
            <Table.Row>
                <Table.Cell>
                    <a
                        href={resolve('/guides/cheapest-xp/[skill=xpSkill]', { skill })}
                        class="flex items-center gap-2 font-medium whitespace-nowrap hover:text-primary hover:underline"
                    >
                        <img src={skillIcon(skill)} alt="" class="h-4 w-4" />
                        {skillLabel(skill)}
                    </a>
                </Table.Cell>
                <Table.Cell><GuideItemCell item={method.item} /></Table.Cell>
                <Table.Cell class="text-right tabular-nums">{method.level}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">{method.xp.toLocaleString('en-US')}</Table.Cell>
                <Table.Cell class="text-right tabular-nums"><XpCostCell {method} /></Table.Cell>
                <Table.Cell class="text-right font-semibold tabular-nums"><XpPerXpCell {method} /></Table.Cell>
            </Table.Row>
        {/each}
    </GuideTable>
</GuideSection>

<GuideSection title="How we work this out">
    <div class="flex max-w-prose flex-col gap-3 text-sm text-muted-foreground">
        <p>
            For everything you can make, we price the ingredients and the finished item from the Grand Exchange, the
            same way as the rest of the site, including the 2% GE tax on the sale. What's lost on each one, divided by
            the XP it gives, is its cost per XP. Anything that makes a profit costs nothing per XP: it's marked "Pays",
            with what it earns per XP in green, and among those the one with the most XP each ranks first.
        </p>
        <p>
            This is the cost of XP, not the speed. A cheap method can still be slow if each action takes a while, so
            check the method before you commit to it.
        </p>
    </div>
</GuideSection>

<RelatedGuides current="cheapest-xp" />
