<script lang="ts">
    import { onMount } from 'svelte';

    /**
     * When a guide's numbers were worked out. The server can't know the reader's time zone, so it
     * renders UTC, and the browser swaps in local time once it has hydrated. Rendering local time on
     * the server would mismatch the browser's first render.
     */
    const { computedAt }: { computedAt: number } = $props();

    const iso = $derived(new Date(computedAt).toISOString());
    const utc = $derived(
        `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(computedAt)} UTC`,
    );

    let local = $state<string | null>(null);

    onMount(() => {
        local = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(computedAt);
    });
</script>

<time datetime={iso}>{local ?? utc}</time>
