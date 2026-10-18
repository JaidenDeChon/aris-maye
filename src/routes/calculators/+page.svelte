<script lang="ts">
    import { resolve } from '$app/paths';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import GuideSection from '$lib/components/guides/guide-section.svelte';
    import { XP_GUIDE_SKILLS } from '$lib/constants/guides';
    import { skillIcon } from '$lib/helpers/homepage';
    import { calculatorsHubSeo } from '$lib/seo/calculator-seo';

    const cardClass =
        'flex h-full items-center gap-3 rounded-md border bg-muted/30 p-4 transition-colors hover:border-primary/60 hover:bg-muted/60';
</script>

<SeoHead seo={calculatorsHubSeo} />

<GuideHeader
    title="OSRS calculators"
    answer="Calculators for skill goals and GE profits. Powered by hourly price updates."
/>

<GuideSection
    title="Skill calculators"
    blurb="Enter your level and your goal to see how many of each item to make, and what it costs."
>
    <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {#each XP_GUIDE_SKILLS as skill (skill.slug)}
            <li>
                <a href={resolve('/calculators/[skill=xpSkill]', { skill: skill.slug })} class={cardClass}>
                    <img src={skillIcon(skill.slug)} alt="" class="h-6 w-6" />
                    <span class="font-semibold">{skill.title}</span>
                </a>
            </li>
        {/each}
    </ul>
</GuideSection>

<GuideSection title="Grand Exchange">
    <ul class="grid gap-3 sm:grid-cols-2">
        <li>
            <a href={resolve('/calculators/ge-tax')} class="{cardClass} flex-col items-start gap-1">
                <span class="font-semibold">GE tax calculator</span>
                <span class="text-sm text-muted-foreground">The tax on a sale, and what you keep after it.</span>
            </a>
        </li>
    </ul>
</GuideSection>
