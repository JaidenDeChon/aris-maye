import mongoose, { Schema, Document, Model } from 'mongoose';
import type { GameItemCreationSpecs } from '../osrsbox-db-item';
import type { IOsrsboxItem } from '../osrsbox-db-item';

import type { Types } from 'mongoose';

export interface ItemCreationRequirement {
    skillName?: string; // "Smithing", "Herblore"
    skillLevel?: number; // 63, 99, ...
    experienceAmount?: number; // XP granted for this action
    description: string; // full row text, for safety/debug
}

export interface ItemCreationIngredient {
    consumedDuringCreation: boolean; // true for mats, false for tools
    amount: number; // quantity required
    item: Types.ObjectId; // ref to OsrsboxItem
}

export interface ItemCreationProduct {
    amount: number; // quantity produced
    item: Types.ObjectId; // ref to OsrsboxItem (usually “this” item, but not always)
}

export interface ItemCreationMethod {
    methodName?: string; // e.g. "Needle", "Costume needle", "Spin Flax"
    requiredSkills: ItemCreationRequirement[]; // inferred from wiki requirements
    experienceGranted: ItemCreationRequirement[]; // if you want to separate “gated by” vs “xp in”
    ingredients: ItemCreationIngredient[]; // mats + tools (tools: consumedDuringCreation=false)
    products: ItemCreationProduct[]; // outputs
}

export interface OsrsboxItemDocument extends Omit<Document, 'id'>, IOsrsboxItem {
    highPrice?: number;
    highTime?: number;
    lowPrice?: number;
    lowTime?: number;
    creationSpecs?: GameItemCreationSpecs[];
}

const creationIngredientSchema = new Schema<ItemCreationIngredient>(
    {
        consumedDuringCreation: { type: Boolean, required: true },
        amount: { type: Number, required: true },
        item: {
            type: Schema.Types.ObjectId,
            ref: 'OsrsboxItem',
            required: true,
        },
    },
    { _id: false },
);

const creationExperienceSchema = new Schema(
    {
        skillName: { type: String, required: true },
        experienceAmount: { type: Number, required: true },
    },
    { _id: false },
);

const creationRequiredSkillSchema = new Schema(
    {
        skillName: { type: String, required: true },
        skillLevel: { type: Number, required: true },
    },
    { _id: false },
);

const creationSpecsSchema = new Schema<GameItemCreationSpecs>(
    {
        experienceGranted: { type: [creationExperienceSchema], default: [] },
        requiredSkills: { type: [creationRequiredSkillSchema], default: [] },
        ingredients: { type: [creationIngredientSchema], default: [] },
        treeMinSkills: { type: Schema.Types.Mixed, default: null },
    },
    { _id: false },
);

export const osrsboxItemSchema: Schema<OsrsboxItemDocument> = new Schema(
    {
        id: { type: Number, required: true, unique: true },
        name: { type: String, required: true },
        last_updated: { type: String, required: true },
        incomplete: { type: Boolean, required: true },
        members: { type: Boolean, required: true },
        tradeable: { type: Boolean, required: true },
        tradeable_on_ge: { type: Boolean, required: true },
        stackable: { type: Boolean, required: true },
        stacked: { type: Number, default: null },
        noted: { type: Boolean, required: true },
        noteable: { type: Boolean, required: true },
        linked_id_item: { type: Number, default: null },
        linked_id_noted: { type: Number, default: null },
        linked_id_placeholder: { type: Number, default: null },
        placeholder: { type: Boolean, required: true },
        equipable: { type: Boolean, required: true },
        equipable_by_player: { type: Boolean, required: true },
        equipable_weapon: { type: Boolean, required: true },
        cost: { type: Number, required: true },
        lowalch: { type: Number, default: null },
        highalch: { type: Number, default: null },
        weight: { type: Number, default: null },
        buy_limit: { type: Number, default: null },
        quest_item: { type: Boolean, required: true },
        release_date: { type: String, default: null },
        duplicate: { type: Boolean, required: true },
        examine: { type: String, default: null },
        icon: { type: String, required: true },
        wiki_name: { type: String, default: null },
        wiki_url: { type: String, default: null },
        wiki_page_title: { type: String, default: null },
        wiki_version: { type: String, default: null },
        // Populated by `populate-store-prices`, which scrapes shop pages rather than item
        // pages: the terms live in template parameters the item page never renders.
        storePrices: {
            type: [
                {
                    _id: false,
                    shop: { type: String, required: true },
                    firstPrice: { type: Number, required: true },
                    floorPrice: { type: Number, required: true },
                    dropPerSale: { type: Number, required: true },
                    salesToFloor: { type: Number, default: null },
                    buyPrice: { type: Number, default: null },
                    stock: { type: Number, default: null },
                    currency: { type: String, default: null },
                },
            ],
            default: undefined,
        },
        equipment: { type: Schema.Types.Mixed, default: null },
        weapon: { type: Schema.Types.Mixed, default: null },
        highPrice: { type: Number, required: false },
        highTime: { type: Number, required: false },
        lowPrice: { type: Number, required: false },
        lowTime: { type: Number, required: false },
        creationSpecs: { type: [creationSpecsSchema], default: [] },
    },
    { collection: 'items' },
);

// Covers the browse-page base filter and its highPrice sort so listing queries
// don't collection-scan; the name index serves prefix-anchored search regexes.
osrsboxItemSchema.index({ tradeable_on_ge: 1, placeholder: 1, noted: 1, stacked: 1, highPrice: -1 });
osrsboxItemSchema.index({ name: 1 });

export const OsrsboxItemModel: Model<OsrsboxItemDocument> =
    mongoose.models.OsrsboxItem || mongoose.model<OsrsboxItemDocument>('OsrsboxItem', osrsboxItemSchema);
