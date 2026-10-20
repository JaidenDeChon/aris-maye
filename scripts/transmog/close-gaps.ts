/**
 * The default heads and jaws don't quite meet: each pair leaves a small triangle open at the tip of
 * the nose. At the game's resolution that's lost against the scenery, but drawn larger on a plain
 * background it shows as a white fleck. This adds the missing triangles to the jaw model.
 */
import type { ModelFile } from '../../src/lib/osrs-model/types';

type Key = string;

interface Edge {
    from: Key;
    to: Key;
    /** The face the edge belongs to, to copy its look. */
    model: ModelFile;
    face: number;
}

const key = (m: ModelFile, v: number): Key => `${m.v[v * 3]},${m.v[v * 3 + 1]},${m.v[v * 3 + 2]}`;

/**
 * Returns `jaw` with a face added for every triangular gap between it and `head`, wound to face
 * outward and coloured like the face beside it. Gaps of any other shape (like the neck, which the
 * torso covers) are left alone.
 */
export function closeGaps(head: ModelFile, jaw: ModelFile): ModelFile {
    const edges = new Map<string, Edge[]>();
    const label = new Map<Key, number>();
    for (const model of [head, jaw]) {
        for (let v = 0; v < model.l.length; v++) label.set(key(model, v), model.l[v]);
        for (let f = 0; f < model.c.length; f++) {
            const corners = [0, 1, 2].map((i) => key(model, model.f[f * 3 + i]));
            for (let i = 0; i < 3; i++) {
                const from = corners[i];
                const to = corners[(i + 1) % 3];
                const id = [from, to].sort().join('|');
                const list = edges.get(id) ?? [];
                list.push({ from, to, model, face: f });
                edges.set(id, list);
            }
        }
    }

    // Edges only one face uses are the rim of a gap.
    const open = [...edges.values()].filter((list) => list.length === 1).map((list) => list[0]);
    const neighbours = new Map<Key, Set<Key>>();
    for (const { from, to } of open) {
        if (!neighbours.has(from)) neighbours.set(from, new Set());
        if (!neighbours.has(to)) neighbours.set(to, new Set());
        neighbours.get(from)!.add(to);
        neighbours.get(to)!.add(from);
    }

    const out: ModelFile = structuredClone(jaw);
    const done = new Set<string>();
    for (const edge of open) {
        for (const third of neighbours.get(edge.from)!) {
            if (third === edge.to || !neighbours.get(edge.to)!.has(third)) continue;
            const id = [edge.from, edge.to, third].sort().join('|');
            if (done.has(id)) continue;
            done.add(id);
            // The neighbouring face runs from -> to, so the new face runs to -> from to match it.
            addFace(out, [edge.to, edge.from, third], edge, label);
        }
    }
    return out;
}

function addFace(out: ModelFile, corners: Key[], beside: Edge, label: Map<Key, number>): void {
    const indices = corners.map((corner) => {
        const [x, y, z] = corner.split(',').map(Number);
        out.v.push(x, y, z);
        out.l.push(label.get(corner) ?? 0);
        return out.l.length - 1;
    });
    const { model, face } = beside;
    const faceCount = out.c.length;
    out.f.push(...indices);
    out.c.push(model.c[face]);
    out.p.push(model.p[face]);
    const copy = (field: 'r' | 'a', none: number) => {
        const value = model[field]?.[face] ?? none;
        if (!out[field] && value === none) return;
        out[field] ??= new Array(faceCount).fill(none);
        out[field]!.push(value);
    };
    copy('r', 0);
    copy('a', 0);
    // A plain-coloured face: textures would need texture coordinates the gap doesn't have.
    if (out.t) out.t.push(-1);
    if (out.tc) out.tc.push(-1);
}
