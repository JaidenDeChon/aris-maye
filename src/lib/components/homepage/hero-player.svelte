<script lang="ts">
    /**
     * Experimental 3D hero: the default OSRS player, rendered live from the game's own model and
     * emote data (see scripts/extract-hero-model.ts), idling and now and then saying something
     * over his head. Falls back to the static NPC image if the model can't load.
     */
    import { onMount } from 'svelte';
    import { CYCLE_MS, PlayerModel, SequencePlayer, type PlayerModelData } from '$lib/osrs-model/player-model';
    import { createPalette, Rasterizer, type Camera } from '$lib/osrs-model/rasterizer';
    import { OVERHEAD_CYCLES, OverheadText, parseChat, type OverheadMessage } from '$lib/osrs-model/overhead-text';
    import { HERO_CHATTER, type ChatterLine } from '$lib/osrs-model/hero-chatter';

    const { fallbackUrl, class: className = '' }: { fallbackUrl?: string; class?: string } = $props();

    /** Internal resolution; the canvas is scaled up by SCALE without smoothing. */
    const WIDTH = 192;
    const HEIGHT = 208;
    const SCALE = 2;
    /** Turned a little toward the headline while idle, square to the viewer for emotes. */
    const IDLE_YAW = 200;
    const EMOTE_YAW = 0;
    /** The client turns a player 32/2048ths of a circle per cycle. */
    const TURN_SPEED = 32;
    /** Gap between bits, in client cycles (4 to 9 seconds). */
    const MIN_GAP = 200;
    const MAX_GAP = 450;

    let canvas: HTMLCanvasElement | undefined = $state();
    let status: 'loading' | 'ready' | 'failed' = $state('loading');

    onMount(() => {
        let disposed = false;
        let frameHandle = 0;
        let visible = true;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        async function start() {
            const [response] = await Promise.all([
                fetch('/hero-model/player.json'),
                document.fonts?.load('16px RuneScape').catch(() => undefined),
            ]);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as PlayerModelData;
            if (disposed || !canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No 2D canvas');
            const model = new PlayerModel(data);
            const rasterizer = new Rasterizer(WIDTH, HEIGHT, createPalette(0.7), model.vertexCount, model.faceCount);
            const overhead = new OverheadText(WIDTH, HEIGHT);
            const camera: Camera = {
                yaw: IDLE_YAW,
                pitch: 110,
                distance: 1000,
                zoom: 700,
                centerX: WIDTH / 2,
                centerY: 118,
                lift: 95,
            };

            const idle = new SequencePlayer(data.animations.idle);
            let emote: SequencePlayer | null = null;
            let targetYaw = IDLE_YAW;
            let message: OverheadMessage | null = null;
            let messageAge = 0;
            let queue: ChatterLine[] = [];
            let untilNextBit = 60;
            let cycle = 0;
            let lastBit = -1;

            const say = (line: ChatterLine) => {
                const parsed = parseChat(line.say);
                message = reducedMotion ? { ...parsed, effect: 'none', colour: 'yellow' } : parsed;
                messageAge = 0;
                const animation = line.emote ? data.animations[line.emote] : undefined;
                if (animation && !reducedMotion) {
                    emote = new SequencePlayer(animation);
                    targetYaw = EMOTE_YAW;
                }
            };

            const tick = () => {
                cycle++;
                if (emote) {
                    if (emote.advance(1, false)) {
                        emote = null;
                        targetYaw = IDLE_YAW;
                    }
                } else if (!reducedMotion) {
                    idle.advance(1, true);
                }

                const diff = ((targetYaw - camera.yaw + 1024) & 2047) - 1024;
                if (diff !== 0) {
                    camera.yaw = (camera.yaw + Math.sign(diff) * Math.min(TURN_SPEED, Math.abs(diff))) & 2047;
                }

                if (message && ++messageAge >= OVERHEAD_CYCLES) message = null;
                if (!message && queue.length) say(queue.shift()!);
                if (!message && !queue.length && !emote && --untilNextBit <= 0) {
                    let pick = Math.floor(Math.random() * HERO_CHATTER.length);
                    if (pick === lastBit) pick = (pick + 1) % HERO_CHATTER.length;
                    lastBit = pick;
                    queue = [...HERO_CHATTER[pick]];
                    untilNextBit = MIN_GAP + Math.floor(Math.random() * (MAX_GAP - MIN_GAP));
                }
            };

            const render = () => {
                model.pose(emote ? emote.current : idle.current);
                rasterizer.clear();
                rasterizer.draw(model, camera);
                if (message) {
                    overhead.draw(rasterizer.pixels, message, WIDTH / 2, rasterizer.top - 6, messageAge, cycle);
                }
                ctx.putImageData(rasterizer.image, 0, 0);
            };

            let last = performance.now();
            let carry = 0;
            const loop = (now: number) => {
                if (disposed) return;
                carry += Math.min(now - last, 1000);
                last = now;
                let ticked = false;
                while (carry >= CYCLE_MS) {
                    carry -= CYCLE_MS;
                    tick();
                    ticked = true;
                }
                if (ticked) render();
                frameHandle = visible ? requestAnimationFrame(loop) : 0;
            };

            render();
            status = 'ready';
            const observer = new IntersectionObserver(([entry]) => {
                visible = entry.isIntersecting;
                if (visible && !frameHandle && !disposed) {
                    last = performance.now();
                    frameHandle = requestAnimationFrame(loop);
                }
            });
            observer.observe(canvas);
            cleanup.push(() => observer.disconnect());
            frameHandle = requestAnimationFrame(loop);
        }

        const cleanup: (() => void)[] = [];
        start().catch((error) => {
            console.warn('3D hero failed to load, showing the static image instead', error);
            status = 'failed';
        });

        return () => {
            disposed = true;
            cancelAnimationFrame(frameHandle);
            cleanup.forEach((fn) => fn());
        };
    });
</script>

<div class={className} style:width="{WIDTH * SCALE}px" style:height="{HEIGHT * SCALE}px">
    {#if status === 'failed' && fallbackUrl}
        <img src={fallbackUrl} alt="" class="w-64 mx-auto" />
    {:else}
        <canvas
            bind:this={canvas}
            width={WIDTH}
            height={HEIGHT}
            aria-hidden="true"
            class="h-full w-full transition-opacity duration-500 [image-rendering:pixelated]"
            class:opacity-0={status !== 'ready'}
        ></canvas>
    {/if}
    <noscript>
        {#if fallbackUrl}<img src={fallbackUrl} alt="" class="w-64 mx-auto" />{/if}
    </noscript>
</div>
