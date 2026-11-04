export const ARENAS = [
  { id:'crystal', name:'Кристальный Разлом', desc:'Колыбель первого двигателя. Чистые линии, +1 энергия за центр.', icon:'⬢', color:'#00e5ff', bg:'radial-gradient(600px 300px at 50% 0%, rgba(0,229,255,.18), transparent 70%)' },
  { id:'nebula', name:'Небула Поющих Ветров', desc:'Газовый гигант поёт. Аномалии движутся каждый 3-й ход.', icon:'◎', color:'#7c4dff', bg:'radial-gradient(600px 300px at 50% 0%, rgba(124,77,255,.22), transparent 70%)' },
  { id:'lab', name:'Лаборатория Архитекторов', desc:'Стерильный куб. Симметрия идеальна, ловушек нет — чистый скилл.', icon:'⬡', color:'#00ffa6', bg:'radial-gradient(600px 300px at 50% 0%, rgba(0,255,166,.15), transparent 70%)' },
  { id:'temple', name:'Храм Тишины', desc:'До резонанса была тишина. Здесь энергия копится вдвое медленнее.', icon:'⟁', color:'#ffcc00', bg:'radial-gradient(600px 300px at 50% 0%, rgba(255,204,0,.15), transparent 70%)' },
  { id:'ark', name:'Ковчег', desc:'Корабль-мир. Порталы шире, но ядро тяжелее.', icon:'⬔', color:'#ff6b00', bg:'radial-gradient(600px 300px at 50% 0%, rgba(255,107,0,.15), transparent 70%)' },
  { id:'abyss', name:'Бездна', desc:'Край карты разума. Каждый ход — риск. +2 ELO за победу.', icon:'⬣', color:'#ff00a8', bg:'radial-gradient(600px 300px at 50% 0%, rgba(255,0,168,.18), transparent 70%)' },
];
export const SKINS = [
  { id:'default', name:'Искатель', rarity:'common', color:'#00e5ff' },
  { id:'ghost', name:'Квантовый Призрак', rarity:'rare', color:'#8ea0c2' },
  { id:'forge', name:'Кузнец Резонанса', rarity:'epic', color:'#ff6b00' },
  { id:'architect', name:'Архитектор', rarity:'legendary', color:'#ffcc00' },
  { id:'void', name:'Дитя Бездны', rarity:'legendary', color:'#7c4dff' },
  { id:'crystal', name:'Кристальный', rarity:'rare', color:'#00ffa6' },
  { id:'neon', name:'Неоновый Шторм', rarity:'epic', color:'#00e5ff' },
  { id:'obsidian', name:'Обсидиан', rarity:'rare', color:'#2a2e3a' },
  { id:'solar', name:'Солнечный Резонатор', rarity:'epic', color:'#ffcc00' },
  { id:'abyssal', name:'Бездонный', rarity:'legendary', color:'#ff00a8' },
  { id:'chrono', name:'Хроно-Ткач', rarity:'legendary', color:'#00e5ff' },
  { id:'prime', name:'Прайм', rarity:'mythic', color:'#ffffff' },
];
export const TITLES = [
  'Новобранец','Искатель','Настроенный','Резонирующий','Вектора','Призрак','Оракул','Кузнец','Хранитель Портала','Проводник','Мастер Резонанса','Архитектор','Гранд-Архитектор','Абсолют','Ткач Реальности','Голос Тишины','Пожиратель Бездны','Ключ'
];
export function getArena(id){ return ARENAS.find(a=>a.id===id) || ARENAS[0]; }
