<script lang="ts">
    /** Previous and next buttons under an item list, with which rows are showing. */
    import { ChevronLeft, ChevronRight } from 'lucide-svelte';
    import { formatWithCommas } from '$lib/helpers/format-number';

    interface Props {
        /** Index of the first row on the page. */
        start: number;
        /** Rows on this page. */
        count: number;
        /** Every row there is, or null while more are still to come. */
        total: number | null;
        hasNext: boolean;
        onprev: () => void;
        onnext: () => void;
    }

    const { start, count, total, hasNext, onprev, onnext }: Props = $props();

    const range = $derived(count === 0 ? '' : `${formatWithCommas(start + 1)}–${formatWithCommas(start + count)}`);
</script>

<div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
    <button
        type="button"
        class="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        aria-label="Previous page"
        disabled={start === 0}
        onclick={onprev}
    >
        <ChevronLeft class="size-4" />
    </button>
    <span class="tabular-nums" aria-live="polite">
        {range}{#if total !== null && count > 0}{` of ${formatWithCommas(total)}`}{/if}
    </span>
    <button
        type="button"
        class="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        aria-label="Next page"
        disabled={!hasNext}
        onclick={onnext}
    >
        <ChevronRight class="size-4" />
    </button>
</div>
