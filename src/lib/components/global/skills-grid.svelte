<script lang="ts">
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { SkillNames } from '$lib/constants/enums/skill-names';
    import type { ICharacterProfile } from '$lib/models/player-stats';

    type SkillKey = keyof ICharacterProfile['skillLevels'];

    const {
        skillLevels,
        idPrefix = '',
        onSkillChange = () => {},
    }: {
        skillLevels: ICharacterProfile['skillLevels'];
        idPrefix?: string;
        onSkillChange?: (skill: SkillKey, value: number) => void;
    } = $props();
    const prefix = $derived(idPrefix ? `${idPrefix}-` : '');

    function handleInput(skill: SkillKey, event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const numeric = Number(input.value);
        const nextValue = Number.isFinite(numeric) ? numeric : 0;
        onSkillChange(skill, nextValue);
    }
</script>

<div class="grid grid-cols-3 gap-6">
    {#each Object.values(SkillNames) as skill (skill)}
        <div>
            <Label class="capitalize text-xs" for={`${prefix}${skill}`}>{skill}</Label>
            <Input
                id={`${prefix}${skill}`}
                type="number"
                value={skillLevels[skill]}
                min={skill === SkillNames.HITPOINTS ? 10 : 1}
                max="99"
                inputmode="numeric"
                oninput={(event) => handleInput(skill, event)}
            />
        </div>
    {/each}
</div>
