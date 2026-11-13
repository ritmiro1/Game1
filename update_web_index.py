import os
from build_all_edits import EDITS_CONFIG

cards_html = []
for c in EDITS_CONFIG:
    slug = c['slug']
    title = c['title']
    style = c['style']
    desc = c['desc']
    dur = c['duration']
    num = c['id']

    card = f'''
        <div class="card edit-item-card" style="background: rgba(18, 24, 38, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, border-color 0.2s;">
          <div style="position: relative; width: 100%; aspect-ratio: 16/9; overflow: hidden; background: #000;">
            <img src="edits/{slug}.jpg" alt="{title}" style="width: 100%; height: 100%; object-fit: cover;">
            <span style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; color: #fbbf24;">#{num}</span>
            <span style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); padding: 3px 8px; border-radius: 6px; font-size: 11px; color: #fff;">{dur} сек</span>
          </div>
          <div style="padding: 16px; display: flex; flex-direction: column; flex-grow: 1; justify-content: space-between;">
            <div>
              <div style="font-size: 11px; font-weight: 700; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">{style}</div>
              <h3 style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 8px; line-height: 1.3;">{title}</h3>
              <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4; margin-bottom: 14px;">{desc}</p>
            </div>
            <div style="display: flex; gap: 8px; margin-top: auto;">
              <button onclick="selectVideo('edits/{slug}.mp4', '{title}', '{style}')" style="flex: 1; background: rgba(139, 92, 246, 0.2); border: 1px solid rgba(139, 92, 246, 0.4); color: #c4b5fd; padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                ▶ Смотреть
              </button>
              <a href="edits/{slug}.mp4" download="{slug}.mp4" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; text-decoration: none; display: flex; align-items: center; justify-content: center;">
                ⬇
              </a>
            </div>
          </div>
        </div>
    '''
    cards_html.append(card)

grid_cards_joined = '\n'.join(cards_html)

section_html = f'''
    <!-- All 16 Edits Section -->
    <section class="edits-pack-section" style="margin-top: 48px; margin-bottom: 60px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <div>
          <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 8px;">
            <span style="font-size: 24px;">🎬</span>
            <h2 style="font-size: 24px; font-weight: 800; color: #fff; letter-spacing: -0.5px;">Коллекция: 16 эдитов фильма «1+1»</h2>
            <span class="badge-gold">1080×1920 (9:16)</span>
          </div>
          <p style="color: var(--text-muted); font-size: 14px;">
            Каждый ролик смонтирован из чистого BDRip 1080p в своём уникальном кинематографичном стиле.
          </p>
        </div>

        <a href="edits_pack_1_plus_1.zip" download="edits_pack_1_plus_1.zip" class="btn btn-primary" style="padding: 12px 22px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #10b981, #059669);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Скачать все 16 эдитов в ZIP (382 МБ)
        </a>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px;">
        {grid_cards_joined}
      </div>
    </section>
'''

with open('web/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace quick actions in header
quick_target = '<div class="quick-actions">'
quick_replacement = '''<div class="quick-actions" style="display: flex; gap: 10px; flex-wrap: wrap;">
        <a href="edits_pack_1_plus_1.zip" download="edits_pack_1_plus_1.zip" class="btn btn-primary" style="background: linear-gradient(135deg, #10b981, #059669); border: none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Скачать весь ZIP-пак (16 эдитов • 382 МБ)
        </a>'''

html = html.replace(quick_target, quick_replacement, 1)

# Insert section before container close
container_close = '    </div>\n  </div>\n\n  <script>'
if container_close in html:
    html = html.replace(container_close, '    </div>\n' + section_html + '\n  </div>\n\n  <script>')
else:
    # try alternate spacing
    container_close_alt = '    </div>\n  </div>'
    idx = html.rfind(container_close_alt)
    html = html[:idx] + '    </div>\n' + section_html + html[idx + len('    </div>'):]

# Add JS selectVideo function
js_select = '''
    function selectVideo(url, title, style) {
      player.src = url;
      player.play();
      screen.classList.remove('paused');
      playBtn.textContent = '❚❚';
      
      const titleElem = document.querySelector('.hero-title');
      if (titleElem) titleElem.textContent = title;
      
      const subElem = document.querySelector('.hero-subtitle');
      if (subElem) subElem.innerHTML = '<span>Фильм: <strong>1+1 (2011)</strong></span> <span>•</span> <span>Стиль: <strong>' + style + '</strong></span>';
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
'''

html = html.replace('  </script>', js_select + '\n  </script>')

with open('web/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('Updated web/index.html with interactive 16-edits gallery!')
