<script lang="ts">
    import GameItemsPage from '$lib/components/items/game-items-page.svelte';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { buildSkillSeo } from '$lib/seo/static-page-seo';

    const { data } = $props();
    const skill = $derived(data.skill);
    const seo = $derived(buildSkillSeo(data.skill));
</script>

<SeoHead {seo} />

{#key skill?.slug ?? 'all'}
    <GameItemsPage {skill} />
{/key}
