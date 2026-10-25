<script lang="ts" module>
    interface Turnstile {
        render(container: HTMLElement, options: Record<string, unknown>): string;
        reset(widgetId: string): void;
        remove(widgetId: string): void;
    }

    const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    let scriptLoad: Promise<Turnstile> | null = null;

    /** Loads Cloudflare's Turnstile script once, the first time a widget is shown. */
    function loadTurnstile(): Promise<Turnstile> {
        scriptLoad ??= new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = SCRIPT_URL;
            script.async = true;
            script.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile);
            script.onerror = () => {
                scriptLoad = null;
                script.remove();
                reject(new Error('The verification check could not load.'));
            };
            document.head.append(script);
        });
        return scriptLoad;
    }
</script>

<script lang="ts">
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import { mode } from 'mode-watcher';

    /**
     * Cloudflare Turnstile, the check that a person filled in the feedback form. It's usually
     * invisible, and `token` holds the pass it hands back for `/api/feedback` to verify.
     */
    let { siteKey, token = $bindable('') }: { siteKey: string; token?: string } = $props();

    let container: HTMLDivElement;
    let turnstile: Turnstile | null = null;
    let widgetId: string | null = null;
    let loadError = $state('');

    onMount(() => {
        let destroyed = false;
        loadTurnstile()
            .then((api) => {
                if (destroyed) return;
                turnstile = api;
                widgetId = api.render(container, {
                    sitekey: siteKey,
                    theme: get(mode) === 'dark' ? 'dark' : 'light',
                    callback: (value: string) => (token = value),
                    'expired-callback': () => (token = ''),
                    'error-callback': () => (token = ''),
                });
            })
            .catch((error: Error) => (loadError = error.message));

        return () => {
            destroyed = true;
            if (turnstile && widgetId) turnstile.remove(widgetId);
        };
    });

    /** Gets a fresh token, since the server has used up the last one. */
    export function reset() {
        token = '';
        if (turnstile && widgetId) turnstile.reset(widgetId);
    }
</script>

<div bind:this={container}></div>
{#if loadError}
    <p class="text-xs text-destructive dark:text-red-400">{loadError}</p>
{/if}
