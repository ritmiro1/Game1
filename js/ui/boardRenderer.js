import { BOARD_SIZE } from '../core/board.js';

export class BoardRenderer {
  constructor(canvas, getState){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getState = getState;
    this.selectedId = null;
    this.hover = null;
    this.anim = { progress:0, from:null, to:null, coreFrom:null, coreTo:null, active:false };
    this.particles = [];
    this.onCellClick = null;
    this.setupEvents();
    this.lastTime = performance.now();
    requestAnimationFrame(()=> this.loop());
  }
  setSelected(id){ this.selectedId = id; }
  setupEvents(){
    const rect = ()=> this.canvas.getBoundingClientRect();
    const cellFromEvent = (e)=>{
      const r = rect();
      const x = (e.touches? e.touches[0].clientX : e.clientX) - r.left;
      const y = (e.touches? e.touches[0].clientY : e.clientY) - r.top;
      const pad = 14;
      const boardPx = Math.min(r.width, r.height) - pad*2;
      const cell = boardPx / BOARD_SIZE;
      const cx = Math.floor((x - pad)/cell);
      const cy = Math.floor((y - pad)/cell);
      if(cx<0||cx>=BOARD_SIZE||cy<0||cy>=BOARD_SIZE) return null;
      return {x:cx,y:cy};
    };
    this.canvas.addEventListener('click', (e)=>{
      const c = cellFromEvent(e);
      if(c && this.onCellClick) this.onCellClick(c);
    });
    this.canvas.addEventListener('mousemove', (e)=>{
      const c = cellFromEvent(e);
      this.hover = c;
    });
    this.canvas.addEventListener('mouseleave', ()=> this.hover=null);
  }
  triggerAnimation(prevCore, nextCore, moves){
    this.anim = { progress:0, active:true, prevCore, nextCore, moves, t:0 };
  }
  addParticles(x,y,color, count=12){
    for(let i=0;i<count;i++) this.particles.push({ x, y, vx:(Math.random()-0.5)*6, vy:(Math.random()-0.5)*6, life:1, decay:0.02+Math.random()*0.02, color, r:2+Math.random()*3 });
  }
  loop(){
    const now = performance.now();
    const dt = Math.min(32, now - this.lastTime)/16.6;
    this.lastTime = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame(()=> this.loop());
  }
  update(dt){
    if(this.anim.active){
      this.anim.t += 0.04*dt;
      if(this.anim.t>=1) this.anim.active=false;
    }
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i];
      p.x+=p.vx*0.5*dt; p.y+=p.vy*0.5*dt; p.vy+=0.15*dt; p.life-=p.decay*dt;
      if(p.life<=0) this.particles.splice(i,1);
    }
  }
  draw(){
    const ctx=this.ctx, W=this.canvas.width, H=this.canvas.height;
    // clear
    ctx.clearRect(0,0,W,H);
    // background grid glow
    const pad=14, boardPx=Math.min(W,H)-pad*2, cell=boardPx/BOARD_SIZE;
    const ox = (W-boardPx)/2, oy=(H-boardPx)/2;
    // board shadow
    ctx.fillStyle='#0a0e1a';
    ctx.strokeStyle='rgba(0,229,255,.15)';
    ctx.lineWidth=1;
    // draw cells
    const state=this.getState();
    if(!state) return;
    for(let y=0;y<BOARD_SIZE;y++) for(let x=0;x<BOARD_SIZE;x++){
      const px=ox + x*cell, py=oy + y*cell;
      const isBlock = state.board[y][x]?.type==='block';
      const isPortal = (x===3 && (y===0||y===6));
      const isCore = (state.core.x===x && state.core.y===y);
      const isHover = this.hover && this.hover.x===x && this.hover.y===y;
      const isSelectedPiece = state.pieces.some(p=> p.id===this.selectedId && p.x===x && p.y===y);
      // cell bg
      if(isBlock){
        ctx.fillStyle='#0e1424';
        ctx.fillRect(px+1,py+1,cell-2,cell-2);
        // diagonal hatch
        ctx.strokeStyle='rgba(255,255,255,.06)';
        ctx.beginPath();
        for(let k=-cell;k<cell*2;k+=8){ ctx.moveTo(px+k,py); ctx.lineTo(px+k+cell,py+cell); }
        ctx.stroke();
      } else if(isPortal){
        const pulse = 0.5 + Math.sin(performance.now()/500)*0.3;
        ctx.fillStyle=`rgba(0,255,166,${0.12*pulse+0.08})`;
        ctx.fillRect(px+1,py+1,cell-2,cell-2);
        ctx.strokeStyle=`rgba(0,255,166,${0.6})`;
        ctx.setLineDash([4,3]);
        ctx.strokeRect(px+1,py+1,cell-2,cell-2);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle= isHover? 'rgba(0,229,255,.08)' : 'rgba(255,255,255,.03)';
        ctx.fillRect(px+1,py+1,cell-2,cell-2);
      }
      if(isSelectedPiece){
        ctx.strokeStyle='#00e5ff';
        ctx.lineWidth=2;
        ctx.strokeRect(px+1,py+1,cell-2,cell-2);
        ctx.lineWidth=1;
      }
      // grid line
      ctx.strokeStyle='rgba(255,255,255,.04)';
      ctx.strokeRect(px,py,cell,cell);
    }
    // legal hints: if selected, show possible moves translucent
    if(this.selectedId){
      const piece = state.pieces.find(p=> p.id===this.selectedId);
      if(piece && !piece.captured){
        // simple hint: highlight neighbor cells that are free
        for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){
          if(dx===0&&dy===0) continue;
          const nx=piece.x+dx, ny=piece.y+dy;
          if(nx<0||nx>=7||ny<0||ny>=7) continue;
          if(state.board[ny][nx]?.type==='block') continue;
          if(state.pieces.some(p=> p.owner===piece.owner && p.x===nx && p.y===ny && !p.captured)) continue;
          if(state.core.x===nx && state.core.y===ny) continue;
          const px=ox+nx*cell+cell/2, py=oy+ny*cell+cell/2;
          ctx.fillStyle='rgba(0,229,255,.18)';
          ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2); ctx.fill();
        }
      }
    }
    // draw pieces + core with animation interpolation
    const lerp = (a,b,t)=> a + (b-a)*t;
    const t = this.anim.active ? easeOutCubic(this.anim.t) : 1;
    // core position interpolated
    let coreX = state.core.x, coreY=state.core.y;
    if(this.anim.active && this.anim.prevCore){
      coreX = lerp(this.anim.prevCore.x, this.anim.nextCore.x, t);
      coreY = lerp(this.anim.prevCore.y, this.anim.nextCore.y, t);
    }
    // draw core
    {
      const px=ox + coreX*cell + cell/2, py=oy + coreY*cell + cell/2;
      const pulse = Math.sin(performance.now()/400)*0.15+0.85;
      ctx.shadowColor='#00ffa6'; ctx.shadowBlur=18*pulse;
      ctx.fillStyle='#00ffa6';
      ctx.beginPath(); ctx.arc(px,py, cell*0.32, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      ctx.fillStyle='#ffffff';
      ctx.beginPath(); ctx.arc(px-cell*0.08,py-cell*0.08, cell*0.09,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(0,255,166,.8)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(px,py, cell*0.42,0,Math.PI*2); ctx.stroke();
      // inner ring
      ctx.strokeStyle='rgba(255,255,255,.6)';
      ctx.beginPath(); ctx.arc(px,py, cell*0.22, 0, Math.PI*2); ctx.stroke();
    }
    // pieces
    for(const p of state.pieces){
      if(p.captured) continue;
      let x=p.x, y=p.y;
      // if this piece moved in anim, interpolate
      if(this.anim.active && this.anim.moves){
        const m=this.anim.moves.find(mm=> mm.pieceId===p.id);
        if(m){ x=lerp(m.from.x, m.to.x, t); y=lerp(m.from.y, m.to.y, t); }
      }
      const px=ox + x*cell + cell/2, py=oy + y*cell + cell/2;
      const isYou = p.owner===0;
      const base = isYou ? '#00e5ff' : '#ff00a8';
      const dark = isYou ? '#007a8a' : '#7a0040';
      const selected = p.id===this.selectedId;
      // shadow
      ctx.fillStyle='rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.ellipse(px,py+cell*0.3, cell*0.28, cell*0.12,0,0,Math.PI*2); ctx.fill();
      // body
      const grad=ctx.createLinearGradient(px-cell*0.3,py-cell*0.3,px+cell*0.3,py+cell*0.3);
      grad.addColorStop(0, base); grad.addColorStop(1,dark);
      ctx.fillStyle=grad;
      // shape: hexagonish
      ctx.beginPath();
      const r=cell*0.34;
      for(let i=0;i<6;i++){ const ang=(Math.PI/3)*i - Math.PI/6; const rx=px + Math.cos(ang)*r; const ry=py + Math.sin(ang)*r; i===0?ctx.moveTo(rx,ry):ctx.lineTo(rx,ry); }
      ctx.closePath(); ctx.fill();
      if(selected){ ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.stroke(); }
      // inner highlight
      ctx.fillStyle='rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(px-4,py-4,3,0,Math.PI*2); ctx.fill();
      // cooldown badge
      if(p.cd>0){
        ctx.fillStyle='rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(px+cell*0.22,py-cell*0.22,8,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#ffcc00'; ctx.font='bold 10px JetBrains Mono'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(p.cd), px+cell*0.22, py-cell*0.22);
      }
      // owner mark
      ctx.fillStyle=isYou? '#00131a' : '#fff';
      ctx.font='bold 11px Orbitron'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(isYou?'◉':'⬣', px, py+1);
    }
    // particles
    for(const pt of this.particles){
      const px=ox + pt.x*cell + cell/2, py=oy + pt.y*cell + cell/2;
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle=pt.color;
      ctx.beginPath(); ctx.arc(px,py, pt.r,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
    // coordinates labels
    ctx.fillStyle='rgba(255,255,255,.18)';
    ctx.font='10px JetBrains Mono';
    for(let i=0;i<7;i++){ ctx.fillText(String.fromCharCode(65+i), ox+i*cell+cell/2-3, oy+boardPx+10); ctx.fillText(String(7-i), ox-10, oy+i*cell+cell/2+3); }
  }
}
function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }
