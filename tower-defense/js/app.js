/*
 * Copyright 2026 Yue Zhang
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* 页面逻辑：把引擎、画面、存档和 DOM 串起来。 */
(function (TD) {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const C = TD.CELL;
  const HINTS = [
    '炮塔放在两段路之间的空地上，可以同时打到两边。',
    '机关枪对坦克无效，对装甲车只有 15% 伤害；重甲要靠火炮、导弹和地雷。',
    '墙能把敌人堵成一堆，这时火炮和火箭炮的范围伤害最划算。',
    '陷阱对骑兵无效（它们会跳过去），坦克会把它碾碎。',
    '下一波不等你清完就会来，杀得慢会叠波；提前召唤有金币奖励，但先确认炮火够用。',
    '墙很快会被拆掉，它的作用是让敌人在火炮范围内挤成一堆，而不是永远挡住。',
    '升级一座塔往往比新建一座更划算，尤其是位置好的那座。',
  ];

  class App {
    constructor() {
      this.save = TD.Storage.load();
      this.canvas = $('#game');
      this.renderer = new TD.Renderer(this.canvas);
      this.selectedKind = null;
      this.selectedTower = null;
      this.hover = null;
      this.paused = false;
      this.overlayShown = false;
      this.ended = false;
      this.speed = this.save.settings.speed || 1;
      this.acc = 0;
      this.logLines = [];
      this.buildButtons();
      this.buildHelp();
      this.bindEvents();
      this.startLevel(this.save.level, true);
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    // ---------- 关卡流程 ----------
    startLevel(n, showIntro) {
      this.levelNo = n;
      this.levelDef = TD.getLevel(n);
      const bonus = (n === this.save.level) ? this.save.bonusGold : 0;
      this.game = new TD.Game(this.levelDef, { bonusGold: bonus });
      this.renderer.resize(this.game);
      this.selectedKind = null; this.selectedTower = null;
      this.paused = false; this.ended = false; this.acc = 0;
      this.logLines = [];
      this.log(`第 ${n} 关「${this.levelDef.name}」：${this.levelDef.intro}`);
      if (bonus) this.log(`上一关带来 ${bonus} 金币。`);
      this.refreshLevelSelect();
      this.refreshBuildButtons();
      if (showIntro) {
        this.showOverlay(`第 ${n} 关 · ${this.levelDef.name}`,
          `${this.levelDef.intro}\n\n起始金币 ${this.game.gold}，生命 ${this.game.lives}，共 ${this.game.waveCount} 波。\n先布置炮塔，准备好了再点「开始第 1 波」。之后每波出完兵 ${TD.ECONOMY.countdown} 秒后下一波自动到来，不等你清完。`,
          [['开始布阵', () => this.hideOverlay()]]);
      } else {
        this.hideOverlay();
      }
      this.updateHud();
    }

    onWon() {
      const g = this.game, n = this.levelNo, s = this.save;
      const carry = Math.min(TD.ECONOMY.carryOverMax, Math.floor(g.gold * TD.ECONOMY.carryOverPct));
      s.stats.kills += g.kills;
      s.stats.cleared++;
      s.stats.bestLevel = Math.max(s.stats.bestLevel, n);
      s.stats.playSeconds += Math.round(g.time);
      if (n >= s.level) { s.level = n + 1; s.bonusGold = carry; }
      s.unlocked = Math.max(s.unlocked, n + 1);
      TD.Storage.save(s);
      this.refreshLevelSelect();
      const next = TD.getLevel(n + 1);
      this.showOverlay(`第 ${n} 关通关！`,
        `剩余生命 ${g.lives}，击杀 ${g.kills}，剩余金币 ${g.gold}（${carry} 带入下一关）。\n\n下一关：${next.name}`,
        [['下一关', () => this.startLevel(n + 1, true)], ['重玩本关', () => this.startLevel(n, false)]]);
    }

    onLost() {
      const g = this.game, s = this.save;
      s.stats.kills += g.kills;
      s.stats.playSeconds += Math.round(g.time);
      TD.Storage.save(s);
      const hint = HINTS[Math.floor(Math.random() * HINTS.length)];
      this.showOverlay('基地失守',
        `坚持到了第 ${g.waveIndex + 1}/${g.waveCount} 波，击杀 ${g.kills}。\n\n小提示：${hint}`,
        [['重玩本关', () => this.startLevel(this.levelNo, false)]]);
    }

    // ---------- 主循环 ----------
    loop(now) {
      const real = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const g = this.game;
      if (!this.paused && !this.overlayShown && !this.ended) {
        this.acc += real * this.speed;
        const step = 1 / 60;
        let n = 0;
        while (this.acc >= step && n < 8) { g.update(step); this.acc -= step; n++; }
        if (this.acc > step) this.acc = 0;
      }
      this.handleEvents();
      this.renderer.draw(g, { hover: this.hover, selectedKind: this.selectedKind, selectedTower: this.selectedTower });
      this.updateHud();
      requestAnimationFrame((t) => this.loop(t));
    }

    handleEvents() {
      const g = this.game;
      for (const ev of g.drainEvents()) {
        switch (ev.type) {
          case 'wave': this.log(`第 ${ev.index + 1} 波来了！`); break;
          case 'waveCleared': this.log(`第 ${ev.index + 1} 波清除，奖励 +${ev.gold}`); break;
          case 'earlyBonus': this.log(`提前召唤，奖励 +${ev.gold}`); break;
          case 'leak': this.log(`${ev.enemy.def.name}冲进了基地！`); break;
          case 'destroyed':
            if (ev.how === 'crushed') this.log(`${ev.tower.def.name}被坦克碾碎了`);
            else if (ev.how === 'broken') this.log('墙被拆掉了');
            else if (ev.how === 'used') this.log('一个陷阱用完了');
            break;
          case 'won': this.ended = true; this.onWon(); break;
          case 'lost': this.ended = true; this.onLost(); break;
          default: break;
        }
      }
      if (this.selectedTower && !g.towers.includes(this.selectedTower)) this.selectTower(null);
    }

    log(text) {
      this.logLines.push(text);
      if (this.logLines.length > 40) this.logLines.shift();
      const el = $('#log');
      el.innerHTML = this.logLines.map(l => `<div>${escapeHtml(l)}</div>`).join('');
      el.scrollTop = el.scrollHeight;
    }

    // ---------- HUD ----------
    updateHud() {
      const g = this.game;
      setText('#stLevel', `${this.levelNo} · ${this.levelDef.name}`);
      setText('#stGold', g.gold);
      setText('#stLives', g.lives);
      setText('#stWave', `${Math.max(0, g.waveIndex + 1)} / ${g.waveCount}`);
      const bw = $('#btnWave');
      if (g.phase === 'build') { bw.disabled = false; bw.textContent = `开始第 ${g.waveIndex + 2} 波`; }
      else if (g.phase === 'countdown') {
        const bonus = Math.ceil(g.countdown) * TD.ECONOMY.earlyCallPerSec;
        bw.disabled = false; bw.textContent = `下一波（${Math.ceil(g.countdown)} 秒）  提前 +${bonus}`;
      } else if (g.phase === 'wave') { bw.disabled = true; bw.textContent = `第 ${g.waveIndex + 1} 波出兵中…`; }
      else if (g.phase === 'final') { bw.disabled = true; bw.textContent = '最后一波，清完即通关'; }
      else { bw.disabled = true; bw.textContent = g.phase === 'won' ? '通关' : '失败'; }
      $('#btnPause').textContent = this.paused ? '继续' : '暂停';
      $('#btnSpeed').textContent = `×${this.speed}`;
      if (this.lastGold !== g.gold) { this.lastGold = g.gold; this.refreshBuildButtons(); }
      if (this.selectedTower) this.refreshSelected();
    }

    refreshBuildButtons() {
      const g = this.game;
      for (const kind of TD.WEAPON_ORDER) {
        const btn = this.buildBtns[kind];
        const def = TD.WEAPONS[kind];
        const poor = g.gold < def.cost || (def.maxCount && g.countKind(kind) >= def.maxCount);
        btn.classList.toggle('poor', poor);
        btn.classList.toggle('active', this.selectedKind === kind);
      }
    }

    refreshLevelSelect() {
      const sel = $('#levelSelect');
      sel.innerHTML = '';
      for (let i = 1; i <= this.save.unlocked; i++) {
        const o = document.createElement('option');
        const def = TD.getLevel(i);
        o.value = i; o.textContent = `${i} · ${def.name}`;
        sel.appendChild(o);
      }
      sel.value = String(this.levelNo);
    }

    // ---------- 建造按钮 ----------
    buildButtons() {
      const box = $('#build');
      this.buildBtns = {};
      for (const kind of TD.WEAPON_ORDER) {
        const def = TD.WEAPONS[kind];
        const btn = document.createElement('button');
        btn.dataset.kind = kind;
        const cv = document.createElement('canvas');
        cv.width = 40; cv.height = 40;
        TD.drawWeaponIcon(cv.getContext('2d'), kind, 20, 20);
        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.innerHTML = `<span>${def.key}. ${def.name}</span><span class="cost">${def.cost} 金</span>`;
        btn.appendChild(cv); btn.appendChild(meta);
        btn.addEventListener('click', () => this.selectKind(kind));
        btn.addEventListener('mouseenter', () => this.showTip(kind));
        box.appendChild(btn);
        this.buildBtns[kind] = btn;
      }
    }

    showTip(kind) {
      const def = TD.WEAPONS[kind];
      let s = `<b>${def.name}</b> ${def.cost} 金 — ${def.desc}`;
      if (def.kind === 'tower') s += `<br>伤害 ${def.dmg} · 射速 ${def.rate}/秒 · 射程 ${def.range} 格` + (def.radius ? ` · 溅射半径 ${def.radius} 格` : '') + (def.rectL ? ` · 范围 ${def.rectW}×${def.rectL} 格` : '') + ' · 可升 3 级';
      else if (def.dmg) s += `<br>伤害 ${def.dmg} · 半径 ${def.radius} 格`;
      else if (def.hp) s += `<br>耐久 ${def.hp}`;
      $('#tip').innerHTML = s;
    }

    selectKind(kind) {
      this.selectedKind = (this.selectedKind === kind) ? null : kind;
      if (this.selectedKind) { this.selectTower(null); this.showTip(kind); }
      this.refreshBuildButtons();
    }

    selectTower(t) {
      this.selectedTower = t;
      const box = $('#selected');
      if (!t) { box.classList.add('hidden'); return; }
      this.selectedKind = null;
      this.refreshBuildButtons();
      box.classList.remove('hidden');
      this.refreshSelected(true);
    }

    refreshSelected(force) {
      const t = this.selectedTower, g = this.game;
      if (!t) return;
      const up = g.upgradeCost(t);
      const sellV = g.sellValue(t);
      const sig = [t.level, up, sellV, g.gold >= (up || 0), t.kills, Math.round(t.hp), t.uses].join('|');
      if (!force && sig === this.selSig) return;
      this.selSig = sig;
      let html = `<b>${t.def.name}</b>`;
      if (t.def.kind === 'tower') {
        const st = g.towerStats(t);
        html += ` Lv.${t.level}<br>伤害 ${st.dmg.toFixed(0)} · 射速 ${st.rate.toFixed(1)}/秒 · 射程 ${st.range.toFixed(1)} 格<br>击杀 ${t.kills || 0}`;
      } else if (t.kind === 'wall') {
        html += `<br>耐久 ${Math.max(0, Math.ceil(t.hp))} / ${t.maxHp}`;
      } else if (t.kind === 'trap') {
        html += `<br>剩余 ${t.uses} 次`;
      } else {
        html += `<br>伤害 ${t.def.dmg}，一次性`;
      }
      html += '<div class="row">';
      if (t.def.kind === 'tower') {
        html += up === null
          ? '<button disabled>已满级</button>'
          : `<button id="btnUpgrade" ${g.gold < up ? 'disabled' : ''}>升级 (${up} 金)</button>`;
      }
      html += `<button id="btnSell">出售 (+${sellV})</button></div>`;
      const box = $('#selected');
      box.innerHTML = html;
      const bu = $('#btnUpgrade');
      if (bu) bu.addEventListener('click', () => { const r = g.upgrade(t.id); if (!r.ok) this.log(r.reason); this.refreshSelected(true); });
      $('#btnSell').addEventListener('click', () => { g.sell(t.id); this.selectTower(null); });
    }

    // ---------- 事件 ----------
    bindEvents() {
      const cv = this.canvas;
      const cellOf = (ev) => {
        const rect = cv.getBoundingClientRect();
        const x = (ev.clientX - rect.left) * cv.width / rect.width;
        const y = (ev.clientY - rect.top) * cv.height / rect.height;
        const c = Math.floor(x / C), r = Math.floor(y / C);
        return this.game.inBounds(c, r) ? { c, r } : null;
      };
      cv.addEventListener('mousemove', (ev) => { this.hover = cellOf(ev); });
      cv.addEventListener('mouseleave', () => { this.hover = null; });
      cv.addEventListener('click', (ev) => {
        const cell = cellOf(ev);
        if (!cell || this.overlayShown) return;
        this.onCellClick(cell);
      });
      cv.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.selectKind(null); this.selectTower(null); });

      $('#btnWave').addEventListener('click', () => this.game.startWave());
      $('#btnPause').addEventListener('click', () => { this.paused = !this.paused; });
      $('#btnSpeed').addEventListener('click', () => {
        this.speed = this.speed === 1 ? 2 : 1;
        this.save.settings.speed = this.speed;
        TD.Storage.save(this.save);
      });
      $('#btnRestart').addEventListener('click', () => this.startLevel(this.levelNo, false));
      $('#btnReset').addEventListener('click', () => {
        if (!confirm('清空所有记录（关卡进度、统计）？此操作不可恢复。')) return;
        TD.Storage.reset();
        this.save = TD.Storage.defaults();
        this.startLevel(1, true);
      });
      $('#levelSelect').addEventListener('change', (ev) => this.startLevel(parseInt(ev.target.value, 10), true));
      $('#btnHelp').addEventListener('click', () => { this.buildHelp(); $('#help').classList.remove('hidden'); this.paused = true; });
      $('#btnHelpClose').addEventListener('click', () => { $('#help').classList.add('hidden'); this.paused = false; });
      $('#btnExport').addEventListener('click', () => {
        const stamp = new Date().toISOString().slice(0, 10);
        TD.Storage.download(`tower-defense-save-${stamp}.json`, TD.Storage.exportText(this.save));
        this.log('记录已导出为文件。');
      });
      $('#btnImport').addEventListener('click', () => $('#fileImport').click());
      $('#fileImport').addEventListener('change', (ev) => {
        const file = ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            this.save = TD.Storage.importText(String(reader.result));
            TD.Storage.save(this.save);
            this.startLevel(this.save.level, true);
            this.log(`记录已导入：已解锁到第 ${this.save.unlocked} 关。`);
          } catch (e) {
            alert('导入失败：' + e.message);
          }
        };
        reader.readAsText(file);
      });

      window.addEventListener('keydown', (ev) => {
        if (ev.target && /input|select|textarea/i.test(ev.target.tagName)) return;
        if (!$('#help').classList.contains('hidden')) { if (ev.key === 'Escape') $('#btnHelpClose').click(); return; }
        const idx = TD.WEAPON_ORDER.findIndex(k => TD.WEAPONS[k].key === ev.key);
        if (idx >= 0) { this.selectKind(TD.WEAPON_ORDER[idx]); return; }
        if (ev.key === 'Escape') { this.selectKind(null); this.selectTower(null); }
        else if (ev.key === ' ') { ev.preventDefault(); if (!this.overlayShown) this.game.startWave(); }
        else if (ev.key === 'p' || ev.key === 'P') { this.paused = !this.paused; }
      });
    }

    onCellClick(cell) {
      const g = this.game;
      if (this.selectedKind) {
        const r = g.place(this.selectedKind, cell.c, cell.r);
        if (!r.ok) {
          this.log(r.reason);
          const t = g.itemAt(cell.c, cell.r);
          if (t) { this.selectTower(t); }
        } else {
          this.refreshBuildButtons();
        }
        return;
      }
      const t = g.itemAt(cell.c, cell.r);
      this.selectTower(t || null);
    }

    // ---------- 弹层 ----------
    showOverlay(title, text, buttons) {
      this.overlayShown = true;
      setText('#ovTitle', title);
      setText('#ovText', text);
      const row = $('#ovButtons');
      row.innerHTML = '';
      buttons.forEach(([label, fn], i) => {
        const b = document.createElement('button');
        if (i === 0) b.className = 'primary';
        b.textContent = label;
        b.addEventListener('click', fn);
        row.appendChild(b);
      });
      $('#overlay').classList.remove('hidden');
    }
    hideOverlay() {
      this.overlayShown = false;
      $('#overlay').classList.add('hidden');
      this.last = performance.now();
    }

    // ---------- 规则说明（由配置生成） ----------
    buildHelp() {
      const body = $('#helpBody');
      const icon = (fn) => { const cv = document.createElement('canvas'); cv.width = 36; cv.height = 36; fn(cv.getContext('2d')); return cv; };
      const s = this.save.stats;
      let html = `
        <p>敌人沿着道路走向基地（小房子）。每个到达基地的敌人扣 1 点生命（坦克扣 2）。生命为 0 就输了；打完所有波次就进入下一关。</p>
        <ul>
          <li>炮塔（机关枪、火炮、火箭炮、导弹）建在<b>空地</b>上，可以升到 3 级，出售返还 ${Math.round(TD.SELL_PCT * 100)}%。</li>
          <li>地雷、陷阱、墙放在<b>道路</b>上。墙同时最多 ${TD.WEAPONS.wall.maxCount} 面。</li>
          <li>一波出完兵 ${TD.ECONOMY.countdown} 秒后下一波自动到来，<b>不等清完</b>，杀得慢就会叠波。可以提前召唤，每剩 1 秒多得 ${TD.ECONOMY.earlyCallPerSec} 金。</li>
          <li>消灭敌人得金币；一波的敌人全部离场另有奖励。</li>
          <li>过关后剩余金币的 ${Math.round(TD.ECONOMY.carryOverPct * 100)}%（最多 ${TD.ECONOMY.carryOverMax}）带入下一关。敌人的血量每关 +${Math.round(TD.SCALING.hpPerLevel * 100)}%，每波 +${Math.round(TD.SCALING.hpPerWave * 100)}%。</li>
          <li>操作：点武器再点地图放置；点已有的塔可升级/出售；快捷键 1–8 选武器，空格开始下一波，P 暂停，Esc 取消。</li>
        </ul>
        <h3>武器</h3>
        <table><tr><th></th><th>名称</th><th>价格</th><th>伤害</th><th>射速</th><th>射程</th><th>说明</th></tr>`;
      const rows = [];
      for (const kind of TD.WEAPON_ORDER) {
        const d = TD.WEAPONS[kind];
        rows.push({ kind, d });
        html += `<tr><td data-icon="${kind}"></td><td>${d.name}</td><td>${d.cost}</td><td>${d.dmg !== undefined ? d.dmg : '—'}</td><td>${d.rate ? d.rate + '/秒' : '—'}</td><td>${d.range ? d.range + ' 格' : (d.radius ? '半径 ' + d.radius + ' 格' : '—')}</td><td>${d.desc}</td></tr>`;
      }
      html += `</table>
        <h3>敌人</h3>
        <table><tr><th></th><th>名称</th><th>血量</th><th>速度</th><th>装甲</th><th>金币</th><th>特性</th></tr>`;
      for (const type of TD.ENEMY_ORDER) {
        const e = TD.ENEMIES[type];
        const traits = [];
        if (e.jumpsTraps) traits.push('跳过陷阱');
        if (e.crushes) traits.push('碾碎墙和陷阱', '免疫机关枪');
        if (e.lives > 1) traits.push(`到达基地扣 ${e.lives} 命`);
        if (e.wallDps >= 60) traits.push('撞墙很快');
        html += `<tr><td data-enemy="${type}"></td><td>${e.name}</td><td>${e.hp}</td><td>${e.speed} 格/秒</td><td>${TD.ARMOR[e.armor]}</td><td>${e.reward}</td><td>${traits.join('，') || '—'}</td></tr>`;
      }
      html += `</table>
        <h3>相克（伤害倍率）</h3>
        <table><tr><th>武器 \\ 敌人</th>${TD.ENEMY_ORDER.map(t => `<th>${TD.ENEMIES[t].name}</th>`).join('')}</tr>`;
      for (const kind of TD.WEAPON_ORDER) {
        if (kind === 'wall') continue;
        html += `<tr><td>${TD.WEAPONS[kind].name}</td>${TD.ENEMY_ORDER.map(t => { const m = TD.damageMult(kind, t); return `<td>${m === 0 ? '<span style="color:var(--red)">无效</span>' : '×' + m}</td>`; }).join('')}</tr>`;
      }
      html += `<tr><td>墙</td>${TD.ENEMY_ORDER.map(t => { const e = TD.ENEMIES[t]; return `<td>${e.crushes ? '<span style="color:var(--red)">碾碎</span>' : '拆墙 ' + e.wallDps + '/秒'}</td>`; }).join('')}</tr></table>
        <h3>你的记录</h3>
        <p>通关 ${s.cleared} 次 · 最高到第 ${s.bestLevel} 关 · 累计击杀 ${s.kills} · 游戏时长 ${Math.round(s.playSeconds / 60)} 分钟。记录只存在本浏览器的 localStorage 里，可用页面顶部的按钮导出/导入。</p>`;
      body.innerHTML = html;
      body.querySelectorAll('td[data-icon]').forEach(td => td.appendChild(icon(ctx => TD.drawWeaponIcon(ctx, td.dataset.icon, 18, 18))));
      body.querySelectorAll('td[data-enemy]').forEach(td => td.appendChild(icon(ctx => TD.drawEnemyIcon(ctx, td.dataset.enemy, 18, 18))));
    }
  }

  function setText(sel, v) { const el = $(sel); if (el.textContent !== String(v)) el.textContent = v; }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

  window.addEventListener('DOMContentLoaded', () => { TD.app = new App(); });
})(globalThis.TD = globalThis.TD || {});
