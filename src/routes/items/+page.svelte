<script lang="ts">
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { itemsSeo } from '$lib/seo/static-page-seo';
    import GameItemsPage from '$lib/components/items/game-items-page.svelte';
</script>

<SeoHead seo={itemsSeo} />

<GameItemsPage heading="Browse items" />
