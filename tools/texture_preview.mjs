// ============================================================================
//  Превью процедурных текстур: рендерит их тем же кодом, что и игра, и
//  сохраняет PNG + считает статистику (средняя яркость, доля прозрачных пикселей).
//  Нужно, чтобы проверять альбедо без GPU: чёрная листва видна сразу.
//
//  Запуск: node tools/texture_preview.mjs [папка]
// ============================================================================
import fs from 'fs';
import path from 'path';
import { createCanvas } from '@napi-rs/canvas';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.resolve(process.argv[2] || path.join(root, '.build', 'textures'));

// генераторы текстур работают через document.createElement('canvas')
globalThis.__makeCanvas = (w, h) => createCanvas(w, h);
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error('поддерживается только canvas');
    return createCanvas(300, 150);
  },
};

const T = await import('../src/gen/textures.js');

const cases = [
  ['leaf-pine', () => T.makeLeafTexture(128, { color: [0.13, 0.3, 0.2], needle: true, seed: 61 })],
  ['leaf-birch', () => T.makeLeafTexture(128, { color: [0.36, 0.5, 0.2], seed: 63 })],
  ['grass-tuft', () => T.makeLeafTexture(128, { color: [0.3, 0.46, 0.2], seed: 71 })],
];

fs.mkdirSync(outDir, { recursive: true });

let bad = 0;
console.log('\n=== ПРЕВЬЮ ТЕКСТУР ===\n');
for (const [name, make] of cases) {
  const src = make();
  const ctx = src.getContext('2d');
  const { width: w, height: h } = src;
  const data = ctx.getImageData(0, 0, w, h).data;

  let sum = 0;
  let opaque = 0;
  let opaqueSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    sum += lum;
    if (a > 128) {
      opaque++;
      opaqueSum += lum;
    }
  }
  const px = w * h;
  const avgAll = sum / px;
  const avgOpaque = opaque ? opaqueSum / opaque : 0;
  const opaqueShare = opaque / px;

  // альбедо листвы должно быть заметно светлым, а не «почти чёрным»
  const ok = avgOpaque > 0.12 && opaqueShare > 0.1;
  if (!ok) bad++;
  console.log(
    `  ${ok ? '✓' : '✗'} ${name}: ${w}×${h}, средняя яркость ${avgAll.toFixed(3)}, ` +
      `по непрозрачным ${avgOpaque.toFixed(3)}, непрозрачных ${(opaqueShare * 100).toFixed(0)}%`
  );

  // сохраняем PNG для визуальной проверки
  const out = path.join(outDir, name + '.png');
  fs.writeFileSync(out, src.toBuffer ? src.toBuffer('image/png') : Buffer.alloc(0));
  if (!src.toBuffer) {
    // у @napi-rs/canvas есть encode
    fs.writeFileSync(out, src.encode('png'));
  }
}
console.log(`\n  файлы: ${path.relative(root, outDir)}`);
if (bad) {
  console.error(`\n  ПРОВАЛЕНО: ${bad}`);
  process.exit(1);
}
console.log('  Текстуры листвы и травы не чёрные.');
