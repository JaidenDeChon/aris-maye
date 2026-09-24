import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

export type IngredientNodeData = {
    item?: IOsrsboxItemWithMeta;
    itemId?: string | number;
    amount?: number;
    consumedDuringCreation?: boolean;
    depth?: number;
    hasLazyChildren?: boolean;
};

export type IngredientTreeNode = {
    key: string | number;
    data: IngredientNodeData;
    children: IngredientTreeNode[];
    leaf: boolean;
};
