<script lang="ts">
    import type { Snippet } from 'svelte';

    /**
     * One labelled number with a line underneath saying what it means.
     *
     * `tone` colours the value for figures that can go either way, like a profit, so a loss reads
     * as one before the minus sign is noticed.
     */
    interface StatTileProps {
        label: string;
        value: string;
        hint?: string;
        tone?: 'neutral' | 'positive' | 'negative' | 'muted';
        icon?: Snippet;
        children?: Snippet;
    }

    const { label, value, hint, tone = 'neutral', icon, children }: StatTileProps = $props();

    const toneClass = $derived(
        {
            neutral: 'text-foreground',
            positive: 'text-emerald-500',
            negative: 'text-rose-500',
            muted: 'text-muted-foreground',
        }[tone],
    );
</script>

<div class="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 min-w-0">
    <div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {#if icon}
            <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                {@render icon()}
            </span>
        {/if}
        <span class="truncate">{label}</span>
    </div>
    <p class="text-xl font-semibold tabular-nums {toneClass}">{value}</p>
    {#if hint}
        <p class="text-xs text-muted-foreground">{hint}</p>
    {/if}
    {@render children?.()}
</div>
