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
    import { XP_GUIDE_SKILLS } from '$lib/constants/guides';
    import { findSkillTreePage } from '$lib/constants/skill-tree-pages';
    import { skillIcon } from '$lib/helpers/homepage';
    import { buildCheapestXpSkillSeo } from '$lib/seo/guide-seo';

    const { data } = $props();
    const skill = $derived(data.skill);
    const seo = $derived(buildCheapestXpSkillSeo(skill));
    const bands = $derived(data.bands.filter((band) => band.rows.length > 0));
    const moneyMakers = $derived(findSkillTreePage(skill.slug));
    const otherSkills = $derived(XP_GUIDE_SKILLS.filter((other) => other.slug !== skill.slug));
</script>

<SeoHead {seo} />

<GuideHeader
    title="Cheapest {skill.title} XP"
    answer="The cheapest things to make for {skill.title} XP at every level, priced from the Grand Exchange."
    computedAt={data.computedAt}
/>

{#each bands as band (band.min)}
    <GuideSection title="Levels {band.min}–{band.max}" id="levels-{band.min}-{band.max}">
        <GuideTable
            rowCount={band.rows.length}
            empty="Nothing to make in this range has a price right now."
            caption="Cheapest {skill.title} XP, levels {band.min} to {band.max}"
        >
            {#snippet head()}
                <Table.Head>Make</Table.Head>
                <Table.Head class="text-right">Level</Table.Head>
                <Table.Head class="text-right">XP each</Table.Head>
                <Table.Head class="text-right">Cost each</Table.Head>
                <Table.Head class="text-right">GP per XP</Table.Head>
            {/snippet}
            {#each band.rows as method (method.item.id)}
                <Table.Row>
                    <Table.Cell><GuideItemCell item={method.item} /></Table.Cell>
                    <Table.Cell class="text-right tabular-nums">{method.level}</Table.Cell>
                    <Table.Cell class="text-right tabular-nums">{method.xp.toLocaleString('en-US')}</Table.Cell>
                    <Table.Cell class="text-right tabular-nums"><XpCostCell {method} /></Table.Cell>
                    <Table.Cell class="text-right font-semibold tabular-nums"><XpPerXpCell {method} /></Table.Cell>
                </Table.Row>
            {/each}
        </GuideTable>
    </GuideSection>
{:else}
    <p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No {skill.title} methods have prices right now. Check back after the next hourly update.
    </p>
{/each}

{#if moneyMakers}
    <p class="text-sm text-muted-foreground">
        Want gold rather than XP? See the
        <a href={resolve('/items/[skill=skill]', { skill: moneyMakers.slug })} class="underline hover:text-primary"
            >most profitable {skill.title} items</a
        >.
    </p>
{/if}

<GuideSection title="Cheapest XP in other skills">
    <ul class="flex flex-wrap gap-2">
        {#each otherSkills as other (other.slug)}
            <li>
                <a
                    href={resolve('/guides/cheapest-xp/[skill=xpSkill]', { skill: other.slug })}
                    class="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium transition-colors hover:border-primary/60 hover:bg-muted/60"
                >
                    <img src={skillIcon(other.slug)} alt="" class="h-4 w-4" />
                    {other.title}
                </a>
            </li>
        {/each}
    </ul>
</GuideSection>

<RelatedGuides current="cheapest-xp" />
