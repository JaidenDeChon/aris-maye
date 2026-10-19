<script lang="ts">
    /**
     * The 3D preview: draws the outfit with the game-style software renderer, loops the idle
     * animation, plays emotes on request, and turns when dragged or with the arrow keys.
     */
    import { onMount } from 'svelte';
    import type { Mesh } from '$lib/osrs-model/compose';
    import { CYCLE_MS, PlayerModel, SequencePlayer } from '$lib/osrs-model/player-model';
    import { createPalette, Rasterizer, type Camera, type Texture } from '$lib/osrs-model/rasterizer';
    import type { TransmogManifest } from '$lib/osrs-model/types';
    import { BRIGHTNESS } from '$lib/transmog/data';

    interface Props {
        manifest: TransmogManifest;
        mesh: Mesh | null;
        textures: Map<number, Texture>;
        /** Name of the looping animation (see idleFor). */
        idle: string;
        class?: string;
    }

    const { manifest, mesh, textures, idle, class: className = '' }: Props = $props();

    /** Screen pixels per rendered pixel. */
    const SCALE = 2;
    /** Starting turn: a little toward the controls, as the game's character designer shows you. */
    const START_YAW = 1848;
    /** 2048ths of a turn per screen pixel dragged, and per arrow-key press. */
    const DRAG_SPEED = 3;
    const KEY_STEP = 128;

    let canvas: HTMLCanvasElement | undefined = $state();
    let container: HTMLDivElement | undefined = $state();
    let emoteName: string | null = $state(null);

    const palette = createPalette(BRIGHTNESS);
    let rasterizer: Rasterizer | null = null;
    let model: PlayerModel | null = null;
    let idlePlayer: SequencePlayer | null = null;
    let emotePlayer: SequencePlayer | null = null;
    let yaw = $state(START_YAW);
    /** The facing as degrees, for the slider role. */
    const facing = $derived(Math.round(((2048 - yaw) % 2048) * (360 / 2048)));
    let cycle = 0;
    let dirty = true;
    let reducedMotion = false;

    const camera = (width: number, height: number): Camera => ({
        yaw,
        pitch: 96,
        distance: 1000,
        // Fit a standing player (about 200 units tall) into roughly 80% of the height, leaving room for raised weapons.
        zoom: Math.round(height * 3.7),
        centerX: width >> 1,
        centerY: Math.round(height * 0.53),
        lift: 95,
    });

    $effect(() => {
        if (!mesh) return;
        model = new PlayerModel(mesh, manifest.framemaps);
        if (rasterizer) rasterizer.textures = textures;
        dirty = true;
    });

    $effect(() => {
        idlePlayer = new SequencePlayer(manifest.animations[idle] ?? manifest.animations.idle);
        dirty = true;
    });

    /** Plays an emote once, then goes back to idling. */
    export function playEmote(name: string): void {
        const animation = manifest.animations[name];
        if (!animation) return;
        emotePlayer = new SequencePlayer(animation);
        emoteName = name;
        dirty = true;
    }

    /** Turns the player back to the starting angle. */
    export function resetView(): void {
        yaw = START_YAW;
        dirty = true;
    }

    /** The current frame as a PNG with a transparent background, enlarged without smoothing. */
    export async function snapshot(scale = 4): Promise<Blob | null> {
        if (!rasterizer || !model) return null;
        const { width, height } = rasterizer;
        // Crop to the player, with a little room around them.
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (rasterizer.pixels[y * width + x] >>> 24 === 0) continue;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) return null;
        const pad = 4;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(width - 1, maxX + pad);
        maxY = Math.min(height - 1, maxY + pad);
        const source = document.createElement('canvas');
        source.width = width;
        source.height = height;
        source.getContext('2d')!.putImageData(rasterizer.image, 0, 0);
        const out = document.createElement('canvas');
        out.width = (maxX - minX + 1) * scale;
        out.height = (maxY - minY + 1) * scale;
        const ctx = out.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, minX, minY, maxX - minX + 1, maxY - minY + 1, 0, 0, out.width, out.height);
        return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
    }

    function resize(): void {
        if (!container || !canvas) return;
        const width = Math.max(64, Math.floor(container.clientWidth / SCALE));
        const height = Math.max(64, Math.floor(container.clientHeight / SCALE));
        if (rasterizer && rasterizer.width === width && rasterizer.height === height) return;
        canvas.width = width;
        canvas.height = height;
        // Size the canvas to a whole multiple so every rendered pixel is the same size on screen.
        canvas.style.width = `${width * SCALE}px`;
        canvas.style.height = `${height * SCALE}px`;
        rasterizer = new Rasterizer(width, height, palette, textures);
        dirty = true;
    }

    function tick(): void {
        cycle++;
        if (emotePlayer) {
            if (emotePlayer.advance(1, false)) {
                emotePlayer = null;
                emoteName = null;
            }
            dirty = true;
        } else if (idlePlayer && !reducedMotion) {
            idlePlayer.advance(1, true);
            dirty = true;
        }
        // Animated textures (the fire cape's lava) move every cycle.
        if (!reducedMotion && rasterizer && rasterizer.textures.size > 0) dirty = true;
    }

    function render(ctx: CanvasRenderingContext2D): void {
        if (!rasterizer || !model || !idlePlayer) return;
        model.pose(emotePlayer ? emotePlayer.current : idlePlayer.current);
        rasterizer.cycle = reducedMotion ? 0 : cycle;
        rasterizer.clear();
        rasterizer.draw(model, camera(rasterizer.width, rasterizer.height));
        ctx.putImageData(rasterizer.image, 0, 0);
        dirty = false;
    }

    // Dragging
    let dragging = false;
    let lastX = 0;
    function onPointerDown(event: PointerEvent): void {
        dragging = true;
        lastX = event.clientX;
        canvas?.setPointerCapture(event.pointerId);
    }
    function onPointerMove(event: PointerEvent): void {
        if (!dragging) return;
        yaw = (yaw - Math.round((event.clientX - lastX) * DRAG_SPEED)) & 2047;
        lastX = event.clientX;
        dirty = true;
    }
    function onPointerUp(event: PointerEvent): void {
        dragging = false;
        canvas?.releasePointerCapture(event.pointerId);
    }
    function onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'ArrowLeft') yaw = (yaw + KEY_STEP) & 2047;
        else if (event.key === 'ArrowRight') yaw = (yaw - KEY_STEP) & 2047;
        else return;
        event.preventDefault();
        dirty = true;
    }

    onMount(() => {
        reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const ctx = canvas!.getContext('2d')!;
        resize();
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container!);

        let visible = true;
        let frame = 0;
        let last = performance.now();
        let carry = 0;
        const loop = (now: number) => {
            carry += Math.min(now - last, 1000);
            last = now;
            while (carry >= CYCLE_MS) {
                carry -= CYCLE_MS;
                tick();
            }
            if (dirty) render(ctx);
            frame = visible ? requestAnimationFrame(loop) : 0;
        };
        const intersection = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible && !frame) {
                last = performance.now();
                frame = requestAnimationFrame(loop);
            }
        });
        intersection.observe(container!);
        frame = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            intersection.disconnect();
        };
    });
</script>

<div
    bind:this={container}
    class="relative flex items-center justify-center overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary {className}"
    tabindex="0"
    role="slider"
    aria-label="Your outfit in 3D. Drag, or use the left and right arrow keys, to turn the character."
    aria-valuemin={0}
    aria-valuemax={359}
    aria-valuenow={facing}
    aria-valuetext="Turned {facing} degrees"
    onkeydown={onKeyDown}
>
    <canvas
        bind:this={canvas}
        aria-hidden="true"
        class="cursor-grab touch-pan-y [image-rendering:pixelated] active:cursor-grabbing"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
    ></canvas>
    {#if emoteName}
        <span class="sr-only" aria-live="polite">Playing the {emoteName} emote</span>
    {/if}
</div>
