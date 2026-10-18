<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { replaceState } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import CalculatorItemCell from '$lib/components/calculators/calculator-item-cell.svelte';
    import GoalInput from '$lib/components/calculators/goal-input.svelte';
    import RelatedCalculators from '$lib/components/calculators/related-calculators.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import GuideSection from '$lib/components/guides/guide-section.svelte';
    import GuideTable from '$lib/components/guides/guide-table.svelte';
    import { Label } from '$lib/components/ui/label';
    import { Switch } from '$lib/components/ui/switch';
    import * as Table from '$lib/components/ui/table';
    import { formatGpPerXp, formatGpShort } from '$lib/helpers/homepage';
    import {
        cheapestUsable,
        currentLevel,
        firstMethodLevel,
        hasGoalStart,
        methodTotals,
        skillGoalParams,
        visibleMethods,
        xpNeeded,
        type GoalPoint,
        type SkillGoal,
    } from '$lib/helpers/skill-calculator';
    import { buildSkillCalculatorSeo } from '$lib/seo/calculator-seo';
    import { getStoreRoot } from '$lib/stores/character-store.svelte';

    const { data } = $props();
    const skill = $derived(data.skill);
    const seo = $derived(buildSkillCalculatorSeo(skill));

    // Seeded from the URL the server read. The routes remount this page on every navigation, so
    // reading it once is enough.
    let goal = $state<SkillGoal>(untrack(() => data.goal));

    const needed = $derived(xpNeeded(goal));
    const level = $derived(currentLevel(goal));
    const best = $derived(cheapestUsable(data.methods, goal));
    const opensAt = $derived(firstMethodLevel(data.methods));
    const bestTotals = $derived(best ? methodTotals(best, goal) : null);
    const rows = $derived(
        visibleMethods(data.methods, goal).map((method) => ({ method, totals: methodTotals(method, goal) })),
    );

    // The address bar follows the goal once the player changes something. A goal filled in from
    // their saved character isn't written, so the link they'd share is the one they arrived on.
    let urlTimer: ReturnType<typeof setTimeout> | undefined;
    function writeUrl() {
        clearTimeout(urlTimer);
        urlTimer = setTimeout(() => {
            const query = skillGoalParams(goal).toString();
            const next = location.pathname + (query ? `?${query}` : '');
            if (next === location.pathname + location.search) return;
            try {
                // The path is the address bar's own, so it's already resolved.
                // eslint-disable-next-line svelte/no-navigation-without-resolve
                replaceState(next, { ...page.state });
            } catch {
                // The router isn't ready yet; the next change writes it.
            }
        }, 250);
    }

    function update(next: Partial<SkillGoal>) {
        goal = { ...goal, ...next };
        writeUrl();
    }

    onMount(() => {
        if (hasGoalStart(new URLSearchParams(location.search))) return;
        const store = getStoreRoot();
        const active = store?.characters.find((c) => String(c.id) === String(store.activeCharacter));
        const saved = active?.skillLevels?.[skill.slug];
        if (typeof saved === 'number' && saved > 1) goal = { ...goal, from: { mode: 'level', value: saved } };
        return () => clearTimeout(urlTimer);
    });

    const gp = (value: number) => Math.round(value).toLocaleString('en-US');
</script>

<SeoHead {seo} />

<GuideHeader
    title="{skill.title} calculator"
    answer="How many of each thing to make to reach your {skill.title} goal, and what it costs at today's Grand Exchange prices."
    computedAt={data.computedAt}
/>

