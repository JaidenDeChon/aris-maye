<script lang="ts">
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import * as ToggleGroup from '$lib/components/ui/toggle-group';
    import { clampPoint, type GoalPoint } from '$lib/helpers/skill-calculator';
    import { MAX_LEVEL, MAX_XP, levelForXp, xpForLevel } from '$lib/helpers/xp-table';

    /** One end of a skill goal: a level or an exact XP amount, with a switch between the two. */
    interface GoalInputProps {
        id: string;
        label: string;
        point: GoalPoint;
        onchange: (point: GoalPoint) => void;
    }

    const { id, label, point, onchange }: GoalInputProps = $props();

    // What's in the box while typing. A half-typed or empty value doesn't change the goal, and
    // leaving the box puts the goal's own value back.
    let text = $derived(String(point.value));

    function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
        text = event.currentTarget.value;
        const value = Number(text.replaceAll(',', ''));
        if (text.trim() !== '' && Number.isFinite(value)) onchange({ mode: point.mode, value });
    }

    function switchMode(mode: string) {
        if (mode !== 'level' && mode !== 'xp') return;
        if (mode === point.mode) return;
        // Keep the same place in the skill: level 50 becomes 101,333 XP, and back.
        const clamped = clampPoint(point);
        onchange(
            mode === 'xp'
                ? { mode: 'xp', value: xpForLevel(clamped.value) }
                : { mode: 'level', value: levelForXp(clamped.value) },
        );
    }
</script>

<div class="flex min-w-0 flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
        <Label for={id}>{label}</Label>
        <ToggleGroup.Root
            type="single"
            value={point.mode}
            onValueChange={switchMode}
            class="rounded-md border bg-muted/30 p-0.5"
            aria-label="{label} as"
        >
            <ToggleGroup.Item value="level" class="h-7 px-2 text-xs">Level</ToggleGroup.Item>
            <ToggleGroup.Item value="xp" class="h-7 px-2 text-xs">XP</ToggleGroup.Item>
        </ToggleGroup.Root>
    </div>
    <Input
        {id}
        type="number"
        inputmode="numeric"
        min={point.mode === 'level' ? 1 : 0}
        max={point.mode === 'level' ? MAX_LEVEL : MAX_XP}
        value={text}
        oninput={handleInput}
        onblur={() => (text = String(clampPoint(point).value))}
        class="tabular-nums"
    />
</div>
