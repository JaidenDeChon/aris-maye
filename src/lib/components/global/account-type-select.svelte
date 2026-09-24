<script lang="ts">
    import * as Select from '$lib/components/ui/select';
    import { Label } from '$lib/components/ui/label';
    import { accountTypeOptions, getAccountTypeOption, normalizeAccountType } from '$lib/models/account-type';
    import type { AccountType } from '$lib/models/account-type';

    const {
        value,
        onChange,
        idPrefix = 'account-type',
    } = $props<{
        value?: AccountType | null;
        onChange: (next: AccountType) => void;
        idPrefix?: string;
    }>();

    const selected = $derived(normalizeAccountType(value));
    const selectedOption = $derived(getAccountTypeOption(selected));
    const selectId = $derived(`${idPrefix}-account-type`);

    function handleChange(next: string) {
        onChange(normalizeAccountType(next));
    }
</script>

<div>
    <Label class="capitalize text-xs" for={selectId}>Account type</Label>
    <Select.Root type="single" value={selected} onValueChange={handleChange}>
        <Select.Trigger id={selectId}>{selectedOption.label}</Select.Trigger>
        <Select.Content>
            <Select.Group>
                {#each accountTypeOptions as option (option.value)}
                    <Select.Item value={option.value}>{option.label}</Select.Item>
                {/each}
            </Select.Group>
        </Select.Content>
    </Select.Root>
    <p class="text-muted-foreground mt-1 text-xs">{selectedOption.description}</p>
</div>
