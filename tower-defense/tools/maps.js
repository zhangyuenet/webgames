/*
 * Copyright 2026 Yue Zhang
 * Licensed under the Apache License, Version 2.0. See LICENSE in the repository root.
 */
// 把 levels.js 里的地图打印成 ASCII（用于 DESIGN.md）：node tools/maps.js
'use strict';
require('../js/config.js');
require('../js/levels.js');
require('../js/engine.js');
const TD = globalThis.TD;

for (const lv of TD.LEVELS) {
  const g = new TD.Game(lv);
  const rows = [];
  for (let r = 0; r < g.rows; r++) rows.push(Array.from({ length: g.cols }, (_, c) => (g.grid[r][c] === 'P' ? '#' : g.grid[r][c] === 'X' ? 'X' : '.')));
  lv.paths.forEach((wp, i) => {
    const s = wp[0], e = wp[wp.length - 1];
    rows[s[1]][s[0]] = lv.paths.length > 1 ? String(i + 1) : 'S';
    rows[e[1]][e[0]] = 'E';
  });
  const lens = g.paths.map(p => p.length - 1);
  const count = {}; let total = 0;
  for (const w of lv.waves) for (const grp of w) { count[grp.type] = (count[grp.type] || 0) + grp.count; total += grp.count; }
  console.log(`### 第 ${lv.id} 关 · ${lv.name}\n`);
  console.log(`${lv.intro}\n`);
  console.log('```');
  console.log('    ' + Array.from({ length: g.cols }, (_, c) => (c % 5 === 0 ? String(c).padEnd(5) : '')).join('').trimEnd());
  rows.forEach((row, r) => console.log(String(r).padStart(2) + '  ' + row.join(' ')));
  console.log('```\n');
  console.log(`- 路径长度：${lens.map((l, i) => (lens.length > 1 ? `路 ${i + 1} = ${l} 格` : `${l} 格`)).join('，')}`);
  console.log(`- 起始金币 ${lv.startGold}，生命 ${lv.lives}，共 ${lv.waves.length} 波，敌人 ${total} 个（${TD.ENEMY_ORDER.filter(t => count[t]).map(t => `${TD.ENEMIES[t].name}×${count[t]}`).join('、')}）`);
  console.log(`- 敌人血量倍率 ×${(1 + TD.SCALING.hpPerLevel * (lv.id - 1)).toFixed(1)}\n`);
}
