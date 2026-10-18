/**
 * The player model behind the 3D homepage hero, and the code that poses it.
 *
 * The data comes from static/hero-model/player.json, which scripts/extract-hero-model.ts builds
 * from the live OSRS cache. Posing follows the client's Model.animate: every frame starts again
 * from the bind pose and applies its transforms in order, using integer maths and the client's
 * 2048-step sine table, so joints creak and snap the way they do in game.
 */

export interface PlayerModelData {
    source: { archive: string; cache: number; build: number; timestamp: string; kits: number[] };
    /** x, y, z per vertex. y points down, as it does in the game. */
    vertices: number[];
    /** The skeleton label each vertex belongs to. */
    labels: number[];
    /** a, b, c vertex indices per face. */
    faces: number[];
    /** Three lit HSL colours per face; a third colour of -1 marks a flat-shaded face. */
    colors: number[];
    framemaps: Record<string, { types: number[]; labels: number[][] }>;
    animations: Record<string, Animation>;
}

export interface Animation {
    /** Client cycles (20ms) per frame. */
    lengths: number[];
    /** [framemap id, slot, dx, dy, dz, slot, dx, dy, dz, ...] per frame. */
    frames: number[][];
}

/** The game's sine and cosine tables: 2048 steps to a full turn, scaled by 65536. */
export const SINE = new Int32Array(2048);
export const COSINE = new Int32Array(2048);
for (let i = 0; i < 2048; i++) {
    SINE[i] = Math.trunc(65536 * Math.sin(i * 0.0030679615));
    COSINE[i] = Math.trunc(65536 * Math.cos(i * 0.0030679615));
}

/** One client cycle, the unit sequence frame lengths are measured in. */
export const CYCLE_MS = 20;

export class PlayerModel {
    readonly vertexCount: number;
    readonly faceCount: number;
    /** The pose being drawn. */
    readonly x: Int32Array;
    readonly y: Int32Array;
    readonly z: Int32Array;
    private readonly baseX: Int32Array;
    private readonly baseY: Int32Array;
    private readonly baseZ: Int32Array;
    /** Vertex indices per skeleton label. */
    private readonly groups: Int32Array[];
    private offsetX = 0;
    private offsetY = 0;
    private offsetZ = 0;

    constructor(readonly data: PlayerModelData) {
        this.vertexCount = data.vertices.length / 3;
        this.faceCount = data.faces.length / 3;
        this.baseX = new Int32Array(this.vertexCount);
        this.baseY = new Int32Array(this.vertexCount);
        this.baseZ = new Int32Array(this.vertexCount);
        for (let v = 0; v < this.vertexCount; v++) {
            this.baseX[v] = data.vertices[v * 3];
            this.baseY[v] = data.vertices[v * 3 + 1];
            this.baseZ[v] = data.vertices[v * 3 + 2];
        }
        this.x = this.baseX.slice();
        this.y = this.baseY.slice();
        this.z = this.baseZ.slice();

        const maxLabel = Math.max(0, ...data.labels);
        const buckets: number[][] = Array.from({ length: maxLabel + 1 }, () => []);
        data.labels.forEach((label, v) => buckets[label].push(v));
        this.groups = buckets.map((b) => Int32Array.from(b));
    }

    /** Puts the model back into its bind pose and applies one animation frame. */
    pose(frame: number[] | null): void {
        this.x.set(this.baseX);
        this.y.set(this.baseY);
        this.z.set(this.baseZ);
        if (!frame) return;
        const framemap = this.data.framemaps[frame[0]];
        for (let i = 1; i < frame.length; i += 4) {
            const slot = frame[i];
            this.transform(framemap.types[slot], framemap.labels[slot], frame[i + 1], frame[i + 2], frame[i + 3]);
        }
    }

