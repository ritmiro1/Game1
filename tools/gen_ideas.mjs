// Генерирует 100_3D_GAME_IDEAS.json и 100_3D_GAME_IDEAS.md из единого каталога.
import fs from 'fs';
import path from 'path';
import { buildCatalog, SCORING } from './ideas_data.mjs';

const root = path.resolve(import.meta.dirname, '..');
const ideas = buildCatalog();
const winner = ideas[0];

const json = {
  meta: {
    title: '100 идей 3D-игр — каталог',
    version: '1.0.0',
    language: 'ru',
    scoring: {
      weights: {
        'Визуальное качество (эталон How to Fish)': SCORING.visual,
        'Техническое исполнение': SCORING.tech,
        'Игровой интерес': SCORING.fun,
        'Физика и системы': SCORING.physics,
      },
      scale: '0–30 для каждой из четырёх осей; итог — взвешенная сумма (максимум 30)',
    },
    note: 'Только 3D-концепты. Никаких 2D, математических тренажёров и примитивных шутеров из кубов.',
    winner: {
      rank: winner.rank,
      title: winner.title,
      total: winner.total,
      why: 'Максимальный визуальный балл благодаря водной симуляции, высокая оценка техники за реальные системы (волны, физика лодки, леска, ИИ рыбы) и сильная связь физики с геймплеем.',
    },
  },
  ideas: ideas.map((i) => ({
    rank: i.rank,
    title: i.title,
    pitch: i.pitch,
    gameplayLoop: i.loop,
    visualSpec: i.visualSpec,
    scores: i.scores,
    score: i.total,
  })),
};

fs.writeFileSync(path.join(root, '100_3D_GAME_IDEAS.json'), JSON.stringify(json, null, 2), 'utf8');

const md = [];
md.push('# 100 идей 3D-игр — каталог\n');
md.push('> Только 3D. Без 2D, без математических тренажёров, без шутеров из кубов.\n');
md.push('## Методика оценки\n');
md.push('| Критерий | Вес |');
md.push('| --- | --- |');
md.push('| Визуальное качество (эталон «How to Fish») | 30% |');
md.push('| Техническое исполнение | 30% |');
md.push('| Игровой интерес | 20% |');
md.push('| Физика и системы | 20% |');
md.push('\nИтог — взвешенная сумма по 30-балльной шкале.\n');
md.push('## Победитель\n');
md.push(`**№${winner.rank} — ${winner.title}** (${winner.total} балла)\n`);
md.push(`${winner.pitch}\n`);
md.push(`Игровой цикл: ${winner.loop}\n`);
md.push(`Визуальный профиль: ${winner.visualSpec}\n`);
md.push('\n## Полный рейтинг\n');
md.push('| № | Название | Балл | Визуал | Техника | Интерес | Физика |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const i of ideas) {
  md.push(`| ${i.rank} | ${i.title} | **${i.total}** | ${i.scores.visual} | ${i.scores.tech} | ${i.scores.fun} | ${i.scores.physics} |`);
}
md.push('\n## Карточки идей\n');
for (const i of ideas) {
  md.push(`### №${i.rank}. ${i.title} — ${i.total} балла\n`);
  md.push(`**Питч.** ${i.pitch}\n`);
  md.push(`**Игровой цикл.** ${i.loop}\n`);
  md.push(`**Визуальная спецификация.** ${i.visualSpec}\n`);
  md.push(`_Оценки: визуал ${i.scores.visual}/30, техника ${i.scores.tech}/30, интерес ${i.scores.fun}/20, физика ${i.scores.physics}/20._\n`);
}
fs.writeFileSync(path.join(root, '100_3D_GAME_IDEAS.md'), md.join('\n'), 'utf8');

console.log(`Сгенерировано: 100_3D_GAME_IDEAS.json и .md, идей: ${ideas.length}, победитель: ${winner.title} (${winner.total})`);
