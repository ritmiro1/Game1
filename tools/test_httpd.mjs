// ============================================================================
//  Нативный тест мини-сервера, который работает внутри .exe (electron/httpd.c).
//  Тот же исходник собирается системным C-компилятором под Linux и проверяется
//  реальными HTTP-запросами: маленький HTML и настоящий dist/index.html (1 МБ).
//
//  Запуск: node tools/test_httpd.mjs
// ============================================================================
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

const root = path.resolve(import.meta.dirname, '..');
const buildDir = path.join(root, '.build');
const binary = path.join(buildDir, 'test_httpd');

const cc = ['cc', 'gcc', 'clang'].find((c) => {
  try {
    execFileSync(c, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
if (!cc) {
  console.log('  · C-компилятор не найден — нативный тест HTTP пропущен (это не ошибка сборки)');
  process.exit(0);
}

fs.mkdirSync(buildDir, { recursive: true });
execFileSync(
  cc,
  [
    '-O2', '-Wall', '-Wextra', '-Wno-unused-parameter', '-pthread',
    '-o', binary,
    path.join(root, 'tools', 'test_httpd.c'),
    path.join(root, 'electron', 'httpd.c'),
  ],
  { stdio: ['ignore', 'pipe', 'inherit'] }
);

let failed = 0;
const run = (args, label) => {
  console.log(`\n  --- ${label} ---`);
  const r = spawnSync(binary, args, { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) failed++;
};

run([], 'короткий тестовый HTML');
const html = path.join(root, 'dist', 'index.html');
if (fs.existsSync(html)) run([html], 'настоящий файл игры (dist/index.html)');

if (failed) {
  console.error(`\n  ПРОВАЛЕНО прогонов: ${failed}`);
  process.exit(1);
}
console.log('\n  HTTP-сервер .exe проверен нативным тестом.');
