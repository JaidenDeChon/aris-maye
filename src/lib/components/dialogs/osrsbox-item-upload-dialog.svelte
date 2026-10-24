<script lang="ts">
    /* eslint-disable @typescript-eslint/no-explicit-any */
    import { toast } from 'svelte-sonner';
    import { Upload, Plus, Trash2, FileText, Search, Database } from 'lucide-svelte';
    import * as Dialog from '$lib/components/ui/dialog';
    import { Button, buttonVariants } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Switch } from '$lib/components/ui/switch';
    import { Separator } from '$lib/components/ui/separator';
    import type { Snippet } from 'svelte';

    const OSRS_WIKI_API = 'https://oldschool.runescape.wiki/api.php';

    type CreationSpecForm = {
        experienceGranted: { skillName: string; experienceAmount: string }[];
        requiredSkills: { skillName: string; skillLevel: string }[];
        ingredients: { consumedDuringCreation: boolean; amount: string; itemId: string }[];
    };

    type OsrsboxItemForm = {
        id: string;
        name: string;
        last_updated: string;
        incomplete: boolean;
        members: boolean;
        tradeable: boolean;
        tradeable_on_ge: boolean;
        stackable: boolean;
        stacked: string;
        noted: boolean;
        noteable: boolean;
        linked_id_item: string;
        linked_id_noted: string;
        linked_id_placeholder: string;
        placeholder: boolean;
        equipable: boolean;
        equipable_by_player: boolean;
        equipable_weapon: boolean;
        cost: string;
        lowalch: string;
        highalch: string;
        weight: string;
        buy_limit: string;
        quest_item: boolean;
        release_date: string;
        duplicate: boolean;
        examine: string;
        icon: string;
        wiki_name: string;
        wiki_url: string;
        equipment: string;
        weapon: string;
        creationSpecs: CreationSpecForm[];
        highPrice: string;
        highTime: string;
        lowPrice: string;
        lowTime: string;
    };

    type UploadPayload = {
        id: number;
        name: string;
        last_updated: string;
        incomplete: boolean;
        members: boolean;
        tradeable: boolean;
        tradeable_on_ge: boolean;
        stackable: boolean;
        stacked: number | null;
        noted: boolean;
        noteable: boolean;
        linked_id_item: number | null;
        linked_id_noted: number | null;
        linked_id_placeholder: number | null;
        placeholder: boolean;
        equipable: boolean;
        equipable_by_player: boolean;
        equipable_weapon: boolean;
        cost: number;
        lowalch: number | null;
        highalch: number | null;
        weight: number | null;
        buy_limit: number | null;
        quest_item: boolean;
        release_date: string | null;
        duplicate: boolean;
        examine: string | null;
        icon: string;
        wiki_name: string | null;
        wiki_url: string | null;
        equipment: Record<string, unknown> | null;
        weapon: Record<string, unknown> | null;
        creationSpecs: {
            experienceGranted: { skillName: string; experienceAmount: number }[];
            requiredSkills: { skillName: string; skillLevel: number }[];
            ingredients: { consumedDuringCreation: boolean; amount: number; itemId: string | number }[];
        }[];
        highPrice?: number | null;
        highTime?: number | null;
        lowPrice?: number | null;
        lowTime?: number | null;
    };

    type TriggerSnippet = Snippet<
        [{ openDialog: () => void; openWithItem: (item: Record<string, unknown>) => void; triggerClass: string }]
    >;

    const emptySpec = (): CreationSpecForm => ({
        experienceGranted: [],
        requiredSkills: [],
        ingredients: [],
    });

    const initialForm: OsrsboxItemForm = {
        id: '',
        name: '',
        last_updated: new Date().toISOString(),
        incomplete: false,
        members: false,
        tradeable: false,
        tradeable_on_ge: false,
        stackable: false,
        stacked: '',
        noted: false,
        noteable: false,
        linked_id_item: '',
        linked_id_noted: '',
        linked_id_placeholder: '',
        placeholder: false,
        equipable: false,
        equipable_by_player: false,
        equipable_weapon: false,
        cost: '',
        lowalch: '',
        highalch: '',
        weight: '',
        buy_limit: '',
        quest_item: false,
        release_date: '',
        duplicate: false,
        examine: '',
        icon: '',
        wiki_name: '',
        wiki_url: '',
        equipment: '',
        weapon: '',
        creationSpecs: [emptySpec()],
        highPrice: '',
        highTime: '',
        lowPrice: '',
        lowTime: '',
    };

    function toStringField(value: unknown): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        return String(value);
    }

    function stringifyObjectField(value: unknown): string {
        if (!value) return '';
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch {
            return '';
        }
    }

    function creationSpecsFromDb(specs: unknown): CreationSpecForm[] {
        if (!Array.isArray(specs)) return [];

        return specs
            .map((spec) => {
                const experienceGranted = Array.isArray((spec as any)?.experienceGranted)
                    ? (spec as any).experienceGranted
                          .map((row: any) => ({
                              skillName: row?.skillName ?? '',
                              experienceAmount: toStringField(row?.experienceAmount ?? ''),
                          }))
                          .filter((row: any) => row.skillName || row.experienceAmount)
                    : [];

                const requiredSkills = Array.isArray((spec as any)?.requiredSkills)
                    ? (spec as any).requiredSkills
                          .map((row: any) => ({
                              skillName: row?.skillName ?? '',
                              skillLevel: toStringField(row?.skillLevel ?? ''),
                          }))
                          .filter((row: any) => row.skillName || row.skillLevel)
                    : [];

                const ingredients = Array.isArray((spec as any)?.ingredients)
                    ? (spec as any).ingredients
                          .map((row: any) => ({
                              consumedDuringCreation: Boolean(row?.consumedDuringCreation),
                              amount: toStringField(row?.amount ?? ''),
                              itemId: toStringField(row?.item ?? row?.itemId ?? ''),
                          }))
                          .filter((row: any) => row.itemId)
                    : [];

                if (!experienceGranted.length && !requiredSkills.length && !ingredients.length) {
                    return null;
                }

                return { experienceGranted, requiredSkills, ingredients };
            })
            .filter(Boolean) as CreationSpecForm[];
    }

    function applyDbItemToForm(item: Record<string, unknown>) {
        const mappedSpecs = creationSpecsFromDb(item?.creationSpecs);
        formData = {
            ...formData,
            id: toStringField(item.id ?? formData.id),
            name: (item.name as string) ?? formData.name,
            last_updated: (item.last_updated as string) ?? formData.last_updated,
            incomplete: Boolean(item.incomplete ?? formData.incomplete),
            members: Boolean(item.members ?? formData.members),
            tradeable: Boolean(item.tradeable ?? formData.tradeable),
            tradeable_on_ge: Boolean(item.tradeable_on_ge ?? formData.tradeable_on_ge),
            stackable: Boolean(item.stackable ?? formData.stackable),
            stacked: toStringField(item.stacked ?? formData.stacked),
            noted: Boolean(item.noted ?? formData.noted),
            noteable: Boolean(item.noteable ?? formData.noteable),
            linked_id_item: toStringField(item.linked_id_item ?? formData.linked_id_item),
            linked_id_noted: toStringField(item.linked_id_noted ?? formData.linked_id_noted),
            linked_id_placeholder: toStringField(item.linked_id_placeholder ?? formData.linked_id_placeholder),
            placeholder: Boolean(item.placeholder ?? formData.placeholder),
            equipable: Boolean(item.equipable ?? formData.equipable),
            equipable_by_player: Boolean(item.equipable_by_player ?? formData.equipable_by_player),
            equipable_weapon: Boolean(item.equipable_weapon ?? formData.equipable_weapon),
            cost: toStringField(item.cost ?? formData.cost),
            lowalch: toStringField(item.lowalch ?? formData.lowalch),
            highalch: toStringField(item.highalch ?? formData.highalch),
            weight: toStringField(item.weight ?? formData.weight),
            buy_limit: toStringField(item.buy_limit ?? formData.buy_limit),
            quest_item: Boolean(item.quest_item ?? formData.quest_item),
            release_date: toStringField(item.release_date ?? formData.release_date),
            duplicate: Boolean(item.duplicate ?? formData.duplicate),
            examine: (item.examine as string) ?? formData.examine,
            icon: toStringField(item.icon ?? formData.icon),
            wiki_name: (item.wiki_name as string) ?? formData.wiki_name,
            wiki_url: (item.wiki_url as string) ?? formData.wiki_url,
            equipment: stringifyObjectField(item.equipment ?? formData.equipment),
            weapon: stringifyObjectField(item.weapon ?? formData.weapon),
            creationSpecs: mappedSpecs.length ? mappedSpecs : [emptySpec()],
            highPrice: toStringField(item.highPrice ?? formData.highPrice),
            highTime: toStringField(item.highTime ?? formData.highTime),
            lowPrice: toStringField(item.lowPrice ?? formData.lowPrice),
            lowTime: toStringField(item.lowTime ?? formData.lowTime),
        };

        if (item.icon) {
            iconFileName = 'icon-from-db';
        }

        ingredientNameCache = {};
        selectedSpecIndex = 0;
    }

    let {
        trigger,
        triggerClass = buttonVariants({ variant: 'default' }),
        onCreated = () => {},
    }: { trigger?: TriggerSnippet; triggerClass?: string; onCreated?: () => void } = $props();

    let open = $state(false);
    let isSubmitting = $state(false);
    let isLookupLoading = $state(false);
    let isDbLookupLoading = $state(false);
    const isAnyLookupLoading = $derived(isLookupLoading || isDbLookupLoading);
    let iconFileName = $state('');
    let formData = $state<OsrsboxItemForm>({ ...initialForm });
    let ingredientNameCache = $state<Record<string, string>>({});
    let selectedSpecIndex = $state(0);
    const currentSpec = $derived(formData.creationSpecs[selectedSpecIndex] ?? null);
    const equipmentPlaceholder = '{"attack_stab":0,"attack_slash":0}';
    const weaponPlaceholder = '{"attack_speed":4,"weapon_type":"sword"}';

    function resetForm() {
        formData = structuredClone(initialForm);
        iconFileName = '';
        ingredientNameCache = {};
        isLookupLoading = false;
        isDbLookupLoading = false;
        selectedSpecIndex = 0;
    }

    function openDialogWithItem(item: Record<string, unknown>) {
        applyDbItemToForm(item);
        open = true;
    }

    function cloneSpec(spec: CreationSpecForm): CreationSpecForm {
        return {
            experienceGranted: spec.experienceGranted.map((row) => ({ ...row })),
            requiredSkills: spec.requiredSkills.map((row) => ({ ...row })),
            ingredients: spec.ingredients.map((row) => ({ ...row })),
        };
    }

    function updateSpec(index: number, updater: (spec: CreationSpecForm) => CreationSpecForm) {
        formData = {
            ...formData,
            creationSpecs: formData.creationSpecs.map((spec, i) => (i === index ? updater(cloneSpec(spec)) : spec)),
        };
    }

    function addCreationSpec() {
        const nextSpecs = [...formData.creationSpecs, emptySpec()];
        formData = { ...formData, creationSpecs: nextSpecs };
        selectedSpecIndex = nextSpecs.length - 1;
    }

    function removeCreationSpec(index: number) {
        if (formData.creationSpecs.length === 1) return;
        const nextSpecs = formData.creationSpecs.filter((_, i) => i !== index);
        formData = { ...formData, creationSpecs: nextSpecs };
        selectedSpecIndex = Math.min(selectedSpecIndex, nextSpecs.length - 1);
    }

    function normalizeIngredientKey(value: unknown): string {
        if (value === null || value === undefined) return '';
        return String(value).trim();
    }

    async function resolveIngredientName(rawId: unknown) {
        const key = normalizeIngredientKey(rawId);
        if (!key || ingredientNameCache[key]) return;

        try {
            const resp = await fetch(`/api/osrsbox-items?id=${encodeURIComponent(key)}`);
            if (!resp.ok) {
                ingredientNameCache = { ...ingredientNameCache, [key]: 'Not found' };
                return;
            }
            const item = (await resp.json()) as { name?: string; wiki_name?: string };
            const name = item?.name || item?.wiki_name;
            ingredientNameCache = { ...ingredientNameCache, [key]: name ?? 'Unknown item' };
        } catch (error) {
            console.error('Ingredient name lookup failed', error);
            ingredientNameCache = { ...ingredientNameCache, [key]: 'Lookup failed' };
        }
    }

    $effect(() => {
        for (const spec of formData.creationSpecs) {
            for (const ing of spec.ingredients) {
                const key = normalizeIngredientKey(ing.itemId);
                if (key && !ingredientNameCache[key]) {
                    void resolveIngredientName(key);
                }
            }
        }
    });

    $effect(() => {
        const maxIndex = Math.max(0, formData.creationSpecs.length - 1);
        if (selectedSpecIndex > maxIndex) {
            selectedSpecIndex = maxIndex;
        }
    });

    function addExperience(specIndex: number) {
        updateSpec(specIndex, (spec) => ({
            ...spec,
            experienceGranted: [...spec.experienceGranted, { skillName: '', experienceAmount: '' }],
        }));
    }

    function addRequiredSkill(specIndex: number) {
        updateSpec(specIndex, (spec) => ({
            ...spec,
            requiredSkills: [...spec.requiredSkills, { skillName: '', skillLevel: '' }],
        }));
    }

    function addIngredient(specIndex: number) {
        updateSpec(specIndex, (spec) => ({
            ...spec,
            ingredients: [...spec.ingredients, { consumedDuringCreation: true, amount: '', itemId: '' }],
        }));
    }

    function removeExperience(specIndex: number, expIndex: number) {
        updateSpec(specIndex, (spec) => ({
            ...spec,
            experienceGranted: spec.experienceGranted.filter((_, i) => i !== expIndex),
        }));
    }

    function removeRequiredSkill(specIndex: number, reqIndex: number) {
        updateSpec(specIndex, (spec) => ({
            ...spec,
            requiredSkills: spec.requiredSkills.filter((_, i) => i !== reqIndex),
        }));
    }

    function removeIngredient(specIndex: number, ingIndex: number) {
        updateSpec(specIndex, (spec) => ({
            ...spec,
            ingredients: spec.ingredients.filter((_, i) => i !== ingIndex),
        }));
    }

    function handleIconFileSelect(event: Event) {
        const target = event.target as HTMLInputElement | null;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result?.includes(',') ? result.split(',')[1] : result;
            formData = { ...formData, icon: base64 ?? '' };
            iconFileName = file.name;
        };
        reader.readAsDataURL(file);
    }

    function toNumber(value: string, fieldName: string, required = false): number | null {
        if (value === '' || value === null || value === undefined) {
            if (required) throw new Error(`${fieldName} is required.`);
            return null;
        }

        const num = Number(value);
        if (!Number.isFinite(num)) {
            throw new Error(`"${fieldName}" must be a valid number.`);
        }
        return num;
    }

    function toStringOrNull(value: string): string | null {
        const trimmed = value?.trim();
        return trimmed ? trimmed : null;
    }

    function parseJsonObject(value: string, fieldName: string): Record<string, unknown> | null {
        const trimmed = value.trim();
        if (!trimmed) return null;

        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
            throw new Error('must be an object');
        } catch (error) {
            throw new Error(`Invalid JSON for ${fieldName}${error instanceof Error ? `: ${error.message}` : ''}`);
        }
    }

    /**
     * =========================
     * Wiki helpers
     * =========================
     */

    function cleanText(text: string | null | undefined): string {
        return (text ?? '').replace(/\s+/g, ' ').trim();
    }

    function parseBoolCell(value?: string): boolean | null {
        if (!value) return null;
        const v = value.toLowerCase();
        if (v.includes('yes')) return true;
        if (v.includes('no')) return false;
        if (v.includes('true')) return true;
        if (v.includes('false')) return false;
        return null;
    }

    function parseIntFromCell(value?: string): string | null {
        if (!value) return null;
        const m = value.replace(/,/g, '').match(/-?\d+/);
        return m ? m[0] : null;
    }

    function parseFloatFromCell(value?: string): string | null {
        if (!value) return null;
        const m = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        return m ? m[0] : null;
    }

    function parseReleaseDateToIso(value?: string): string | null {
        if (!value) return null;
        const cleaned = value.split('(')[0].trim(); // drop (Update) etc.
        const m = cleaned.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
        if (!m) return cleaned;

        const day = Number(m[1]);
        const monthName = m[2].toLowerCase();
        const year = m[3];

        const monthMap: Record<string, string> = {
            january: '01',
            february: '02',
            march: '03',
            april: '04',
            may: '05',
            june: '06',
            july: '07',
            august: '08',
            september: '09',
            october: '10',
            november: '11',
            december: '12',
        };

        const mm = monthMap[monthName];
        if (!mm) return cleaned;
        const dd = day.toString().padStart(2, '0');
        return `${year}-${mm}-${dd}`;
    }

    async function fetchWikiHtmlByTitle(title: string): Promise<string> {
        const url = `${OSRS_WIKI_API}?action=parse&format=json&formatversion=2&prop=text&page=${encodeURIComponent(
            title,
        )}&origin=*`;

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Wiki parse failed: ${res.status} ${res.statusText}`);
        }

        const json = (await res.json()) as any;
        const html: string | undefined =
            typeof json?.parse?.text === 'string' ? json.parse.text : json?.parse?.text?.['*'];

        if (!html) throw new Error('No HTML returned from wiki parse.');
        return html;
    }

    function buildInfoboxMap(doc: Document): Record<string, string> {
        const map: Record<string, string> = {};
        const infobox = doc.querySelector('table.infobox-item, table.infobox');
        if (!infobox) return map;

        const rows = Array.from(infobox.querySelectorAll('tr'));
        for (const row of rows) {
            const th = row.querySelector('th');
            const tds = row.querySelectorAll('td');
            if (!th || tds.length === 0) continue;
            const key = cleanText(th.textContent);
            const value = cleanText(tds[tds.length - 1].textContent);
            if (!key || !value) continue;
            map[key.toLowerCase()] = value;
        }

        return map;
    }

    async function fetchIconBase64FromDoc(doc: Document): Promise<{ base64: string; fileName: string } | null> {
        const infobox = doc.querySelector('table.infobox-item, table.infobox');
        if (!infobox) return null;

        const img = infobox.querySelector('td.infobox-image img, .inventory-image img');
        if (!img) return null;

        const src = img.getAttribute('src');
        if (!src) return null;

        const fileName = src.split('/').pop() ?? 'icon.png';
        const url = src.startsWith('http') ? src : `https://oldschool.runescape.wiki${src}`;

        const res = await fetch(url);
        if (!res.ok) return null;

        const blob = await res.blob();
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        return { base64, fileName };
    }

    async function findPageTitleByItemId(idStr: string): Promise<string | null> {
        const id = Number(idStr);
        if (!Number.isFinite(id)) {
            throw new Error('Item ID must be a valid number.');
        }

        // Search for "id = 6675" in the wikitext (Infobox Item uses |id = 6675)
        const query = `insource:"id = ${id}"`;
        const url = `${OSRS_WIKI_API}?action=query&format=json&list=search&srlimit=1&srsearch=${encodeURIComponent(
            query,
        )}&origin=*`;

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Wiki search failed: ${res.status} ${res.statusText}`);
        }

        const json = (await res.json()) as any;
        const first = json?.query?.search?.[0];
        if (!first?.title) return null;
        return first.title as string;
    }

    async function fetchAndApplyWikiData(pageTitle: string) {
        isLookupLoading = true;
        try {
            const html = await fetchWikiHtmlByTitle(pageTitle);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const map = buildInfoboxMap(doc);

            if (Object.keys(map).length === 0) {
                toast.error('No infobox found on this wiki page.');
                return;
            }

            const updates: Partial<OsrsboxItemForm> = {};

            // ID
            const idStr = parseIntFromCell(map['item id'] ?? map['id']);
            if (idStr) {
                updates.id = idStr;
            }

            // Members
            const membersBool = parseBoolCell(map['members']);
            if (membersBool !== null) {
                updates.members = membersBool;
            }

            // Tradeable
            const tradeBool = parseBoolCell(map['tradeable'] ?? map['tradable']);
            if (tradeBool !== null) {
                updates.tradeable = tradeBool;
                // If it's not tradeable, it's definitely not GE-tradeable
                if (tradeBool === false) {
                    updates.tradeable_on_ge = false;
                }
            }

            // Stackable
            const stackBool = parseBoolCell(map['stackable']);
            if (stackBool !== null) {
                updates.stackable = stackBool;
            }

            // Noteable
            const noteBool = parseBoolCell(map['noteable'] ?? map['notable']);
            if (noteBool !== null) {
                updates.noteable = noteBool;
            }

            // Quest item
            const questBool = parseBoolCell(map['quest item']);
            if (questBool !== null) {
                updates.quest_item = questBool;
            }

            // Equipable
            const equipBool = parseBoolCell(map['equipable']);
            if (equipBool !== null) {
                updates.equipable = equipBool;
                updates.equipable_by_player = equipBool;
            }

            // Value → cost
            const valueStr = parseIntFromCell(map['value']);
            if (valueStr && !formData.cost) {
                updates.cost = valueStr;
            }

            // High/low alch
            const highAlchStr = parseIntFromCell(map['high alch'] ?? map['high level alchemy']);
            if (highAlchStr && !formData.highalch) {
                updates.highalch = highAlchStr;
            }

            const lowAlchStr = parseIntFromCell(map['low alch'] ?? map['low level alchemy']);
            if (lowAlchStr && !formData.lowalch) {
                updates.lowalch = lowAlchStr;
            }

            // Weight
            const weightStr = parseFloatFromCell(map['weight']);
            if (weightStr && !formData.weight) {
                updates.weight = weightStr;
            }

            // Release date
            const release = parseReleaseDateToIso(map['released'] ?? map['release'] ?? map['release date']);
            if (release && !formData.release_date) {
                updates.release_date = release;
            }

            // Examine
            const ex = map['examine'];
            if (ex && !formData.examine) {
                // Strip leading/trailing quotes if present
                updates.examine = ex.replace(/^['"]|['"]$/g, '').trim();
            }

            // Wiki name + URL
            if (!formData.wiki_name) {
                updates.wiki_name = pageTitle;
            }
            const wikiUrl = `https://oldschool.runescape.wiki/w/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;
            if (!formData.wiki_url) {
                updates.wiki_url = wikiUrl;
            }

            // Apply updates
            formData = { ...formData, ...updates };

            // Icon (only if not already provided)
            if (!formData.icon) {
                const iconData = await fetchIconBase64FromDoc(doc);
                if (iconData) {
                    formData = { ...formData, icon: iconData.base64 };
                    iconFileName = iconData.fileName;
                }
            }

            toast.success('Loaded item data from OSRS Wiki.');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? `Wiki lookup failed: ${error.message}` : 'Wiki lookup failed.');
        } finally {
            isLookupLoading = false;
        }
    }

    async function handleWikiLookupByName() {
        const title = (formData.wiki_name || formData.name).trim();
        if (!title) {
            toast.error('Enter an item name or wiki name first.');
            return;
        }
        await fetchAndApplyWikiData(title);
    }

    async function handleWikiLookupById() {
        const idStr = formData.id.trim();
        if (!idStr) {
            toast.error('Enter an item ID first.');
            return;
        }
        isLookupLoading = true;
        try {
            const title = await findPageTitleByItemId(idStr);
            if (!title) {
                toast.error('Could not find a wiki page for this item ID.');
                return;
            }
            // Also set wiki_name for convenience
            if (!formData.wiki_name) {
                formData = { ...formData, wiki_name: title };
            }
            await fetchAndApplyWikiData(title);
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? `ID lookup failed: ${error.message}` : 'ID lookup failed.');
        } finally {
            isLookupLoading = false;
        }
    }

    async function handleDbLookupById() {
        const idStr = formData.id.trim();
        if (!idStr) {
            toast.error('Enter an item ID first.');
            return;
        }

        isDbLookupLoading = true;
        try {
            const resp = await fetch(`/api/osrsbox-items?id=${encodeURIComponent(idStr)}`);
            if (!resp.ok) {
                const message = await resp.text();
                throw new Error(message || 'Database lookup failed.');
            }
            const item = (await resp.json()) as Record<string, unknown>;
            applyDbItemToForm(item);
            toast.success('Loaded item from database.');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Database lookup failed.');
        } finally {
            isDbLookupLoading = false;
        }
    }

    async function handleDbLookupByName() {
        const title = (formData.wiki_name || formData.name).trim();
        if (!title) {
            toast.error('Enter an item name or wiki name first.');
            return;
        }

        isDbLookupLoading = true;
        try {
            const resp = await fetch(`/api/osrsbox-items?name=${encodeURIComponent(title)}`);
            if (!resp.ok) {
                const message = await resp.text();
                throw new Error(message || 'Database lookup failed.');
            }
            const item = (await resp.json()) as Record<string, unknown>;
            applyDbItemToForm(item);
            toast.success('Loaded item from database.');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Database lookup failed.');
        } finally {
            isDbLookupLoading = false;
        }
    }

    /**
     * =========================
     * Submit logic
     * =========================
     */

    function buildPayload(): UploadPayload {
        const id = toNumber(formData.id, 'Item ID', true);
        const cost = toNumber(formData.cost, 'Cost', true);
        if (id === null || cost === null) throw new Error('Item ID and cost are required.');
        if (!formData.name.trim()) throw new Error('Name is required.');
        if (!formData.last_updated.trim()) throw new Error('Last updated date is required.');
        if (!formData.icon.trim()) throw new Error('Icon (base64) is required.');

        const creationSpecs = formData.creationSpecs
            .map((spec, specIndex) => {
                const experienceGranted = spec.experienceGranted
                    .map((row, rowIndex) => {
                        if (!row.skillName.trim()) return null;
                        const amount = toNumber(
                            row.experienceAmount,
                            `Spec ${specIndex + 1} experience ${rowIndex + 1}`,
                            true,
                        );
                        return amount === null ? null : { skillName: row.skillName.trim(), experienceAmount: amount };
                    })
                    .filter(Boolean) as UploadPayload['creationSpecs'][number]['experienceGranted'];

                const requiredSkills = spec.requiredSkills
                    .map((row, rowIndex) => {
                        if (!row.skillName.trim()) return null;
                        const level = toNumber(
                            row.skillLevel,
                            `Spec ${specIndex + 1} requirement ${rowIndex + 1}`,
                            true,
                        );
                        return level === null ? null : { skillName: row.skillName.trim(), skillLevel: level };
                    })
                    .filter(Boolean) as UploadPayload['creationSpecs'][number]['requiredSkills'];

                const ingredients = spec.ingredients
                    .map((row, rowIndex) => {
                        if (!row.itemId.trim()) return null;
                        const amount = toNumber(
                            row.amount,
                            `Spec ${specIndex + 1} ingredient ${rowIndex + 1} amount`,
                            true,
                        );
                        if (amount === null) return null;
                        return {
                            consumedDuringCreation: row.consumedDuringCreation,
                            amount,
                            itemId: row.itemId.trim(),
                        };
                    })
                    .filter(Boolean) as UploadPayload['creationSpecs'][number]['ingredients'];

                const hasContent = experienceGranted.length || requiredSkills.length || ingredients.length;
                return hasContent ? { experienceGranted, requiredSkills, ingredients } : null;
            })
            .filter(Boolean) as UploadPayload['creationSpecs'];

        return {
            id,
            name: formData.name.trim(),
            last_updated: formData.last_updated.trim(),
            incomplete: formData.incomplete,
            members: formData.members,
            tradeable: formData.tradeable,
            tradeable_on_ge: formData.tradeable_on_ge,
            stackable: formData.stackable,
            stacked: toNumber(formData.stacked, 'Stacked'),
            noted: formData.noted,
            noteable: formData.noteable,
            linked_id_item: toNumber(formData.linked_id_item, 'Linked item'),
            linked_id_noted: toNumber(formData.linked_id_noted, 'Linked noted'),
            linked_id_placeholder: toNumber(formData.linked_id_placeholder, 'Linked placeholder'),
            placeholder: formData.placeholder,
            equipable: formData.equipable,
            equipable_by_player: formData.equipable_by_player,
            equipable_weapon: formData.equipable_weapon,
            cost,
            lowalch: toNumber(formData.lowalch, 'Low alchemy'),
            highalch: toNumber(formData.highalch, 'High alchemy'),
            weight: toNumber(formData.weight, 'Weight'),
            buy_limit: toNumber(formData.buy_limit, 'Buy limit'),
            quest_item: formData.quest_item,
            release_date: toStringOrNull(formData.release_date),
            duplicate: formData.duplicate,
            examine: toStringOrNull(formData.examine),
            icon: formData.icon.trim(),
            wiki_name: toStringOrNull(formData.wiki_name),
            wiki_url: toStringOrNull(formData.wiki_url),
            equipment: parseJsonObject(formData.equipment, 'Equipment'),
            weapon: parseJsonObject(formData.weapon, 'Weapon'),
            creationSpecs,
            highPrice: toNumber(formData.highPrice, 'High price'),
            highTime: toNumber(formData.highTime, 'High time'),
            lowPrice: toNumber(formData.lowPrice, 'Low price'),
            lowTime: toNumber(formData.lowTime, 'Low time'),
        };
    }

    async function handleSubmit(event: Event) {
        event.preventDefault();
        isSubmitting = true;
        try {
            const payload = buildPayload();
            const resp = await fetch('/api/osrsbox-items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!resp.ok) {
                const message = await resp.text();
                throw new Error(message || 'Failed to upload item.');
            }

            toast.success('OSRSBox item saved.');
            onCreated();
            open = false;
            resetForm();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to upload item.');
            console.error(error);
        } finally {
            isSubmitting = false;
        }
    }
