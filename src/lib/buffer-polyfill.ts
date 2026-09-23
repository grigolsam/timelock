// Ensures `Buffer` is available in the browser before Solana/Streamflow modules load.
// Production can resolve bare `buffer` imports to an empty browser shim, so this
// file is also aliased as the app's `buffer` module in vite.config.ts.

let installed = false;

type BufferLike = Uint8Array & {
  toString: (encoding?: string, start?: number, end?: number) => string;
  copy: (target: Uint8Array, targetStart?: number, sourceStart?: number, sourceEnd?: number) => number;
  slice: (start?: number, end?: number) => BufferLike;
  readUIntLE: (offset: number, byteLength: number) => number;
  readUIntBE: (offset: number, byteLength: number) => number;
  readUInt8: (offset: number) => number;
  readUInt16LE: (offset: number) => number;
  readUInt16BE: (offset: number) => number;
  readUInt32LE: (offset: number) => number;
  readUInt32BE: (offset: number) => number;
  readIntLE: (offset: number, byteLength: number) => number;
  readIntBE: (offset: number, byteLength: number) => number;
  readInt8: (offset: number) => number;
  readInt16LE: (offset: number) => number;
  readInt16BE: (offset: number) => number;
  readInt32LE: (offset: number) => number;
  readInt32BE: (offset: number) => number;
  readFloatLE: (offset: number) => number;
  readFloatBE: (offset: number) => number;
  readDoubleLE: (offset: number) => number;
  readDoubleBE: (offset: number) => number;
  writeUIntLE: (value: number, offset: number, byteLength: number) => number;
  writeUIntBE: (value: number, offset: number, byteLength: number) => number;
  writeUInt8: (value: number, offset: number) => number;
  writeUInt16LE: (value: number, offset: number) => number;
  writeUInt16BE: (value: number, offset: number) => number;
  writeUInt32LE: (value: number, offset: number) => number;
  writeUInt32BE: (value: number, offset: number) => number;
  writeIntLE: (value: number, offset: number, byteLength: number) => number;
  writeIntBE: (value: number, offset: number, byteLength: number) => number;
  writeInt8: (value: number, offset: number) => number;
  writeInt16LE: (value: number, offset: number) => number;
  writeInt16BE: (value: number, offset: number) => number;
  writeInt32LE: (value: number, offset: number) => number;
  writeInt32BE: (value: number, offset: number) => number;
  writeFloatLE: (value: number, offset: number) => number;
  writeFloatBE: (value: number, offset: number) => number;
  writeDoubleLE: (value: number, offset: number) => number;
  writeDoubleBE: (value: number, offset: number) => number;
};

type BufferCtor = {
  (value: unknown, encodingOrOffset?: string | number, length?: number): BufferLike;
  from: (value: unknown, encodingOrOffset?: string | number, length?: number) => BufferLike;
  alloc: (size: number, fill?: number | string, encoding?: string) => BufferLike;
  allocUnsafe: (size: number) => BufferLike;
  allocUnsafeSlow: (size: number) => BufferLike;
  concat: (list: Uint8Array[], totalLength?: number) => BufferLike;
  isBuffer: (value: unknown) => boolean;
  byteLength: (value: string | Uint8Array, encoding?: string) => number;
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function viewOf(bytes: Uint8Array<ArrayBufferLike>): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function normalizeEncoding(encoding?: string): string {
  return (encoding || "utf8").toLowerCase().replace("-", "");
}

function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: Uint8Array, urlSafe = false): string {
  const encoded = btoa(bytesToBinary(bytes));
  return urlSafe ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") : encoded;
}

