/**
 * Decoders for the cache definitions the transmog tool needs: identity kits (the bare body parts a
 * player is built from), items, models, textures and their sprites, animation sequences, frames
 * and framemaps (skeletons).
 *
 * Each is a port of the matching RuneLite loader in net.runelite.cache.definitions.loaders, trimmed
 * to the fields a worn player model uses.
 */
import { Buffer } from './buffer';

export interface KitDefinition {
    id: number;
    bodyPartId: number;
    models: number[];
    recolorToFind: number[];
    recolorToReplace: number[];
    retextureToFind: number[];
    retextureToReplace: number[];
    nonSelectable: boolean;
}

export function decodeKit(id: number, data: Uint8Array): KitDefinition {
    const kit: KitDefinition = {
        id,
        bodyPartId: -1,
        models: [],
        recolorToFind: [],
        recolorToReplace: [],
        retextureToFind: [],
        retextureToReplace: [],
        nonSelectable: false,
    };
    const stream = new Buffer(data);
    for (let opcode = stream.readUnsignedByte(); opcode !== 0; opcode = stream.readUnsignedByte()) {
        if (opcode === 1) kit.bodyPartId = stream.readUnsignedByte();
        else if (opcode === 2 || opcode === 5) {
            const count = stream.readUnsignedByte();
            kit.models = [];
            for (let i = 0; i < count; i++) {
                kit.models.push(opcode === 2 ? stream.readUnsignedShort() : stream.readInt());
            }
        } else if (opcode === 3) kit.nonSelectable = true;
        else if (opcode === 40 || opcode === 41) {
            const count = stream.readUnsignedByte();
            for (let i = 0; i < count; i++) {
                const find = stream.readUnsignedShort();
                const replace = stream.readUnsignedShort();
                if (opcode === 40) {
                    kit.recolorToFind.push(find);
                    kit.recolorToReplace.push(replace);
                } else {
                    kit.retextureToFind.push(find);
                    kit.retextureToReplace.push(replace);
                }
            }
        } else if (opcode >= 60 && opcode < 70) stream.readUnsignedShort();
        else if (opcode >= 70 && opcode < 80) stream.readInt();
        else throw new Error(`Kit ${id}: unknown opcode ${opcode}`);
    }
    return kit;
}

export interface ItemDefinition {
    id: number;
    name: string;
    /** Equipment slot the item goes in, or -1 if it can't be worn. */
    wearPos1: number;
    /** Further equipment slots the item hides (e.g. a full helm hides hair and jaw). */
    wearPos2: number;
    wearPos3: number;
    /** Male and female worn models, -1 when unused. */
    maleModels: [number, number, number];
    femaleModels: [number, number, number];
    /** Vertical offset applied to the first worn model. */
    maleOffset: number;
    femaleOffset: number;
    recolorToFind: number[];
    recolorToReplace: number[];
    retextureToFind: number[];
    retextureToReplace: number[];
    members: boolean;
    tradeable: boolean;
    geTradeable: boolean;
    /** Noted, placeholder and bought (trade-in) copies point at the item they copy. */
    isTemplateCopy: boolean;
}

