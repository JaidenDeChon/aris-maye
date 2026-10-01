<script lang="ts">
    import { onMount } from 'svelte';
    import { Shield } from 'lucide-svelte';
    import { Switch } from '$lib/components/ui/switch';
    import { activeIsIronman, setIronmanMode } from '$lib/stores/character-store.svelte';

    /**
     * A shortcut to Ironman mode from the top bar. It flips the same switch every price on the site
     * reads (`activeIsIronman`), without changing the selected character.
     */

    // The mode lives in the browser, so the server renders it off until the page has loaded.
    let mounted = $state(false);
    onMount(() => (mounted = true));
    const ironman = $derived(mounted && activeIsIronman());
</script>

<label
    class="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-background/70 px-3 text-sm text-foreground transition-colors hover:bg-muted/55 lg:ml-auto"
    title="Ironman mode: prices from alching and shops only, nothing from the Grand Exchange"
>
    <Shield class="h-4 w-4 {ironman ? 'text-primary' : 'text-muted-foreground'}" aria-hidden="true" />
    <span class="hidden sm:inline">Ironman</span>
    <Switch
        checked={ironman}
        onCheckedChange={(value) => setIronmanMode(value)}
        aria-label="Ironman mode"
        class="h-5 w-9 [&>span]:size-4 [&>span]:data-[state=checked]:translate-x-4"
    />
</label>
