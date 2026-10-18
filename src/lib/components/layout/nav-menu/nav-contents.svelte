<script lang="ts">
    import { page } from '$app/state';
    import * as Sidebar from '$lib/components/ui/sidebar';
    import { skillTreePages } from '$lib/constants/skill-tree-pages';
    import {
        Home,
        Heart,
        Sword,
        EyeOff,
        User,
        BookOpen,
        TrendingUp,
        Sparkles,
        GraduationCap,
        Shield,
    } from 'lucide-svelte';
    import { favoritesStore } from '$lib/stores/favorites-store';
    import { hiddenStore } from '$lib/stores/hidden-store';
    import { resolve } from '$app/paths';
    import type { GuidePath } from '$lib/constants/guides';

    interface Item {
        title: string;
        url: string;
        // Use if providing an icon with Lucide.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        icon?: any;
        // Use if using a custom image a san icon.
        iconString?: string;
        items?: Item[];
    }

    const primaryMenuItems: Item[] = [
        {
            title: 'Home',
            url: '/',
            icon: Home,
        },
        {
            title: 'Browse items',
            url: '/items',
            icon: Sword,
        },
        {
            title: 'My character',
            url: '/my-character',
            icon: User,
        },
        {
            title: 'Favorites',
            url: '/favorites',
            icon: Heart,
        },
        {
            title: 'Hidden',
            url: '/hidden',
            icon: EyeOff,
        },
    ];

    const skills: Item[] = skillTreePages.map((skill) => ({
        title: skill.title,
        url: `/items/${skill.slug}`,
        iconString: skill.icon,
    }));

    // "All guides" is lit only on the hub itself; the others also cover their sub-pages.
    const guides: { title: string; url: '/guides' | GuidePath; icon: typeof BookOpen; exact?: boolean }[] = [
        { title: 'All guides', url: '/guides', icon: BookOpen, exact: true },
        { title: 'Market report', url: '/guides/market', icon: TrendingUp },
        { title: 'High alch', url: '/guides/high-alch', icon: Sparkles },
        { title: 'Cheapest XP', url: '/guides/cheapest-xp', icon: GraduationCap },
        { title: 'Ironman money', url: '/guides/ironman-money-making', icon: Shield },
    ];

    const currentPath = $derived(page.url.pathname || '');
    const favoritesCount = $derived(($favoritesStore.favorites || []).length);
    const hiddenCount = $derived(($hiddenStore.hidden || []).length);
</script>

{#snippet activeRouteIndicator()}
    <div class="active-route-indicator size-3 bg-foreground ml-auto rounded-full opacity-10"></div>
{/snippet}

<Sidebar.Group>
    <Sidebar.GroupContent>
        <Sidebar.Menu>
            {#each primaryMenuItems as item (item.url)}
                <Sidebar.MenuItem>
                    <Sidebar.MenuButton>
                        {#snippet tooltipContent()}
                            {item.title}
                        {/snippet}
                        {#snippet child({ props })}
                            <a href={resolve(item.url)} {...props}>
                                <item.icon />
                                <span>{item.title}</span>
                                <span class="ml-auto inline-flex items-center gap-2">
                                    {#if currentPath === item.url}
                                        {@render activeRouteIndicator()}
                                    {/if}
                                    {#if item.title === 'Favorites' && favoritesCount > 0}
                                        <span
                                            class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                        >
                                            {favoritesCount}
                                        </span>
                                    {/if}
                                    {#if item.title === 'Hidden' && hiddenCount > 0}
                                        <span
                                            class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                        >
                                            {hiddenCount}
                                        </span>
                                    {/if}
                                </span>
                            </a>
                        {/snippet}
                    </Sidebar.MenuButton>
                </Sidebar.MenuItem>
            {/each}
        </Sidebar.Menu>
    </Sidebar.GroupContent>
</Sidebar.Group>

<Sidebar.Group>
    <Sidebar.GroupLabel>Item trees</Sidebar.GroupLabel>
    <Sidebar.GroupContent>
        <Sidebar.Menu>
            {#each skills as skill (skill.title)}
                <Sidebar.MenuItem>
                    <Sidebar.MenuButton>
                        {#snippet tooltipContent()}
                            {skill.title}
                        {/snippet}
                        {#snippet child({ props })}
                            <a href={resolve(skill.url)} {...props}>
                                {#if skill.icon}
                                    <skill.icon />
                                {:else if skill.iconString}
                                    <img src={skill.iconString} alt="skill icon" class="w-4 h-4" />
                                {/if}
                                <span>{skill.title}</span>
                                {#if currentPath === skill.url || currentPath.startsWith(`${skill.url}/`)}
                                    {@render activeRouteIndicator()}
                                {/if}
                            </a>
                        {/snippet}
                    </Sidebar.MenuButton>
                </Sidebar.MenuItem>
            {/each}
        </Sidebar.Menu>
    </Sidebar.GroupContent>
</Sidebar.Group>

<Sidebar.Group>
    <Sidebar.GroupLabel>Guides</Sidebar.GroupLabel>
    <Sidebar.GroupContent>
        <Sidebar.Menu>
            {#each guides as guide (guide.url)}
                <Sidebar.MenuItem>
                    <Sidebar.MenuButton>
                        {#snippet tooltipContent()}
                            {guide.title}
                        {/snippet}
                        {#snippet child({ props })}
                            <a href={resolve(guide.url)} {...props}>
                                <guide.icon />
                                <span>{guide.title}</span>
                                {#if currentPath === guide.url || (!guide.exact && currentPath.startsWith(`${guide.url}/`))}
                                    {@render activeRouteIndicator()}
                                {/if}
                            </a>
                        {/snippet}
                    </Sidebar.MenuButton>
                </Sidebar.MenuItem>
            {/each}
        </Sidebar.Menu>
    </Sidebar.GroupContent>
</Sidebar.Group>

<style>
    .active-route-indicator {
        view-transition-name: active-route-indicator;
    }
</style>