/** Port of RuneLite's ItemLoader, keeping only what a worn item needs. */
export function decodeItem(id: number, data: Uint8Array): ItemDefinition {
    const item: ItemDefinition = {
        id,
        name: 'null',
        wearPos1: -1,
        wearPos2: -1,
        wearPos3: -1,
        maleModels: [-1, -1, -1],
        femaleModels: [-1, -1, -1],
        maleOffset: 0,
        femaleOffset: 0,
        recolorToFind: [],
        recolorToReplace: [],
        retextureToFind: [],
        retextureToReplace: [],
        members: false,
        tradeable: true,
        geTradeable: false,
        isTemplateCopy: false,
    };
    const s = new Buffer(data);
    for (let op = s.readUnsignedByte(); op !== 0; op = s.readUnsignedByte()) {
        if (op === 1) s.readUnsignedShort();
        else if (op === 2) item.name = s.readString();
        else if (op === 3 || op === 9) s.readString();
        else if (op >= 4 && op <= 8) s.readUnsignedShort();
        else if (op === 11 || op === 160 || op === 251) {
            // stackable, bronzeman
        } else if (op === 12) s.readInt();
        else if (op === 13) item.wearPos1 = s.readByte();
        else if (op === 14) item.wearPos2 = s.readByte();
        else if (op === 15) item.tradeable = false;
        else if (op === 16) item.members = true;
        else if (op === 23) {
            item.maleModels[0] = s.readUnsignedShort();
            item.maleOffset = s.readUnsignedByte();
        } else if (op === 24) item.maleModels[1] = s.readUnsignedShort();
        else if (op === 25) {
            item.femaleModels[0] = s.readUnsignedShort();
            item.femaleOffset = s.readUnsignedByte();
        } else if (op === 26) item.femaleModels[1] = s.readUnsignedShort();
        else if (op === 27) item.wearPos3 = s.readByte();
        else if (op >= 30 && op < 40) s.readString();
        else if (op === 40 || op === 41) {
            const count = s.readUnsignedByte();
            for (let i = 0; i < count; i++) {
                const find = s.readUnsignedShort();
                const replace = s.readUnsignedShort();
                if (op === 40) {
                    item.recolorToFind.push(find);
                    item.recolorToReplace.push(replace);
                } else {
                    item.retextureToFind.push(find);
                    item.retextureToReplace.push(replace);
                }
            }
        } else if (op === 42) s.readByte();
        else if (op === 43) {
            s.readUnsignedByte();
            for (let sub = s.readUnsignedByte(); sub !== 0; sub = s.readUnsignedByte()) s.readString();
        } else if (op === 44) s.readInt();
        else if (op === 45) {
            item.maleModels[0] = s.readInt();
            item.maleOffset = s.readUnsignedByte();
        } else if (op === 46) item.maleModels[1] = s.readInt();
        else if (op === 47) item.maleModels[2] = s.readInt();
        else if (op === 48) {
            item.femaleModels[0] = s.readInt();
            item.femaleOffset = s.readUnsignedByte();
        } else if (op === 49) item.femaleModels[1] = s.readInt();
        else if (op === 50) item.femaleModels[2] = s.readInt();
        else if (op >= 51 && op <= 54) s.readInt();
        else if (op === 65) item.geTradeable = true;
        else if (op === 75) s.readShort();
        else if (op === 78) item.maleModels[2] = s.readUnsignedShort();
        else if (op === 79) item.femaleModels[2] = s.readUnsignedShort();
        else if (op >= 90 && op <= 95) s.readUnsignedShort();
        else if (op === 97 || op === 139 || op === 148) s.readUnsignedShort();
        else if (op === 98 || op === 140 || op === 149) {
            if (s.readUnsignedShort() !== 0xffff) item.isTemplateCopy = true;
        } else if (op === 99) s.readUnsignedShort();
        else if (op >= 100 && op < 110) s.skip(4);
        else if (op >= 110 && op <= 112) s.readUnsignedShort();
        else if (op === 113 || op === 114) s.readByte();
        else if (op === 115) s.readUnsignedByte();
        else if (op === 161) s.skip(s.readUnsignedShort() * 2);
        else if (op === 200) {
            s.skip(2);
            s.readString();
        } else if (op === 201) {
            s.skip(13);
            s.readString();
        } else if (op === 202) {
            s.skip(15);
            s.readString();
        } else if (op === 249) {
            const count = s.readUnsignedByte();
            for (let i = 0; i < count; i++) {
                const type = s.readUnsignedByte();
                s.readUnsignedMedium();
                if (type === 1) s.readString();
                else if (type === 2) s.skip(8);
                else s.readInt();
            }
        } else throw new Error(`Item ${id}: unknown opcode ${op}`);
    }
    return item;
}

