/**
 * Reads groups out of a live Old School RuneScape cache hosted by the OpenRS2 Archive
 * (https://archive.openrs2.org), which serves each JS5 group on its own, so a script only downloads
 * the handful of groups it needs rather than the whole ~190MB cache.
 *
 * Downloads are kept under node_modules/.cache/osrs-cache/<cache id>/ so repeat runs are offline.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Buffer } from './buffer';

const ARCHIVE = 'https://archive.openrs2.org';
const CACHE_DIR = join(import.meta.dir, '..', '..', 'node_modules', '.cache', 'osrs-cache');

interface OpenRs2Cache {
    id: number;
    scope: string;
    game: string;
    environment: string;
    language: string;
    builds: { major: number; minor: number | null }[];
    timestamp: string | null;
}

/** The newest live, English OSRS cache the archive holds. */
export async function latestOsrsCache(): Promise<{ id: number; build: number; timestamp: string }> {
    const response = await fetch(`${ARCHIVE}/caches.json`);
    if (!response.ok) throw new Error(`caches.json: HTTP ${response.status}`);
    const caches = (await response.json()) as OpenRs2Cache[];
    const live = caches
        .filter((c) => c.game === 'oldschool' && c.environment === 'live' && c.language === 'en' && c.timestamp)
        .sort((a, b) => (a.timestamp! < b.timestamp! ? -1 : 1));
    const newest = live.at(-1);
    if (!newest) throw new Error('No live OSRS cache found on OpenRS2');
    return { id: newest.id, build: newest.builds[0]?.major ?? 0, timestamp: newest.timestamp! };
}

/** Unpacks a JS5 container: one compression byte, the lengths, then the (possibly compressed) data. */
export function decompressContainer(raw: Uint8Array): Uint8Array {
    const stream = new Buffer(raw);
    const compression = stream.readUnsignedByte();
    const compressedLength = stream.readInt();
    if (compression === 0) return raw.slice(5, 5 + compressedLength);

    const decompressedLength = stream.readInt();
    const payload = raw.slice(9, 9 + compressedLength);
    let data: Uint8Array;
    if (compression === 1) {
        // Jagex strips the "BZh1" magic from their bzip2 streams.
        const withHeader = new Uint8Array(payload.length + 4);
        withHeader.set([0x42, 0x5a, 0x68, 0x31]);
        withHeader.set(payload, 4);
        const result = Bun.spawnSync(['bzip2', '-dc'], { stdin: withHeader });
        if (result.exitCode !== 0) throw new Error(`bzip2 failed: ${result.stderr.toString()}`);
        data = new Uint8Array(result.stdout);
    } else if (compression === 2) {
        data = new Uint8Array(gunzipSync(payload));
    } else {
        throw new Error(`Unknown container compression ${compression}`);
    }
    if (data.length !== decompressedLength) {
        throw new Error(`Container length mismatch: ${data.length} != ${decompressedLength}`);
    }
    return data;
}

/** One group's entry in an index's reference table. */
interface GroupInfo {
    id: number;
    fileIds: number[];
}

/** Parses an index's reference table (index 255, group = the index id). Mirrors RuneLite's IndexData.load. */
function parseReferenceTable(data: Uint8Array): Map<number, GroupInfo> {
    const stream = new Buffer(data);
    const protocol = stream.readUnsignedByte();
    if (protocol < 5 || protocol > 7) throw new Error(`Unsupported reference table protocol ${protocol}`);
    if (protocol >= 6) stream.readInt();
    const flags = stream.readUnsignedByte();
    const named = (flags & 1) !== 0;
    const sized = (flags & 4) !== 0;
    const readCount = () => (protocol >= 7 ? stream.readBigSmart() : stream.readUnsignedShort());

    const count = readCount();
    const groups: GroupInfo[] = [];
    let last = 0;
    for (let i = 0; i < count; i++) {
        last += readCount();
        groups.push({ id: last, fileIds: [] });
    }
    if (named) stream.skip(count * 4);
    stream.skip(count * 4); // crc
    if (sized) stream.skip(count * 8);
    stream.skip(count * 4); // revision
    const fileCounts = groups.map(() => readCount());
    groups.forEach((group, i) => {
        let lastFile = 0;
        for (let f = 0; f < fileCounts[i]; f++) {
            lastFile += readCount();
            group.fileIds.push(lastFile);
        }
    });
    return new Map(groups.map((g) => [g.id, g]));
}

/** Splits a group into its files. Mirrors RuneLite's ArchiveFiles.loadContents. */
function splitGroup(data: Uint8Array, fileIds: number[]): Map<number, Uint8Array> {
    const files = new Map<number, Uint8Array>();
    if (fileIds.length === 1) {
        files.set(fileIds[0], data);
        return files;
    }
    const filesCount = fileIds.length;
    const chunks = data[data.length - 1];
    const stream = new Buffer(data);
    stream.offset = data.length - 1 - chunks * filesCount * 4;
    const chunkSizes: number[][] = fileIds.map(() => []);
    const fileSizes = fileIds.map(() => 0);
    for (let chunk = 0; chunk < chunks; chunk++) {
        let chunkSize = 0;
        for (let id = 0; id < filesCount; id++) {
            chunkSize += stream.readInt();
            chunkSizes[id][chunk] = chunkSize;
            fileSizes[id] += chunkSize;
        }
    }
    const contents = fileSizes.map((size) => new Uint8Array(size));
    const written = fileIds.map(() => 0);
    let offset = 0;
    for (let chunk = 0; chunk < chunks; chunk++) {
        for (let id = 0; id < filesCount; id++) {
            const size = chunkSizes[id][chunk];
            contents[id].set(data.subarray(offset, offset + size), written[id]);
            written[id] += size;
            offset += size;
        }
    }
    fileIds.forEach((fileId, i) => files.set(fileId, contents[i]));
    return files;
}

export class OsrsCache {
    private readonly tables = new Map<number, Map<number, GroupInfo>>();

    constructor(readonly cacheId: number) {}

    /** The raw, still-compressed container for one group, from disk if it was fetched before. */
    private async fetchContainer(index: number, group: number): Promise<Uint8Array> {
        const dir = join(CACHE_DIR, String(this.cacheId), String(index));
        const path = join(dir, `${group}.dat`);
        if (existsSync(path)) return new Uint8Array(readFileSync(path));
        const url = `${ARCHIVE}/caches/runescape/${this.cacheId}/archives/${index}/groups/${group}.dat`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        mkdirSync(dir, { recursive: true });
        writeFileSync(path, bytes);
        return bytes;
    }

    private async table(index: number): Promise<Map<number, GroupInfo>> {
        let table = this.tables.get(index);
        if (!table) {
            table = parseReferenceTable(decompressContainer(await this.fetchContainer(255, index)));
            this.tables.set(index, table);
        }
        return table;
    }

    /** A group's decompressed bytes, for indexes where each group holds a single file (models). */
    async group(index: number, group: number): Promise<Uint8Array> {
        return decompressContainer(await this.fetchContainer(index, group));
    }

    /** Every file in a group, keyed by file id. */
    async files(index: number, group: number): Promise<Map<number, Uint8Array>> {
        const info = (await this.table(index)).get(group);
        if (!info) throw new Error(`Index ${index} has no group ${group}`);
        return splitGroup(await this.group(index, group), info.fileIds);
    }
}
