<script lang="ts">
    import HomeItemRow from './home-item-row.svelte';
    import { formatGpPerXp, skillIcon, skillLabel } from '$lib/helpers/homepage';
    import type { HomepageCheapXp } from '$lib/models/homepage';

    /**
     * One skill's cheapest XP: what each XP costs, or what it earns when making the item turns a
     * profit, tagged so the two read apart at a glance.
     */
    const { row }: { row: HomepageCheapXp } = $props();

    const profitable = $derived(row.gpPerXp === 0);
    const earnedPerXp = $derived(Math.max(0, row.item.creationProfit ?? 0) / row.xp);
</script>

<HomeItemRow
    item={row.item}
    value={profitable ? `+${formatGpPerXp(earnedPerXp)}` : formatGpPerXp(row.gpPerXp)}
    tone={profitable ? 'positive' : 'neutral'}
    detail={`${row.xp.toLocaleString('en-US')} xp each`}
>
    <span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span class="flex items-center gap-1">
            <img src={skillIcon(row.skill)} alt="" class="h-3.5 w-3.5" />
            {skillLabel(row.skill)}
        </span>
        <span
            class="rounded-full border px-1.5 py-px text-[10px] font-medium leading-4 {profitable
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-border bg-muted text-muted-foreground'}"
        >
            {profitable ? 'Profitable' : 'Not profitable'}
        </span>
    </span>
</HomeItemRow>
