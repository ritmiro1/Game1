// ============================================================================
//  Генерация иконки приложения (.ico) — 16/32/48/64/128/256 px.
//  Без внешних зависимостей: рисуем RGBA-пиксели вручную (маяк, вода, луна).
//  Запуск: node electron/make_icon.mjs
// ============================================================================
import fs from 'fs';
import path from 'path';

const SIZES = [16, 32, 48, 64, 128, 256];

/** Рисует иконку размера s в RGBA-буфер (s*s*4). */
function drawIcon(s) {
  const buf = Buffer.alloc(s * s * 4);
  const px = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= s || y >= s) return;
    const i = (y * s + x) * 4;
    const na = a / 255;
    buf[i] = Math.round(r * na + buf[i] * (1 - na));
    buf[i + 1] = Math.round(g * na + buf[i + 1] * (1 - na));
    buf[i + 2] = Math.round(b * na + buf[i + 2] * (1 - na));
    buf[i + 3] = Math.max(buf[i + 3], a);
  };
  const inRounded = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || y < y0 || x > x1 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r);
  };

  // фон: ночное небо с градиентом
  for (let y = 0; y < s; y++) {
    const t = y / (s - 1);
    for (let x = 0; x < s; x++) {
      if (!inRounded(x, y, 0, 0, s - 1, s - 1, Math.round(s * 0.22))) continue;
      // небо → море
      let r, g, b;
      if (t < 0.62) {
        const k = t / 0.62;
        r = 8 + 10 * (1 - k);
        g = 18 + 22 * (1 - k);
        b = 30 + 34 * (1 - k);
      } else {
        const k = (t - 0.62) / 0.38;
        r = 10 + 16 * k;
        g = 40 + 34 * k;
        b = 56 + 30 * k;
      }
      px(x, y, r, g, b, 255);
    }
  }

  // луна
  const mx = s * 0.74, my = s * 0.24, mr = s * 0.1;
  for (let y = Math.floor(my - mr); y <= my + mr; y++)
    for (let x = Math.floor(mx - mr); x <= mx + mr; x++) {
      const d = Math.hypot(x - mx, y - my);
      if (d <= mr) px(x, y, 232, 240, 244, d > mr - 1.2 ? 190 : 245);
    }

  // маяк: башня (сужается кверху)
  const baseY = s * 0.86, topY = s * 0.24;
  const cx0 = s * 0.36;
  for (let y = Math.floor(topY); y <= baseY; y++) {
    const k = (y - topY) / (baseY - topY);
    const halfW = s * (0.045 + 0.05 * k);
    for (let x = Math.floor(cx0 - halfW); x <= cx0 + halfW; x++) {
      // полосы
      const stripe = Math.floor(((y - topY) / (baseY - topY)) * 6) % 2 === 0;
      const shade = 1 - Math.abs(x - cx0) / (halfW + 1);
      if (stripe) px(x, y, 228 * (0.72 + 0.28 * shade), 232 * (0.72 + 0.28 * shade), 236 * (0.72 + 0.28 * shade), 255);
      else px(x, y, 168 * (0.7 + 0.3 * shade), 62 * (0.7 + 0.3 * shade), 52 * (0.7 + 0.3 * shade), 255);
    }
  }
  // фонарь
  const ly = s * 0.2, lr = s * 0.055;
  for (let y = Math.floor(ly - lr); y <= ly + lr; y++)
    for (let x = Math.floor(cx0 - lr); x <= cx0 + lr; x++) {
      const d = Math.hypot(x - cx0, y - ly * 1.0 + s * 0.0);
      if (d <= lr) px(x, y, 255, 214, 128, 250);
    }
  // луч света
  for (let y = Math.floor(ly - s * 0.06); y <= ly + s * 0.06; y++) {
    for (let x = Math.floor(cx0 + lr); x < s * 0.62; x++) {
      const k = 1 - (x - cx0 - lr) / (s * 0.26);
      px(x, y, 255, 224, 160, Math.max(0, Math.round(46 * k * (1 - Math.abs(y - ly) / (s * 0.07)))));
    }
  }

  // отражение в воде
  for (let y = Math.floor(baseY); y < s * 0.97; y++) {
    const k = (y - baseY) / (s * 0.12);
    const alpha = Math.max(0, 70 * (1 - k));
    for (let x = Math.floor(cx0 - s * 0.11); x <= cx0 + s * 0.11; x++) {
      if (Math.sin((y - baseY) * 0.9 + x * 0.15) > 0.2) px(x, y, 255, 220, 150, alpha);
    }
  }
  // волны
  for (let i = 0; i < 3; i++) {
    const wy = s * (0.9 + i * 0.028);
    for (let x = 0; x < s; x++) {
      const yy = wy + Math.sin((x / s) * Math.PI * 4 + i) * s * 0.012;
      px(Math.round(x), Math.round(yy), 190, 226, 236, 90);
    }
  }
  return buf;
}

