<script lang="ts">
    import { beforeNavigate } from '$app/navigation';
    import * as Sidebar from '$lib/components/ui/sidebar';
    import NavHeader from '$lib/components/layout/nav-menu/nav-header.svelte';
    import NavContents from '$lib/components/layout/nav-menu/nav-contents.svelte';
    import NavFooter from '$lib/components/layout/nav-menu/nav-footer.svelte';

    const { showDevControls = false } = $props<{ showDevControls?: boolean }>();

    const sidebar = Sidebar.useSidebar();

    // On phones the menu covers the page, so close it as soon as a link in the site is followed.
    beforeNavigate(({ willUnload }) => {
        if (sidebar.isMobile && !willUnload) sidebar.setOpenMobile(false);
    });
</script>

<nav>
    <Sidebar.Root variant="inset" collapsible="icon">
        <!-- Header -->
        <NavHeader />

        <!-- Content -->
        <Sidebar.Content>
            <NavContents />
        </Sidebar.Content>

        <!-- Footer -->
        <Sidebar.Footer>
            <NavFooter {showDevControls} />
        </Sidebar.Footer>
    </Sidebar.Root>
</nav>
