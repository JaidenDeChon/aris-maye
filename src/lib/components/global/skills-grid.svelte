<script lang="ts">
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
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
    <div>
        <Label class="capitalize text-xs" for={`${prefix}agility`}>agility</Label>
        <Input
            id={`${prefix}agility`}
            type="number"
            value={skillLevels.agility}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('agility', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}attack`}>attack</Label>
        <Input
            id={`${prefix}attack`}
            type="number"
            value={skillLevels.attack}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('attack', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}construction`}>construction</Label>
        <Input
            id={`${prefix}construction`}
            type="number"
            value={skillLevels.construction}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('construction', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}cooking`}>cooking</Label>
        <Input
            id={`${prefix}cooking`}
            type="number"
            value={skillLevels.cooking}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('cooking', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}crafting`}>crafting</Label>
        <Input
            id={`${prefix}crafting`}
            type="number"
            value={skillLevels.crafting}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('crafting', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}defence`}>defence</Label>
        <Input
            id={`${prefix}defence`}
            type="number"
            value={skillLevels.defence}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('defence', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}farming`}>farming</Label>
        <Input
            id={`${prefix}farming`}
            type="number"
            value={skillLevels.farming}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('farming', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}firemaking`}>firemaking</Label>
        <Input
            id={`${prefix}firemaking`}
            type="number"
            value={skillLevels.firemaking}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('firemaking', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}fishing`}>fishing</Label>
        <Input
            id={`${prefix}fishing`}
            type="number"
            value={skillLevels.fishing}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('fishing', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}fletching`}>fletching</Label>
        <Input
            id={`${prefix}fletching`}
            type="number"
            value={skillLevels.fletching}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('fletching', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}herblore`}>herblore</Label>
        <Input
            id={`${prefix}herblore`}
            type="number"
            value={skillLevels.herblore}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('herblore', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}hitpoints`}>hitpoints</Label>
        <Input
            id={`${prefix}hitpoints`}
            type="number"
            value={skillLevels.hitpoints}
            min={10}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('hitpoints', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}hunter`}>hunter</Label>
        <Input
            id={`${prefix}hunter`}
            type="number"
            value={skillLevels.hunter}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('hunter', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}magic`}>magic</Label>
        <Input
            id={`${prefix}magic`}
            type="number"
            value={skillLevels.magic}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('magic', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}mining`}>mining</Label>
        <Input
            id={`${prefix}mining`}
            type="number"
            value={skillLevels.mining}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('mining', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}prayer`}>prayer</Label>
        <Input
            id={`${prefix}prayer`}
            type="number"
            value={skillLevels.prayer}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('prayer', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}ranged`}>ranged</Label>
        <Input
            id={`${prefix}ranged`}
            type="number"
            value={skillLevels.ranged}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('ranged', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}runecrafting`}>runecrafting</Label>
        <Input
            id={`${prefix}runecrafting`}
            type="number"
            value={skillLevels.runecrafting}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('runecrafting', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}slayer`}>slayer</Label>
        <Input
            id={`${prefix}slayer`}
            type="number"
            value={skillLevels.slayer}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('slayer', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}smithing`}>smithing</Label>
        <Input
            id={`${prefix}smithing`}
            type="number"
            value={skillLevels.smithing}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('smithing', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}strength`}>strength</Label>
        <Input
            id={`${prefix}strength`}
            type="number"
            value={skillLevels.strength}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('strength', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}thieving`}>thieving</Label>
        <Input
            id={`${prefix}thieving`}
            type="number"
            value={skillLevels.thieving}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('thieving', event)}
        />
    </div>
    <div>
        <Label class="capitalize text-xs" for={`${prefix}woodcutting`}>woodcutting</Label>
        <Input
            id={`${prefix}woodcutting`}
            type="number"
            value={skillLevels.woodcutting}
            min={1}
            max="99"
            inputmode="numeric"
            oninput={(event) => handleInput('woodcutting', event)}
        />
    </div>
</div>
