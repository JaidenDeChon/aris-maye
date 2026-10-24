<script lang="ts">
    import { toggleMode } from 'mode-watcher';
    import { Moon, Sun } from 'lucide-svelte';

    /**
     * The light/dark switch for the top bar. Just an icon, so it fits next to the Ironman toggle on a
     * phone. The icon swaps on the `dark` class, so the server renders the right one before hydration.
     */
</script>

<button
    type="button"
    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input bg-background/70 text-foreground transition-colors hover:bg-muted/55"
    title="Toggle theme"
    onclick={toggleMode}
>
    <Sun class="h-[18px] w-[18px] dark:hidden" />
    <Moon class="hidden h-[18px] w-[18px] dark:block" />
    <span class="sr-only">Toggle theme</span>
</button>