function fromHex(value: string): Uint8Array {
  const clean = value.length % 2 === 0 ? value : `0${value}`;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class BrowserBuffer extends Uint8Array {
  toString(encoding?: string, start = 0, end = this.length): string {
    const bytes = this.subarray(start, end);
    switch (normalizeEncoding(encoding)) {
      case "hex":
        return toHex(bytes);
      case "base64":
        return toBase64(bytes);
      case "base64url":
        return toBase64(bytes, true);
      case "latin1":
      case "binary":
      case "ascii":
        return bytesToBinary(bytes);
      case "utf8":
      default:
        return textDecoder.decode(bytes);
    }
  }

  copy(target: Uint8Array, targetStart = 0, sourceStart = 0, sourceEnd = this.length): number {
    const source = this.subarray(sourceStart, sourceEnd);
    const clipped = source.subarray(0, Math.max(0, target.length - targetStart));
    target.set(clipped, targetStart);
    return clipped.length;
  }

  readUIntLE(offset: number, byteLength: number): number {
    let value = 0;
    for (let i = 0; i < byteLength; i += 1) value += this[offset + i] * 2 ** (8 * i);
    return value;
  }

  readUIntBE(offset: number, byteLength: number): number {
    let value = 0;
    for (let i = 0; i < byteLength; i += 1) value = value * 256 + this[offset + i];
    return value;
  }

  readUInt8(offset: number): number { return this[offset]; }
  readUInt16LE(offset: number): number { return viewOf(this).getUint16(offset, true); }
  readUInt16BE(offset: number): number { return viewOf(this).getUint16(offset, false); }
  readUInt32LE(offset: number): number { return viewOf(this).getUint32(offset, true); }
  readUInt32BE(offset: number): number { return viewOf(this).getUint32(offset, false); }

  readIntLE(offset: number, byteLength: number): number {
    const unsigned = this.readUIntLE(offset, byteLength);
    const limit = 2 ** (8 * byteLength - 1);
    return unsigned >= limit ? unsigned - 2 ** (8 * byteLength) : unsigned;
  }

  readIntBE(offset: number, byteLength: number): number {
    const unsigned = this.readUIntBE(offset, byteLength);
    const limit = 2 ** (8 * byteLength - 1);
    return unsigned >= limit ? unsigned - 2 ** (8 * byteLength) : unsigned;
  }

  readInt8(offset: number): number { return viewOf(this).getInt8(offset); }
  readInt16LE(offset: number): number { return viewOf(this).getInt16(offset, true); }
  readInt16BE(offset: number): number { return viewOf(this).getInt16(offset, false); }
  readInt32LE(offset: number): number { return viewOf(this).getInt32(offset, true); }
  readInt32BE(offset: number): number { return viewOf(this).getInt32(offset, false); }
  readFloatLE(offset: number): number { return viewOf(this).getFloat32(offset, true); }
  readFloatBE(offset: number): number { return viewOf(this).getFloat32(offset, false); }
  readDoubleLE(offset: number): number { return viewOf(this).getFloat64(offset, true); }
  readDoubleBE(offset: number): number { return viewOf(this).getFloat64(offset, false); }

  writeUIntLE(value: number, offset: number, byteLength: number): number {
    let next = value;
    for (let i = 0; i < byteLength; i += 1) {
      this[offset + i] = next & 0xff;
      next = Math.floor(next / 256);
    }
    return offset + byteLength;
  }

  writeUIntBE(value: number, offset: number, byteLength: number): number {
    let next = value;
    for (let i = byteLength - 1; i >= 0; i -= 1) {
      this[offset + i] = next & 0xff;
      next = Math.floor(next / 256);
    }
    return offset + byteLength;
  }

  writeUInt8(value: number, offset: number): number { this[offset] = value & 0xff; return offset + 1; }
  writeUInt16LE(value: number, offset: number): number { viewOf(this).setUint16(offset, value, true); return offset + 2; }
  writeUInt16BE(value: number, offset: number): number { viewOf(this).setUint16(offset, value, false); return offset + 2; }
  writeUInt32LE(value: number, offset: number): number { viewOf(this).setUint32(offset, value, true); return offset + 4; }
  writeUInt32BE(value: number, offset: number): number { viewOf(this).setUint32(offset, value, false); return offset + 4; }

  writeIntLE(value: number, offset: number, byteLength: number): number {
    const unsigned = value < 0 ? value + 2 ** (8 * byteLength) : value;
    return this.writeUIntLE(unsigned, offset, byteLength);
  }

  writeIntBE(value: number, offset: number, byteLength: number): number {
    const unsigned = value < 0 ? value + 2 ** (8 * byteLength) : value;
    return this.writeUIntBE(unsigned, offset, byteLength);
  }

  writeInt8(value: number, offset: number): number { viewOf(this).setInt8(offset, value); return offset + 1; }
  writeInt16LE(value: number, offset: number): number { viewOf(this).setInt16(offset, value, true); return offset + 2; }
  writeInt16BE(value: number, offset: number): number { viewOf(this).setInt16(offset, value, false); return offset + 2; }
  writeInt32LE(value: number, offset: number): number { viewOf(this).setInt32(offset, value, true); return offset + 4; }
  writeInt32BE(value: number, offset: number): number { viewOf(this).setInt32(offset, value, false); return offset + 4; }
  writeFloatLE(value: number, offset: number): number { viewOf(this).setFloat32(offset, value, true); return offset + 4; }
  writeFloatBE(value: number, offset: number): number { viewOf(this).setFloat32(offset, value, false); return offset + 4; }
  writeDoubleLE(value: number, offset: number): number { viewOf(this).setFloat64(offset, value, true); return offset + 8; }
  writeDoubleBE(value: number, offset: number): number { viewOf(this).setFloat64(offset, value, false); return offset + 8; }
}

(BrowserBuffer.prototype as any).slice = function slice(start?: number, end?: number): BufferLike {
  return wrap(Uint8Array.prototype.slice.call(this, start, end));
};

function wrap(bytes: Uint8Array): BufferLike {
  Object.setPrototypeOf(bytes, BrowserBuffer.prototype);
  return bytes as BufferLike;
}

const fallbackBuffer = function Buffer(value: unknown, encodingOrOffset?: string | number, length?: number): BufferLike {
  if (typeof value === "number") return fallbackBuffer.allocUnsafe(value);
  return fallbackBuffer.from(value, encodingOrOffset, length);
} as BufferCtor;

fallbackBuffer.from = function from(value: unknown, encodingOrOffset?: string | number, length?: number): BufferLike {
    if (typeof value === "string") {
      switch (normalizeEncoding(typeof encodingOrOffset === "string" ? encodingOrOffset : undefined)) {
        case "hex":
          return wrap(fromHex(value));
        case "base64":
        case "base64url":
          return wrap(fromBase64(value));
        case "latin1":
        case "binary":
        case "ascii":
          return wrap(Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff));
        case "utf8":
        default:
          return wrap(textEncoder.encode(value));
      }
    }
    if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer)) {
      const offset = typeof encodingOrOffset === "number" ? encodingOrOffset : 0;
      return wrap(new Uint8Array(value, offset, length));
    }
    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      return wrap(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    }
    if (Array.isArray(value)) return wrap(Uint8Array.from(value));
    return wrap(Uint8Array.from(value as ArrayLike<number>));
  };