export interface ModelDefinition {
    id: number;
    vertexX: number[];
    vertexY: number[];
    vertexZ: number[];
    faceA: number[];
    faceB: number[];
    faceC: number[];
    /** 16-bit Jagex HSL colour per face. */
    faceColors: number[];
    /** Per face: 0 smooth (gouraud), 1 flat, 2 hidden, 3 flat black. */
    faceRenderTypes: number[];
    /** Draw priority per face (0-11). */
    facePriorities: number[];
    /** Transparency per face: 0 opaque to 255 invisible. */
    faceAlphas: number[];
    /** Texture id per face, -1 for a plain coloured face. */
    faceTextures: number[];
    /** Which texture triangle maps each textured face, -1 to map the face onto itself. */
    faceTextureCoords: number[];
    /** Texture-space triangles as vertex indices (P, M, N). */
    texA: number[];
    texB: number[];
    texC: number[];
    /** The skeleton label each vertex belongs to. */
    vertexLabels: number[];
}

function emptyModel(id: number, vertexCount: number, faceCount: number): ModelDefinition {
    const zeros = (n: number) => new Array<number>(n).fill(0);
    return {
        id,
        vertexX: zeros(vertexCount),
        vertexY: zeros(vertexCount),
        vertexZ: zeros(vertexCount),
        faceA: zeros(faceCount),
        faceB: zeros(faceCount),
        faceC: zeros(faceCount),
        faceColors: zeros(faceCount),
        faceRenderTypes: zeros(faceCount),
        facePriorities: zeros(faceCount),
        faceAlphas: zeros(faceCount),
        faceTextures: new Array<number>(faceCount).fill(-1),
        faceTextureCoords: new Array<number>(faceCount).fill(-1),
        texA: [],
        texB: [],
        texC: [],
        vertexLabels: zeros(vertexCount),
    };
}

/** Reads the delta-packed vertex positions shared by every model format. */
function readVertices(
    model: ModelDefinition,
    flags: Buffer,
    xs: Buffer,
    ys: Buffer,
    zs: Buffer,
    labels: Buffer | null,
): void {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let v = 0; v < model.vertexX.length; v++) {
        const flag = flags.readUnsignedByte();
        x += flag & 1 ? xs.readShortSmart() : 0;
        y += flag & 2 ? ys.readShortSmart() : 0;
        z += flag & 4 ? zs.readShortSmart() : 0;
        model.vertexX[v] = x;
        model.vertexY[v] = y;
        model.vertexZ[v] = z;
        if (labels) model.vertexLabels[v] = labels.readUnsignedByte();
    }
}

/** Reads the strip-compressed triangle indices shared by every model format. */
function readFaces(model: ModelDefinition, types: Buffer, indices: Buffer): void {
    let a = 0;
    let b = 0;
    let c = 0;
    let last = 0;
    for (let f = 0; f < model.faceA.length; f++) {
        const type = types.readUnsignedByte();
        if (type === 1) {
            a = indices.readShortSmart() + last;
            b = indices.readShortSmart() + a;
            c = indices.readShortSmart() + b;
            last = c;
        } else if (type === 2) {
            b = c;
            c = indices.readShortSmart() + last;
            last = c;
        } else if (type === 3) {
            a = c;
            c = indices.readShortSmart() + last;
            last = c;
        } else if (type === 4) {
            const swap = a;
            a = b;
            b = swap;
            c = indices.readShortSmart() + last;
            last = c;
        }
        model.faceA[f] = a;
        model.faceB[f] = b;
        model.faceC[f] = c;
    }
}

function at(data: Uint8Array, offset: number): Buffer {
    const buffer = new Buffer(data);
    buffer.offset = offset;
    return buffer;
}

