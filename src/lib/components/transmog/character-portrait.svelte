<script lang="ts">
    /** A still picture of a character in their saved outfit, or the plain user icon when they have none. */
    import { User } from 'lucide-svelte';
    import { onMount } from 'svelte';
    import { Skeleton } from '$lib/components/ui/skeleton';
    import { isEmptyOutfit, type Outfit } from '$lib/transmog/outfit';
    import { renderPortrait } from '$lib/transmog/portrait';

    interface Props {
        outfit?: Outfit;
        /** What the picture shows, for screen readers. */
        alt: string;
        /** Picks the portrait out in the primary colour, as for the active character. */
        highlighted?: boolean;
        class?: string;
    }

    const { outfit, alt, highlighted = false, class: className = '' }: Props = $props();

    /** Drawn at twice the CSS size so it stays sharp on high-density screens. */
    const WIDTH = 224;
    const HEIGHT = 288;

    let src = $state<string | null>(null);
    let loading = $state(false);
    let mounted = $state(false);
    onMount(() => (mounted = true));

    $effect(() => {
        const current = outfit;
        if (!mounted || !current || isEmptyOutfit(current)) {
            src = null;
            loading = false;
            return;
        }
        let cancelled = false;
        loading = true;
        renderPortrait(current, WIDTH, HEIGHT).then((url) => {
            if (cancelled) return;
            src = url;
            loading = false;
        });
        return () => (cancelled = true);
    });
</script>

<div
    class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-card {highlighted
        ? 'border-primary/60'
        : ''} {src
        ? 'bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.10),transparent_70%)]'
        : ''} {className}"
>
    {#if src}
        <img {src} {alt} width={WIDTH / 2} height={HEIGHT / 2} class="h-full w-full object-contain" />
    {:else if loading}
        <Skeleton class="absolute inset-0" aria-label="Drawing {alt}" />
    {:else}
        <User
            class="size-16 {highlighted ? 'text-primary/50' : 'text-muted-foreground/40'}"
            strokeWidth={1.5}
            role="img"
            aria-label={alt}
        />
    {/if}
</div>
