/*
 * Copyright 2026 Yue Zhang
 * Licensed under the Apache License, Version 2.0. See LICENSE in the repository root.
 */
// 无头平衡性模拟：node tools/sim.js [关卡号] [策略名]
// 策略：greedy（合理布局）、naive（随机乱放机关枪）、lazy（开局三座塔然后不管）
'use strict';
require('../js/config.js');
require('../js/levels.js');
require('../js/engine.js');
const TD = globalThis.TD;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** 每个空地格子能覆盖多少道路格（按给定射程） */
function coverage(game, range) {
  const cells = [];
  const pathCells = [];
  for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) if (game.grid[r][c] === 'P') pathCells.push([c + 0.5, r + 0.5]);
  for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) {
    if (game.grid[r][c] !== 'G') continue;
    const x = c + 0.5, y = r + 0.5;
    let n = 0;
    for (const [px, py] of pathCells) if (Math.hypot(px - x, py - y) <= range) n++;
    cells.push({ c, r, n });
  }
  return cells;
}

const strategies = {
  // 合理玩家：按覆盖度选位，塔之间稍微分散，先机关枪后火炮，有余钱就升级
  greedy(game, rng) {
    const order = ['machinegun', 'machinegun', 'cannon', 'machinegun', 'cannon', 'twinCannon', 'cannon', 'twinCannon', 'missile', 'twinCannon', 'missile', 'rocket', 'missile'];
    const built = game.towers.filter(t => t.def.kind === 'tower').length;
    const kind = order[Math.min(built, order.length - 1)];
    const def = TD.WEAPONS[kind];
    if (game.gold >= def.cost) {
      const cells = coverage(game, def.range);
      let best = null, bestScore = -1;
      for (const cell of cells) {
        if (game.itemAt(cell.c, cell.r)) continue;
        let score = cell.n;
        for (const t of game.towers) {
          const d = Math.hypot(t.col - cell.c, t.row - cell.r);
          if (d < 1.5) score -= 3;
        }
        if (score > bestScore) { bestScore = score; best = cell; }
      }
      if (best) { game.place(kind, best.c, best.r); return; }
    }
    // 坦克/装甲车要来了：在靠近基地的道路上埋地雷（最多 3 颗）
    const upcoming = game.level.waves[Math.min(game.waveIndex + 1, game.level.waves.length - 1)];
    const heavyComing = upcoming.some(g => g.type === 'tank' || g.type === 'armoredCar');
    if (heavyComing && game.countKind('mine') < 3 && game.gold >= TD.WEAPONS.mine.cost + 60) {
      for (const path of game.paths) {
        for (let i = path.length - 2; i > path.length / 2; i--) {
          const [c, r] = path[i];
          if (!game.itemAt(c, r)) { game.place('mine', c, r); return; }
        }
      }
    }
    // 升级：有钱且不是急需买新塔时
    for (const t of game.towers) {
      const cost = game.upgradeCost(t);
      if (cost !== null && game.gold >= cost + 100) { game.upgrade(t.id); return; }
    }
  },
  // 随手乱放：随机选一个挨着路的空地，只会买机关枪
  naive(game, rng) {
    const def = TD.WEAPONS.machinegun;
    if (game.gold < def.cost) return;
    const cells = coverage(game, def.range).filter(c => c.n >= 3 && !game.itemAt(c.c, c.r));
    if (!cells.length) return;
    const pick = cells[Math.floor(rng() * cells.length)];
    game.place('machinegun', pick.c, pick.r);
  },
  // 懒人：开局按 greedy 买到钱不够，之后什么都不做
  lazy(game, rng) {
    if (game.waveIndex <= 0 && game.gold >= 50) strategies.greedy(game, rng);
  },
  // 马虎：开局随手放 4 座机关枪，之后什么都不做
  sloppy(game, rng) {
    if (game.towers.length < 4) strategies.naive(game, rng);
  },
  // 两座机关枪 + 一堵墙，墙破了就补（玩家反馈的第一关打法）
  twoMgWall(game, rng) {
    const mgs = game.towers.filter(t => t.kind === 'machinegun');
    if (mgs.length < 2) { if (game.gold >= 50) placeBest(game, 'machinegun'); return; }
    if (game.countKind('wall') === 0 && game.gold >= TD.WEAPONS.wall.cost) {
      // 墙放在第一座机关枪射程内、离出口最近的道路格
      const mg = mgs[0]; let best = null, bestRemain = Infinity;
      game.paths.forEach(path => path.forEach(([c, r], i) => {
        if (i === 0 || i === path.length - 1) return;
        if (Math.hypot(c + 0.5 - mg.x, r + 0.5 - mg.y) > 2.5) return;
        const remain = path.length - 1 - i;
        if (remain < bestRemain && !game.itemAt(c, r)) { bestRemain = remain; best = [c, r]; }
      }));
      if (best) game.place('wall', best[0], best[1]);
    }
  },
  // 第一关 4 个黄金炮位各放一座塔（2 机关枪 + 单管 + 双管），之后不加建不升级
  fourGood(game, rng) {
    const plan = [['machinegun', 13, 4], ['machinegun', 8, 4], ['cannon', 9, 8], ['twinCannon', 12, 8]];
    for (const [k, c, r] of plan) if (!game.itemAt(c, r) && game.gold >= TD.WEAPONS[k].cost) { game.place(k, c, r); return; }
  },
  // 一座火箭炮放在最好的位置，之后什么都不做（玩家反馈的第二关打法）
  oneRocket(game, rng) {
    if (game.countKind('rocket') === 0 && game.gold >= TD.WEAPONS.rocket.cost) placeBest(game, 'rocket');
  },
};

