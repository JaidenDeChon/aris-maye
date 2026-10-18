/**
 * Decoders for the few cache definitions the 3D hero needs: identity kits (the bare body parts a
 * player model is built from), models, animation sequences, frames and framemaps (skeletons).
 *
 * Each is a straight port of the matching RuneLite loader in net.runelite.cache.definitions.loaders,
 * trimmed to the fields a flat-shaded, untextured player model uses.
 */
import { Buffer } from './buffer';

export interface KitDefinition {
    id: number;
    bodyPartId: number;
    models: number[];
    recolorToFind: number[];
    recolorToReplace: number[];
    nonSelectable: boolean;
}

export function decodeKit(id: number, data: Uint8Array): KitDefinition {
    const kit: KitDefinition = {
        id,
        bodyPartId: -1,
        models: [],
        recolorToFind: [],
        recolorToReplace: [],
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
                const find = stream.readShort();
                const replace = stream.readShort();
                if (opcode === 40) {
                    kit.recolorToFind.push(find & 0xffff);
                    kit.recolorToReplace.push(replace & 0xffff);
                }
            }
        } else if (opcode >= 60 && opcode < 70) stream.readUnsignedShort();
        else if (opcode >= 70 && opcode < 80) stream.readInt();
        else throw new Error(`Kit ${id}: unknown opcode ${opcode}`);
    }
    return kit;
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
    /** 0 = smooth (gouraud), 1 = flat. Null when every face is smooth. */
    faceRenderTypes: number[] | null;
    faceRenderPriorities: number[] | null;
    priority: number;
    faceTransparencies: number[] | null;
    faceTextures: number[] | null;
    /** The skeleton label (vertex group) each vertex belongs to. */
    vertexLabels: number[] | null;
    /** Per-face labels, used by alpha animations (framemap type 5). */
    faceLabels: number[] | null;
}