fallbackBuffer.alloc = function alloc(size: number, fill?: number | string, encoding?: string): BufferLike {
    const bytes = wrap(new Uint8Array(Math.max(0, size)));
    if (fill !== undefined) {
      if (typeof fill === "string") {
        const fillBytes = fallbackBuffer.from(fill, encoding);
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = fillBytes[i % fillBytes.length] ?? 0;
      } else {
        bytes.fill(fill);
      }
    }
    return bytes;
  };

fallbackBuffer.allocUnsafe = function allocUnsafe(size: number): BufferLike {
    return wrap(new Uint8Array(Math.max(0, size)));
  };

fallbackBuffer.allocUnsafeSlow = function allocUnsafeSlow(size: number): BufferLike {
    return fallbackBuffer.allocUnsafe(size);
  };

fallbackBuffer.concat = function concat(list: Uint8Array[], totalLength = list.reduce((sum, item) => sum + item.length, 0)): BufferLike {
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const item of list) {
      out.set(item.subarray(0, Math.max(0, totalLength - offset)), offset);
      offset += item.length;
      if (offset >= totalLength) break;
    }
    return wrap(out);
  };

fallbackBuffer.isBuffer = function isBuffer(value: unknown): boolean {
    return value instanceof Uint8Array;
  };

fallbackBuffer.byteLength = function byteLength(value: string | Uint8Array, encoding?: string): number {
    return typeof value === "string" ? fallbackBuffer.from(value, encoding).length : value.length;
  };

(fallbackBuffer as any).prototype = BrowserBuffer.prototype;

function resolveCtor(): BufferCtor {
  const g = (globalThis as any).Buffer;
  if (g && typeof g.from === "function") return g;
  return fallbackBuffer;
}

export function ensureBufferPolyfill(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (installed) return Promise.resolve();

  const existing = (globalThis as any).Buffer;
  if (existing && typeof existing.from === "function") {
    installed = true;
    return Promise.resolve();
  }

  const Ctor = resolveCtor();

  (globalThis as any).Buffer = Ctor;
  (window as any).Buffer = Ctor;
  installed = true;
  return Promise.resolve();
}

void ensureBufferPolyfill().catch(() => {
  /* surfaced by explicit callers */
});

export const Buffer = fallbackBuffer;
export default { Buffer };
