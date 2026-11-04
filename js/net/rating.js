export function eloDelta(my, enemy, result){ // result 1 win, 0 loss, 0.5 draw
  const k = my<1600? 32 : my<2000? 24 : 16;
  const expected = 1 / (1 + Math.pow(10, (enemy - my)/400));
  return Math.round(k * (result - expected));
}
export function rankName(elo){
  if(elo>=2100) return 'Гранд-Архитектор';
  if(elo>=1850) return 'Архитектор I';
  if(elo>=1600) return 'Платина '+ ['III','II','I'][Math.min(2, Math.floor((2000-elo)/120))] || 'Платина';
  if(elo>=1350) return 'Золото';
  if(elo>=1100) return 'Серебро';
  return 'Бронза';
}
export function saveProfile(profile){
  localStorage.setItem('synapsis_profile', JSON.stringify(profile));
}
export function loadProfile(){
  try{
    const p = JSON.parse(localStorage.getItem('synapsis_profile')||'null');
    if(p) return p;
  }catch{}
  return { name:'Резонатор_'+Math.floor(Math.random()*9000+1000), elo:1284, wins:0, losses:0, draws:0, streak:0, arena:'crystal', history:[], achievements:new Set() };
}
