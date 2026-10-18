const PNG_MAGIC = 'iVBOR';
const GIF_MAGIC = 'R0lG';
const JPEG_MAGIC = '/9j/';

/**
 * Normalizes an icon string (raw base64 or already data URI) into a data URI suitable for <img src>.
 */
export function iconToDataUri(icon?: string | null): string {
    if (!icon) return '';
    if (icon.startsWith('data:')) return icon;

    if (icon.startsWith(PNG_MAGIC)) return `data:image/png;base64,${icon}`;
    if (icon.startsWith(GIF_MAGIC)) return `data:image/gif;base64,${icon}`;
    if (icon.startsWith(JPEG_MAGIC)) return `data:image/jpeg;base64,${icon}`;

    // Default to PNG if unrecognized.
    return `data:image/png;base64,${icon}`;
}

/**
 * An icon string (raw base64 or a data URI) as image bytes and their content type, for serving it
 * as a file. Null when there's nothing to decode.
 */
export function decodeIcon(icon?: string | null): { bytes: Uint8Array; contentType: string } | null {
    const match = iconToDataUri(icon).match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) return null;
    const bytes = Uint8Array.from(Buffer.from(match[2], 'base64'));
    return bytes.length ? { bytes, contentType: match[1] } : null;
}

export default iconToDataUri;
