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

/* 记录：只存在浏览器 localStorage，可导出/导入 JSON 文件，不上传任何数据。 */
(function (TD) {
  'use strict';

  const KEY = 'webgames.tower-defense.v1';
  const GAME = 'webgames/tower-defense';
  const VERSION = 1;

  function defaults() {
    return {
      game: GAME, version: VERSION,
      level: 1,          // 下一次要打的关
      unlocked: 1,       // 已解锁的最高关
      bonusGold: 0,      // 上一关带下来的金币
      stats: { kills: 0, cleared: 0, bestLevel: 0, playSeconds: 0 },
      settings: { speed: 1 },
      savedAt: null,
    };
  }

  function num(v, def, min, max) {
    if (typeof v !== 'number' || !isFinite(v)) return def;
    return Math.max(min, Math.min(max, Math.floor(v)));
  }

  function sanitize(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('不是有效的记录文件');
    if (obj.game !== undefined && obj.game !== GAME) throw new Error('这不是塔防游戏的记录');
    const d = defaults();
    d.level = num(obj.level, 1, 1, 9999);
    d.unlocked = Math.max(d.level, num(obj.unlocked, 1, 1, 9999));
    d.bonusGold = num(obj.bonusGold, 0, 0, 999999);
    const s = obj.stats || {};
    d.stats.kills = num(s.kills, 0, 0, 1e9);
    d.stats.cleared = num(s.cleared, 0, 0, 1e9);
    d.stats.bestLevel = num(s.bestLevel, 0, 0, 9999);
    d.stats.playSeconds = num(s.playSeconds, 0, 0, 1e9);
    const st = obj.settings || {};
    d.settings.speed = st.speed === 2 ? 2 : 1;
    d.savedAt = typeof obj.savedAt === 'string' ? obj.savedAt : null;
    return d;
  }

  TD.Storage = {
    defaults,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? sanitize(JSON.parse(raw)) : defaults();
      } catch (e) {
        return defaults();
      }
    },
    save(data) {
      data.savedAt = new Date().toISOString();
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 隐私模式等情况下忽略 */ }
    },
    reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
    exportText(data) { return JSON.stringify(data, null, 2); },
    importText(text) { return sanitize(JSON.parse(text)); },
    download(filename, text) {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
})(globalThis.TD = globalThis.TD || {});
