<script lang="ts">
    import { resolve } from '$app/paths';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import GuideSection from '$lib/components/guides/guide-section.svelte';
    import { GUIDE_PAGES, XP_GUIDE_SKILLS } from '$lib/constants/guides';
    import { skillIcon } from '$lib/helpers/homepage';
    import { guidesHubSeo } from '$lib/seo/guide-seo';
</script>

<SeoHead seo={guidesHubSeo} />

<GuideHeader
    title="OSRS guides"
    answer="Answers to the questions players ask most, worked out from live Grand Exchange and shop prices and updated every hour."
/>

<ul class="grid gap-4 sm:grid-cols-2">
    {#each GUIDE_PAGES as guide (guide.key)}
        <li>
            <a
                href={resolve(guide.path)}
                class="flex h-full flex-col gap-2 rounded-md border bg-muted/30 p-4 transition-colors hover:border-primary/60 hover:bg-muted/60"
            >
                <span class="text-lg font-semibold">{guide.title}</span>
                <span class="text-sm text-muted-foreground">{guide.blurb}</span>
            </a>
        </li>
    {/each}
</ul>

<GuideSection title="Cheapest XP by skill" blurb="Pick a skill to see the cheapest way to train it at every level.">
    <ul class="flex flex-wrap gap-2">
        {#each XP_GUIDE_SKILLS as skill (skill.slug)}
            <li>
                <a
                    href={resolve('/guides/cheapest-xp/[skill=xpSkill]', { skill: skill.slug })}
                    class="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium transition-colors hover:border-primary/60 hover:bg-muted/60"
                >
                    <img src={skillIcon(skill.slug)} alt="" class="h-4 w-4" />
                    {skill.title}
                </a>
            </li>
        {/each}
    </ul>
</GuideSection>