/** Models whose footer ends in -1, -2. Port of ModelLoader.decodeType2. */
function decodeType2(id: number, data: Uint8Array): ModelDefinition {
    const footer = at(data, data.length - 23);
    const vertexCount = footer.readUnsignedShort();
    const faceCount = footer.readUnsignedShort();
    const texCount = footer.readUnsignedByte();
    const hasRenderTypes = footer.readUnsignedByte() === 1;
    const priority = footer.readUnsignedByte();
    const hasAlpha = footer.readUnsignedByte() === 1;
    const hasFaceLabels = footer.readUnsignedByte() === 1;
    const hasVertexLabels = footer.readUnsignedByte() === 1;
    const hasAnimaya = footer.readUnsignedByte() === 1;
    const xLength = footer.readUnsignedShort();
    const yLength = footer.readUnsignedShort();
    footer.readUnsignedShort(); // z length: the z data is the last block, so nothing is laid out after it
    const indexLength = footer.readUnsignedShort();
    const labelLength = footer.readUnsignedShort();
    if (hasAnimaya) throw new Error(`Model ${id} uses skeletal (animaya) data, which isn't supported`);

    let offset = vertexCount;
    const faceTypesOffset = offset;
    offset += faceCount;
    const priorityOffset = offset;
    if (priority === 255) offset += faceCount;
    const faceLabelsOffset = offset;
    if (hasFaceLabels) offset += faceCount;
    const renderTypesOffset = offset;
    if (hasRenderTypes) offset += faceCount;
    const vertexLabelsOffset = offset;
    offset += labelLength;
    const alphaOffset = offset;
    if (hasAlpha) offset += faceCount;
    const indicesOffset = offset;
    offset += indexLength;
    const colorsOffset = offset;
    offset += faceCount * 2;
    const texOffset = offset;
    offset += texCount * 6;
    const xOffset = offset;
    offset += xLength;
    const yOffset = offset;
    offset += yLength;
    const zOffset = offset;

    const model = emptyModel(id, vertexCount, faceCount);
    readVertices(
        model,
        at(data, 0),
        at(data, xOffset),
        at(data, yOffset),
        at(data, zOffset),
        hasVertexLabels ? at(data, vertexLabelsOffset) : null,
    );

    const colors = at(data, colorsOffset);
    const renderTypes = at(data, renderTypesOffset);
    const priorities = at(data, priorityOffset);
    const alphas = at(data, alphaOffset);
    for (let f = 0; f < faceCount; f++) {
        model.faceColors[f] = colors.readUnsignedShort();
        if (hasRenderTypes) {
            const flags = renderTypes.readUnsignedByte();
            model.faceRenderTypes[f] = flags & 1;
            if (flags & 2) {
                // In this format a textured face stores its texture id where the colour would go.
                model.faceTextureCoords[f] = flags >> 2;
                model.faceTextures[f] = model.faceColors[f] === 0xffff ? -1 : model.faceColors[f];
                model.faceColors[f] = 127;
            }
        }
        model.facePriorities[f] = priority === 255 ? priorities.readByte() : priority;
        if (hasAlpha) model.faceAlphas[f] = alphas.readUnsignedByte();
    }
    void faceLabelsOffset;

    readFaces(model, at(data, faceTypesOffset), at(data, indicesOffset));

    const tex = at(data, texOffset);
    for (let t = 0; t < texCount; t++) {
        model.texA.push(tex.readUnsignedShort());
        model.texB.push(tex.readUnsignedShort());
        model.texC.push(tex.readUnsignedShort());
    }
    // A texture triangle that's the face itself is the same as no texture triangle.
    for (let f = 0; f < faceCount; f++) {
        const t = model.faceTextureCoords[f];
        if (t === -1 || model.faceTextures[f] === -1) {
            model.faceTextureCoords[f] = -1;
            continue;
        }
        if (model.faceA[f] === model.texA[t] && model.faceB[f] === model.texB[t] && model.faceC[f] === model.texC[t]) {
            model.faceTextureCoords[f] = -1;
        }
    }
    return model;
}

