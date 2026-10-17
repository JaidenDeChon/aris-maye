<script lang="ts">
    import { page } from '$app/state';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { itemsSeo } from '$lib/seo/static-page-seo';
    import GameItemsPage from '$lib/components/items/game-items-page.svelte';
</script>

<SeoHead seo={itemsSeo} />

<!-- A fresh page on every real navigation (shallow pagination and view changes leave page.url
     alone), so following a link to /items from a shared view picks up the new URL's view. -->
{#key page.url.href}
    <GameItemsPage heading="Browse items" />
{/key}
