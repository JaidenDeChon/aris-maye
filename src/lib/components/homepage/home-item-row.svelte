<script lang="ts">
    import { resolve } from '$app/paths';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import type { Snippet } from 'svelte';

    /**
     * One item in a homepage list: icon, name, a headline number and a line of detail under it.
     */
    interface HomeItemRowProps {
        item: { id: number; name: string; icon?: string | null };
        value: string;
        tone?: 'positive' | 'negative' | 'neutral' | 'muted';
        detail?: string;
        rank?: number;
        /** Extra content under the name, such as a skill badge. */
        children?: Snippet;
    }

    const { item, value, tone = 'neutral', detail, rank, children }: HomeItemRowProps = $props();

    const toneClass = $derived(
        {
            neutral: 'text-foreground',
            positive: 'text-emerald-500',
            negative: 'text-rose-500',
            muted: 'text-muted-foreground',
        }[tone],
    );
</script>

<a
    href={resolve(`/items/${item.id}`)}
    class="group flex min-w-0 items-center gap-3 rounded-md border bg-muted/30 p-3 transition-colors [contain:inline-size] hover:border-primary/60 hover:bg-muted/60"
>
    {#if rank !== undefined}
        <span class="rs-font w-4 shrink-0 text-center text-lg text-muted-foreground">{rank}</span>
    {/if}
    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-background/60">
        {#if item.icon}
            <img src={iconToDataUri(item.icon)} alt="" class="max-h-8 max-w-8 drop-shadow" loading="lazy" />
        {/if}
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-sm font-medium group-hover:text-primary">{item.name}</span>
        {#if detail}
            <span class="truncate text-xs text-muted-foreground">{detail}</span>
        {/if}
        {@render children?.()}
    </span>
    <span class="shrink-0 text-right text-base font-semibold tabular-nums {toneClass}">{value}</span>
</a>
