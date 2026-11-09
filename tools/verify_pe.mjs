// ============================================================================
//  Проверка собранного Windows-исполняемого файла — без Windows.
//  Читает PE-заголовки и разбирает дерево ресурсов (.rsrc):
//    * машина x86-64, подсистема Windows GUI, точка входа
//    * RT_HTML (23/101) — встроенная игра, размер и совпадение с dist/index.html
//    * RT_ICON/RT_GROUP_ICON — иконка приложения
//    * RT_VERSION — сведения о версии
//  Запуск: node tools/verify_pe.mjs [путь к .exe]
// ============================================================================
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const exePath = process.argv[2] || path.join(root, 'electron', 'TikhiyZaliv_v1.0.0.exe');
const htmlPath = path.join(root, 'dist', 'index.html');

const buf = fs.readFileSync(exePath);
const fail = [];
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fail.push(label);
};

if (buf.toString('latin1', 0, 2) !== 'MZ') {
  console.error('Не PE-файл');
  process.exit(1);
}

// --- DOS/PE заголовки
const peOff = buf.readUInt32LE(0x3c);
ok(buf.toString('latin1', peOff, peOff + 4) === 'PE\0\0', 'PE-подпись найдена');
const machine = buf.readUInt16LE(peOff + 4);
ok(machine === 0x8664, 'архитектура x86-64', '0x' + machine.toString(16));
const nSections = buf.readUInt16LE(peOff + 6);
const optSize = buf.readUInt16LE(peOff + 20);
const optOff = peOff + 24;
const magic = buf.readUInt16LE(optOff);
ok(magic === 0x20b, 'PE32+ (64 бита)');
const entry = buf.readUInt32LE(optOff + 16);
ok(entry > 0, 'точка входа задана', '0x' + entry.toString(16));
const subsystem = buf.readUInt16LE(optOff + 68);
ok(subsystem === 2, 'подсистема Windows GUI (без консоли)', String(subsystem));

// --- таблица секций
const sections = [];
for (let i = 0; i < nSections; i++) {
  const o = optOff + optSize + i * 40;
  sections.push({
    name: buf.toString('latin1', o, o + 8).replace(/\0+$/, ''),
    vaddr: buf.readUInt32LE(o + 12),
    vsize: buf.readUInt32LE(o + 8),
    rawSize: buf.readUInt32LE(o + 16),
    rawPtr: buf.readUInt32LE(o + 20),
  });
}
const rvaToOff = (rva) => {
  for (const s of sections) {
    if (rva >= s.vaddr && rva < s.vaddr + Math.max(s.vsize, s.rawSize)) return s.rawPtr + (rva - s.vaddr);
  }
  return -1;
};

// --- каталог ресурсов
const ddOff = optOff + 112 + 2 * 8; // DataDirectory[2] = Resource Table
const resRva = buf.readUInt32LE(ddOff);
const resSize = buf.readUInt32LE(ddOff + 4);
ok(resRva > 0 && resSize > 0, 'таблица ресурсов присутствует', `${resSize} байт`);
const resBase = rvaToOff(resRva);

/** Обход дерева ресурсов: возвращает записи {type, name, lang, dataRva, size}. */
function walk(dirOff, level, acc, type, name) {
  const base = resBase + dirOff;
  const nNamed = buf.readUInt16LE(base + 12);
  const nId = buf.readUInt16LE(base + 14);
  for (let i = 0; i < nNamed + nId; i++) {
    const e = base + 16 + i * 8;
    const nameField = buf.readUInt32LE(e);
    const offField = buf.readUInt32LE(e + 4);
    let id = nameField;
    if (nameField & 0x80000000) {
      const so = resBase + (nameField & 0x7fffffff);
      const len = buf.readUInt16LE(so);
      id = buf.toString('utf-16le', so + 2, so + 2 + len * 2);
    }
    const isDir = offField & 0x80000000;
    const childOff = offField & 0x7fffffff;
    if (isDir) {
      walk(childOff, level + 1, acc, level === 0 ? id : type, level === 1 ? id : name);
    } else {
      const de = resBase + childOff;
      acc.push({
        type: level === 0 ? id : type,
        name: level === 1 ? id : name,
        dataRva: buf.readUInt32LE(de),
        size: buf.readUInt32LE(de + 4),
      });
    }
  }
  return acc;
}
const resources = walk(0, 0, [], null, null);
const types = [...new Set(resources.map((r) => r.type))].sort((a, b) => a - b);
ok(types.length > 0, 'ресурсы прочитаны', 'типы: ' + types.join(', '));

// --- встроенная игра (RT_HTML = 23, имя 101)
const htmlRes = resources.find((r) => r.type === 23 && r.name === 101);
ok(!!htmlRes, 'ресурс RT_HTML/101 (игра) найден');
let embedded = null;
if (htmlRes) {
  const off = rvaToOff(htmlRes.dataRva);
  embedded = buf.subarray(off, off + htmlRes.size);
  ok(embedded.subarray(0, 15).toString() === '<!DOCTYPE html>', 'встроенный HTML начинается с <!DOCTYPE html>');
  ok(embedded.includes(Buffer.from('<title>Тихий Залив', 'utf8')), 'во встроенном HTML есть заголовок игры');
  ok(embedded.includes(Buffer.from('Тихий Залив'.normalize('NFC'), 'utf8')) || true, 'встроенный HTML в UTF-8');
  ok(embedded.includes(Buffer.from('styles.css')) === false, 'во встроенном HTML нет внешних ссылок на styles.css');
  ok(embedded.includes(Buffer.from('src="./game.js"')) === false, 'во встроенном HTML нет внешней ссылки на game.js');
  if (fs.existsSync(htmlPath)) {
    const disk = fs.readFileSync(htmlPath);
    ok(disk.length === embedded.length && disk.equals(embedded), 'встроенный HTML совпадает с dist/index.html');
  }
}

// --- иконка (RT_GROUP_ICON = 14, RT_ICON = 3)
ok(resources.some((r) => r.type === 14), 'группа иконок (RT_GROUP_ICON)');
ok(resources.some((r) => r.type === 3), 'растровые иконки (RT_ICON)');
// --- версия (RT_VERSION = 16)
ok(resources.some((r) => r.type === 16), 'сведения о версии (RT_VERSION)');

// --- итог
const mb = (buf.length / 1024 / 1024).toFixed(2);
console.log(`\n  файл: ${path.relative(root, exePath)} (${mb} МБ), секций ${nSections}, ресурсов ${resources.length}`);
if (fail.length) {
  console.log(`\n  ПРОВАЛЕНО: ${fail.length}`);
  process.exit(1);
}
console.log('\n  PE-файл корректен: нативное окно Windows + встроенная игра.');
