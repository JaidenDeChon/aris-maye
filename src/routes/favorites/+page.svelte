<script lang="ts">
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { favoritesSeo } from '$lib/seo/static-page-seo';
    import { onMount } from 'svelte';
    import { favoritesStore } from '$lib/stores/favorites-store';
    import ItemCard from '$lib/components/global/item-card.svelte';
    import type { IGameItem } from '$lib/models/game-item';

    let loading = $state(true);

    let favorites = $derived($favoritesStore.favorites);
    let completeFavorites = $state([] as IGameItem[]);

    onMount(async () => {
        loading = true;
        if (!favorites.length) {
            completeFavorites = [];
            loading = false;
            return;
        }

        const params = favorites.join('&id=');
        const response = await fetch(`/api/game-items?id=${params}`);
        const result: IGameItem[] = await response.json();
        completeFavorites = result;
        loading = false;
    });
</script>

<SeoHead seo={favoritesSeo} />

<div class="px-4 sm:px-6 lg:px-8">
    <div class="max-w-5xl mx-auto w-full">
        <h1 class="text-3xl font-bold mb-4">Favorites</h1>

        {#if loading}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {#each Array.from({ length: 5 }, (_, i) => i) as index (index)}
                    <ItemCard {loading} />
                {/each}
            </div>
        {:else if completeFavorites.length === 0}
            <div class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                No favorites yet. Add items to your favorites to see them here.
            </div>
        {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {#each completeFavorites as item (item.id)}
                    <ItemCard {item} linkToItemPage allowHide={false} allowFavorite={true} />
                {/each}
            </div>
        {/if}
    </div>
</div>
