import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 2: 3, 6: 4 };

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let header = null;
  const data = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12] };
    } else if (type === "IDAT") data.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR");
  const { width, height, depth, colorType, interlace } = header;
  const channels = CHANNELS[colorType];
  if (depth !== 8 || !channels || interlace !== 0) throw new Error(`unsupported PNG: depth ${depth}, color type ${colorType}, interlace ${interlace}`);
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      if (predictor === undefined) throw new Error(`bad PNG filter ${filter}`);
      pixels[y * stride + x] = (line[x] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

const luma = ({ pixels, channels }, i) => {
  const o = i * channels;
  return (pixels[o] + pixels[o + 1] + pixels[o + 2]) / 3;
};

export function stddev(png) {
  const count = png.width * png.height;
  const values = Array.from({ length: count }, (_, i) => luma(png, i));
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count);
}

export function meanGrid({ width, height, channels, pixels }, n) {
  const cells = Array.from({ length: n * n }, () => [0, 0, 0, 0]);
  for (let y = 0; y < height; y++) {
    const row = Math.min(n - 1, Math.floor((y * n) / height)) * n;
    for (let x = 0; x < width; x++) {
      const cell = cells[row + Math.min(n - 1, Math.floor((x * n) / width))];
      const o = (y * width + x) * channels;
      for (let c = 0; c < 3; c++) cell[c] += pixels[o + c];
      cell[3]++;
    }
  }
  return cells.map(([r, g, b, count]) => [r / count, g / count, b / count]);
}
