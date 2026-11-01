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

/* 画面：2D 简易线条画风。纸色底、墨线、敌人用红墨。 */
(function (TD) {
  'use strict';

  const C = TD.CELL;
  const INK = '#2a2a2a', PAPER = '#fbfaf4', ROAD = '#eeeadf', FAINT = '#d3cfc2';
  const RED = '#b5372a', BLUE = '#2b6cb0', GREEN = '#3a7d44', LIGHT = '#9a9586';
  TD.COLORS = { INK, PAPER, ROAD, FAINT, RED, BLUE, GREEN, LIGHT };

  // ---------- 基础图元 ----------
  function circle(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) ctx.fill(); else ctx.stroke();
  }
  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function poly(ctx, pts, close) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
    ctx.stroke();
  }
  function rotRect(ctx, x, y, angle, len, width, offset) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = PAPER; ctx.fillRect(0, (offset || 0) - width / 2, len, width);
    ctx.strokeRect(0, (offset || 0) - width / 2, len, width);
    ctx.restore();
  }

  // ---------- 武器图标（也用于建造按钮） ----------
  const towerArt = {
    machinegun(ctx, x, y, a) {
      ctx.fillStyle = PAPER; circle(ctx, x, y, 11, true); circle(ctx, x, y, 11);
      rotRect(ctx, x, y, a, 17, 3);
      circle(ctx, x, y, 3);
    },
    cannon(ctx, x, y, a) {
      ctx.fillStyle = PAPER; ctx.fillRect(x - 12, y - 12, 24, 24); ctx.strokeRect(x - 12, y - 12, 24, 24);
      rotRect(ctx, x, y, a, 19, 5);
      circle(ctx, x, y, 5);
    },
    twinCannon(ctx, x, y, a) {
      ctx.fillStyle = PAPER; ctx.fillRect(x - 12, y - 12, 24, 24); ctx.strokeRect(x - 12, y - 12, 24, 24);
      rotRect(ctx, x, y, a, 19, 4, -4); rotRect(ctx, x, y, a, 19, 4, 4);
      circle(ctx, x, y, 5);
    },
    rocket(ctx, x, y, a) {
      ctx.fillStyle = PAPER; ctx.fillRect(x - 12, y - 12, 24, 24); ctx.strokeRect(x - 12, y - 12, 24, 24);
      rotRect(ctx, x, y, a, 17, 4, -6); rotRect(ctx, x, y, a, 17, 4, 0); rotRect(ctx, x, y, a, 17, 4, 6);
      circle(ctx, x, y, 2, true);
    },
    missile(ctx, x, y, a) {
      const pts = [];
      for (let i = 0; i < 6; i++) { const t = Math.PI / 3 * i + Math.PI / 6; pts.push([x + Math.cos(t) * 13, y + Math.sin(t) * 13]); }
      ctx.fillStyle = PAPER; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
      poly(ctx, pts, true);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = PAPER; ctx.fillRect(-4, -3, 16, 6); ctx.strokeRect(-4, -3, 16, 6);
      poly(ctx, [[12, -3], [18, 0], [12, 3]], true);
      line(ctx, -4, -3, -8, -6); line(ctx, -4, 3, -8, 6);
      ctx.restore();
    },
    mine(ctx, x, y) {
      ctx.fillStyle = PAPER; circle(ctx, x, y, 7, true); circle(ctx, x, y, 7);
      line(ctx, x - 4, y - 4, x + 4, y + 4); line(ctx, x - 4, y + 4, x + 4, y - 4);
      for (let i = 0; i < 4; i++) { const t = Math.PI / 2 * i + Math.PI / 4; line(ctx, x + Math.cos(t) * 7, y + Math.sin(t) * 7, x + Math.cos(t) * 10, y + Math.sin(t) * 10); }
    },
    trap(ctx, x, y) {
      ctx.fillStyle = PAPER; ctx.fillRect(x - 10, y - 10, 20, 20); ctx.strokeRect(x - 10, y - 10, 20, 20);
      ctx.save(); ctx.beginPath(); ctx.rect(x - 10, y - 10, 20, 20); ctx.clip();
      for (let k = -20; k <= 20; k += 7) line(ctx, x + k - 10, y + 10, x + k + 10, y - 10);
      ctx.restore();
    },
    wall(ctx, x, y) {
      const w = C - 6, h = C - 6, x0 = x - w / 2, y0 = y - h / 2;
      ctx.fillStyle = PAPER; ctx.fillRect(x0, y0, w, h); ctx.strokeRect(x0, y0, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
      const rowH = 8;
      for (let i = 1; i * rowH < h; i++) line(ctx, x0, y0 + i * rowH, x0 + w, y0 + i * rowH);
      for (let i = 0; i * rowH < h; i++) {
        const off = (i % 2) ? 6 : 0;
        for (let xx = x0 + off; xx < x0 + w; xx += 12) line(ctx, xx, y0 + i * rowH, xx, y0 + (i + 1) * rowH);
      }
      ctx.restore();
    },
  };

  TD.drawWeaponIcon = function (ctx, kind, x, y, angle) {
    ctx.save();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    towerArt[kind](ctx, x, y, angle === undefined ? -Math.PI / 4 : angle);
    ctx.restore();
  };

  // ---------- 敌人 ----------
  function stickFigure(ctx, x, y) {
    circle(ctx, x, y - 6, 3);
    line(ctx, x, y - 3, x, y + 3);
    line(ctx, x - 4, y - 1, x + 4, y - 1);
    line(ctx, x, y + 3, x - 3, y + 8); line(ctx, x, y + 3, x + 3, y + 8);
  }
  function shield(ctx, x, y, dx, dy) {
    const sx = x + dx * 6, sy = y + dy * 6;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath(); ctx.moveTo(-1, -6); ctx.lineTo(2, -6); ctx.quadraticCurveTo(4, 0, 2, 6); ctx.lineTo(-1, 6); ctx.closePath();
    ctx.fillStyle = PAPER; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function speedLines(ctx, x, y, dx, dy) {
    const bx = x - dx * 9, by = y - dy * 9;
    const px = -dy, py = dx;
    for (const k of [-4, 0, 4]) line(ctx, bx + px * k, by + py * k, bx + px * k - dx * 6, by + py * k - dy * 6);
  }
  const enemyArt = {
    infantry(ctx, x, y) { stickFigure(ctx, x, y); },
    cavalry(ctx, x, y, dx, dy) { stickFigure(ctx, x, y); speedLines(ctx, x, y, dx, dy); },
    armoredInfantry(ctx, x, y, dx, dy) { stickFigure(ctx, x, y); shield(ctx, x, y, dx, dy); },
    armoredCavalry(ctx, x, y, dx, dy) { stickFigure(ctx, x, y); shield(ctx, x, y, dx, dy); speedLines(ctx, x, y, dx, dy); },
    armoredCar(ctx, x, y, dx, dy) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ctx.moveTo(-11, -6); ctx.lineTo(8, -6); ctx.lineTo(12, -2); ctx.lineTo(12, 4); ctx.lineTo(-11, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      circle(ctx, -6, 5, 3, true); circle(ctx, -6, 5, 3); circle(ctx, 6, 5, 3, true); circle(ctx, 6, 5, 3);
      ctx.strokeRect(-4, -10, 7, 5);
      ctx.restore();
    },
    tank(ctx, x, y, dx, dy) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = PAPER;
      ctx.fillRect(-13, -8, 26, 16); ctx.strokeRect(-13, -8, 26, 16);
      for (let k = -10; k <= 10; k += 5) { line(ctx, k, -8, k, -5); line(ctx, k, 8, k, 5); }
      circle(ctx, -1, 0, 5, true); circle(ctx, -1, 0, 5);
      rotRect(ctx, -1, 0, 0, 17, 3);
      ctx.restore();
    },
  };

  TD.drawEnemyIcon = function (ctx, type, x, y) {
    ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    enemyArt[type](ctx, x, y, 1, 0);
    ctx.restore();
  };

  // ---------- 渲染器 ----------
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.bg = null;
    }

    resize(game) {
      this.canvas.width = game.cols * C;
      this.canvas.height = game.rows * C;
      this.bg = null;
    }

    buildBackground(game) {
      const off = document.createElement('canvas');
      off.width = this.canvas.width; off.height = this.canvas.height;
      const ctx = off.getContext('2d');
      ctx.fillStyle = PAPER; ctx.fillRect(0, 0, off.width, off.height);
      ctx.fillStyle = FAINT;
      for (let r = 0; r <= game.rows; r++) for (let c = 0; c <= game.cols; c++) circle(ctx, c * C, r * C, 1.2, true);
      ctx.fillStyle = ROAD;
      for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) if (game.grid[r][c] === 'P') ctx.fillRect(c * C, r * C, C, C);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) {
        if (game.grid[r][c] !== 'P') continue;
        const end = game.endpoints.has(c + ',' + r);
        const edge = (nc, nr, x1, y1, x2, y2) => {
          const t = game.cellType(nc, nr);
          if (t === 'P') return;
          if (t === null && end) return; // 出入口朝地图外敞开
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        };
        edge(c, r - 1, c * C, r * C, (c + 1) * C, r * C);
        edge(c, r + 1, c * C, (r + 1) * C, (c + 1) * C, (r + 1) * C);
        edge(c - 1, r, c * C, r * C, c * C, (r + 1) * C);
        edge(c + 1, r, (c + 1) * C, r * C, (c + 1) * C, (r + 1) * C);
      }
      ctx.stroke();
      for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) if (game.grid[r][c] === 'X') this.drawRock(ctx, c, r);
      for (const path of game.paths) {
        this.drawSpawn(ctx, path[0], path[1]);
        this.drawBase(ctx, path[path.length - 1]);
      }
      this.bg = off;
    }

    drawRock(ctx, c, r) {
      const x = c * C + C / 2, y = r * C + C / 2;
      const seed = (c * 31 + r * 17) % 7;
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const t = Math.PI / 3 * i + seed * 0.3;
        const rad = 11 + ((i * 5 + seed) % 4) * 1.5;
        pts.push([x + Math.cos(t) * rad, y + Math.sin(t) * rad]);
      }
      ctx.save(); ctx.strokeStyle = LIGHT; ctx.lineWidth = 1.5;
      poly(ctx, pts, true);
      line(ctx, pts[0][0], pts[0][1], pts[3][0], pts[3][1]);
      line(ctx, (pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2, pts[4][0], pts[4][1]);
      ctx.restore();
    }

    drawSpawn(ctx, cell, next) {
      const x = cell[0] * C + C / 2, y = cell[1] * C + C / 2;
      const dx = Math.sign(next[0] - cell[0]), dy = Math.sign(next[1] - cell[1]);
      ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
      for (const k of [-6, 2]) poly(ctx, [[k - 4, -7], [k + 4, 0], [k - 4, 7]], false);
      ctx.restore();
    }

    drawBase(ctx, cell) {
      const x = cell[0] * C + C / 2, y = cell[1] * C + C / 2;
      ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.fillStyle = PAPER;
      ctx.fillRect(x - 10, y - 2, 20, 14); ctx.strokeRect(x - 10, y - 2, 20, 14);
      poly(ctx, [[x - 13, y - 2], [x, y - 13], [x + 13, y - 2]], true);
      ctx.strokeRect(x - 3, y + 4, 6, 8);
      line(ctx, x + 6, y - 11, x + 6, y - 19); poly(ctx, [[x + 6, y - 19], [x + 13, y - 16], [x + 6, y - 13]], true);
      ctx.restore();
    }

    draw(game, ui) {
      if (!this.bg) this.buildBackground(game);
      const ctx = this.ctx;
      ctx.drawImage(this.bg, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      // 选中/悬停的塔：射程
      const sel = ui.selectedTower;
      if (sel && game.towers.includes(sel)) {
        this.drawRange(ctx, game, sel, BLUE);
        ctx.save(); ctx.strokeStyle = BLUE; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.strokeRect(sel.col * C + 2, sel.row * C + 2, C - 4, C - 4); ctx.restore();
      }

      for (const t of game.towers) this.drawTower(ctx, t);
      for (const e of game.enemies) this.drawEnemy(ctx, e);
      for (const p of game.projectiles) this.drawProjectile(ctx, p);
      for (const f of game.effects) this.drawEffect(ctx, f);

      if (ui.hover && ui.selectedKind) this.drawGhost(ctx, game, ui.selectedKind, ui.hover);
      else if (ui.hover) {
        const t = game.itemAt(ui.hover.c, ui.hover.r);
        if (t && t !== sel) {
          this.drawRange(ctx, game, t, LIGHT);
          ctx.save(); ctx.strokeStyle = LIGHT; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.strokeRect(t.col * C + 2, t.row * C + 2, C - 4, C - 4); ctx.restore();
        }
      }
    }

    drawRange(ctx, game, t, color) {
      let r = 0;
      if (t.def.kind === 'tower') r = game.towerStats(t).range;
      else if (t.def.radius) r = t.def.radius;
      if (!r) return;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      circle(ctx, t.x * C, t.y * C, r * C);
      ctx.restore();
    }

    drawTower(ctx, t) {
      const x = t.x * C, y = t.y * C;
      ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      towerArt[t.kind](ctx, x, y, t.angle);
      // 等级标记
      if (t.level > 1) {
        ctx.fillStyle = INK;
        for (let i = 0; i < t.level - 1; i++) ctx.fillRect(x - 4 + i * 6 - (t.level - 2) * 3, y + 14, 3, 3);
      }
      // 墙的耐久 / 陷阱剩余次数
      if (t.kind === 'wall' && t.hp < t.maxHp) this.bar(ctx, x, y - C / 2 + 4, 24, t.hp / t.maxHp, INK);
      if (t.kind === 'trap') {
        ctx.fillStyle = INK;
        for (let i = 0; i < t.uses; i++) ctx.fillRect(x - 6 + i * 5, y + 13, 3, 3);
      }
      ctx.restore();
    }

    drawEnemy(ctx, e) {
      const x = e.x * C, y = e.y * C;
      ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = 1.5;
      enemyArt[e.type](ctx, x, y, e.dx, e.dy);
      if (e.hp < e.maxHp) this.bar(ctx, x, y - 15, 18, e.hp / e.maxHp, RED);
      if (e.stun > 0) {
        ctx.strokeStyle = BLUE; ctx.lineWidth = 1;
        for (const k of [-6, 0, 6]) circle(ctx, x + k, y - 20 + Math.abs(k) * 0.3, 2);
      }
      if (e.blocked) { ctx.strokeStyle = LIGHT; ctx.lineWidth = 1; line(ctx, x + e.dx * 10, y + e.dy * 10 - 4, x + e.dx * 10, y + e.dy * 10 + 4); }
      ctx.restore();
    }

    bar(ctx, x, y, w, ratio, color) {
      ctx.save(); ctx.lineWidth = 2;
      ctx.strokeStyle = FAINT; line(ctx, x - w / 2, y, x + w / 2, y);
      ctx.strokeStyle = color; line(ctx, x - w / 2, y, x - w / 2 + w * Math.max(0, ratio), y);
      ctx.restore();
    }

    drawProjectile(ctx, p) {
      if (p.delay > 0) return;
      const x = p.x * C, y = p.y * C;
      ctx.save(); ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.5;
      if (p.kind === 'rocket' || p.kind === 'missile') {
        const len = p.kind === 'missile' ? 14 : 9, w = p.kind === 'missile' ? 5 : 4;
        ctx.translate(x, y); ctx.rotate(p.angle || 0);
        ctx.fillStyle = PAPER; ctx.fillRect(-len / 2, -w / 2, len, w); ctx.strokeRect(-len / 2, -w / 2, len, w);
        poly(ctx, [[len / 2, -w / 2], [len / 2 + 5, 0], [len / 2, w / 2]], true);
        line(ctx, -len / 2, -w / 2, -len / 2 - 3, -w / 2 - 3); line(ctx, -len / 2, w / 2, -len / 2 - 3, w / 2 + 3);
      } else {
        circle(ctx, x, y, 3, true);
      }
      ctx.restore();
    }

    drawEffect(ctx, f) {
      const p = 1 - f.ttl / f.life; // 0 -> 1
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      if (f.type === 'boom') {
        const x = f.x * C, y = f.y * C, R = f.r * C;
        ctx.strokeStyle = f.kind === 'trap' ? BLUE : INK; ctx.lineWidth = 2;
        circle(ctx, x, y, R * (0.3 + 0.7 * p));
        if (f.kind === 'mine' || f.kind === 'missile') {
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 8; i++) { const t = Math.PI / 4 * i; line(ctx, x + Math.cos(t) * R * 0.5, y + Math.sin(t) * R * 0.5, x + Math.cos(t) * R * (0.8 + 0.5 * p), y + Math.sin(t) * R * (0.8 + 0.5 * p)); }
        }
      } else if (f.type === 'rect') {
        ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.translate(f.x * C, f.y * C); ctx.rotate(Math.atan2(f.uy, f.ux));
        ctx.strokeRect(-f.l * C / 2, -f.w * C / 2, f.l * C, f.w * C);
        ctx.lineWidth = 1;
        line(ctx, -f.l * C / 2, 0, f.l * C / 2, 0);
      } else if (f.type === 'tracer') {
        ctx.strokeStyle = INK; ctx.lineWidth = 1;
        line(ctx, f.x1 * C, f.y1 * C, f.x2 * C, f.y2 * C);
      } else if (f.type === 'float') {
        ctx.fillStyle = GREEN; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x * C, f.y * C - 12 - p * 14);
      } else if (f.type === 'break') {
        const x = f.x * C, y = f.y * C, s = 6 + p * 10;
        ctx.strokeStyle = LIGHT; ctx.lineWidth = 2;
        line(ctx, x - s, y - s, x + s, y + s); line(ctx, x - s, y + s, x + s, y - s);
      }
      ctx.restore();
    }

    drawGhost(ctx, game, kind, cell) {
      const chk = game.canPlace(kind, cell.c, cell.r);
      const x = cell.c * C + C / 2, y = cell.r * C + C / 2;
      ctx.save();
      if (chk.ok) {
        ctx.globalAlpha = 0.6;
        const fake = { def: TD.WEAPONS[kind], x: cell.c + 0.5, y: cell.r + 0.5, kind, level: 1 };
        this.drawRange(ctx, game, fake, BLUE);
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        towerArt[kind](ctx, x, y, -Math.PI / 4);
      } else {
        ctx.globalAlpha = 0.7; ctx.strokeStyle = RED; ctx.lineWidth = 2;
        line(ctx, x - 8, y - 8, x + 8, y + 8); line(ctx, x - 8, y + 8, x + 8, y - 8);
      }
      ctx.restore();
    }
  }

  TD.Renderer = Renderer;
})(globalThis.TD = globalThis.TD || {});
