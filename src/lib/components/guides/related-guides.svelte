<script lang="ts">
    import { resolve } from '$app/paths';
    import { GUIDE_PAGES, type GuideKey } from '$lib/constants/guides';

    /** Links to the other guides, at the foot of each one. */
    const { current }: { current?: GuideKey } = $props();

    const others = $derived(GUIDE_PAGES.filter((guide) => guide.key !== current));
</script>

<nav aria-labelledby="related-guides" class="flex flex-col gap-3 border-t pt-6">
    <h2 id="related-guides" class="text-lg font-semibold">More guides</h2>
    <ul class="grid gap-3 sm:grid-cols-2">
        {#each others as guide (guide.key)}
            <li>
                <a
                    href={resolve(guide.path)}
                    class="flex h-full flex-col gap-1 rounded-md border bg-muted/30 p-3 transition-colors hover:border-primary/60 hover:bg-muted/60"
                >
                    <span class="font-medium">{guide.title}</span>
                    <span class="text-sm text-muted-foreground">{guide.blurb}</span>
                </a>
            </li>
        {/each}
    </ul>
    <a
        href={resolve('/guides')}
        class="self-start text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
    >
        All guides →
    </a>
</nav>
