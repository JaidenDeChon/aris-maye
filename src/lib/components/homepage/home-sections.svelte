<script lang="ts">
    import { onMount } from 'svelte';
    import * as Tabs from '$lib/components/ui/tabs';
    import HomeStatStrip from './home-stat-strip.svelte';
    import ForYouSection from './for-you-section.svelte';
    import MakeNowSection from './make-now-section.svelte';
    import SkillEarnersSection from './skill-earners-section.svelte';
    import AlchXpSection from './alch-xp-section.svelte';
    import MarketPulseSection from './market-pulse-section.svelte';
    import IronmanCornerSection from './ironman-corner-section.svelte';
    import HomeSectionsSkeleton from './home-sections-skeleton.svelte';
    import { activeIsIronman } from '$lib/stores/character-store.svelte';
    import { timeSince } from '$lib/helpers/time-since';
    import { HOMEPAGE_SNAPSHOT_MAX_AGE_MS } from '$lib/constants/homepage';
    import type { HomepageMarketPulse, HomepageSnapshot } from '$lib/models/homepage';

    /**
     * Everything between the hero and the FAQ.
     *
     * On wide screens each section is its own band. On phones the same sections fold into one
     * tabbed card so the page doesn't scroll forever.
     *
     * The server sends the sections valued for a main when it has them quickly. When it doesn't,
     * the page arrives with a skeleton and the browser fetches them. An Ironman profile always
     * fetches its own values, with the skeleton up until they land, so a main's numbers never
     * flash past.
     *
     * A snapshot past its age is shown as it is, and the browser asks for a rebuilt one to swap in.
     * The server can't rebuild in the background, so this is what keeps the numbers moving when the
     * hourly job's refresh doesn't run.
     */
    const { snapshot: serverSnapshot }: { snapshot: HomepageSnapshot | null } = $props();

    let fetchedMain = $state<HomepageSnapshot | null>(null);
    let ironmanSnapshot = $state<HomepageSnapshot | null>(null);
    let failed = $state(false);
    let mounted = $state(false);
    onMount(() => (mounted = true));

    // Before mount the profile isn't readable yet, so the server's render (a main's view) stands.
    const ironman = $derived(mounted && activeIsIronman());
    const mainSnapshot = $derived(fetchedMain ?? serverSnapshot);
    const snapshot = $derived(ironman ? ironmanSnapshot : mainSnapshot);

    $effect(() => {
        if (!mounted || snapshot || failed) return;
        const wantIronman = ironman;
        const controller = new AbortController();
        fetch(wantIronman ? '/api/homepage?ironman=1' : '/api/homepage', { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<HomepageSnapshot>;
            })
            .then((data) => {
                if (wantIronman) ironmanSnapshot = data;
                else fetchedMain = data;
            })
            .catch((error) => {
                if (error?.name === 'AbortError') return;
                console.error('Failed to load homepage data', error);
                failed = true;
            });
        return () => controller.abort();
    });

    // Asked for once per view, whatever comes back: a request that finds another one already
    // rebuilding gets the same stale snapshot, and trying again straight away wouldn't help.
    const refreshRequested = { main: false, ironman: false };
    $effect(() => {
        if (!mounted || !snapshot) return;
        const shownAt = snapshot.computedAt;
        if (Date.now() - shownAt < HOMEPAGE_SNAPSHOT_MAX_AGE_MS) return;
        const wantIronman = ironman;
        const view = wantIronman ? 'ironman' : 'main';
        if (refreshRequested[view]) return;
        refreshRequested[view] = true;
        fetch(wantIronman ? '/api/homepage?ironman=1&fresh=1' : '/api/homepage?fresh=1')
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<HomepageSnapshot>;
            })
            .then((data) => {
                if (data.computedAt <= shownAt) return;
                if (wantIronman) ironmanSnapshot = data;
                else fetchedMain = data;
            })
            .catch((error) => console.error('Failed to refresh homepage data', error));
    });

    // Market pulse is read live rather than from the snapshot, so its hour count is never older
    // than a minute. Until that lands, the snapshot's copy stands in.
    let livePulse = $state<HomepageMarketPulse | null>(null);
    $effect(() => {
        if (!mounted || ironman || livePulse) return;
        const controller = new AbortController();
        fetch('/api/homepage/market-pulse', { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<HomepageMarketPulse>;
            })
            .then((data) => (livePulse = data))
            .catch((error) => {
                if (error?.name !== 'AbortError') console.error('Failed to load Market pulse', error);
            });
        return () => controller.abort();
    });

    // Ironmen can't trade on the GE, so their snapshot has no Market pulse and the band stays hidden.
    // It also stays hidden before the hourly job has stored any trade history.
    const pulse = $derived.by(() => {
        if (!snapshot || snapshot.ironman) return null;
        const current = livePulse ?? snapshot.marketPulse ?? null;
        return current && current.historyHours > 0 ? current : null;
    });

    // Snapshots cached before the Ironman corner existed don't have one.
    const corner = $derived(snapshot?.ironmanCorner ?? null);
    // An Ironman sees their corner first; everyone else finds it at the end.
    const cornerFirst = $derived(Boolean(snapshot?.ironman));

    const tabs = $derived([
        ...(corner && cornerFirst ? [{ value: 'ironman', label: 'Ironman' }] : []),
        { value: 'make', label: 'Make' },
        { value: 'skills', label: 'By skill' },
        ...(pulse ? [{ value: 'market', label: 'Market' }] : []),
        { value: 'xp', label: snapshot && !snapshot.ironman && snapshot.alchPicks.length ? 'Alch & XP' : 'XP' },
        ...(corner && !cornerFirst ? [{ value: 'ironman', label: 'Ironman' }] : []),
    ]);
    // Until a tab is picked, the first one shows, which follows the account type.
    let pickedTab = $state<string | null>(null);
    const activeTab = $derived(pickedTab && tabs.some((tab) => tab.value === pickedTab) ? pickedTab : tabs[0].value);

    // Worked out in the browser so the server's clock and time zone never leak into the page.
    const updatedAgo = $derived(mounted && snapshot ? timeSince(Math.floor(snapshot.computedAt / 1000)) : null);
