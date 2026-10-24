<script lang="ts">
    /** The male and female symbols, drawn like the lucide icons (this lucide version doesn't have them). */
    import type { Gender } from '$lib/osrs-model/types';

    interface Props {
        gender: Gender;
        class?: string;
    }

    const { gender, class: className = '' }: Props = $props();
</script>

<svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
    aria-hidden="true"
>
    {#if gender === 'male'}
        <path d="M16 3h5v5" />
        <path d="m21 3-6.75 6.75" />
        <circle cx="10" cy="14" r="6" />
    {:else}
        <path d="M12 15v7" />
        <path d="M9 19h6" />
        <circle cx="12" cy="9" r="6" />
    {/if}
</svg>
