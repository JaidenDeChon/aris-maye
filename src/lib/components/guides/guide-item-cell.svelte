<script lang="ts">
    import { resolve } from '$app/paths';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';

    /** An item's icon and name in a guide table, linking to its page. */
    const { item }: { item: { id: number; name: string; icon?: string | null } } = $props();
</script>

<a href={resolve(`/items/${item.id}`)} class="group flex min-w-44 items-center gap-2">
    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40">
        {#if item.icon}
            <img src={iconToDataUri(item.icon)} alt="" class="max-h-7 max-w-7 drop-shadow" loading="lazy" />
        {/if}
    </span>
    <span class="font-medium group-hover:text-primary group-hover:underline">{item.name}</span>
</a>
