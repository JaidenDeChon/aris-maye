<script lang="ts">
    import { resolve } from '$app/paths';
    import HomeBand from './home-band.svelte';
    import { formatGpShort, skillIcon, skillLabel } from '$lib/helpers/homepage';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import type { HomepageSnapshot } from '$lib/models/homepage';

    /** One tile per skill, showing the most profitable thing it makes today. */
    const { snapshot, compact = false }: { snapshot: HomepageSnapshot; compact?: boolean } = $props();
</script>

<HomeBand title="Top earner per skill" blurb="Most profitable items to make, by skill" {compact}>
    {#if snapshot.skillEarners.length}
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {#each snapshot.skillEarners as earner (earner.skill)}
                <a
                    href={resolve(`/items/${earner.item.id}`)}
                    class="group flex min-w-0 flex-col gap-2 rounded-md border bg-muted/30 p-3 transition-colors [contain:inline-size] hover:border-primary/60 hover:bg-muted/60"
                >
                    <span class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <img src={skillIcon(earner.skill)} alt="" class="h-4 w-4" />
                        {skillLabel(earner.skill)}
                    </span>
                    <span class="flex items-center gap-3 min-w-0">
                        <span class="flex h-8 w-8 shrink-0 items-center justify-center">
                            {#if earner.item.icon}
                                <img
                                    src={iconToDataUri(earner.item.icon)}
                                    alt=""
                                    class="max-h-8 max-w-8 drop-shadow"
                                    loading="lazy"
                                />
                            {/if}
                        </span>
                        <span class="flex-1 truncate text-sm font-medium group-hover:text-primary">
                            {earner.item.name}
                        </span>
                        <span class="shrink-0 font-semibold tabular-nums text-emerald-500">
                            {formatGpShort(earner.item.creationProfit, true)}
                        </span>
                    </span>
                </a>
            {/each}
        </div>
    {:else}
        <p class="text-sm text-muted-foreground">No skill has a profitable item at today's prices.</p>
    {/if}
</HomeBand>
