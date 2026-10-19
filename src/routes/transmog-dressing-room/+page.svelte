<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { replaceState } from '$app/navigation';
    import { page } from '$app/state';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import EquipmentSlots from '$lib/components/transmog/equipment-slots.svelte';
    import ItemPicker from '$lib/components/transmog/item-picker.svelte';
    import OutfitCost from '$lib/components/transmog/outfit-cost.svelte';
    import SavedOutfits from '$lib/components/transmog/saved-outfits.svelte';
    import TransmogViewer from '$lib/components/transmog/transmog-viewer.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Skeleton } from '$lib/components/ui/skeleton';
    import type { Mesh } from '$lib/osrs-model/compose';
    import type { Texture } from '$lib/osrs-model/rasterizer';
    import type { Gender, WearableItem } from '$lib/osrs-model/types';
    import { canonicalUrl } from '$lib/seo/page-seo';
    import { transmogSeo } from '$lib/seo/static-page-seo';
    import { buildOutfitMesh, emoteIcon, loadTransmogData, type TransmogData } from '$lib/transmog/data';
    import {
        EMOTES,
        EMPTY_OUTFIT,
        equip,
        idleFor,
        isEmptyOutfit,
        outfitParams,
        unequip,
        validateOutfit,
        type Outfit,
    } from '$lib/transmog/outfit';

    const { data } = $props();

    let outfit = $state<Outfit>(untrack(() => data.outfit));
    // Loaded once and never changed in place, so no deep reactivity (5,000 items would be slow to proxy).
    let transmog = $state.raw<TransmogData | null>(null);
    let loadError = $state(false);
    let mesh = $state.raw<Mesh | null>(null);
    let textures = $state.raw<Map<number, Texture>>(new Map());
    let selectedSlot = $state<number | null>(null);
    let viewer: TransmogViewer | undefined = $state();

    onMount(() => {
        loadTransmogData()
            .then((loaded) => {
                transmog = loaded;
                outfit = validateOutfit(outfit, loaded.items);
            })
            .catch((error) => {
                console.warn('Transmog data failed to load', error);
                loadError = true;
            });
        return () => clearTimeout(urlTimer);
    });

    // Rebuild the model whenever the outfit changes. Only the newest request wins.
    let build = 0;
    $effect(() => {
        const loaded = transmog;
        const current = outfit;
        if (!loaded) return;
        const token = ++build;
        buildOutfitMesh(loaded, current)
            .then((result) => {
                if (token !== build) return;
                textures = result.textures;
                mesh = result.mesh;
            })
            .catch((error) => {
                console.warn('Outfit failed to build', error);
                if (token === build) toast.error("That outfit couldn't be loaded. Try again in a moment.");
            });
    });

    // Keep the address bar in step with the outfit, so the link always shares what's on screen.
    let urlTimer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
        const query = outfitParams(outfit).toString();
        clearTimeout(urlTimer);
        urlTimer = setTimeout(() => {
            const path = location.pathname + (query ? `?${query}` : '');
            if (path === location.pathname + location.search) return;
            try {
                // The path is the address bar's own, so it's already resolved.
                // eslint-disable-next-line svelte/no-navigation-without-resolve
                replaceState(path, { ...page.state });
            } catch {
                // The router isn't ready yet; the next change writes it.
            }
        }, 250);
    });

    function pick(item: WearableItem): void {
        if (!transmog) return;
        outfit = equip(outfit, item, transmog.items);
    }

    function setGender(gender: Gender): void {
        outfit = { ...outfit, gender };
    }

    async function copyLink(): Promise<void> {
        const query = outfitParams(outfit).toString();
        const link = `${location.origin}${location.pathname}${query ? `?${query}` : ''}`;
        try {
            await navigator.clipboard.writeText(link);
            toast.success('Link copied');
        } catch {
            toast.error("Couldn't copy. Copy the address bar instead.");
        }
    }

    async function download(): Promise<void> {
        const blob = await viewer?.snapshot();
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'osrs-outfit.png';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** Tells search engines what the page is, under the names people search for. `<` is escaped so the JSON can't close the script tag. */
    const structuredData = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'OSRS Transmog Dressing Room',
        alternateName: ['OSRS transmog', 'OSRS dressing room', 'OSRS fashionscape planner'],
        description: transmogSeo.description,
        url: canonicalUrl(transmogSeo.canonicalPath),
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    }).replaceAll('<', '\\u003c');
    // The closing tag is split so it doesn't end this component's own <script> block.
    const structuredDataTag = `<script type="application/ld+json">${structuredData}</` + 'script>';

    const genders: { value: Gender; label: string }[] = [
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
    ];
</script>

<SeoHead seo={transmogSeo} />
<svelte:head>
    <!-- Built from constants above, with `<` escaped, so it's safe to inline. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html structuredDataTag}
</svelte:head>

