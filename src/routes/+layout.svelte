<script lang="ts">
    import { onMount } from 'svelte';
    import { onNavigate } from '$app/navigation';
    import '../app.css';
    import { markAppHydrated } from '$lib/helpers/deferred-page-data';
    import * as Sidebar from '$lib/components/ui/sidebar';
    import { Toaster } from '$lib/components/ui/sonner';
    import NavMenu from '$lib/components/layout/nav-menu/nav-menu.svelte';
    import SiteHeader from '$lib/components/layout/site-header.svelte';
    import { ModeWatcher } from 'mode-watcher';

    let { children, data } = $props();

    // This runs once the server-rendered page is on screen and hydrated, which is the point after
    // which a `load` may hand its page promises instead of finished data.
    onMount(markAppHydrated);

    onNavigate((navigation) => {
        // Bail early if the browser doesn't support view transitions.
        if (!document.startViewTransition) return;

        return new Promise((resolve) => {
            document.startViewTransition(async () => {
                resolve();
                await navigation.complete;
            });
        });
    });
</script>

<svelte:head>
    <!-- Only the tags that are the same on every page. Each page renders its own title,
         description, canonical and share tags through SeoHead. -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Aris Maye" />
    <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<Toaster />

<Sidebar.Provider>
    <NavMenu showDevControls={data.showDevControls} />
    <Sidebar.Inset>
        <main class="w-full">
            <SiteHeader />
            {@render children?.()}
        </main>
    </Sidebar.Inset>
</Sidebar.Provider>

<ModeWatcher />

<style>
    :global(div[data-dialog-overlay]) {
        @apply duration-300 !important;
    }
</style>
