<script lang="ts">
    import type { Snippet } from 'svelte';

    /** One part of a guide: a heading, a line on what it shows, and its table or text. */
    interface GuideSectionProps {
        title: string;
        blurb?: string;
        id?: string;
        actions?: Snippet;
        children: Snippet;
    }

    const { title, blurb, id, actions, children }: GuideSectionProps = $props();
</script>

<section class="flex min-w-0 flex-col gap-3" {id}>
    <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-col gap-1">
            <h2 class="text-xl font-semibold md:text-2xl">{title}</h2>
            {#if blurb}
                <p class="max-w-prose text-sm text-muted-foreground">{blurb}</p>
            {/if}
        </div>
        {@render actions?.()}
    </div>
    {@render children()}
</section>
