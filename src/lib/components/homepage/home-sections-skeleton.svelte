<script lang="ts">
    import { Skeleton } from '$lib/components/ui/skeleton';

    /**
     * Placeholders shaped like the homepage sections, shown while their data loads so the page
     * doesn't jump when it arrives.
     */
    const { part }: { part: 'strip' | 'bands' } = $props();

    const ROW_HEIGHT = 'h-[62px]';
</script>

{#if part === 'strip'}
    <div
        class="-mx-8 flex gap-3 overflow-hidden px-8 pt-1 pb-4 [contain:inline-size] md:mx-0 md:grid md:grid-cols-4 md:px-0 md:pb-1"
    >
        {#each { length: 4 }, index (index)}
            <div class="flex min-w-[11rem] shrink-0 flex-col gap-2 rounded-md border bg-muted/30 p-3 md:min-w-0">
                <Skeleton class="h-3 w-24" />
                <Skeleton class="h-6 w-16" />
                <Skeleton class="h-3 w-28" />
            </div>
        {/each}
    </div>
    <Skeleton class="h-3 w-24" />
{:else}
    {#snippet bandHeading()}
        <div class="flex flex-col gap-2">
            <Skeleton class="h-7 w-56" />
            <Skeleton class="h-4 w-72 max-w-full" />
        </div>
    {/snippet}

    <!-- Wide screens: the first band, then the heading of the next, which is all that fits above the fold. -->
    <div class="hidden flex-col gap-14 md:flex" aria-hidden="true">
        <div class="flex flex-col gap-4">
            {@render bandHeading()}
            <div class="grid gap-2 md:grid-cols-2">
                {#each { length: 6 }, index (index)}
                    <Skeleton class="{ROW_HEIGHT} w-full" />
                {/each}
            </div>
        </div>
        <div class="flex flex-col gap-4">
            {@render bandHeading()}
            <div class="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {#each { length: 6 }, index (index)}
                    <Skeleton class="h-[74px] w-full" />
                {/each}
            </div>
        </div>
    </div>

    <!-- Phones: the tab bar and the first tab's rows. -->
    <div class="flex flex-col gap-4 md:hidden" aria-hidden="true">
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-4 w-48" />
        {#each { length: 4 }, index (index)}
            <Skeleton class="{ROW_HEIGHT} w-full" />
        {/each}
    </div>
{/if}
