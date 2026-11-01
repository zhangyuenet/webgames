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
 * 关卡与地图（任务2）。
 * 地图为 20×14 格；paths 是每条道路的拐点坐标 [列, 行]，相邻拐点必须在同一行或同一列。
 * 第一个拐点是敌人入口，最后一个拐点是基地。
 * waves: 每一波是若干批敌人，批次默认依次出现；带 delay 的批次在波次开始后 delay 秒出现（可与别的批次同时）。
 *   { type, count, gap, path, delay }
 */
(function (TD) {
  'use strict';

  TD.LEVELS = [
    {
      id: 1, name: '蛇形小径', cols: 20, rows: 14, startGold: 200, lives: 20,
      intro: '一条 S 形小路。路与路之间的空地是最好的炮位，一座塔可以同时覆盖两段路。',
      paths: [
        [[0, 2], [15, 2], [15, 6], [4, 6], [4, 10], [19, 10]],
      ],
      blocked: [[2, 12], [17, 1]],
      waves: [
        [{ type: 'infantry', count: 8, gap: 1.0 }],
        [{ type: 'infantry', count: 10, gap: 0.8 }],
        [{ type: 'infantry', count: 8, gap: 0.8 }, { type: 'cavalry', count: 6, gap: 0.5 }],
        [{ type: 'cavalry', count: 12, gap: 0.45 }],
        [{ type: 'armoredInfantry', count: 4, gap: 1.0 }, { type: 'infantry', count: 12, gap: 0.5 }, { type: 'cavalry', count: 6, gap: 0.5 }],
        [{ type: 'armoredInfantry', count: 6, gap: 0.9 }, { type: 'infantry', count: 12, gap: 0.5 }],
        [{ type: 'cavalry', count: 14, gap: 0.35 }, { type: 'armoredInfantry', count: 8, gap: 0.7 }],
        [{ type: 'armoredInfantry', count: 10, gap: 0.6 }, { type: 'infantry', count: 16, gap: 0.4 }, { type: 'cavalry', count: 12, gap: 0.35 }],
      ],
    },
    {
      id: 2, name: '回字环路', cols: 20, rows: 14, startGold: 250, lives: 20,
      intro: '道路绕着地图转了两圈才到中心。放在内圈的塔能打到三段路，装甲骑兵很快，别让机关枪独自面对它。',
      paths: [
        [[0, 1], [18, 1], [18, 12], [1, 12], [1, 4], [15, 4], [15, 9], [5, 9], [5, 7], [10, 7]],
      ],
      blocked: [[12, 11], [8, 2]],
      waves: [
        [{ type: 'infantry', count: 10, gap: 0.8 }],
        [{ type: 'infantry', count: 8, gap: 0.7 }, { type: 'cavalry', count: 8, gap: 0.5 }],
        [{ type: 'armoredInfantry', count: 5, gap: 1.0 }, { type: 'infantry', count: 10, gap: 0.6 }],
        [{ type: 'cavalry', count: 14, gap: 0.4 }],
        [{ type: 'armoredCavalry', count: 5, gap: 0.8 }, { type: 'infantry', count: 10, gap: 0.6 }],
        [{ type: 'armoredInfantry', count: 8, gap: 0.8 }, { type: 'armoredCavalry', count: 5, gap: 0.7 }],
        [{ type: 'infantry', count: 16, gap: 0.4 }, { type: 'cavalry', count: 10, gap: 0.4 }],
        [{ type: 'armoredCavalry', count: 10, gap: 0.6 }],
        [{ type: 'armoredInfantry', count: 10, gap: 0.7 }, { type: 'cavalry', count: 10, gap: 0.4 }],
        [{ type: 'armoredInfantry', count: 10, gap: 0.6 }, { type: 'armoredCavalry', count: 8, gap: 0.6 }, { type: 'infantry', count: 14, gap: 0.4 }],
      ],
    },
    {
      id: 3, name: '双线汇合', cols: 20, rows: 14, startGold: 350, lives: 20,
      intro: '上下两路敌人在中间汇合后走同一段路到基地。汇合段是火炮的天堂，装甲车要靠火炮和导弹。',
      paths: [
        [[0, 1], [13, 1], [13, 4], [9, 4], [9, 7], [19, 7]],
        [[0, 12], [13, 12], [13, 9], [9, 9], [9, 7], [19, 7]],
      ],
      blocked: [[3, 6], [3, 7], [17, 2], [17, 11]],
      waves: [
        [{ type: 'infantry', count: 7, gap: 0.9, path: 0, delay: 0 }, { type: 'infantry', count: 7, gap: 0.9, path: 1, delay: 0.5 }],
        [{ type: 'cavalry', count: 7, gap: 0.5, path: 0, delay: 0 }, { type: 'cavalry', count: 7, gap: 0.5, path: 1, delay: 1 }],
        [{ type: 'armoredInfantry', count: 5, gap: 1.0, path: 0, delay: 0 }, { type: 'infantry', count: 10, gap: 0.6, path: 1, delay: 0 }],
        [{ type: 'infantry', count: 10, gap: 0.6, path: 0, delay: 0 }, { type: 'armoredCavalry', count: 5, gap: 0.8, path: 1, delay: 2 }],
        [{ type: 'armoredCavalry', count: 5, gap: 0.8, path: 0, delay: 0 }, { type: 'armoredCavalry', count: 5, gap: 0.8, path: 1, delay: 0 }],
        [{ type: 'armoredCar', count: 1, gap: 1, path: 0, delay: 0 }, { type: 'infantry', count: 10, gap: 0.5, path: 1, delay: 0 }],
        [{ type: 'armoredInfantry', count: 6, gap: 0.8, path: 0, delay: 0 }, { type: 'armoredInfantry', count: 6, gap: 0.8, path: 1, delay: 0 }],
        [{ type: 'armoredCar', count: 2, gap: 3, path: 0, delay: 0 }, { type: 'cavalry', count: 10, gap: 0.4, path: 1, delay: 0 }],
        [{ type: 'armoredCavalry', count: 6, gap: 0.7, path: 0, delay: 0 }, { type: 'armoredCar', count: 1, gap: 1, path: 1, delay: 0 }, { type: 'infantry', count: 12, gap: 0.4, path: 1, delay: 3 }],
        [{ type: 'armoredCar', count: 2, gap: 3, path: 0, delay: 0 }, { type: 'armoredInfantry', count: 8, gap: 0.7, path: 1, delay: 0 }, { type: 'cavalry', count: 8, gap: 0.4, path: 0, delay: 4 }],
      ],
    },
    {
      id: 4, name: '之字长路', cols: 20, rows: 14, startGold: 400, lives: 20,
      intro: '四条平行的长路，每两条路之间只隔两格空地，正中的塔能同时打两条路。坦克登场：机关枪打不动，墙也拦不住，靠地雷和导弹。',
      paths: [
        [[0, 1], [17, 1], [17, 4], [2, 4], [2, 7], [17, 7], [17, 10], [2, 10], [2, 12], [19, 12]],
      ],
      blocked: [[19, 0], [0, 13]],
      waves: [
        [{ type: 'infantry', count: 12, gap: 0.7 }],
        [{ type: 'cavalry', count: 12, gap: 0.5 }],
        [{ type: 'armoredInfantry', count: 6, gap: 0.9 }, { type: 'infantry', count: 10, gap: 0.5 }],
        [{ type: 'armoredCavalry', count: 6, gap: 0.7 }, { type: 'cavalry', count: 8, gap: 0.4 }],
        [{ type: 'armoredCar', count: 2, gap: 3 }, { type: 'infantry', count: 12, gap: 0.5 }],
        [{ type: 'armoredInfantry', count: 8, gap: 0.7 }, { type: 'armoredCavalry', count: 6, gap: 0.6 }],
        [{ type: 'armoredCar', count: 2, gap: 2.5 }, { type: 'armoredInfantry', count: 8, gap: 0.7 }],
        [{ type: 'tank', count: 1, gap: 1 }, { type: 'infantry', count: 12, gap: 0.5 }],
        [{ type: 'armoredCavalry', count: 8, gap: 0.6 }, { type: 'armoredCar', count: 2, gap: 2.5 }],
        [{ type: 'tank', count: 2, gap: 6 }, { type: 'armoredInfantry', count: 8, gap: 0.7 }],
        [{ type: 'armoredCar', count: 3, gap: 2 }, { type: 'cavalry', count: 12, gap: 0.4 }],
        [{ type: 'tank', count: 2, gap: 5 }, { type: 'armoredCar', count: 2, gap: 2 }, { type: 'armoredInfantry', count: 8, gap: 0.6 }, { type: 'infantry', count: 10, gap: 0.4 }],
      ],
    },
    {
      id: 5, name: '十字交错', cols: 20, rows: 14, startGold: 700, lives: 20,
      intro: '两条路、两个基地，道路在两处交叉。放在交叉口附近的塔两边都能照顾到；放在交叉口上的墙两边都能挡。',
      paths: [
        [[0, 3], [7, 3], [7, 10], [12, 10], [12, 3], [19, 3]],
        [[9, 13], [9, 7], [16, 7], [16, 0]],
      ],
      blocked: [[2, 11], [17, 12], [1, 0]],
      waves: [
        [{ type: 'infantry', count: 10, gap: 0.7, path: 0, delay: 0 }, { type: 'infantry', count: 8, gap: 0.7, path: 1, delay: 2 }],
        [{ type: 'cavalry', count: 10, gap: 0.5, path: 0, delay: 0 }, { type: 'cavalry', count: 8, gap: 0.5, path: 1, delay: 2 }],
        [{ type: 'armoredInfantry', count: 6, gap: 0.9, path: 0, delay: 0 }, { type: 'armoredCavalry', count: 5, gap: 0.7, path: 1, delay: 2 }],
        [{ type: 'armoredCar', count: 2, gap: 3, path: 0, delay: 0 }, { type: 'infantry', count: 12, gap: 0.5, path: 1, delay: 0 }],
        [{ type: 'tank', count: 1, gap: 1, path: 0, delay: 0 }, { type: 'cavalry', count: 10, gap: 0.4, path: 1, delay: 3 }],
        [{ type: 'armoredCavalry', count: 8, gap: 0.6, path: 0, delay: 0 }, { type: 'armoredCar', count: 2, gap: 3, path: 1, delay: 0 }],
        [{ type: 'armoredInfantry', count: 8, gap: 0.7, path: 0, delay: 0 }, { type: 'tank', count: 1, gap: 1, path: 1, delay: 0 }],
        [{ type: 'armoredCar', count: 2, gap: 2.5, path: 0, delay: 0 }, { type: 'armoredCavalry', count: 6, gap: 0.6, path: 1, delay: 1 }],
        [{ type: 'tank', count: 1, gap: 6, path: 0, delay: 0 }, { type: 'armoredInfantry', count: 8, gap: 0.7, path: 1, delay: 0 }, { type: 'armoredCar', count: 1, gap: 1, path: 0, delay: 8 }],
        [{ type: 'infantry', count: 14, gap: 0.4, path: 0, delay: 0 }, { type: 'cavalry', count: 12, gap: 0.35, path: 1, delay: 0 }],
        [{ type: 'armoredCar', count: 3, gap: 2, path: 0, delay: 0 }, { type: 'tank', count: 1, gap: 1, path: 1, delay: 4 }],
        [{ type: 'tank', count: 1, gap: 5, path: 0, delay: 0 }, { type: 'armoredCar', count: 2, gap: 2.5, path: 1, delay: 0 }, { type: 'armoredCavalry', count: 8, gap: 0.5, path: 0, delay: 6 }, { type: 'armoredInfantry', count: 8, gap: 0.6, path: 1, delay: 8 }, { type: 'tank', count: 1, gap: 1, path: 1, delay: 12 }],
      ],
    },
  ];

  /**
   * 取第 n 关的定义。超过设计关卡数后进入“无尽模式”：循环使用已有地图，
   * 波次用最后一关的，敌人血量继续按关卡数放大。
   */
  TD.getLevel = function (n) {
    const designed = TD.LEVELS;
    const hpMul = 1 + TD.SCALING.hpPerLevel * (n - 1);
    if (n <= designed.length) {
      return Object.assign({}, designed[n - 1], { number: n, hpMul: hpMul, endless: false });
    }
    const base = designed[(n - 1) % designed.length];
    const hardest = designed[designed.length - 1];
    return Object.assign({}, base, {
      number: n,
      name: base.name + '（无尽 ' + (n - designed.length) + '）',
      intro: '无尽模式：地图循环，敌人越来越强。',
      waves: hardest.waves,
      startGold: hardest.startGold + 50 * (n - designed.length),
      hpMul: hpMul,
      endless: true,
    });
  };
})(globalThis.TD = globalThis.TD || {});
