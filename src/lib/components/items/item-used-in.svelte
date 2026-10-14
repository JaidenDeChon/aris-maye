<script lang="ts">
    import { resolve } from '$app/paths';
    import { Button } from '$lib/components/ui/button';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import { skillIcon, skillLabel } from '$lib/helpers/homepage';
    import type { ItemUsedIn } from '$lib/models/item-used-in';

    /**
     * The recipes this item goes into. For an ingredient like an ore this is the main thing its
     * page has to say, and the links let readers (and crawlers) follow it to the things it makes.
     */
    const { usedIn }: { usedIn: ItemUsedIn } = $props();

    const INITIAL_ROWS = 10;
    let expanded = $state(false);
    const visible = $derived(expanded ? usedIn.items : usedIn.items.slice(0, INITIAL_ROWS));
    const canExpand = $derived(!expanded && usedIn.items.length > INITIAL_ROWS);
    const isCapped = $derived(usedIn.total > usedIn.items.length);
</script>

<section data-seo-used-in class="border rounded-lg bg-card shadow-sm overflow-hidden mt-6">
    <div class="flex items-baseline gap-3 p-4 border-b">
        <h3 class="text-lg font-semibold leading-tight">Used in</h3>
        <span class="text-sm text-muted-foreground">
            {usedIn.total}
            {usedIn.total === 1 ? 'recipe' : 'recipes'}
        </span>
    </div>
    <ul class="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        {#each visible as recipe (recipe.id)}
            <li>
                <a
                    href={resolve(`/items/${recipe.id}`)}
                    class="group flex min-w-0 items-center gap-3 rounded-md border bg-muted/30 p-3 transition-colors hover:border-primary/60 hover:bg-muted/60"
                >
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-background/60">
                        {#if recipe.icon}
                            <img
                                src={iconToDataUri(recipe.icon)}
                                alt=""
                                class="max-h-8 max-w-8 drop-shadow"
                                loading="lazy"
                            />
                        {/if}
                    </span>
                    <span class="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary"
                        >{recipe.name}</span
                    >
                    {#if recipe.skill}
                        <span class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <img src={skillIcon(recipe.skill)} alt="" class="h-4 w-4" />
                            {skillLabel(recipe.skill)}
                            {recipe.level}
                        </span>
                    {/if}
                </a>
            </li>
        {/each}
    </ul>
    {#if canExpand}
        <div class="px-4 pb-4">
            <Button variant="outline" size="sm" onclick={() => (expanded = true)}>Show all {usedIn.total}</Button>
        </div>
    {/if}
    {#if expanded && isCapped}
        <p class="px-4 pb-4 text-xs text-muted-foreground">
            Showing the {usedIn.items.length} lowest-level recipes.
        </p>
    {/if}
</section>