function placeBest(game, kind) {
  const def = TD.WEAPONS[kind];
  let best = null, bestScore = -1;
  for (const cell of coverage(game, def.range)) {
    if (game.itemAt(cell.c, cell.r)) continue;
    let score = cell.n;
    for (const t of game.towers) if (Math.hypot(t.col - cell.c, t.row - cell.r) < 1.5) score -= 3;
    if (score > bestScore) { bestScore = score; best = cell; }
  }
  if (best) game.place(kind, best.c, best.r);
}

function run(levelNo, stratName, seed, opts) {
  opts = opts || {};
  const level = TD.getLevel(levelNo);
  if (process.env.HPMUL) level.hpMul *= parseFloat(process.env.HPMUL);
  if (process.env.COUNTDOWN) TD.ECONOMY.countdown = parseFloat(process.env.COUNTDOWN);
  if (process.env.HPWAVE) TD.SCALING.hpPerWave = parseFloat(process.env.HPWAVE);
  if (process.env.GOLDADD) level.startGold += parseInt(process.env.GOLDADD, 10);
  const game = new TD.Game(level);
  const leaksByWave = [];
  const rng = mulberry32(seed);
  const strat = strategies[stratName];
  const dt = 1 / 30;
  let t = 0, nextThink = 0;
  const maxTime = 3000;
  while (game.phase !== 'won' && game.phase !== 'lost' && t < maxTime) {
    if (t >= nextThink) { strat(game, rng); nextThink = t + 0.5; }
    if (game.phase === 'build' || (game.phase === 'countdown' && opts.callEarly)) game.startWave();
    game.update(dt);
    for (const ev of game.drainEvents()) if (ev.type === 'leak') leaksByWave[ev.enemy.wave] = (leaksByWave[ev.enemy.wave] || 0) + 1;
    t += dt;
  }
  const res = { phase: game.phase, lives: game.lives, gold: game.gold, kills: game.kills, leaks: game.leaks, wave: game.waveIndex + 1, waves: game.waveCount, towers: game.towers.length, time: Math.round(t) };
  if (process.env.TRACE) res.leaksByWave = Array.from(leaksByWave, v => v || 0);
  return res;
}

const levelNo = parseInt(process.argv[2] || '1', 10);
const names = process.argv[3] ? [process.argv[3]] : Object.keys(strategies);
for (const name of names) {
  const results = [];
  for (let seed = 1; seed <= 5; seed++) results.push(run(levelNo, name, seed, { callEarly: !process.env.NOEARLY && name === 'greedy' && seed % 2 === 0 }));
  console.log(`关卡 ${levelNo}  策略 ${name}`);
  for (const r of results) console.log('  ', JSON.stringify(r));
}
