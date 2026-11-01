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
 * 塔防小游戏 —— 数值配置（任务1 的规则设计全部体现在这里）
 * 单位约定：距离 = 格，速度 = 格/秒，射速 = 发/秒，时间 = 秒。
 */
(function (TD) {
  'use strict';

  TD.CELL = 40; // 每格像素

  // 装甲等级
  TD.ARMOR = { none: '无甲', light: '轻甲', heavy: '重甲' };

  // 敌人属性（第一关基准值；随关卡、波次按 TD.SCALING 放大血量）
  TD.ENEMIES = {
    infantry:        { name: '步兵',     hp: 60,  speed: 1.0, armor: 'none',  reward: 5,  wallDps: 20, lives: 1 },
    cavalry:         { name: '骑兵',     hp: 50,  speed: 2.0, armor: 'none',  reward: 8,  wallDps: 20, lives: 1, jumpsTraps: true },
    armoredInfantry: { name: '装甲步兵', hp: 150, speed: 0.8, armor: 'light', reward: 12, wallDps: 35, lives: 1 },
    armoredCavalry:  { name: '装甲骑兵', hp: 130, speed: 1.7, armor: 'light', reward: 16, wallDps: 35, lives: 1, jumpsTraps: true },
    armoredCar:      { name: '装甲车',   hp: 350, speed: 1.3, armor: 'heavy', reward: 30, wallDps: 90, lives: 1 },
    tank:            { name: '坦克',     hp: 900, speed: 0.6, armor: 'heavy', reward: 60, wallDps: 0,  lives: 2, crushes: true },
  };
  TD.ENEMY_ORDER = ['infantry', 'cavalry', 'armoredInfantry', 'armoredCavalry', 'armoredCar', 'tank'];

  // 武器属性
  //   kind: 'tower' 建在空地上的炮塔；'path' 放在道路上的消耗品/障碍
  //   hit:  'single' 单体；'circle' 圆形范围（radius 格）；'rect' 沿路径矩形（rectW 宽 × rectL 长）
  TD.WEAPONS = {
    machinegun: { name: '机关枪',   key: '1', cost: 50,  kind: 'tower', hit: 'single', dmg: 5,   rate: 5.0,  range: 2.5,
                  desc: '点伤害，射速快。对轻甲减半，对装甲车很弱，对坦克无效。' },
    cannon:     { name: '单管火炮', key: '2', cost: 90,  kind: 'tower', hit: 'circle', dmg: 25,  rate: 1.0,  range: 3.0, radius: 0.7, projectile: { speed: 7 },
                  desc: '一发炮弹，小范围溅射。' },
    twinCannon: { name: '双管火炮', key: '3', cost: 160, kind: 'tower', hit: 'circle', dmg: 24,  rate: 0.9,  range: 3.2, radius: 1.0, shots: 2, projectile: { speed: 7 },
                  desc: '两发炮弹，更大范围溅射。' },
    rocket:     { name: '火箭炮',   key: '4', cost: 220, kind: 'tower', hit: 'rect',   dmg: 40,  rate: 0.5,  range: 3.5, rectW: 1.0, rectL: 3.0, projectile: { speed: 9 },
                  desc: '沿道路方向 1×3 格的矩形伤害，克成排的敌人。' },
    missile:    { name: '导弹',     key: '5', cost: 320, kind: 'tower', hit: 'circle', dmg: 120, rate: 0.33, range: 5.0, radius: 1.5, projectile: { speed: 5 },
                  desc: '射程最远，大圆形伤害，克装甲。' },
    mine:       { name: '地雷',     key: '6', cost: 40,  kind: 'path',  hit: 'circle', dmg: 160, radius: 0.9, uses: 1,
                  desc: '放在道路上，踩上即炸，一次性。反坦克利器。' },
    trap:       { name: '陷阱',     key: '7', cost: 30,  kind: 'path',  hit: 'circle', dmg: 35,  radius: 0.7, uses: 3, stun: 1.5, cooldown: 2.0,
                  desc: '放在道路上，触发时小范围伤害并定身 1.5 秒，可触发 3 次。骑兵跳过，坦克碾碎。' },
    wall:       { name: '墙',       key: '8', cost: 40,  kind: 'path',  hit: 'none',   hp: 150, maxCount: 2,
                  desc: '放在道路上，挡住敌人直到被拆毁（场上最多 2 面）。敌人越多拆得越快；装甲车撞墙很快，坦克直接碾碎。' },
  };
  TD.WEAPON_ORDER = ['machinegun', 'cannon', 'twinCannon', 'rocket', 'missile', 'mine', 'trap', 'wall'];

  // 炮塔升级（五种炮塔可升到 3 级；地雷/陷阱/墙不可升级）
  TD.UPGRADE = {
    maxLevel: 3,
    costPct:  [0, 0.6, 0.9],   // 升到 2 级花费 60% 原价，升到 3 级花费 90% 原价
    dmgMul:   [1, 1.4, 1.96],  // 每级伤害 +40%
    rangeMul: [1, 1.1, 1.2],   // 每级射程 +10%
    rateMul:  [1, 1.1, 1.2],   // 每级射速 +10%
  };
  TD.SELL_PCT = 0.7; // 出售返还已投入金币的 70%

  // 伤害倍率表：武器 × 装甲等级
  TD.DAMAGE = {
    machinegun: { none: 1.0, light: 0.5, heavy: 0.15 },
    cannon:     { none: 1.0, light: 1.0, heavy: 0.6 },
    twinCannon: { none: 1.0, light: 1.0, heavy: 0.7 },
    rocket:     { none: 1.0, light: 1.2, heavy: 0.8 },
    missile:    { none: 0.8, light: 1.3, heavy: 1.5 },
    mine:       { none: 1.0, light: 1.5, heavy: 2.0 },
    trap:       { none: 1.0, light: 1.0, heavy: 0 },
  };

  // 相克规则（在倍率表之上的特例）
  TD.damageMult = function (weapon, enemyType) {
    const e = TD.ENEMIES[enemyType];
    if (!e || !TD.DAMAGE[weapon]) return 0;
    if (weapon === 'machinegun' && enemyType === 'tank') return 0;   // 机关枪打不动坦克
    if (weapon === 'trap' && (e.jumpsTraps || e.crushes)) return 0;  // 骑兵跳过陷阱，坦克碾碎陷阱
    return TD.DAMAGE[weapon][e.armor];
  };

  // 经济
  TD.ECONOMY = {
    waveBonusBase: 15,     // 清完一波的奖励 = base + perWave × 波数
    waveBonusPerWave: 5,
    countdown: 12,         // 一波出完兵后，下一波自动到来的倒计时（秒）；不等清完
    earlyCallPerSec: 2,    // 提前召唤下一波：每剩余 1 秒奖励 2 金币
    carryOverPct: 0.3,     // 过关后剩余金币的 30% 带入下一关
    carryOverMax: 200,     // 带入上限
  };

  // 敌人成长：血量 × (1 + hpPerLevel × (关卡-1)) × (1 + hpPerWave × (波次-1))
  TD.SCALING = { hpPerLevel: 0.15, hpPerWave: 0.05 };
})(globalThis.TD = globalThis.TD || {});
