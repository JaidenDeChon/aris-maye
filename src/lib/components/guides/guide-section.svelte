<script lang="ts">
    import type { Snippet } from 'svelte';

    /** One part of a guide: a heading, a line on what it shows, and its table or text. */
    interface GuideSectionProps {
        title: string;
        /** A line on what it shows, or several, each its own paragraph. */
        blurb?: string | string[];
        id?: string;
        actions?: Snippet;
        children: Snippet;
    }

    const { title, blurb, id, actions, children }: GuideSectionProps = $props();
    const paragraphs = $derived(typeof blurb === 'string' ? [blurb] : (blurb ?? []));
</script>

<section class="flex min-w-0 flex-col gap-3" {id}>
    <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-col gap-1">
            <h2 class="text-xl font-semibold md:text-2xl">{title}</h2>
            {#each paragraphs as paragraph (paragraph)}
                <p class="max-w-prose text-sm text-muted-foreground">{paragraph}</p>
            {/each}
        </div>
        {@render actions?.()}
    </div>
    {@render children()}
</section>
