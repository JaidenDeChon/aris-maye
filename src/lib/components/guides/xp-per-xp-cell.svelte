<script lang="ts">
    import { formatGpPerXp } from '$lib/helpers/homepage';
    import { netCostPerXp } from '$lib/helpers/guides';
    import type { XpMethod } from '$lib/models/guides';

    /** What each XP costs, or what it earns (in green) when making the item turns a profit. */
    const { method }: { method: XpMethod } = $props();

    const net = $derived(netCostPerXp(method));
</script>

{#if net < 0}
    <span class="text-emerald-500">+{formatGpPerXp(-net)}</span>
{:else}
    {formatGpPerXp(net)}
{/if}
