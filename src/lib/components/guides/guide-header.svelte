<script lang="ts">
    import UpdatedTime from './updated-time.svelte';

    /** The top of a guide: what it is, the one-line answer, and how fresh the numbers are. */
    interface GuideHeaderProps {
        title: string;
        answer: string;
        computedAt?: number;
        /** Where the numbers come from, for the line beside the update time. */
        source?: string;
        /** Whether the update line says the numbers refresh hourly. */
        refreshedHourly?: boolean;
    }

    const {
        title,
        answer,
        computedAt,
        source = 'From Grand Exchange prices.',
        refreshedHourly = true,
    }: GuideHeaderProps = $props();
</script>

<header class="flex flex-col gap-2">
    <h1 class="rs-font-with-shadow dark:rs-font text-3xl text-primary text-balance md:text-4xl">{title}</h1>
    <p class="max-w-prose text-base text-muted-foreground">{answer}</p>
    {#if computedAt}
        <p class="text-xs text-muted-foreground">
            {source} Updated <UpdatedTime {computedAt} />{refreshedHourly ? ', refreshed hourly.' : '.'}
        </p>
    {/if}
</header>