function emptyModel(id: number, vertexCount: number, faceCount: number): ModelDefinition {
    return {
        id,
        vertexX: new Array(vertexCount).fill(0),
        vertexY: new Array(vertexCount).fill(0),
        vertexZ: new Array(vertexCount).fill(0),
        faceA: new Array(faceCount).fill(0),
        faceB: new Array(faceCount).fill(0),
        faceC: new Array(faceCount).fill(0),
        faceColors: new Array(faceCount).fill(0),
        faceRenderTypes: null,
        faceRenderPriorities: null,
        priority: 0,
        faceTransparencies: null,
        faceTextures: null,
        vertexLabels: null,
        faceLabels: null,
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
        if (labels) model.vertexLabels![v] = labels.readUnsignedByte();
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

/** Models whose footer ends in -1, -2. Port of ModelLoader.decodeType2. */
function decodeType2(id: number, data: Uint8Array): ModelDefinition {
    const footer = new Buffer(data);
    footer.offset = data.length - 23;
    const vertexCount = footer.readUnsignedShort();
    const faceCount = footer.readUnsignedShort();
    const texFaceCount = footer.readUnsignedByte();
    const hasRenderTypes = footer.readUnsignedByte();
    const priority = footer.readUnsignedByte();
    const hasAlpha = footer.readUnsignedByte();
    const hasFaceLabels = footer.readUnsignedByte();
    const hasVertexLabels = footer.readUnsignedByte();
    const hasAnimaya = footer.readUnsignedByte();
    const xLength = footer.readUnsignedShort();
    const yLength = footer.readUnsignedShort();
    footer.readUnsignedShort(); // z length: the z data is the last block, so nothing is laid out after it
    const indexLength = footer.readUnsignedShort();
    const labelLength = footer.readUnsignedShort();

    let offset = 0;
    const vertexFlagsOffset = offset;
    offset += vertexCount;
    const faceTypesOffset = offset;
    offset += faceCount;
    const priorityOffset = offset;
    if (priority === 255) offset += faceCount;
    const faceLabelsOffset = offset;
    if (hasFaceLabels === 1) offset += faceCount;
    const renderTypesOffset = offset;
    if (hasRenderTypes === 1) offset += faceCount;
    const vertexLabelsOffset = offset;
    offset += labelLength;
    const alphaOffset = offset;
    if (hasAlpha === 1) offset += faceCount;
    const indicesOffset = offset;
    offset += indexLength;
    const colorsOffset = offset;
    offset += faceCount * 2;
    offset += texFaceCount * 6;
    const xOffset = offset;
    offset += xLength;
    const yOffset = offset;
    offset += yLength;
    const zOffset = offset;

    const model = emptyModel(id, vertexCount, faceCount);
    model.priority = priority === 255 ? 0 : priority;
    if (hasVertexLabels === 1) model.vertexLabels = new Array(vertexCount).fill(0);
    if (hasAnimaya === 1) throw new Error(`Model ${id} uses skeletal (animaya) data, which isn't supported`);

    const at = (o: number) => Object.assign(new Buffer(data), { offset: o });
    readVertices(
        model,
        at(vertexFlagsOffset),
        at(xOffset),
        at(yOffset),
        at(zOffset),
        hasVertexLabels === 1 ? at(vertexLabelsOffset) : null,
    );

    const colors = at(colorsOffset);
    const renderTypes = at(renderTypesOffset);
    const priorities = at(priorityOffset);
    const alphas = at(alphaOffset);
    const faceLabels = at(faceLabelsOffset);
    if (hasRenderTypes === 1) model.faceRenderTypes = new Array(faceCount).fill(0);
    if (priority === 255) model.faceRenderPriorities = new Array(faceCount).fill(0);
    if (hasAlpha === 1) model.faceTransparencies = new Array(faceCount).fill(0);
    if (hasFaceLabels === 1) model.faceLabels = new Array(faceCount).fill(0);
    let textured = false;
    for (let f = 0; f < faceCount; f++) {
        model.faceColors[f] = colors.readUnsignedShort();
        if (hasRenderTypes === 1) {
            const flags = renderTypes.readUnsignedByte();
            model.faceRenderTypes![f] = flags & 1;
            if (flags & 2) textured = true;
        }
        if (priority === 255) model.faceRenderPriorities![f] = priorities.readByte();
        if (hasAlpha === 1) model.faceTransparencies![f] = alphas.readByte();
        if (hasFaceLabels === 1) model.faceLabels![f] = faceLabels.readUnsignedByte();
    }
    if (textured) throw new Error(`Model ${id} is textured, which isn't supported`);

    readFaces(model, at(faceTypesOffset), at(indicesOffset));
    return model;
}

/** Models whose footer ends in -1, -3. Port of ModelLoader.decodeType3. */
function decodeType3(id: number, data: Uint8Array): ModelDefinition {
    const footer = new Buffer(data);
    footer.offset = data.length - 26;
    const vertexCount = footer.readUnsignedShort();
    const faceCount = footer.readUnsignedShort();
    const texFaceCount = footer.readUnsignedByte();
    const hasRenderTypes = footer.readUnsignedByte();
    const priority = footer.readUnsignedByte();
    const hasAlpha = footer.readUnsignedByte();
    const hasFaceLabels = footer.readUnsignedByte();
    const hasTextures = footer.readUnsignedByte();
    const hasVertexLabels = footer.readUnsignedByte();
    const hasAnimaya = footer.readUnsignedByte();
    const xLength = footer.readUnsignedShort();
    const yLength = footer.readUnsignedShort();
    footer.readUnsignedShort(); // z length: the z data is the last block, so nothing is laid out after it
    const indexLength = footer.readUnsignedShort();
    const texIndexLength = footer.readUnsignedShort();
    const labelLength = footer.readUnsignedShort();
    if (texFaceCount > 0 || hasTextures === 1) throw new Error(`Model ${id} is textured, which isn't supported`);
    if (hasAnimaya === 1) throw new Error(`Model ${id} uses skeletal (animaya) data, which isn't supported`);

    let offset = texFaceCount + vertexCount;
    const vertexFlagsOffset = texFaceCount;
    const renderTypesOffset = offset;
    if (hasRenderTypes === 1) offset += faceCount;
    const faceTypesOffset = offset;
    offset += faceCount;
    const priorityOffset = offset;
    if (priority === 255) offset += faceCount;
    const faceLabelsOffset = offset;
    if (hasFaceLabels === 1) offset += faceCount;
    const vertexLabelsOffset = offset;
    offset += labelLength;
    const alphaOffset = offset;
    if (hasAlpha === 1) offset += faceCount;
    const indicesOffset = offset;
    offset += indexLength;
    offset += texIndexLength;
    const colorsOffset = offset;
    offset += faceCount * 2;
    const xOffset = offset;
    offset += xLength;
    const yOffset = offset;
    offset += yLength;
    const zOffset = offset;

    const model = emptyModel(id, vertexCount, faceCount);
    model.priority = priority === 255 ? 0 : priority;
    if (hasVertexLabels === 1) model.vertexLabels = new Array(vertexCount).fill(0);

    const at = (o: number) => Object.assign(new Buffer(data), { offset: o });
    readVertices(
        model,
        at(vertexFlagsOffset),
        at(xOffset),
        at(yOffset),
        at(zOffset),
        hasVertexLabels === 1 ? at(vertexLabelsOffset) : null,
    );

    const colors = at(colorsOffset);
    const renderTypes = at(renderTypesOffset);
    const priorities = at(priorityOffset);
    const alphas = at(alphaOffset);
    const faceLabels = at(faceLabelsOffset);
    if (hasRenderTypes === 1) model.faceRenderTypes = new Array(faceCount).fill(0);
    if (priority === 255) model.faceRenderPriorities = new Array(faceCount).fill(0);
    if (hasAlpha === 1) model.faceTransparencies = new Array(faceCount).fill(0);
    if (hasFaceLabels === 1) model.faceLabels = new Array(faceCount).fill(0);
    for (let f = 0; f < faceCount; f++) {
        model.faceColors[f] = colors.readUnsignedShort();
        if (hasRenderTypes === 1) model.faceRenderTypes![f] = renderTypes.readByte();
        if (priority === 255) model.faceRenderPriorities![f] = priorities.readByte();
        if (hasAlpha === 1) model.faceTransparencies![f] = alphas.readByte();
        if (hasFaceLabels === 1) model.faceLabels![f] = faceLabels.readUnsignedByte();
    }

    readFaces(model, at(faceTypesOffset), at(indicesOffset));
    return model;
}

export function decodeModel(id: number, data: Uint8Array): ModelDefinition {
    const last = (data[data.length - 2] << 24) >> 24;
    const marker = (data[data.length - 1] << 24) >> 24;
    if (last === -1 && marker === -3) return decodeType3(id, data);
    if (last === -1 && marker === -2) return decodeType2(id, data);
    throw new Error(`Model ${id} uses a model format this script doesn't decode (footer ${last}, ${marker})`);
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
    const values = new Buffer(data);
    values.offset = 3 + length;
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
