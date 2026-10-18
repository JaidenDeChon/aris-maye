<script lang="ts">
    import { resolve } from '$app/paths';
    import type { Snippet } from 'svelte';
    import type { GuidePath } from '$lib/constants/guides';

    /**
     * A full-width homepage section: a heading, one line on what it shows, and a link to see
     * more: the browse page, or the guide with the full list.
     */
    interface HomeBandProps {
        title: string;
        blurb?: string;
        /** Controls that sit beside the heading, such as a sort toggle. */
        actions?: Snippet;
        children: Snippet;
        showSeeAll?: boolean;
        /** Where "See all" goes, and what it says. Defaults to the browse page. */
        seeAllHref?: '/items' | GuidePath;
        seeAllLabel?: string;
        /** Drops the heading, for when a tab label already names the section. */
        compact?: boolean;
    }

    const {
        title,
        blurb,
        actions,
        children,
        showSeeAll = true,
        seeAllHref = '/items',
        seeAllLabel = 'See all items',
        compact = false,
    }: HomeBandProps = $props();
</script>

<section class="flex flex-col gap-4">
    {#if !compact || actions}
        <div class="flex flex-wrap items-end justify-between gap-3">
            {#if !compact}
                <div class="flex flex-col gap-1">
                    <h2 class="rs-font-with-shadow dark:rs-font text-2xl md:text-3xl text-primary">{title}</h2>
                    {#if blurb}
                        <p class="text-sm text-muted-foreground">{blurb}</p>
                    {/if}
                </div>
            {:else if blurb}
                <p class="text-sm text-muted-foreground">{blurb}</p>
            {/if}
            {@render actions?.()}
        </div>
    {:else if blurb}
        <p class="text-sm text-muted-foreground">{blurb}</p>
    {/if}

    {@render children()}

    {#if showSeeAll}
        <a
            href={resolve(seeAllHref)}
            class="self-start text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
            {seeAllLabel} →
        </a>
    {/if}
</section>