<div class="content-sizing flex flex-col gap-6 pt-6 pb-10">
    <GuideHeader title="Transmog Dressing Room" answer="Try on anything in OSRS" />

    {#if loadError}
        <div class="rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
            The outfit data isn't available right now. Please try again later.
        </div>
    {:else if !transmog}
        <div class="grid gap-6 md:grid-cols-[22rem_minmax(0,1fr)]" aria-busy="true">
            <Skeleton class="h-[26rem] md:order-2 md:h-[40rem]" />
            <Skeleton class="h-[26rem] md:h-[40rem]" />
        </div>
    {:else}
        <!-- Controls on the left and the character on the right; on phones the character comes first. -->
        <div class="grid gap-6 md:grid-cols-[22rem_minmax(0,1fr)]">
            <div class="min-w-0 md:sticky md:top-20 md:col-start-2 md:row-start-1 md:self-start">
                <TransmogViewer
                    bind:this={viewer}
                    manifest={transmog.manifest}
                    {mesh}
                    {textures}
                    idle={idleFor(outfit)}
                    class="h-[26rem] rounded-md border bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.10),transparent_70%)] md:h-[min(40rem,calc(100dvh-6rem))]"
                />
            </div>

            <div class="flex min-w-0 flex-col gap-4 md:col-start-1 md:row-start-1">
                <div class="flex flex-wrap items-center gap-2">
                    <div class="flex rounded-md border p-0.5" role="radiogroup" aria-label="Body">
                        {#each genders as option (option.value)}
                            <button
                                type="button"
                                role="radio"
                                aria-checked={outfit.gender === option.value}
                                class="rounded px-3 py-1 text-sm transition-colors {outfit.gender === option.value
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground'}"
                                onclick={() => setGender(option.value)}
                            >
                                {option.label}
                            </button>
                        {/each}
                    </div>
                    <Button variant="outline" size="sm" onclick={() => viewer?.resetView()}>Reset view</Button>
                    <Button variant="outline" size="sm" onclick={download}>Download image</Button>
                    <Button variant="outline" size="sm" onclick={copyLink}>Copy link</Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={isEmptyOutfit(outfit)}
                        onclick={() => (outfit = { ...EMPTY_OUTFIT, gender: outfit.gender })}
                    >
                        Remove all items
                    </Button>
                </div>

                <!-- On phones a menu keeps the slots close to the viewer; wider screens get the emote tab. -->
                <select
                    class="h-9 rounded-md border bg-background px-3 text-sm md:hidden"
                    aria-label="Play an emote"
                    onchange={(event) => {
                        const key = event.currentTarget.value;
                        if (key) viewer?.playEmote(key);
                        event.currentTarget.value = '';
                    }}
                >
                    <option value="">Play an emote…</option>
                    {#each EMOTES as emote (emote.key)}
                        <option value={emote.key}>{emote.label}</option>
                    {/each}
                </select>

                <div class="hidden md:block">
                    <EquipmentSlots
                        {outfit}
                        items={transmog.items}
                        selected={selectedSlot}
                        layout="grid"
                        onselect={(slot) => (selectedSlot = slot)}
                    />
                </div>
                <div class="md:hidden">
                    <EquipmentSlots
                        {outfit}
                        items={transmog.items}
                        selected={selectedSlot}
                        layout="strip"
                        onselect={(slot) => (selectedSlot = slot)}
                    />
                </div>
                <ItemPicker
                    itemList={transmog.itemList}
                    {outfit}
                    slot={selectedSlot}
                    onpick={pick}
                    onremove={(slot) => (outfit = unequip(outfit, slot))}
                    onclearslot={() => (selectedSlot = null)}
                />

                <section aria-labelledby="emotes-heading" class="hidden flex-col gap-1.5 md:flex">
                    <h2 id="emotes-heading" class="text-sm font-semibold">Emotes</h2>
                    <div class="grid grid-cols-6 gap-1">
                        {#each EMOTES as emote (emote.key)}
                            <button
                                type="button"
                                class="flex aspect-square items-center justify-center rounded-sm border bg-muted/30 hover:border-primary/60 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                                aria-label={emote.label}
                                title={emote.label}
                                onclick={() => viewer?.playEmote(emote.key)}
                            >
                                <img
                                    src={emoteIcon(emote.key)}
                                    alt=""
                                    width="48"
                                    height="48"
                                    class="size-12 [image-rendering:pixelated]"
                                />
                            </button>
                        {/each}
                    </div>
                </section>
            </div>
        </div>

        <div class="grid gap-6 md:grid-cols-2">
            <OutfitCost {outfit} items={transmog.items} />
            <SavedOutfits
                {outfit}
                items={transmog.items}
                onload={(saved) => transmog && (outfit = validateOutfit(saved, transmog.items))}
            />
        </div>

        <p class="text-xs text-muted-foreground">
            Models, textures and emotes come straight from the game's files (build {transmog.manifest.source.build ||
                '?'}), via the
            <a
                href="https://archive.openrs2.org"
                class="underline underline-offset-2 hover:text-foreground"
                rel="noopener noreferrer"
                target="_blank">OpenRS2 Archive</a
            >. Weapons are held in the standard stance for now.
        </p>
    {/if}

    <section
        class="flex max-w-prose flex-col gap-2 text-sm text-muted-foreground"
        aria-labelledby="about-dressing-room"
    >
        <h2 id="about-dressing-room" class="font-semibold text-foreground">About the dressing room</h2>
        <p>
            This OSRS transmog dressing room lets you try on any wearable item in the game. Mix pieces from every slot
            to plan your outfit and check GE prices for your selections.
        </p>
    </section>
</div>
