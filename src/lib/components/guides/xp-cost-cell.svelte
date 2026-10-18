<script lang="ts">
    import { formatGpShort } from '$lib/helpers/homepage';
    import type { XpMethod } from '$lib/models/guides';

    /** What making one costs, or what it pays when it turns a profit. */
    const { method }: { method: XpMethod } = $props();

    const profit = $derived(method.item.creationProfit ?? 0);
</script>

{#if profit >= 0}
    <span class="font-medium text-emerald-500">Pays {formatGpShort(profit)}</span>
{:else}
    {formatGpShort(-profit)}
{/if}