/** Models whose footer ends in -1, -3. Port of ModelLoader.decodeType3. */
function decodeType3(id: number, data: Uint8Array): ModelDefinition {
    const footer = at(data, data.length - 26);
    const vertexCount = footer.readUnsignedShort();
    const faceCount = footer.readUnsignedShort();
    const texCount = footer.readUnsignedByte();
    const hasRenderTypes = footer.readUnsignedByte() === 1;
    const priority = footer.readUnsignedByte();
    const hasAlpha = footer.readUnsignedByte() === 1;
    const hasFaceLabels = footer.readUnsignedByte() === 1;
    const hasTextures = footer.readUnsignedByte() === 1;
    const hasVertexLabels = footer.readUnsignedByte() === 1;
    const hasAnimaya = footer.readUnsignedByte() === 1;
    const xLength = footer.readUnsignedShort();
    const yLength = footer.readUnsignedShort();
    const zLength = footer.readUnsignedShort();
    const indexLength = footer.readUnsignedShort();
    const texCoordLength = footer.readUnsignedShort();
    const labelLength = footer.readUnsignedShort();
    if (hasAnimaya) throw new Error(`Model ${id} uses skeletal (animaya) data, which isn't supported`);

    const textureRenderTypes: number[] = [];
    for (let t = 0; t < texCount; t++) textureRenderTypes.push(data[t]);

    let offset = texCount + vertexCount;
    const renderTypesOffset = offset;
    if (hasRenderTypes) offset += faceCount;
    const faceTypesOffset = offset;
    offset += faceCount;
    const priorityOffset = offset;
    if (priority === 255) offset += faceCount;
    const faceLabelsOffset = offset;
    if (hasFaceLabels) offset += faceCount;
    const vertexLabelsOffset = offset;
    offset += labelLength;
    const alphaOffset = offset;
    if (hasAlpha) offset += faceCount;
    const indicesOffset = offset;
    offset += indexLength;
    const texturesOffset = offset;
    if (hasTextures) offset += faceCount * 2;
    const texCoordsOffset = offset;
    offset += texCoordLength;
    const colorsOffset = offset;
    offset += faceCount * 2;
    const xOffset = offset;
    offset += xLength;
    const yOffset = offset;
    offset += yLength;
    const zOffset = offset;
    offset += zLength;
    const simpleTexOffset = offset;
    void faceLabelsOffset;

    const model = emptyModel(id, vertexCount, faceCount);
    readVertices(
        model,
        at(data, texCount),
        at(data, xOffset),
        at(data, yOffset),
        at(data, zOffset),
        hasVertexLabels ? at(data, vertexLabelsOffset) : null,
    );

    const colors = at(data, colorsOffset);
    const renderTypes = at(data, renderTypesOffset);
    const priorities = at(data, priorityOffset);
    const alphas = at(data, alphaOffset);
    const textures = at(data, texturesOffset);
    const texCoords = at(data, texCoordsOffset);
    for (let f = 0; f < faceCount; f++) {
        model.faceColors[f] = colors.readUnsignedShort();
        if (hasRenderTypes) model.faceRenderTypes[f] = renderTypes.readByte();
        model.facePriorities[f] = priority === 255 ? priorities.readByte() : priority;
        if (hasAlpha) model.faceAlphas[f] = alphas.readUnsignedByte();
        if (hasTextures) model.faceTextures[f] = textures.readUnsignedShort() - 1;
        if (hasTextures && texCount > 0 && model.faceTextures[f] !== -1) {
            model.faceTextureCoords[f] = texCoords.readUnsignedByte() - 1;
        }
    }

    readFaces(model, at(data, faceTypesOffset), at(data, indicesOffset));

    // Only planar ("simple", type 0) texture triangles carry P, M, N vertices; the cylindrical and
    // spherical mappings are rare on worn items and fall back to mapping the face onto itself.
    const simple = at(data, simpleTexOffset);
    for (let t = 0; t < texCount; t++) {
        if (textureRenderTypes[t] === 0) {
            model.texA.push(simple.readUnsignedShort());
            model.texB.push(simple.readUnsignedShort());
            model.texC.push(simple.readUnsignedShort());
        } else {
            model.texA.push(-1);
            model.texB.push(-1);
            model.texC.push(-1);
        }
    }
    for (let f = 0; f < faceCount; f++) {
        const t = model.faceTextureCoords[f];
        if (t >= 0 && model.texA[t] === -1) model.faceTextureCoords[f] = -1;
    }
    return model;
}

export function decodeModel(id: number, data: Uint8Array): ModelDefinition {
    const last = (data[data.length - 2] << 24) >> 24;
    const marker = (data[data.length - 1] << 24) >> 24;
    if (last === -1 && marker === -3) return decodeType3(id, data);
    if (last === -1 && marker === -2) return decodeType2(id, data);
    throw new Error(`Model ${id} uses a model format this script doesn't decode (footer ${last}, ${marker})`);
}

