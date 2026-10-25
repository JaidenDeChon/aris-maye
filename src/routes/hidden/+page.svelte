<script lang="ts">
    import PageTitle from '$lib/components/global/page-title.svelte';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { hiddenSeo } from '$lib/seo/static-page-seo';
    import { onMount } from 'svelte';
    import { hiddenStore } from '$lib/stores/hidden-store';
    import ItemCard from '$lib/components/global/item-card.svelte';
    import type { IGameItem } from '$lib/models/game-item';

    let loading = $state(true);

    let hidden = $derived($hiddenStore.hidden);
    let completeHidden = $state([] as IGameItem[]);

    onMount(async () => {
        loading = true;
        if (!hidden.length) {
            completeHidden = [];
            loading = false;
            return;
        }

        const params = hidden.join('&id=');
        const response = await fetch(`/api/game-items?id=${params}`);
        const result: IGameItem[] = await response.json();
        completeHidden = result;
        loading = false;
    });
</script>

<SeoHead seo={hiddenSeo} />

<div>
    <PageTitle class="mb-4">Hidden items</PageTitle>

    {#if loading}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {#each Array.from({ length: 5 }, (_, i) => i) as index (index)}
                <ItemCard {loading} />
            {/each}
        </div>
    {:else if completeHidden.length === 0}
        <div class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No hidden items yet.</div>
    {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {#each completeHidden as item (item.id)}
                <ItemCard {item} linkToItemPage allowHide={true} allowFavorite={false} />
            {/each}
        </div>
    {/if}
</div>