</script>

<Dialog.Root bind:open>
    {#if trigger}
        {@render trigger({
            openDialog: () => (open = true),
            openWithItem: (item) => openDialogWithItem(item),
            triggerClass,
        })}
    {:else}
        <Dialog.Trigger class={triggerClass}>
            <Upload class="size-4" />
            <span class="ml-2">Add or update item</span>
        </Dialog.Trigger>
    {/if}

    <Dialog.Content class="max-w-5xl w-[95vw]">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2">
                <Upload class="size-4" />
                Add or update item
            </Dialog.Title>
            <Dialog.Description>Provide the full OSRSBox schema fields so we can store the item.</Dialog.Description>
        </Dialog.Header>

        <form class="flex flex-col gap-6" onsubmit={handleSubmit}>
            <div class="max-h-[65vh] overflow-y-auto pr-1 space-y-8">
                <section class="space-y-4">
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <Label for="item-id">Item ID *</Label>
                            <div class="flex gap-2">
                                <Input
                                    id="item-id"
                                    required
                                    inputmode="numeric"
                                    type="number"
                                    class="flex-1"
                                    bind:value={formData.id}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onclick={handleWikiLookupById}
                                    disabled={isAnyLookupLoading}
                                    aria-label="Lookup by ID on OSRS Wiki"
                                >
                                    <Search class="size-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onclick={handleDbLookupById}
                                    disabled={isAnyLookupLoading}
                                    aria-label="Load by ID from database"
                                >
                                    <Database class="size-4" />
                                </Button>
                            </div>
                        </div>
                        <div class="md:col-span-2">
                            <Label for="item-name">Name *</Label>
                            <div class="flex gap-2">
                                <Input id="item-name" required class="flex-1" bind:value={formData.name} />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onclick={handleWikiLookupByName}
                                    disabled={isAnyLookupLoading}
                                    aria-label="Lookup by name on OSRS Wiki"
                                >
                                    <Search class="size-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onclick={handleDbLookupByName}
                                    disabled={isAnyLookupLoading}
                                    aria-label="Load by name from database"
                                >
                                    <Database class="size-4" />
                                </Button>
                            </div>
                        </div>
                        <div>
                            <Label for="last-updated">Last updated *</Label>
                            <Input id="last-updated" type="text" bind:value={formData.last_updated} />
                            <p class="text-[11px] text-muted-foreground mt-1">Defaults to now; keep ISO format.</p>
                        </div>
                        <div>
                            <Label for="release-date">Release date</Label>
                            <Input
                                id="release-date"
                                type="text"
                                placeholder="YYYY-MM-DD"
                                bind:value={formData.release_date}
                            />
                        </div>
                        <div>
                            <Label for="cost">Cost *</Label>
                            <Input id="cost" type="number" inputmode="numeric" required bind:value={formData.cost} />
                        </div>
                        <div>
                            <Label for="lowalch">Low alchemy</Label>
                            <Input id="lowalch" type="number" inputmode="numeric" bind:value={formData.lowalch} />
                        </div>
                        <div>
                            <Label for="highalch">High alchemy</Label>
                            <Input id="highalch" type="number" inputmode="numeric" bind:value={formData.highalch} />
                        </div>
                        <div>
                            <Label for="weight">Weight (kg)</Label>
                            <Input
                                id="weight"
                                type="number"
                                step="0.001"
                                inputmode="decimal"
                                bind:value={formData.weight}
                            />
                        </div>
                        <div>
                            <Label for="buy-limit">Buy limit</Label>
                            <Input id="buy-limit" type="number" inputmode="numeric" bind:value={formData.buy_limit} />
                        </div>
                        <div>
                            <Label for="stacked">Stacked amount</Label>
                            <Input id="stacked" type="number" inputmode="numeric" bind:value={formData.stacked} />
                        </div>
                        <div>
                            <Label for="linked-item">Linked item ID</Label>
                            <Input
                                id="linked-item"
                                type="number"
                                inputmode="numeric"
                                bind:value={formData.linked_id_item}
                            />
                        </div>
                        <div>
                            <Label for="linked-noted">Linked noted ID</Label>
                            <Input
                                id="linked-noted"
                                type="number"
                                inputmode="numeric"
                                bind:value={formData.linked_id_noted}
                            />
                        </div>
                        <div>
                            <Label for="linked-placeholder">Linked placeholder ID</Label>
                            <Input
                                id="linked-placeholder"
                                type="number"
                                inputmode="numeric"
                                bind:value={formData.linked_id_placeholder}
                            />
                        </div>
                        <div>
                            <Label for="wiki-name">Wiki name</Label>
                            <Input id="wiki-name" bind:value={formData.wiki_name} />
                        </div>
                        <div>
                            <Label for="wiki-url">Wiki URL</Label>
                            <Input id="wiki-url" bind:value={formData.wiki_url} />
                        </div>
                        <div class="md:col-span-3">
                            <Label for="examine">Examine</Label>
                            <textarea
                                id="examine"
                                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                rows="2"
                                bind:value={formData.examine}
                            ></textarea>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div class="flex items-center gap-2">
                            <Switch id="incomplete" bind:checked={formData.incomplete} />
                            <Label for="incomplete" class="text-sm">Incomplete</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="members" bind:checked={formData.members} />
                            <Label for="members" class="text-sm">Members</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="tradeable" bind:checked={formData.tradeable} />
                            <Label for="tradeable" class="text-sm">Tradeable</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="tradeable-ge" bind:checked={formData.tradeable_on_ge} />
                            <Label for="tradeable-ge" class="text-sm">GE tradeable</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="stackable" bind:checked={formData.stackable} />
                            <Label for="stackable" class="text-sm">Stackable</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="noted" bind:checked={formData.noted} />
                            <Label for="noted" class="text-sm">Noted</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="noteable" bind:checked={formData.noteable} />
                            <Label for="noteable" class="text-sm">Noteable</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="placeholder" bind:checked={formData.placeholder} />
                            <Label for="placeholder" class="text-sm">Placeholder</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="equipable" bind:checked={formData.equipable} />
                            <Label for="equipable" class="text-sm">Equipable</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="equipable-player" bind:checked={formData.equipable_by_player} />
                            <Label for="equipable-player" class="text-sm">Equipable by player</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="equipable-weapon" bind:checked={formData.equipable_weapon} />
                            <Label for="equipable-weapon" class="text-sm">Equipable weapon</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="quest-item" bind:checked={formData.quest_item} />
                            <Label for="quest-item" class="text-sm">Quest item</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Switch id="duplicate" bind:checked={formData.duplicate} />
                            <Label for="duplicate" class="text-sm">Duplicate</Label>
                        </div>
                    </div>
                </section>

                <Separator />

                <section class="space-y-4">
                    <div class="flex flex-wrap items-center gap-2">
                        <Label class="text-base font-semibold">Icon *</Label>
                        {#if iconFileName}
                            <span class="text-xs text-muted-foreground">Loaded from {iconFileName}</span>
                        {/if}
                    </div>
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-3 items-start">
                        <div class="space-y-2">
                            <Input type="file" accept="image/*" onchange={handleIconFileSelect} />
                            <p class="text-[11px] text-muted-foreground">
                                File will be converted to base64 for storage.
                            </p>
                        </div>
                        <div class="space-y-2">
                            <Label for="icon-base64">Or paste base64</Label>
                            <textarea
                                id="icon-base64"
                                class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                                rows="4"
                                bind:value={formData.icon}
                            ></textarea>
                        </div>
                        <div class="space-y-2">
                            <Label>Preview</Label>
                            {#if formData.icon?.trim()}
                                <div class="flex items-center gap-2">
                                    <img
                                        src={`data:image/png;base64,${formData.icon.trim()}`}
                                        alt="Item icon preview"
                                        class="h-12 w-12 object-contain border rounded bg-muted"
                                    />
                                    <span class="text-xs text-muted-foreground break-all">Base64 applied</span>
                                </div>
                            {:else}
                                <p class="text-xs text-muted-foreground">No base64 icon provided yet.</p>
                            {/if}
                        </div>
                    </div>
                </section>

                <Separator />

                <section class="space-y-4">
                    <div class="flex items-center gap-2">
                        <FileText class="size-4 text-muted-foreground" />
                        <div>
                            <p class="text-base font-semibold leading-tight">Equipment & weapon JSON</p>
                            <p class="text-xs text-muted-foreground">
                                Paste JSON blobs straight from the wiki or leave empty.
                            </p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div class="space-y-2">
                            <Label for="equipment-json">Equipment JSON</Label>
                            <textarea
                                id="equipment-json"
                                class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                                rows="8"
                                placeholder={equipmentPlaceholder}
                                bind:value={formData.equipment}
                            ></textarea>
                        </div>
                        <div class="space-y-2">
                            <Label for="weapon-json">Weapon JSON</Label>
                            <textarea
                                id="weapon-json"
                                class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                                rows="8"
                                placeholder={weaponPlaceholder}
                                bind:value={formData.weapon}
                            ></textarea>
                        </div>
                    </div>
                </section>

                <Separator />

                <section class="space-y-3">
                    <div class="flex items-center justify-between gap-2">
                        <div>
                            <p class="text-base font-semibold">Creation specs</p>
                            <p class="text-xs text-muted-foreground">
                                Add skill requirements, XP, and ingredient references (use OSRS item IDs or Mongo _ids).
                            </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onclick={addCreationSpec}>
                            <Plus class="size-4" />
                            Add spec
                        </Button>
                    </div>

                    <div class="space-y-4">
                        <div class="flex flex-wrap gap-2">
                            {#each formData.creationSpecs, tabIndex (tabIndex)}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={tabIndex === selectedSpecIndex ? 'secondary' : 'ghost'}
                                    disabled={formData.creationSpecs.length === 1}
                                    onclick={() => (selectedSpecIndex = tabIndex)}
                                >
                                    Spec {tabIndex + 1}
                                </Button>
                            {/each}
                        </div>

                        {#if formData.creationSpecs.length}
                            {#if currentSpec}
                                <div class="rounded-lg border bg-muted/40 p-4 space-y-4">
                                    <div class="flex items-center justify-between">
                                        <p class="font-semibold text-sm">Spec {selectedSpecIndex + 1}</p>
                                        {#if formData.creationSpecs.length > 1}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                type="button"
                                                onclick={() => removeCreationSpec(selectedSpecIndex)}
                                            >
                                                <Trash2 class="size-4" />
                                                <span class="sr-only">Remove spec</span>
                                            </Button>
                                        {/if}
                                    </div>

                                    <div class="grid gap-3 md:grid-cols-2">
                                        <div class="space-y-2">
                                            <div class="flex items-center justify-between">
                                                <Label>Experience granted</Label>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    type="button"
                                                    onclick={() => addExperience(selectedSpecIndex)}
                                                >
                                                    <Plus class="size-4" />
                                                    Add row
                                                </Button>
                                            </div>
                                            <div class="space-y-2">
                                                {#if currentSpec.experienceGranted.length === 0}
                                                    <p class="text-xs text-muted-foreground">No XP rows yet.</p>
                                                {/if}
                                                {#each currentSpec.experienceGranted as expRow, expIndex (expIndex)}
                                                    <div class="grid grid-cols-5 gap-2 items-center">
                                                        <Input
                                                            class="col-span-3"
                                                            placeholder="Skill"
                                                            bind:value={expRow.skillName}
                                                        />
                                                        <Input
                                                            class="col-span-2"
                                                            type="number"
                                                            inputmode="decimal"
                                                            bind:value={expRow.experienceAmount}
                                                        />
                                                        <Button
                                                            class="col-span-5 justify-start"
                                                            variant="ghost"
                                                            size="sm"
                                                            type="button"
                                                            onclick={() =>
                                                                removeExperience(selectedSpecIndex, expIndex)}
                                                        >
                                                            <Trash2 class="size-4" />
                                                            Remove
                                                        </Button>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>

                                        <div class="space-y-2">
                                            <div class="flex items-center justify-between">
                                                <Label>Required skills</Label>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    type="button"
                                                    onclick={() => addRequiredSkill(selectedSpecIndex)}
                                                >
                                                    <Plus class="size-4" />
                                                    Add row
                                                </Button>
                                            </div>
                                            <div class="space-y-2">
                                                {#if currentSpec.requiredSkills.length === 0}
                                                    <p class="text-xs text-muted-foreground">No requirements yet.</p>
                                                {/if}
                                                {#each currentSpec.requiredSkills as reqRow, reqIndex (reqIndex)}
                                                    <div class="grid grid-cols-5 gap-2 items-center">
                                                        <Input
                                                            class="col-span-3"
                                                            placeholder="Skill"
                                                            bind:value={reqRow.skillName}
                                                        />
                                                        <Input
                                                            class="col-span-2"
                                                            type="number"
                                                            inputmode="numeric"
                                                            bind:value={reqRow.skillLevel}
                                                        />
                                                        <Button
                                                            class="col-span-5 justify-start"
                                                            variant="ghost"
                                                            size="sm"
                                                            type="button"
                                                            onclick={() =>
                                                                removeRequiredSkill(selectedSpecIndex, reqIndex)}
                                                        >
                                                            <Trash2 class="size-4" />
                                                            Remove
                                                        </Button>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="space-y-2">
                                        <div class="flex items-center justify-between">
                                            <Label>Ingredients</Label>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                type="button"
                                                onclick={() => addIngredient(selectedSpecIndex)}
                                            >
                                                <Plus class="size-4" />
                                                Add ingredient
                                            </Button>
                                        </div>
                                        <div class="space-y-3">
                                            {#if currentSpec.ingredients.length === 0}
                                                <p class="text-xs text-muted-foreground">
                                                    List the item IDs and quantities needed.
                                                </p>
                                            {/if}
                                            {#each currentSpec.ingredients as ingRow, ingIndex (ingIndex)}
                                                <div
                                                    class="grid gap-2 md:grid-cols-12 items-center rounded-md border bg-background/80 p-3"
                                                >
                                                    <div class="md:col-span-5 space-y-1">
                                                        <Label class="text-xs">Item ID or ObjectId</Label>
                                                        <Input
                                                            placeholder="e.g., 946 or 64b9... "
                                                            bind:value={ingRow.itemId}
                                                        />
                                                        {#if normalizeIngredientKey(ingRow.itemId)}
                                                            <p class="text-[11px] text-muted-foreground">
                                                                Resolved: {ingredientNameCache[
                                                                    normalizeIngredientKey(ingRow.itemId)
                                                                ] ?? '…'}
                                                            </p>
                                                        {:else}
                                                            <p class="text-[11px] text-muted-foreground">
                                                                Enter an item id to resolve name
                                                            </p>
                                                        {/if}
                                                    </div>
                                                    <div class="md:col-span-3 space-y-1">
                                                        <Label class="text-xs">Amount</Label>
                                                        <Input
                                                            type="number"
                                                            inputmode="numeric"
                                                            bind:value={ingRow.amount}
                                                        />
                                                    </div>
                                                    <div class="md:col-span-3 space-y-1">
                                                        <Label class="text-xs">Consumed?</Label>
                                                        <div class="flex items-center gap-2">
                                                            <Switch bind:checked={ingRow.consumedDuringCreation} />
                                                            <span class="text-xs text-muted-foreground">
                                                                {ingRow.consumedDuringCreation
                                                                    ? 'Consumed'
                                                                    : 'Retained/tool'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div class="md:col-span-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            type="button"
                                                            onclick={() =>
                                                                removeIngredient(selectedSpecIndex, ingIndex)}
                                                        >
                                                            <Trash2 class="size-4" />
                                                            <span class="sr-only">Remove ingredient</span>
                                                        </Button>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        {/if}
                    </div>
                </section>

                <Separator />

                <section class="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div>
                        <Label for="high-price">Latest high price</Label>
                        <Input id="high-price" type="number" inputmode="numeric" bind:value={formData.highPrice} />
                    </div>
                    <div>
                        <Label for="high-time">High price timestamp</Label>
                        <Input id="high-time" type="number" inputmode="numeric" bind:value={formData.highTime} />
                    </div>
                    <div>
                        <Label for="low-price">Latest low price</Label>
                        <Input id="low-price" type="number" inputmode="numeric" bind:value={formData.lowPrice} />
                    </div>
                    <div>
                        <Label for="low-time">Low price timestamp</Label>
                        <Input id="low-time" type="number" inputmode="numeric" bind:value={formData.lowTime} />
                    </div>
                </section>
            </div>

            <Dialog.Footer class="gap-2">
                <Button type="button" variant="ghost" onclick={resetForm} disabled={isSubmitting || isLookupLoading}>
                    Reset
                </Button>
                <Button type="submit" class="ml-auto" disabled={isSubmitting}>
                    {#if isSubmitting}
                        Saving...
                    {:else}
                        Save item
                    {/if}
                </Button>
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