export interface TextureDefinition {
    id: number;
    /** The sprite group holding the texture's image. */
    spriteId: number;
    /** HSL colour the low-detail client uses in place of the texture. */
    averageColor: number;
    /** 0 none, 1 v-, 2 u-, 3 v+, 4 u+, scrolled at `animationSpeed` 128ths per client cycle. */
    animationDirection: number;
    animationSpeed: number;
}

/** Port of RuneLite's TextureLoader for the rev 233+ layout. */
export function decodeTexture(id: number, data: Uint8Array): TextureDefinition {
    const s = new Buffer(data);
    const spriteId = s.readUnsignedShort();
    const averageColor = s.readUnsignedShort();
    s.readUnsignedByte();
    const animationDirection = s.readUnsignedByte();
    const animationSpeed = s.readUnsignedByte();
    return { id, spriteId, averageColor, animationDirection, animationSpeed };
}

/**
 * Decodes the first frame of a sprite group into ARGB pixels, padded out to the sprite's full
 * size (RuneLite's SpriteLoader plus SpriteDefinition.normalize). Palette index 0 is transparent.
 */
export function decodeSprite(data: Uint8Array): { width: number; height: number; pixels: Uint32Array } {
    const s = at(data, data.length - 2);
    const count = s.readUnsignedShort();
    s.offset = data.length - 7 - count * 8;
    const width = s.readUnsignedShort();
    const height = s.readUnsignedShort();
    const paletteLength = s.readUnsignedByte() + 1;
    const offsetX: number[] = [];
    const offsetY: number[] = [];
    const widths: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < count; i++) offsetX.push(s.readUnsignedShort());
    for (let i = 0; i < count; i++) offsetY.push(s.readUnsignedShort());
    for (let i = 0; i < count; i++) widths.push(s.readUnsignedShort());
    for (let i = 0; i < count; i++) heights.push(s.readUnsignedShort());
    s.offset = data.length - 7 - count * 8 - (paletteLength - 1) * 3;
    const palette = new Uint32Array(paletteLength);
    for (let i = 1; i < paletteLength; i++) {
        palette[i] = s.readUnsignedMedium() || 1;
    }

    // Only the first frame is needed for a texture.
    s.offset = 0;
    const w = widths[0];
    const h = heights[0];
    const indices = new Uint8Array(w * h);
    const flags = s.readUnsignedByte();
    if ((flags & 1) === 0) {
        for (let j = 0; j < w * h; j++) indices[j] = s.readUnsignedByte();
    } else {
        for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) indices[w * y + x] = s.readUnsignedByte();
    }
    const pixels = new Uint32Array(width * height);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const index = indices[y * w + x];
            if (index !== 0) pixels[(y + offsetY[0]) * width + x + offsetX[0]] = (0xff000000 | palette[index]) >>> 0;
        }
    }
    return { width, height, pixels };
}

export interface SequenceDefinition {
    id: number;
    /** Client cycles (20ms each) per frame. */
    frameLengths: number[];
    /** (frame archive << 16) | frame file. */
    frameIds: number[];
    frameStep: number;
    maxLoops: number;
    animMayaId: number;
    debugName: string | null;
}

