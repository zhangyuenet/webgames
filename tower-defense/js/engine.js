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

/*
 * 游戏引擎：纯逻辑，不碰 DOM / Canvas，浏览器和 node 都能跑。
 * 坐标单位为“格”，格子 (c, r) 的中心是 (c + 0.5, r + 0.5)。
 */
(function (TD) {
  'use strict';

  const key = (c, r) => c + ',' + r;

  /** 把拐点列表展开成逐格的路径 */
  function buildPath(waypoints) {
    const cells = [];
    for (let i = 0; i < waypoints.length; i++) {
      const [c, r] = waypoints[i];
      if (i === 0) { cells.push([c, r]); continue; }
      const [pc, pr] = waypoints[i - 1];
      if (pc !== c && pr !== r) throw new Error('路径拐点必须在同一行或同一列: ' + [pc, pr] + ' -> ' + [c, r]);
      const dc = Math.sign(c - pc), dr = Math.sign(r - pr);
      let cc = pc, rr = pr;
      while (cc !== c || rr !== r) { cc += dc; rr += dr; cells.push([cc, rr]); }
    }
    return cells;
  }
  TD.buildPath = buildPath;

  class Game {
    constructor(level, opts) {
      opts = opts || {};
      this.level = level;
      this.cols = level.cols;
      this.rows = level.rows;
      this.paths = level.paths.map(buildPath);
      this.hpMul = level.hpMul || 1;

      // 地形：G 空地（可建塔），P 道路（可放地雷/陷阱/墙），X 障碍
      this.grid = [];
      for (let r = 0; r < this.rows; r++) {
        const row = [];
        for (let c = 0; c < this.cols; c++) row.push('G');
        this.grid.push(row);
      }
      this.endpoints = new Set();
      for (const path of this.paths) {
        for (const [c, r] of path) this.grid[r][c] = 'P';
        this.endpoints.add(key(...path[0]));
        this.endpoints.add(key(...path[path.length - 1]));
      }
      for (const [c, r] of (level.blocked || [])) {
        if (this.grid[r] && this.grid[r][c] === 'G') this.grid[r][c] = 'X';
      }

      this.gold = level.startGold + (opts.bonusGold || 0);
      this.lives = level.lives;
      this.waveIndex = -1;          // 当前波次（0 起），-1 表示还没开始
      // build 开局布阵 | wave 本波正在出兵 | countdown 出完兵，倒计时下一波（不等清完）| final 最后一波出完，清完即胜 | won | lost
      this.phase = 'build';
      this.waveAlive = new Map();   // 波次 -> 场上存活数，用于判定“某一波清完”
      this.waveCleared = new Set();
      this.countdown = 0;
      this.waveTime = 0;
      this.time = 0;
      this.kills = 0;
      this.leaks = 0;
      this.nextId = 1;

      this.enemies = [];
      this.towers = [];             // 包含炮塔和道路上的地雷/陷阱/墙
      this.projectiles = [];
      this.effects = [];
      this.spawnQueue = [];
      this.events = [];             // 供 UI 消费的事件队列
      this.occupied = new Map();    // "c,r" -> tower
    }

    // ---------- 查询 ----------
    get waveCount() { return this.level.waves.length; }
    inBounds(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
    cellType(c, r) { return this.inBounds(c, r) ? this.grid[r][c] : null; }
    itemAt(c, r) { return this.occupied.get(key(c, r)) || null; }
    towerById(id) { return this.towers.find(t => t.id === id) || null; }
    countKind(kind) { let n = 0; for (const t of this.towers) if (t.kind === kind) n++; return n; }

    towerStats(t) {
      const up = TD.UPGRADE, lv = t.level - 1, d = t.def;
      return {
        dmg: d.dmg * up.dmgMul[lv],
        range: (d.range || 0) * up.rangeMul[lv],
        rate: (d.rate || 0) * up.rateMul[lv],
      };
    }
    upgradeCost(t) {
      if (t.def.kind !== 'tower' || t.level >= TD.UPGRADE.maxLevel) return null;
      return Math.round(t.def.cost * TD.UPGRADE.costPct[t.level]);
    }
    sellValue(t) { return Math.floor(t.invested * TD.SELL_PCT); }

    // ---------- 建造 ----------
    canPlace(kind, c, r) {
      const def = TD.WEAPONS[kind];
      if (!def) return { ok: false, reason: '未知武器' };
      if (!this.inBounds(c, r)) return { ok: false, reason: '超出地图' };
      if (this.occupied.has(key(c, r))) return { ok: false, reason: '这里已经有东西了' };
      const t = this.grid[r][c];
      if (def.kind === 'tower' && t !== 'G') return { ok: false, reason: '炮塔只能建在空地上' };
      if (def.kind === 'path') {
        if (t !== 'P') return { ok: false, reason: def.name + '只能放在道路上' };
        if (this.endpoints.has(key(c, r))) return { ok: false, reason: '不能放在出入口上' };
        if (def.maxCount && this.countKind(kind) >= def.maxCount) return { ok: false, reason: '场上最多 ' + def.maxCount + ' 个' + def.name };
      }
      if (this.gold < def.cost) return { ok: false, reason: '金币不足' };
      return { ok: true };
    }

    place(kind, c, r) {
      const chk = this.canPlace(kind, c, r);
      if (!chk.ok) return chk;
      const def = TD.WEAPONS[kind];
      const t = {
        id: this.nextId++, kind, def, col: c, row: r, x: c + 0.5, y: r + 0.5,
        level: 1, invested: def.cost, cooldown: 0, angle: -Math.PI / 2,
        uses: def.uses || 0, hp: def.hp || 0, maxHp: def.hp || 0, cd: 0, targetId: 0, kills: 0,
      };
      this.gold -= def.cost;
      this.towers.push(t);
      this.occupied.set(key(c, r), t);
      this.events.push({ type: 'placed', tower: t });
      return { ok: true, tower: t };
    }

    upgrade(id) {
      const t = this.towerById(id);
      if (!t) return { ok: false, reason: '不存在' };
      const cost = this.upgradeCost(t);
      if (cost === null) return { ok: false, reason: '不能再升级了' };
      if (this.gold < cost) return { ok: false, reason: '金币不足' };
      this.gold -= cost;
      t.invested += cost;
      t.level++;
      this.events.push({ type: 'upgraded', tower: t });
      return { ok: true };
    }

    sell(id) {
      const t = this.towerById(id);
      if (!t) return { ok: false, reason: '不存在' };
      const v = this.sellValue(t);
      this.gold += v;
      this.removeTower(t);
      this.events.push({ type: 'sold', tower: t, value: v });
      return { ok: true, value: v };
    }

    removeTower(t) {
      const i = this.towers.indexOf(t);
      if (i >= 0) this.towers.splice(i, 1);
      this.occupied.delete(key(t.col, t.row));
    }

    destroyItem(t, how) {
      this.removeTower(t);
      this.effects.push({ type: 'break', x: t.x, y: t.y, ttl: 0.5, life: 0.5 });
      this.events.push({ type: 'destroyed', tower: t, how });
    }

    // ---------- 波次 ----------
    startWave() {
      if (this.phase !== 'build' && this.phase !== 'countdown') return false;
      if (this.phase === 'countdown' && this.countdown > 0) {
        const bonus = Math.ceil(this.countdown) * TD.ECONOMY.earlyCallPerSec;
        if (bonus > 0) { this.gold += bonus; this.events.push({ type: 'earlyBonus', gold: bonus }); }
      }
      this.waveIndex++;
      this.phase = 'wave';
      this.waveTime = 0;
      this.countdown = 0;
      const wave = this.level.waves[this.waveIndex];
      const queue = [];
      let cursor = 0;
      for (const g of wave) {
        const start = (g.delay !== undefined) ? g.delay : cursor;
        const gap = g.gap || 1;
        for (let i = 0; i < g.count; i++) {
          queue.push({ time: start + i * gap, type: g.type, path: Math.min(g.path || 0, this.paths.length - 1) });
        }
        const end = start + (g.count - 1) * gap;
        if (g.delay === undefined) cursor = end + 0.8;
        else cursor = Math.max(cursor, end + 0.8);
      }
      queue.sort((a, b) => a.time - b.time);
      this.spawnQueue = queue;
      this.waveAlive.set(this.waveIndex, 0);
      this.events.push({ type: 'wave', index: this.waveIndex });
      return true;
    }

    /** 某个敌人离场（死亡或到达基地）后的波次结算 */
    noteGone(e) {
      const n = (this.waveAlive.get(e.wave) || 0) - 1;
      this.waveAlive.set(e.wave, n);
      const fullySpawned = e.wave < this.waveIndex || this.spawnQueue.length === 0;
      if (n <= 0 && fullySpawned && !this.waveCleared.has(e.wave)) {
        this.waveCleared.add(e.wave);
        const bonus = TD.ECONOMY.waveBonusBase + TD.ECONOMY.waveBonusPerWave * (e.wave + 1);
        this.gold += bonus;
        this.events.push({ type: 'waveCleared', index: e.wave, gold: bonus });
      }
    }

    spawn(type, pathIndex) {
      const def = TD.ENEMIES[type];
      const path = this.paths[pathIndex];
      const hp = Math.round(def.hp * this.hpMul * (1 + TD.SCALING.hpPerWave * this.waveIndex));
      const e = {
        id: this.nextId++, type, def, hp, maxHp: hp, pathIndex, path, wave: this.waveIndex,
        dist: 0, x: path[0][0] + 0.5, y: path[0][1] + 0.5, dx: 1, dy: 0,
        stun: 0, blocked: false, dead: false, reached: false,
      };
      this.updateEnemyPos(e);
      this.enemies.push(e);
      this.waveAlive.set(this.waveIndex, (this.waveAlive.get(this.waveIndex) || 0) + 1);
      return e;
    }

    // ---------- 主循环 ----------
    update(dt) {
      this.time += dt;
      if (this.phase === 'wave') {
        this.waveTime += dt;
        while (this.spawnQueue.length && this.spawnQueue[0].time <= this.waveTime) {
          const s = this.spawnQueue.shift();
          this.spawn(s.type, s.path);
        }
        if (this.spawnQueue.length === 0) {
          if (this.waveIndex >= this.waveCount - 1) this.phase = 'final';
          else { this.phase = 'countdown'; this.countdown = TD.ECONOMY.countdown; }
        }
      } else if (this.phase === 'countdown') {
        this.countdown -= dt;
        if (this.countdown <= 0) this.startWave();
      }
      if (this.phase !== 'won' && this.phase !== 'lost') {
        for (const e of this.enemies) this.updateEnemy(e, dt);
        for (const t of this.towers) this.updateTower(t, dt);
      }
      this.updateProjectiles(dt);
      this.updateEffects(dt);
      // 离场结算与清理
      if (this.enemies.some(e => e.dead || e.reached)) {
        for (const e of this.enemies) if (e.dead || e.reached) this.noteGone(e);
        this.enemies = this.enemies.filter(e => !e.dead && !e.reached);
      }
      if (this.phase === 'final' && this.enemies.length === 0) {
        this.phase = 'won';
        this.events.push({ type: 'won' });
      }
    }

    updateEnemyPos(e) {
      const path = e.path, n = path.length;
      const i = Math.max(0, Math.min(Math.floor(e.dist), n - 2));
      const f = Math.max(0, Math.min(e.dist - i, 1));
      const a = path[i], b = path[i + 1];
      e.dx = b[0] - a[0]; e.dy = b[1] - a[1];
      e.x = a[0] + 0.5 + e.dx * f;
      e.y = a[1] + 0.5 + e.dy * f;
    }

    updateEnemy(e, dt) {
      if (e.dead || e.reached) return;
      if (e.stun > 0) { e.stun -= dt; return; }
      const path = e.path;
      const i = Math.floor(e.dist);
      const f = e.dist - i;
      let step = e.def.speed * dt;
      e.blocked = false;

      // 前方格子上的墙
      if (i + 1 < path.length) {
        const next = path[i + 1];
        const w = this.itemAt(next[0], next[1]);
        if (w && w.kind === 'wall') {
          if (e.def.crushes) {
            if (f >= 0.4) this.destroyItem(w, 'crushed');
          } else if (f >= 0.5) {
            e.blocked = true;
            w.hp -= e.def.wallDps * dt;
            if (w.hp <= 0) this.destroyItem(w, 'broken');
            return;
          } else {
            step = Math.min(step, i + 0.5 - e.dist);
          }
        }
      }

      e.dist += step;
      if (e.dist >= path.length - 1) {
        e.reached = true;
        e.dist = path.length - 1;
        this.updateEnemyPos(e);
        this.lives = Math.max(0, this.lives - e.def.lives);
        this.leaks++;
        this.events.push({ type: 'leak', enemy: e });
        if (this.lives <= 0 && this.phase !== 'lost') {
          this.phase = 'lost';
          this.events.push({ type: 'lost' });
        }
        return;
      }
      this.updateEnemyPos(e);

      // 踩到道路上的地雷 / 陷阱
      const ci = Math.round(e.dist);
      if (Math.abs(e.dist - ci) <= 0.3 && ci < path.length) {
        const it = this.itemAt(path[ci][0], path[ci][1]);
        if (it) {
          if (it.kind === 'mine') this.detonateMine(it, e);
          else if (it.kind === 'trap') this.triggerTrap(it, e);
        }
      }
    }

    detonateMine(m, e) {
      this.removeTower(m);
      this.effects.push({ type: 'boom', x: m.x, y: m.y, r: m.def.radius, ttl: 0.4, life: 0.4, kind: 'mine' });
      this.areaDamage(m.x, m.y, m.def.radius, m.def.dmg, 'mine', m);
      this.events.push({ type: 'mine', tower: m, enemy: e });
    }

    triggerTrap(t, e) {
      if (e.def.crushes) { this.destroyItem(t, 'crushed'); return; }
      if (e.def.jumpsTraps) return;
      if (t.cd > 0) return;
      t.cd = t.def.cooldown;
      t.uses--;
      this.effects.push({ type: 'boom', x: t.x, y: t.y, r: t.def.radius, ttl: 0.35, life: 0.35, kind: 'trap' });
      for (const o of this.enemies) {
        if (o.dead || o.reached) continue;
        const d = Math.hypot(o.x - t.x, o.y - t.y);
        if (d > t.def.radius) continue;
        if (TD.damageMult('trap', o.type) <= 0) continue;
        o.stun = Math.max(o.stun, t.def.stun);
        this.hit(o, t.def.dmg, 'trap', t);
      }
      this.events.push({ type: 'trap', tower: t });
      if (t.uses <= 0) this.destroyItem(t, 'used');
    }

    pickTarget(t, range) {
      let best = null, bestRemain = Infinity;
      const r2 = range * range;
      for (const e of this.enemies) {
        if (e.dead || e.reached) continue;
        if (TD.damageMult(t.kind, e.type) <= 0) continue;
        const dx = e.x - t.x, dy = e.y - t.y;
        if (dx * dx + dy * dy > r2) continue;
        const remain = (e.path.length - 1) - e.dist;
        if (remain < bestRemain) { bestRemain = remain; best = e; }
      }
      return best;
    }

    updateTower(t, dt) {
      if (t.cd > 0) t.cd -= dt;
      if (t.def.kind !== 'tower') return;
      t.cooldown -= dt;
      const st = this.towerStats(t);
      const target = this.pickTarget(t, st.range);
      if (target) {
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        t.targetId = target.id;
        if (t.cooldown <= 0) {
          this.fire(t, target, st);
          t.cooldown = 1 / st.rate;
        }
      } else {
        t.targetId = 0;
      }
    }

    fire(t, target, st) {
      if (t.def.hit === 'single') {
        this.hit(target, st.dmg, t.kind, t);
        this.effects.push({ type: 'tracer', x1: t.x, y1: t.y, x2: target.x, y2: target.y, ttl: 0.07, life: 0.07 });
        return;
      }
      const shots = t.def.shots || 1;
      for (let k = 0; k < shots; k++) {
        this.projectiles.push({
          kind: t.kind, def: t.def, owner: t, x: t.x, y: t.y, target,
          tx: target.x, ty: target.y, dx: target.dx, dy: target.dy,
          speed: t.def.projectile.speed, dmg: st.dmg, delay: k * 0.15, angle: t.angle,
        });
      }
    }

    updateProjectiles(dt) {
      let any = false;
      for (const p of this.projectiles) {
        if (p.delay > 0) { p.delay -= dt; continue; }
        const tg = p.target;
        if (tg && !tg.dead && !tg.reached) { p.tx = tg.x; p.ty = tg.y; p.dx = tg.dx; p.dy = tg.dy; }
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        if (d <= step) {
          p.x = p.tx; p.y = p.ty;
          this.explode(p);
          p.done = true; any = true;
        } else {
          p.x += dx / d * step; p.y += dy / d * step;
          p.angle = Math.atan2(dy, dx);
        }
      }
      if (any) this.projectiles = this.projectiles.filter(p => !p.done);
    }

    explode(p) {
      const d = p.def;
      if (d.hit === 'circle') {
        this.effects.push({ type: 'boom', x: p.x, y: p.y, r: d.radius, ttl: 0.3, life: 0.3, kind: p.kind });
        this.areaDamage(p.x, p.y, d.radius, p.dmg, p.kind, p.owner);
      } else if (d.hit === 'rect') {
        let ux = p.dx, uy = p.dy;
        const n = Math.hypot(ux, uy);
        if (n === 0) { ux = 1; uy = 0; } else { ux /= n; uy /= n; }
        this.effects.push({ type: 'rect', x: p.x, y: p.y, ux, uy, w: d.rectW, l: d.rectL, ttl: 0.3, life: 0.3 });
        for (const e of this.enemies) {
          if (e.dead || e.reached) continue;
          const rx = e.x - p.x, ry = e.y - p.y;
          const along = rx * ux + ry * uy;
          const across = rx * uy - ry * ux;
          if (Math.abs(along) <= d.rectL / 2 && Math.abs(across) <= d.rectW / 2) this.hit(e, p.dmg, p.kind, p.owner);
        }
      }
    }

    areaDamage(x, y, radius, dmg, kind, owner) {
      for (const e of this.enemies) {
        if (e.dead || e.reached) continue;
        if (Math.hypot(e.x - x, e.y - y) <= radius) this.hit(e, dmg, kind, owner);
      }
    }

    hit(e, dmg, kind, owner) {
      if (e.dead || e.reached) return;
      const mult = TD.damageMult(kind, e.type);
      if (mult <= 0) return;
      e.hp -= dmg * mult;
      if (e.hp <= 0) {
        e.hp = 0;
        e.dead = true;
        this.kills++;
        this.gold += e.def.reward;
        if (owner) owner.kills = (owner.kills || 0) + 1;
        this.effects.push({ type: 'float', x: e.x, y: e.y, text: '+' + e.def.reward, ttl: 0.8, life: 0.8 });
        this.events.push({ type: 'kill', enemy: e });
      }
    }

    updateEffects(dt) {
      let any = false;
      for (const f of this.effects) { f.ttl -= dt; if (f.ttl <= 0) any = true; }
      if (any) this.effects = this.effects.filter(f => f.ttl > 0);
    }

    /** 取出并清空事件队列 */
    drainEvents() { const ev = this.events; this.events = []; return ev; }
  }

  TD.Game = Game;
})(globalThis.TD = globalThis.TD || {});