<section class="flex min-w-0 flex-col gap-4 rounded-md border bg-muted/20 p-4" aria-label="Your goal">
    <div class="grid gap-4 sm:grid-cols-2">
        <GoalInput id="goal-from" label="Current" point={goal.from} onchange={(from: GoalPoint) => update({ from })} />
        <GoalInput id="goal-to" label="Target" point={goal.to} onchange={(to: GoalPoint) => update({ to })} />
    </div>

    <dl class="grid gap-3 text-sm sm:grid-cols-3" data-testid="calculator-summary">
        <div class="flex flex-col gap-0.5">
            <dt class="text-muted-foreground">XP needed</dt>
            <dd class="text-2xl font-semibold tabular-nums" data-testid="xp-needed">
                {needed.toLocaleString('en-US')}
            </dd>
        </div>
        {#if needed === 0}
            <div class="flex flex-col gap-0.5 sm:col-span-2">
                <dt class="text-muted-foreground">Goal</dt>
                <dd class="text-base font-medium">You're already there. Pick a higher target.</dd>
            </div>
        {:else if best && bestTotals}
            <div class="flex flex-col gap-0.5">
                <dt class="text-muted-foreground">Cheapest at level {level}</dt>
                <dd class="text-base font-medium">
                    {bestTotals.count.toLocaleString('en-US')} × {best.name}
                </dd>
            </div>
            <div class="flex flex-col gap-0.5">
                <dt class="text-muted-foreground">{bestTotals.totalCost < 0 ? 'Pays you' : 'Costs'}</dt>
                <dd class="text-2xl font-semibold tabular-nums {bestTotals.totalCost < 0 ? 'text-emerald-500' : ''}">
                    {gp(Math.abs(bestTotals.totalCost))} gp
                </dd>
            </div>
        {:else}
            <div class="flex flex-col gap-0.5 sm:col-span-2">
                <dt class="text-muted-foreground">Cheapest at level {level}</dt>
                <dd class="text-base font-medium">
                    {opensAt === null
                        ? 'No method has a price right now.'
                        : `Nothing here can be made at level ${level}. The first method opens at level ${opensAt}.`}
                </dd>
            </div>
        {/if}
    </dl>
</section>

<GuideSection
    title="Every {skill.title} method"
    blurb="What you can use now, cheapest XP first, then the rest in the order they unlock. Live Grand Exchange prices, buying the materials and selling what you make. It doesn't count boosts, outfits or how fast each one is."
>
    {#snippet actions()}
        <div class="flex items-center gap-2">
            <Switch
                id="can-use-switch"
                checked={goal.canUseOnly}
                onCheckedChange={(canUseOnly: boolean) => update({ canUseOnly })}
            />
            <Label for="can-use-switch" class="cursor-pointer text-sm select-none">Only methods I can use now</Label>
        </div>
    {/snippet}

    <GuideTable
        rowCount={rows.length}
        empty={data.methods.length
            ? `Nothing can be made at level ${level} yet.`
            : `No ${skill.title} methods have prices right now. Check back after the next hourly update.`}
        caption="Every way to train {skill.title} by making things, with how many you'd need and the cost"
    >
        {#snippet head()}
            <Table.Head>Make</Table.Head>
            <Table.Head class="text-right">Level</Table.Head>
            <Table.Head class="text-right">XP each</Table.Head>
            <Table.Head class="text-right">How many</Table.Head>
            <Table.Head class="text-right">Total cost</Table.Head>
            <Table.Head class="text-right">GP per XP</Table.Head>
        {/snippet}
        {#each rows as { method, totals } (`${method.id}:${method.xp}`)}
            <Table.Row
                class={totals.usable ? '' : 'opacity-60'}
                data-item-id={method.id}
                data-level={method.level}
                data-count={totals.count}
            >
                <Table.Cell><CalculatorItemCell item={method} /></Table.Cell>
                <Table.Cell class="text-right whitespace-nowrap tabular-nums">
                    {#if !totals.usable}
                        <span class="mr-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Needs</span>
                    {/if}
                    {method.level}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">{method.xp.toLocaleString('en-US')}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">{totals.count.toLocaleString('en-US')}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                    {#if totals.count === 0}
                        —
                    {:else if totals.totalCost <= 0}
                        <span class="font-medium text-emerald-500">Pays {formatGpShort(-totals.totalCost)}</span>
                    {:else}
                        {formatGpShort(totals.totalCost)}
                    {/if}
                </Table.Cell>
                <Table.Cell class="text-right font-semibold tabular-nums">
                    {#if method.netCost < 0}
                        <span class="text-emerald-500">+{formatGpPerXp(-method.netCost / method.xp)}</span>
                    {:else}
                        {formatGpPerXp(method.gpPerXp)}
                    {/if}
                </Table.Cell>
            </Table.Row>
        {/each}
    </GuideTable>
</GuideSection>

<p class="text-sm text-muted-foreground">
    Want the short version? See the
    <a href={resolve('/guides/cheapest-xp/[skill=xpSkill]', { skill: skill.slug })} class="underline hover:text-primary"
        >cheapest {skill.title} XP at every level</a
    >.
</p>

<RelatedCalculators current={skill.slug} />
