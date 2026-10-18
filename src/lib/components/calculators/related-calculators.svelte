<script lang="ts">
    import { resolve } from '$app/paths';
    import { XP_GUIDE_SKILLS } from '$lib/constants/guides';
    import { skillIcon } from '$lib/helpers/homepage';

    /** Links to the other calculators, at the foot of each one. `current` is a skill slug or `ge-tax`. */
    const { current }: { current?: string } = $props();

    const skills = $derived(XP_GUIDE_SKILLS.filter((skill) => skill.slug !== current));
    const linkClass =
        'flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium transition-colors hover:border-primary/60 hover:bg-muted/60';
</script>

<nav aria-labelledby="related-calculators" class="flex flex-col gap-3 border-t pt-6">
    <h2 id="related-calculators" class="text-lg font-semibold">More calculators</h2>
    <ul class="flex flex-wrap gap-2">
        {#each skills as skill (skill.slug)}
            <li>
                <a href={resolve('/calculators/[skill=xpSkill]', { skill: skill.slug })} class={linkClass}>
                    <img src={skillIcon(skill.slug)} alt="" class="h-4 w-4" />
                    {skill.title}
                </a>
            </li>
        {/each}
        {#if current !== 'ge-tax'}
            <li><a href={resolve('/calculators/ge-tax')} class={linkClass}>GE tax</a></li>
        {/if}
    </ul>
    <a
        href={resolve('/calculators')}
        class="self-start text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
    >
        All calculators →
    </a>
</nav>
