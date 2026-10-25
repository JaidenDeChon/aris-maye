<script lang="ts" module>
    export interface OutfitNameOption {
        name: string;
        kind: 'character' | 'outfit';
    }
</script>

<script lang="ts">
    /**
     * A text field for an outfit's name with a list to pick from: your characters, then the outfits
     * already saved. Anything typed that isn't in the list is a new name.
     */
    import { Check, ChevronDown, Shirt, User } from 'lucide-svelte';

    interface Props {
        value: string;
        options: OutfitNameOption[];
        placeholder?: string;
        disabled?: boolean;
        id: string;
        label: string;
    }

    let { value = $bindable(''), options, placeholder = '', disabled = false, id, label }: Props = $props();

    const listId = `${id}-list`;
    const groups = [
        { kind: 'character', heading: 'Your characters', icon: User },
        { kind: 'outfit', heading: 'Saved outfits', icon: Shirt },
    ] as const;

    let open = $state(false);
    /** Only narrow the list while typing; opening it with the arrow shows everything. */
    let filtering = $state(false);
    let highlighted = $state(-1);
    let input: HTMLInputElement | undefined = $state();

    const shown = $derived.by(() => {
        const query = value.trim().toLowerCase();
        const matching = filtering && query ? options.filter((o) => o.name.toLowerCase().includes(query)) : options;
        // Grouped order, so the arrow keys move through the list as it's drawn.
        return groups.flatMap((g) => matching.filter((o) => o.kind === g.kind));
    });

    function show(narrow: boolean): void {
        if (disabled) return;
        filtering = narrow;
        open = true;
        highlighted = shown.findIndex((o) => o.name.toLowerCase() === value.trim().toLowerCase());
    }

    function choose(option: OutfitNameOption): void {
        value = option.name;
        open = false;
        input?.focus();
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) return show(false);
            if (shown.length === 0) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            highlighted = (highlighted + step + shown.length) % shown.length;
            document.getElementById(`${listId}-${highlighted}`)?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter' && open && shown[highlighted]) {
            // Pick the option rather than submitting the form.
            event.preventDefault();
            choose(shown[highlighted]);
        } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            open = false;
        }
    }
</script>

<div
    class="relative min-w-0 flex-1"
    onfocusout={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
    }}
>
    <input
        bind:this={input}
        {id}
        type="text"
        role="combobox"
        autocomplete="off"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
        maxlength={60}
        {placeholder}
        {disabled}
        bind:value
        class="flex h-10 w-full rounded-md border border-input bg-background py-2 pr-9 pl-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        oninput={() => show(true)}
        onclick={() => !open && show(false)}
        onkeydown={onKeyDown}
    />
    <button
        type="button"
        tabindex="-1"
        class="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        aria-label={open ? 'Hide the list' : 'Show the list'}
        {disabled}
        onclick={() => {
            if (open) open = false;
            else show(false);
            input?.focus();
        }}
    >
        <ChevronDown class="size-4 transition-transform {open ? 'rotate-180' : ''}" />
    </button>

    {#if open && shown.length > 0}
        <ul
            id={listId}
            role="listbox"
            aria-label={label}
            class="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
            {#each groups as group (group.kind)}
                {@const start = shown.findIndex((o) => o.kind === group.kind)}
                {#if start >= 0}
                    <li role="presentation" class="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
                        {group.heading}
                    </li>
                    {#each shown as option, index (option.kind + option.name)}
                        {#if option.kind === group.kind}
                            {@const selected = option.name.toLowerCase() === value.trim().toLowerCase()}
                            <!-- The keyboard drives the options from the text field (aria-activedescendant), so they only need the mouse. -->
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <li
                                id="{listId}-{index}"
                                role="option"
                                aria-selected={selected}
                                class="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm {index ===
                                highlighted
                                    ? 'bg-accent text-accent-foreground'
                                    : ''}"
                                onmousedown={(event) => event.preventDefault()}
                                onmousemove={() => (highlighted = index)}
                                onclick={() => choose(option)}
                            >
                                <group.icon class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span class="min-w-0 flex-1 truncate">{option.name}</span>
                                {#if selected}
                                    <Check class="size-3.5 shrink-0" aria-hidden="true" />
                                {/if}
                            </li>
                        {/if}
                    {/each}
                {/if}
            {/each}
        </ul>
    {/if}
</div>