/** Port of SequenceLoader for the current (rev 226+) layout. */
export function decodeSequence(id: number, data: Uint8Array): SequenceDefinition {
    const seq: SequenceDefinition = {
        id,
        frameLengths: [],
        frameIds: [],
        frameStep: -1,
        maxLoops: 99,
        animMayaId: -1,
        debugName: null,
    };
    const s = new Buffer(data);
    const readSound = () => {
        s.readUnsignedShort();
        s.readUnsignedByte();
        s.readUnsignedByte();
        s.readUnsignedByte();
        s.readUnsignedByte();
    };
    for (let opcode = s.readUnsignedByte(); opcode !== 0; opcode = s.readUnsignedByte()) {
        if (opcode === 1) {
            const count = s.readUnsignedShort();
            for (let i = 0; i < count; i++) seq.frameLengths.push(s.readUnsignedShort());
            for (let i = 0; i < count; i++) seq.frameIds.push(s.readUnsignedShort());
            for (let i = 0; i < count; i++) seq.frameIds[i] += s.readUnsignedShort() << 16;
        } else if (opcode === 2) seq.frameStep = s.readUnsignedShort();
        else if (opcode === 3) s.skip(s.readUnsignedByte());
        else if (opcode === 4) {
            // stretches
        } else if (opcode === 5) s.readUnsignedByte();
        else if (opcode === 6 || opcode === 7) s.readUnsignedShort();
        else if (opcode === 8) seq.maxLoops = s.readUnsignedByte();
        else if (opcode === 9 || opcode === 10 || opcode === 11) s.readUnsignedByte();
        else if (opcode === 12) s.skip(s.readUnsignedByte() * 4);
        else if (opcode === 13) seq.animMayaId = s.readInt();
        else if (opcode === 14) {
            const count = s.readUnsignedShort();
            for (let i = 0; i < count; i++) {
                s.readUnsignedShort();
                readSound();
            }
        } else if (opcode === 15) s.skip(4);
        else if (opcode === 16) s.readByte();
        else if (opcode === 17) s.skip(s.readUnsignedByte());
        else if (opcode === 18) seq.debugName = s.readString();
        else if (opcode === 19) {
            // sounds cross world view
        } else throw new Error(`Sequence ${id}: unknown opcode ${opcode}`);
    }
    return seq;
}

export interface FramemapDefinition {
    id: number;
    /** Transform type per slot: 0 origin, 1 translate, 2 rotate, 3 scale, 5 alpha. */
    types: number[];
    /** The vertex labels each slot moves. */
    labels: number[][];
}

export function decodeFramemap(id: number, data: Uint8Array): FramemapDefinition {
    const s = new Buffer(data);
    const length = s.readUnsignedByte();
    const types: number[] = [];
    const counts: number[] = [];
    for (let i = 0; i < length; i++) types.push(s.readUnsignedByte());
    for (let i = 0; i < length; i++) counts.push(s.readUnsignedByte());
    const labels = counts.map((count) => {
        const slot: number[] = [];
        for (let j = 0; j < count; j++) slot.push(s.readUnsignedByte());
        return slot;
    });
    return { id, types, labels };
}

export interface FrameDefinition {
    framemapId: number;
    /** Framemap slot per transform. */
    slots: number[];
    dx: number[];
    dy: number[];
    dz: number[];
}

export function frameFramemapId(data: Uint8Array): number {
    return (data[0] << 8) | data[1];
}

/** Port of FrameLoader, including the origin transforms it slots in before each rotate/scale. */
export function decodeFrame(framemap: FramemapDefinition, data: Uint8Array): FrameDefinition {
    const attributes = new Buffer(data);
    const framemapId = attributes.readUnsignedShort();
    const length = attributes.readUnsignedByte();
    const values = at(data, 3 + length);
    const frame: FrameDefinition = { framemapId, slots: [], dx: [], dy: [], dz: [] };
    let lastSlot = -1;
    for (let i = 0; i < length; i++) {
        const flags = attributes.readUnsignedByte();
        if (flags <= 0) continue;
        if (framemap.types[i] !== 0) {
            for (let j = i - 1; j > lastSlot; j--) {
                if (framemap.types[j] === 0) {
                    frame.slots.push(j);
                    frame.dx.push(0);
                    frame.dy.push(0);
                    frame.dz.push(0);
                    break;
                }
            }
        }
        const fallback = framemap.types[i] === 3 ? 128 : 0;
        frame.slots.push(i);
        frame.dx.push(flags & 1 ? values.readShortSmart() : fallback);
        frame.dy.push(flags & 2 ? values.readShortSmart() : fallback);
        frame.dz.push(flags & 4 ? values.readShortSmart() : fallback);
        lastSlot = i;
    }
    if (values.offset !== data.length) throw new Error('Frame data was not fully read');
    return frame;
}