</script>

<!-- If the data can't be loaded at all, the sections step aside and the hero and FAQ carry on. -->
<div class="content-sizing flex flex-col gap-10 md:gap-14">
    {#if snapshot || !failed}
        <div class="flex flex-col gap-2 pt-8 md:gap-3 md:pt-12">
            {#if snapshot}
                <HomeStatStrip {snapshot} {pulse} />
                <!-- Kept in the layout before the time is known so the page doesn't shift when it appears. -->
                <p class="min-h-4 text-xs text-muted-foreground">{updatedAgo ?? ''}</p>
            {:else}
                <HomeSectionsSkeleton part="strip" />
            {/if}
        </div>
    {/if}

    <ForYouSection />

    {#if snapshot}
        <!-- Wide screens: one band per section. -->
        <div class="hidden flex-col gap-14 md:flex">
            {#if corner && cornerFirst}
                <IronmanCornerSection {corner} ironman />
            {/if}
            <MakeNowSection {snapshot} />
            <SkillEarnersSection {snapshot} />
            {#if pulse}
                <MarketPulseSection {pulse} />
            {/if}
            <AlchXpSection {snapshot} />
            {#if corner && !cornerFirst}
                <IronmanCornerSection {corner} />
            {/if}
        </div>

        <!-- Phones: the same sections as tabs. -->
        <div class="md:hidden">
            <Tabs.Root value={activeTab} onValueChange={(value) => (pickedTab = value)} class="flex flex-col gap-4">
                <Tabs.List class="grid w-full" style="grid-template-columns: repeat({tabs.length}, minmax(0, 1fr))">
                    {#each tabs as tab (tab.value)}
                        <Tabs.Trigger value={tab.value} class="px-1 text-xs min-[400px]:text-sm"
                            >{tab.label}</Tabs.Trigger
                        >
                    {/each}
                </Tabs.List>
                <Tabs.Content value="make"><MakeNowSection {snapshot} compact /></Tabs.Content>
                <Tabs.Content value="skills"><SkillEarnersSection {snapshot} compact /></Tabs.Content>
                {#if pulse}
                    <Tabs.Content value="market"><MarketPulseSection {pulse} compact /></Tabs.Content>
                {/if}
                <Tabs.Content value="xp"><AlchXpSection {snapshot} compact /></Tabs.Content>
                {#if corner}
                    <Tabs.Content value="ironman">
                        <IronmanCornerSection {corner} ironman={cornerFirst} compact />
                    </Tabs.Content>
                {/if}
            </Tabs.Root>
        </div>
    {:else if !failed}
        <HomeSectionsSkeleton part="bands" />
    {/if}
</div>
