// ============================================================================
//  Сборка: esbuild → dist/game.js (+ styles, index, идеи, шрифты-заглушки).
//  Режим --watch для локальной разработки. Ничего не пишет вне репозитория.
// ============================================================================
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const root = import.meta.dirname;
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

fs.mkdirSync(dist, { recursive: true });

const options = {
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  outfile: path.join(dist, 'game.js'),
  format: 'iife',
  target: ['chrome100', 'firefox100', 'safari15'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  metafile: true,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
};

/** Собирает dist/index.html как ОДИН самодостаточный файл: стили и бандл внутри. */
function buildSingleFile() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(dist, 'game.js'), 'utf8');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  // замены функциями: в бандле встречаются «$&», «$'» и т.п. — они не должны
  // трактоваться как шаблоны замены String.replace
  const out = html
    .replace(/<link[^>]*href="\.\/styles\.css"[^>]*>/, () => `<style>\n${safeCss}\n</style>`)
    .replace(/<script[^>]*src="\.\/game\.js"[^>]*><\/script>/, () => `<script>\n${safeJs}\n</script>`);
  if (out.includes('src="./game.js"') || out.includes('href="./styles.css"')) {
    throw new Error('не удалось встроить ресурсы в index.html');
  }
  const file = path.join(dist, 'index.html');
  fs.writeFileSync(file, out);
  return file;
}

function copyStatics() {
  const files = ['index.html', 'styles.css', '100_3D_GAME_IDEAS.json', '100_3D_GAME_IDEAS.md', 'README.md'];
  for (const f of files) {
    const src = path.join(root, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, f));
  }
}

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  copyStatics();
  buildSingleFile();
  fs.watch(root, { recursive: false }, (ev, file) => {
    if (file && (file.endsWith('.html') || file.endsWith('.css'))) {
      copyStatics();
      buildSingleFile();
    }
  });
  console.log('watch: http://localhost:8080 (см. serve.mjs)');
} else {
  const result = await esbuild.build(options);
  copyStatics();
  const single = buildSingleFile();
  console.log(`  ${path.relative(root, single)} — автономный файл, ${(fs.statSync(single).size / 1024 / 1024).toFixed(2)} МБ`);
  let total = 0;
  for (const [file, info] of Object.entries(result.metafile.outputs)) {
    total += info.bytes;
    console.log(`  ${path.relative(root, file)} — ${(info.bytes / 1024).toFixed(1)} КБ`);
  }
  console.log(`Сборка готова, JS: ${(total / 1024).toFixed(1)} КБ`);
}
