<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    /** A page's main heading, in the game's own font, like the headings in game interfaces. */
    interface PageTitleProps {
        class?: string;
        children: Snippet;
    }

    const { class: className, children }: PageTitleProps = $props();
</script>

<h1 class={cn('rs-font-with-shadow dark:rs-font text-3xl text-primary text-balance md:text-4xl', className)}>
    {@render children()}
</h1>
