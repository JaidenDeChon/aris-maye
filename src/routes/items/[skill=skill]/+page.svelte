<script lang="ts">
    import { page } from '$app/state';
    import GameItemsPage from '$lib/components/items/game-items-page.svelte';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { buildSkillSeo } from '$lib/seo/static-page-seo';

    const { data } = $props();
    const skill = $derived(data.skill);
    const seo = $derived(buildSkillSeo(data.skill));
</script>

<SeoHead {seo} />

<!-- A fresh page on every real navigation, including the same skill from a shared view (shallow
     pagination and view changes leave page.url alone). -->
{#key page.url.href}
    <GameItemsPage {skill} />
{/key}
