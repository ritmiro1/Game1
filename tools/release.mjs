// ============================================================================
//  Релиз «Тихого Залива»: два чистых артефакта в release/
//    1) TikhiyZaliv_v1.0.0.exe            — нативное окно Windows + игра внутри
//    2) TikhiyZaliv_SOURCE_AND_IDEAS.zip  — исходники, документация, каталог идей
//  Промежуточные файлы (.res, копии HTML, PDB) в релиз не попадают и удаляются.
//
//  Требуется zig для кросс-компиляции: pip install ziglang
//  (или переменная окружения ZIG=/путь/к/zig).
// ============================================================================
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const root = path.resolve(import.meta.dirname, '..');
const buildDir = path.join(root, '.build');
const electronDir = path.join(root, 'electron');
const releaseDir = path.join(root, 'release');
const exeName = 'TikhiyZaliv_v1.0.0.exe';
const zipName = 'TikhiyZaliv_SOURCE_AND_IDEAS.zip';
const log = [];

const step = (msg) => {
  log.push(msg);
  console.log('  ' + msg);
};

function fail(msg) {
  console.error('\n  ОШИБКА: ' + msg);
  process.exit(1);
}

/** Ищет кросс-компилятор zig: ZIG → PATH → пакет ziglang из PyPI. */
function findZig() {
  const candidates = [];
  if (process.env.ZIG) candidates.push(process.env.ZIG);
  candidates.push('zig');
  // пакет ziglang ставит бинарник внутрь site-packages
  const pythons = ['python3', 'python'];
  for (const py of pythons) {
    try {
      const out = execFileSync(py, ['-c', 'import ziglang,os;print(os.path.join(os.path.dirname(ziglang.__file__),"zig"))'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (out) candidates.push(out);
    } catch {
      /* python или пакет отсутствуют */
    }
  }
  for (const c of candidates) {
    try {
      const v = execFileSync(c, ['version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (v) return { zig: c, version: v };
    } catch {
      /* не подошёл */
    }
  }
  return null;
}

/** Иконка: пересобираем, если её нет или она старше генератора. */
function ensureIcon() {
  const icon = path.join(electronDir, 'icon.ico');
  const maker = path.join(electronDir, 'make_icon.mjs');
  if (!fs.existsSync(icon) || fs.statSync(icon).mtimeMs < fs.statSync(maker).mtimeMs) {
    execFileSync(process.execPath, [maker], { stdio: 'inherit' });
  }
  return icon;
}

/** HTML игры кладём во временную папку сборки — в репозитории он не нужен. */
function stageHtml() {
  const src = path.join(root, 'dist', 'index.html');
  if (!fs.existsSync(src)) fail('нет dist/index.html — сначала запустите node build.mjs');
  const dst = path.join(buildDir, 'app.html');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.copyFileSync(src, dst);
  return dst;
}

function buildExe(zig) {
  const appHtml = path.join(electronDir, 'app.html');
  const rcFile = path.join(electronDir, 'app.rc');
  const resFile = path.join(electronDir, 'app.res');
  const exeOut = path.join(buildDir, exeName);

  fs.copyFileSync(stageHtml(), appHtml);
  const cleanup = [appHtml, resFile];
  try {
    execFileSync(zig, ['rc', rcFile, resFile], { cwd: electronDir, stdio: ['ignore', 'pipe', 'pipe'] });
    step('ресурсы Windows собраны (игра + иконка + версия)');
    execFileSync(
      zig,
      [
        'cc',
        '-target', 'x86_64-windows-gnu',
        '-O2',
        '-Wl,--subsystem,windows',
        '-Wl,--entry,WinMainCRTStartup',
        '-o', exeOut,
        path.join(electronDir, 'main.c'),
        resFile,
        '-lole32', '-loleaut32', '-luuid', '-lshell32', '-luser32', '-lgdi32', '-lws2_32',
      ],
      { cwd: electronDir, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    step(`исполняемый файл собран: ${(fs.statSync(exeOut).size / 1024 / 1024).toFixed(2)} МБ`);
    return exeOut;
  } finally {
    for (const f of cleanup) if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

/** Проверка PE-структуры перенесённым из tools/verify_pe.mjs скриптом. */
function verifyExe(exePath) {
  const out = execFileSync(process.execPath, [path.join(root, 'tools', 'verify_pe.mjs'), exePath], {
    encoding: 'utf8',
  });
  const lines = out.split('\n').filter((l) => l.trim().startsWith('✓') || l.trim().startsWith('✗'));
  const bad = lines.filter((l) => l.includes('✗'));
  for (const l of lines) console.log('    ' + l.trim());
  if (bad.length) fail('проверка .exe не пройдена');
  step(`PE проверен: ${lines.length} пунктов, без ошибок`);
}

/** Список файлов исходников (без node_modules, dist, release, .git). */
function collectSources() {
  const out = [];
  const skipDirs = new Set(['node_modules', '.git', 'release', 'dist', '.build', 'docs_old']);
  const skipExt = new Set(['.exe', '.pdb', '.res', '.obj', '.o']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(full);
        continue;
      }
      if (skipExt.has(path.extname(entry.name).toLowerCase())) continue;
      if (entry.name === 'app.html') continue; // генерируется сборкой
      if (/^(package-lock\.json)$/.test(entry.name)) continue;
      out.push(rel.split(path.sep).join('/'));
    }
  };
  walk(root);
  // dist — только собранная игра как удобный запуск
  for (const f of ['index.html', 'game.js', 'styles.css', '100_3D_GAME_IDEAS.json', '100_3D_GAME_IDEAS.md', 'README.md']) {
    const p = path.join(root, 'dist', f);
    if (fs.existsSync(p)) out.push('dist/' + f);
  }
  return [...new Set(out)].sort();
}

/** ZIP через стандартные утилиты (zip есть в системе) — без внешних пакетов. */
function makeZip(fileList, zipPath) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'tz-pack-'));
  try {
    for (const rel of fileList) {
      const src = path.join(root, rel);
      const dst = path.join(staging, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    fs.mkdirSync(releaseDir, { recursive: true });
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execFileSync('zip', ['-r', '-9', '-q', zipPath, '.'], { cwd: staging, stdio: ['ignore', 'pipe', 'pipe'] });
    return fs.statSync(zipPath).size;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- запуск
console.log('\n=== СБОРКА РЕЛИЗА «ТИХИЙ ЗАЛИВ» ===\n');

step('сборка игры…');
execFileSync(process.execPath, [path.join(root, 'build.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
step('игра собрана: dist/game.js + автономный dist/index.html');

ensureIcon();
step('иконка приложения готова');

const zig = findZig();
if (!zig) {
  fail('не найден zig. Установите кросс-компилятор: pip install ziglang (или задайте ZIG=/путь/к/zig)');
}
step(`кросс-компилятор: zig ${zig.version}`);

fs.mkdirSync(releaseDir, { recursive: true });
for (const f of fs.readdirSync(releaseDir)) fs.rmSync(path.join(releaseDir, f), { recursive: true, force: true });

const exePath = buildExe(zig.zig);
verifyExe(exePath);
// отладочные файлы компилятора в релиз не идут
for (const f of fs.readdirSync(buildDir)) {
  if (f.endsWith('.pdb') || f.endsWith('.res')) fs.rmSync(path.join(buildDir, f), { force: true });
}
for (const f of fs.readdirSync(electronDir)) {
  if (f.endsWith('.pdb') || f.endsWith('.res')) fs.rmSync(path.join(electronDir, f), { force: true });
}

const exeFinal = path.join(releaseDir, exeName);
fs.copyFileSync(exePath, exeFinal);
step(`артефакт 1: release/${exeName}`);

const sources = collectSources();
step(`исходников к упаковке: ${sources.length}`);
const zipSize = makeZip(sources, path.join(releaseDir, zipName));
step(`артефакт 2: release/${zipName} (${(zipSize / 1024 / 1024).toFixed(2)} МБ)`);

// ---------------------------------------------------------------- проверка
console.log('\n=== ПРОВЕРКА АРТЕФАКТОВ ===\n');
const expect = [exeFinal, path.join(releaseDir, zipName)];
for (const f of expect) {
  const exists = fs.existsSync(f);
  const size = exists ? fs.statSync(f).size : 0;
  console.log(`  ${exists && size > 0 ? '✓' : '✗'} ${path.basename(f)} — ${(size / 1024 / 1024).toFixed(2)} МБ`);
  if (!exists || size === 0) fail(`артефакт не создан: ${f}`);
}
// содержимое ZIP: каталог идей и документация обязательны
const zipList = execFileSync('unzip', ['-Z1', path.join(releaseDir, zipName)], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
for (const need of ['100_3D_GAME_IDEAS.json', '100_3D_GAME_IDEAS.md', 'docs/GDD.md', 'docs/TECHNICAL.md', 'src/main.js', 'electron/main.c', 'README.md']) {
  const ok = zipList.includes(need);
  console.log(`  ${ok ? '✓' : '✗'} в архиве: ${need}`);
  if (!ok) fail(`в ZIP нет ${need}`);
}
const ideas = JSON.parse(fs.readFileSync(path.join(root, '100_3D_GAME_IDEAS.json'), 'utf8'));
console.log(`  ${ideas.ideas.length === 100 ? '✓' : '✗'} идей в каталоге: ${ideas.ideas.length}`);
console.log(`  ${zipList.length} файлов в архиве`);

// ---------------------------------------------------------------- итог
const total = expect.reduce((a, f) => a + fs.statSync(f).size, 0);
console.log('\n=== ГОТОВО ===\n');
console.log(`  release/${exeName} — ${(fs.statSync(exeFinal).size / 1024 / 1024).toFixed(2)} МБ`);
console.log(`  release/${zipName} — ${(zipSize / 1024 / 1024).toFixed(2)} МБ`);
console.log(`  суммарно: ${(total / 1024 / 1024).toFixed(2)} МБ\n`);