/** ICO-файл: заголовок + BMP-записи (BGRA, bottom-up) с маской прозрачности. */
function buildIco() {
  const images = SIZES.map((s) => ({ s, rgba: drawIcon(s) }));
  const records = [];
  let offset = 6 + 16 * images.length;
  const blobs = [];
  for (const { s, rgba } of images) {
    const rowSize = s * 4;
    const maskRow = Math.ceil(s / 32) * 4;
    const bmpSize = 40 + rowSize * s + maskRow * s;
    const bmp = Buffer.alloc(bmpSize);
    bmp.writeUInt32LE(40, 0);
    bmp.writeInt32LE(s, 4);
    bmp.writeInt32LE(s * 2, 8);
    bmp.writeUInt16LE(1, 12);
    bmp.writeUInt16LE(32, 14);
    bmp.writeUInt32LE(0, 16);
    bmp.writeUInt32LE(rowSize * s + maskRow * s, 20);
    for (let y = 0; y < s; y++) {
      const srcRow = (s - 1 - y) * s * 4;
      const dstRow = 40 + y * rowSize;
      for (let x = 0; x < s; x++) {
        bmp[dstRow + x * 4 + 0] = rgba[srcRow + x * 4 + 2];
        bmp[dstRow + x * 4 + 1] = rgba[srcRow + x * 4 + 1];
        bmp[dstRow + x * 4 + 2] = rgba[srcRow + x * 4 + 0];
        bmp[dstRow + x * 4 + 3] = rgba[srcRow + x * 4 + 3];
      }
    }
    // маска: 1 = прозрачный (не используется при 32 bpp, но обязательна)
    const maskStart = 40 + rowSize * s;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const a = rgba[((s - 1 - y) * s + x) * 4 + 3];
        if (a === 0) bmp[maskStart + y * maskRow + (x >> 3)] |= 1 << (7 - (x & 7));
      }
    }
    records.push({ s, size: bmpSize, offset });
    blobs.push(bmp);
    offset += bmpSize;
  }
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  images.forEach(({ s }, i) => {
    const p = 6 + i * 16;
    head.writeUInt8(s >= 256 ? 0 : s, p);
    head.writeUInt8(s >= 256 ? 0 : s, p + 1);
    head.writeUInt8(0, p + 2);
    head.writeUInt8(0, p + 3);
    head.writeUInt16LE(1, p + 4);
    head.writeUInt16LE(32, p + 6);
    head.writeUInt32LE(records[i].size, p + 8);
    head.writeUInt32LE(records[i].offset, p + 12);
  });
  return Buffer.concat([head, ...blobs]);
}

const out = path.join(import.meta.dirname, 'icon.ico');
fs.writeFileSync(out, buildIco());
console.log(`иконка: ${path.relative(process.cwd(), out)} — ${(fs.statSync(out).size / 1024).toFixed(1)} КБ`);
