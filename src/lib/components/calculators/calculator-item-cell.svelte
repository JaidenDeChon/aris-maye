<script lang="ts">
    import { resolve } from '$app/paths';
    import { itemIconPath } from '$lib/constants/calculators';

    /**
     * An item's icon and name in a calculator table, linking to its page. The icon comes from the
     * icon endpoint rather than a data URI, because these tables list every method.
     */
    const { item }: { item: { id: number; name: string } } = $props();

    let failed = $state(false);
</script>

<a href={resolve(`/items/${item.id}`)} class="group flex min-w-44 items-center gap-2">
    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40">
        {#if !failed}
            <img
                src={itemIconPath(item.id)}
                alt=""
                width="28"
                height="28"
                class="h-auto max-h-7 w-auto max-w-7 drop-shadow"
                loading="lazy"
                onerror={() => (failed = true)}
            />
        {/if}
    </span>
    <span class="font-medium group-hover:text-primary group-hover:underline">{item.name}</span>
</a>
