/**
 * A big-endian reader over the byte layouts the OSRS cache uses. The method names follow
 * RuneLite's cache library (net.runelite.cache.io.InputStream) so the decoders can be checked
 * against it line by line.
 */
export class Buffer {
    offset = 0;

    constructor(readonly data: Uint8Array) {}

    get length(): number {
        return this.data.length;
    }

    get remaining(): number {
        return this.data.length - this.offset;
    }

    peek(): number {
        return this.data[this.offset];
    }

    readUnsignedByte(): number {
        return this.data[this.offset++];
    }

    readByte(): number {
        return (this.data[this.offset++] << 24) >> 24;
    }

    readUnsignedShort(): number {
        const value = (this.data[this.offset] << 8) | this.data[this.offset + 1];
        this.offset += 2;
        return value;
    }

    readShort(): number {
        return (this.readUnsignedShort() << 16) >> 16;
    }

    readUnsignedMedium(): number {
        return (this.readUnsignedByte() << 16) | this.readUnsignedShort();
    }

    readInt(): number {
        const value =
            (this.data[this.offset] << 24) |
            (this.data[this.offset + 1] << 16) |
            (this.data[this.offset + 2] << 8) |
            this.data[this.offset + 3];
        this.offset += 4;
        return value;
    }

    readBigSmart(): number {
        return this.peek() < 128 ? this.readUnsignedShort() : this.readInt() & 0x7fffffff;
    }

    readBigSmart2(): number {
        if (this.peek() >= 128) return this.readInt() & 0x7fffffff;
        const value = this.readUnsignedShort();
        return value === 32767 ? -1 : value;
    }

    readShortSmart(): number {
        return this.peek() < 128 ? this.readUnsignedByte() - 64 : this.readUnsignedShort() - 0xc000;
    }

    readUnsignedShortSmart(): number {
        return this.peek() < 128 ? this.readUnsignedByte() : this.readUnsignedShort() - 0x8000;
    }

    readUnsignedShortSmartMinusOne(): number {
        return this.peek() < 128 ? this.readUnsignedByte() - 1 : this.readUnsignedShort() - 0x8001;
    }

    readString(): string {
        let out = '';
        for (let ch = this.readUnsignedByte(); ch !== 0; ch = this.readUnsignedByte()) {
            out += String.fromCharCode(ch);
        }
        return out;
    }

    skip(count: number): void {
        this.offset += count;
    }
}