    /** Port of Model.animate (RuneLite's ModelDefinition.animate). */
    private transform(type: number, labels: number[], dx: number, dy: number, dz: number): void {
        const { x, y, z, groups } = this;
        if (type === 0) {
            let count = 0;
            let sx = 0;
            let sy = 0;
            let sz = 0;
            for (const label of labels) {
                const group = groups[label];
                if (!group) continue;
                for (let i = 0; i < group.length; i++) {
                    const v = group[i];
                    sx += x[v];
                    sy += y[v];
                    sz += z[v];
                    count++;
                }
            }
            if (count > 0) {
                this.offsetX = dx + Math.trunc(sx / count);
                this.offsetY = dy + Math.trunc(sy / count);
                this.offsetZ = dz + Math.trunc(sz / count);
            } else {
                this.offsetX = dx;
                this.offsetY = dy;
                this.offsetZ = dz;
            }
            return;
        }

        if (type === 1) {
            for (const label of labels) {
                const group = groups[label];
                if (!group) continue;
                for (let i = 0; i < group.length; i++) {
                    const v = group[i];
                    x[v] += dx;
                    y[v] += dy;
                    z[v] += dz;
                }
            }
            return;
        }

        const { offsetX, offsetY, offsetZ } = this;
        if (type === 2) {
            const pitch = (dx & 255) * 8;
            const yaw = (dy & 255) * 8;
            const roll = (dz & 255) * 8;
            for (const label of labels) {
                const group = groups[label];
                if (!group) continue;
                for (let i = 0; i < group.length; i++) {
                    const v = group[i];
                    let vx = x[v] - offsetX;
                    let vy = y[v] - offsetY;
                    let vz = z[v] - offsetZ;
                    if (roll !== 0) {
                        const sin = SINE[roll];
                        const cos = COSINE[roll];
                        const nx = (sin * vy + cos * vx) >> 16;
                        vy = (cos * vy - sin * vx) >> 16;
                        vx = nx;
                    }
                    if (pitch !== 0) {
                        const sin = SINE[pitch];
                        const cos = COSINE[pitch];
                        const ny = (cos * vy - sin * vz) >> 16;
                        vz = (sin * vy + cos * vz) >> 16;
                        vy = ny;
                    }
                    if (yaw !== 0) {
                        const sin = SINE[yaw];
                        const cos = COSINE[yaw];
                        const nx = (sin * vz + cos * vx) >> 16;
                        vz = (cos * vz - sin * vx) >> 16;
                        vx = nx;
                    }
                    x[v] = vx + offsetX;
                    y[v] = vy + offsetY;
                    z[v] = vz + offsetZ;
                }
            }
            return;
        }

        if (type === 3) {
            for (const label of labels) {
                const group = groups[label];
                if (!group) continue;
                for (let i = 0; i < group.length; i++) {
                    const v = group[i];
                    x[v] = Math.trunc(((x[v] - offsetX) * dx) / 128) + offsetX;
                    y[v] = Math.trunc(((y[v] - offsetY) * dy) / 128) + offsetY;
                    z[v] = Math.trunc(((z[v] - offsetZ) * dz) / 128) + offsetZ;
                }
            }
        }
        // Type 5 changes face transparency, which the player body doesn't use.
    }
}

/** Plays one sequence, counting time in whole client cycles the way the client does. */
export class SequencePlayer {
    private frame = 0;
    private cycle = 0;

    constructor(readonly animation: Animation) {}

    /** The frame to draw now. */
    get current(): number[] {
        return this.animation.frames[this.frame];
    }

    /** Moves on by some number of client cycles. Returns true once a non-looping run has finished. */
    advance(cycles: number, loop: boolean): boolean {
        const { lengths } = this.animation;
        this.cycle += cycles;
        while (this.cycle > Math.max(1, lengths[this.frame])) {
            this.cycle -= Math.max(1, lengths[this.frame]);
            this.frame++;
            if (this.frame >= lengths.length) {
                if (!loop) {
                    this.frame = lengths.length - 1;
                    return true;
                }
                this.frame = 0;
            }
        }
        return false;
    }
}
