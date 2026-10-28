import { COLORS as colors, clamp, nearestJoint } from "./physics.js";
import { TYPES } from "./levels.js";
const TAU = Math.PI * 2;
// 沿用第一阶段 Canvas 材质、冷却高光与完美震动，静态 PCB 单独缓存。
export function createRenderer(state, canvas) {
  const ctx = canvas.getContext("2d");
  let width = 0,
    height = 0,
    scale = 1,
    centerY = 0,
    dpr = 1;
  const boardCache = document.createElement("canvas");
  const boardCtx = boardCache.getContext("2d");
  // 绘制圆角基底与描边。
  function rr(c, x, y, w, h, r, fill, stroke) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.stroke();
    }
  }
  // 绘制导线或铜走线。
  function line(c, points, color, w = 1) {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.strokeStyle = color;
    c.lineWidth = w;
    c.stroke();
  }
  // 绘制焊盘、光斑和烟雾轮廓。
  function ellipse(c, x, y, rx, ry, fill, stroke) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, TAU);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.stroke();
    }
  }
  // 统一画布中文字体与对齐。
  function text(c, str, x, y, size, color, align = "left") {
    c.font = `${size}px "Microsoft YaHei", sans-serif`;
    c.textAlign = align;
    c.fillStyle = color;
    c.fillText(str, x, y);
  }
  // 电路板局部坐标转为画布坐标。
  function boardPoint(x, y) {
    const a = -0.105;
    return {
      x: width / 2 + scale * (x * Math.cos(a) - y * Math.sin(a)),
      y: centerY + scale * (x * Math.sin(a) + y * Math.cos(a)),
    };
  }
  // 屏幕输入逆变换，保证缩放后仍准确接触。
  function localPoint(x, y) {
    const a = 0.105,
      dx = (x - width / 2) / scale,
      dy = (y - centerY) / scale;
    return {
      x: dx * Math.cos(a) - dy * Math.sin(a),
      y: dx * Math.sin(a) + dy * Math.cos(a),
    };
  }
  // 按视口和 DPR 更新画布分辨率及板缩放。
  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    scale = Math.min((width - 35) / 760, (height - 240) / 470);
    centerY = 98 + (height - 260) / 2;
    if (width < 400) {
      scale = Math.min((width - 18) / 760, (height - 290) / 520);
      centerY = 110 + (height - 310) / 2;
    }
    buildBoard();
  }
  // 构建含当前关卡标识的静态电路板。
  function buildBoard() {
    const factor = Math.max(1, Math.min(2, scale * dpr));
    boardCache.width = 800 * factor;
    boardCache.height = 530 * factor;
    const c = boardCtx;
    c.setTransform(factor, 0, 0, factor, 400 * factor, 265 * factor);
    rr(c, -352, -207, 704, 426, 20, "#07130d");
    rr(c, -350, -216, 700, 425, 18, "#233b22", "#72874e");
    const bg = c.createLinearGradient(-350, -216, 350, 210);
    bg.addColorStop(0, "#285944");
    bg.addColorStop(0.38, "#194a36");
    bg.addColorStop(1, "#0c2e22");
    rr(c, -350, -216, 700, 416, 16, bg, "#6d8e54");
    rr(c, -333, -200, 666, 382, 7, null, "#70966750");
    // 铜走线与过孔确定性生成，缓存在离屏画布中。
    for (let i = 0; i < 22; i++) {
      const x = -290 + i * 26;
      line(
        c,
        [
          [x, 160],
          [x, 138],
          [x + 28, 110],
          [x + 28, 25 + (i % 4) * 12],
          [x + 67, -14 + (i % 4) * 12],
          [x + 67, -166],
        ],
        i % 3 ? "#a5b15e45" : "#cad08a75",
        i % 4 === 0 ? 2 : 1.2,
      );
      for (const yy of [-166, 160]) {
        ellipse(c, x + (yy < 0 ? 67 : 0), yy, 4, 4, "#2b573a", "#c0bb7e");
        ellipse(c, x + (yy < 0 ? 67 : 0), yy, 1.7, 1.7, "#0b2419");
      }
    }
    for (const j of state.joints) {
      line(
        c,
        [
          [j.x, j.y],
          [j.x, j.y + 28],
          [j.x + 20, j.y + 48],
        ],
        "#aebb7188",
        3,
      );
    }
    for (let i = 0; i < 210; i++) {
      const x = -328 + ((i * 137) % 650),
        y = -190 + ((i * 71) % 360);
      ellipse(c, x, y, 0.6, 0.6, "#bde69a14");
    }
    for (const x of [-320, 320])
      for (const y of [-185, 170]) {
        ellipse(c, x, y, 13, 13, "#afaa6c", "#2b391d");
        ellipse(c, x, y, 8, 8, "#06140d", "#d1bd7b");
        ellipse(c, x - 1, y - 2, 5, 4, "#020905");
      }
    text(
      c,
      "焊接大师 / " +
        (state.mode === "sandbox" ? "自由实验板" : state.level.name),
      -285,
      -171,
      12,
      "#c6dfb399",
    );
    text(
      c,
      state.mode === "sandbox"
        ? "自由"
        : String((state.level?.id || 0) + 1).padStart(2, "0"),
      285,
      -155,
      26,
      "#b5ce9e70",
      "right",
    );
    text(c, "每个连接，都值得专注。", -285, 188, 10, "#b5ce9e88");
    text(c, "无铅工艺 / 恒温 415°C", 285, 188, 10, "#b5ce9e88", "right");
    for (const part of state.parts) {
      text(
        c,
        part.name + " · " + part.value,
        part.x,
        part.y - (part.type === "ic" ? 77 : 67),
        11,
        "#d3dfb6",
        "center",
      );
    }
  }
  // 保留原型电阻的金属引脚与色环质感。
  function drawResistor(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "#000a";
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 8;
    line(
      ctx,
      [
        [-85, 0],
        [-64, -10],
        [-36, -10],
      ],
      "#6b7564",
      7,
    );
    line(
      ctx,
      [
        [36, -10],
        [64, -10],
        [85, 0],
      ],
      "#6b7564",
      7,
    );
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    line(
      ctx,
      [
        [-85, -2],
        [-63, -12],
        [-36, -12],
      ],
      "#d6dec1",
      2,
    );
    line(
      ctx,
      [
        [36, -12],
        [63, -12],
        [85, -2],
      ],
      "#d6dec1",
      2,
    );
    const g = ctx.createLinearGradient(0, -30, 0, 9);
    g.addColorStop(0, "#bc8d53");
    g.addColorStop(0.3, "#f2d79c");
    g.addColorStop(0.65, "#c3955b");
    g.addColorStop(1, "#684725");
    rr(ctx, -47, -31, 94, 39, 17, g, "#d4ac6e");
    ["#793822", "#8e3d28", "#3e3021", "#bd9a43"].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(-29 + i * 18, -30, 7, 37);
    });
    const gloss = ctx.createLinearGradient(0, -30, 0, 7);
    gloss.addColorStop(0, "#fff6ca00");
    gloss.addColorStop(0.28, "#fff6ca66");
    gloss.addColorStop(0.5, "#fff6ca00");
    gloss.addColorStop(1, "#0005");
    rr(ctx, -47, -31, 94, 39, 17, gloss);
    ctx.restore();
  }
  // 保留五种焊点外观、熔融光泽与冷却过渡。
  function drawJoint(j) {
    const { active, sceneTime } = state;
    ctx.save();
    if (j.small) {
      ctx.translate(j.x, j.y);
      ctx.scale(0.58, 0.58);
      ctx.translate(-j.x, -j.y);
    }
    const { x, y, temp, tin } = j,
      selected = j === active,
      hot = clamp((temp - 200) / 210, 0, 1),
      liquid = clamp((temp - 175) / 120, 0, 1);
    if (j.damage > 0.1) {
      ellipse(ctx, x, y, 22 + j.damage * 6, 19 + j.damage * 5, "#15180fe0");
      ellipse(ctx, x + 3, y + 3, 17, 15, "#392c19");
      ctx.beginPath();
      ctx.moveTo(x - 16, y + 4);
      ctx.quadraticCurveTo(x - 24, y - 11 - j.damage * 4, x - 12, y - 16);
      ctx.lineTo(x - 7, y - 7);
      ctx.closePath();
      ctx.fillStyle = "#96734b";
      ctx.fill();
    }
    if (hot > 0) {
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 42);
      glow.addColorStop(0, `rgba(255,177,65,${hot * 0.55})`);
      glow.addColorStop(1, "#f9952400");
      ellipse(ctx, x, y, 42, 42, glow);
    }
    const pad = ctx.createLinearGradient(x - 14, y - 14, x + 14, y + 14);
    pad.addColorStop(0, "#f1d794");
    pad.addColorStop(0.4, "#a6924e");
    pad.addColorStop(1, "#69532c");
    ellipse(ctx, x, y, 17, 15, pad, "#bdb784");
    ellipse(ctx, x, y, 9, 8, "#14291d", "#736f43");
    if (!j.settled) {
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -sceneTime * 8;
      ellipse(
        ctx,
        x,
        y,
        24,
        22,
        null,
        selected
          ? "#e8dc9c"
          : `rgba(178,212,137,${0.38 + 0.18 * Math.sin(sceneTime * 2 + j.id)})`,
      );
      ctx.restore();
    }
    if (tin > 0.015) {
      const r = 8 + Math.min(tin, 2.4) * 11,
        over = tin > 1.4,
        gray = j.quality === "冷焊",
        scorched = j.quality === "过热";
      const g = ctx.createRadialGradient(
        x - r * 0.28,
        y - r * 0.65,
        1,
        x,
        y,
        r * 1.5,
      );
      g.addColorStop(
        0,
        scorched
          ? "#827766"
          : gray
            ? "#a5aaa0"
            : `rgb(${Math.round(212 + liquid * 43)},${Math.round(221 + liquid * 34)},${Math.round(207 + liquid * 48)})`,
      );
      g.addColorStop(0.3, gray ? "#6c756d" : "#c1ccc1");
      g.addColorStop(0.48, scorched ? "#60533c" : gray ? "#7c857b" : "#536f68");
      g.addColorStop(0.77, gray ? "#858d80" : "#bdcfc6");
      g.addColorStop(1, "#34483d");
      ctx.beginPath();
      ctx.moveTo(x - r, y + 4);
      if (over) {
        ctx.bezierCurveTo(
          x - r - 3,
          y - r * 1.5,
          x + r + 4,
          y - r * 1.5,
          x + r,
          y + 4,
        );
      } else {
        ctx.bezierCurveTo(x - r * 0.45, y + 1, x - 4, y - 12, x - 3, y - 18);
        ctx.quadraticCurveTo(x, y - 22, x + 4, y - 18);
        ctx.bezierCurveTo(x + 6, y - 8, x + r * 0.45, y + 1, x + r, y + 4);
      }
      ctx.bezierCurveTo(x + r * 0.6, y + 15, x - r * 0.7, y + 15, x - r, y + 4);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = gray ? "#647566" : "#e0eadd99";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      if (!gray && !scorched) {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.7, y + 6);
        ctx.quadraticCurveTo(x - 4, y + 7, x - 2, y - 13);
        ctx.strokeStyle = `rgba(245,255,236,${0.4 + liquid * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (liquid > 0.1) {
        ctx.save();
        ctx.globalAlpha = liquid * 0.6;
        const shift = (sceneTime * 1.5) % 1;
        ctx.beginPath();
        ctx.ellipse(
          x,
          y + 4,
          r * (0.4 + shift * 0.6),
          4 + shift * 3,
          0,
          0.2,
          Math.PI * 0.9,
        );
        ctx.strokeStyle = "#ffffdb";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      if (gray) {
        for (let n = 0; n < 22; n++) {
          ellipse(
            ctx,
            x + Math.sin(n * 4.7) * r * 0.75,
            y - 1 + Math.cos(n * 2.9) * 8,
            0.8,
            1,
            n % 2 ? "#bcc1af" : "#495b4d",
          );
        }
      }
    }
    const pin = ctx.createLinearGradient(x - 3, 0, x + 4, 0);
    pin.addColorStop(0, "#627969");
    pin.addColorStop(0.5, "#edf0d1");
    pin.addColorStop(1, "#82997c");
    rr(ctx, x - 2.5, y - 18, 5, 20, 2, pin);
    ellipse(ctx, x, y - 18, 2.5, 2, "#f2f0c5");
    if (j.settled) {
      ellipse(ctx, x + 23, y - 22, 9, 9, "#14231b", colors[j.quality]);
      text(
        ctx,
        j.quality === "完美" ? "✓" : j.quality === "良好" ? "✓" : "!",
        x + 23,
        y - 18,
        11,
        colors[j.quality],
        "center",
      );
    }
    text(
      ctx,
      String(j.id + 1).padStart(2, "0"),
      x,
      y + 37,
      j.small ? 14 : 9,
      selected ? "#e6e9be" : "#a3bc9299",
      "center",
    );
    ctx.restore();
  }
  // 烙铁尖端跟随指针，低温送锡显示阻挡反馈。
  function drawIron() {
    const { mouse, active, sceneTime } = state;
    const { right, space, touchFeed } = state.input;
    const finished = state.phase !== "play" || state.placing;
    if (!mouse.visible || finished) return;
    const p = mouse,
      hot = active ? clamp((active.temp - 100) / 320, 0, 1) : 0.1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-0.75);
    const s = clamp(scale, 0.58, 1);
    ctx.scale(s, s);
    ctx.shadowColor = "#0009";
    ctx.shadowOffsetY = 16;
    ctx.shadowOffsetX = 10;
    ctx.shadowBlur = 14;
    const metal = ctx.createLinearGradient(0, -18, 0, 18);
    metal.addColorStop(0, "#2e332d");
    metal.addColorStop(0.25, "#a3aa8a");
    metal.addColorStop(0.4, "#d2c9a1");
    metal.addColorStop(0.55, "#817b5d");
    metal.addColorStop(1, "#292f27");
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(82, -13);
    ctx.lineTo(177, -16);
    ctx.lineTo(177, 17);
    ctx.lineTo(82, 14);
    ctx.closePath();
    ctx.fillStyle = metal;
    ctx.fill();
    rr(ctx, 152, -24, 40, 49, 5, "#9a8b5c", "#b8ad7e");
    rr(ctx, 187, -30, 170, 60, 13, "#1b211e", "#465043");
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    const grip = ctx.createLinearGradient(0, -28, 0, 28);
    grip.addColorStop(0, "#374139");
    grip.addColorStop(0.3, "#272f29");
    grip.addColorStop(1, "#0b120f");
    rr(ctx, 197, -29, 154, 58, 12, grip);
    for (let i = 0; i < 12; i++)
      line(
        ctx,
        [
          [203 + i * 8, -23],
          [203 + i * 8, 23],
        ],
        "#5b655336",
        2,
      );
    text(ctx, "恒温 · 415°C", 290, 4, 9, "#98a38c", "center");
    const glow = ctx.createRadialGradient(2, 0, 0, 2, 0, 25);
    glow.addColorStop(0, `rgba(255,213,121,${hot})`);
    glow.addColorStop(0.3, `rgba(255,133,41,${hot * 0.45})`);
    glow.addColorStop(1, "#ffb63c00");
    ellipse(ctx, 2, 0, 25, 25, glow);
    ctx.restore();
    if (right || space || touchFeed) {
      ctx.save();
      ctx.shadowBlur = 4;
      ctx.shadowColor = "#000";
      const blocked = active && active.temp < 250;
      const wobble = blocked ? Math.sin(sceneTime * 40) * 2 : 0;
      ctx.beginPath();
      ctx.moveTo(p.x - 140, p.y + 100);
      ctx.quadraticCurveTo(p.x - 60, p.y + 60, p.x - 6 + wobble, p.y + 3);
      ctx.strokeStyle = "#b8c4b5";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#eef0d3";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      if (blocked) {
        text(
          ctx,
          "温度不足 · 锡丝未熔化",
          p.x - 15,
          p.y + 45,
          11,
          "#e6bd7c",
          "center",
        );
      }
      ctx.restore();
    }
  }

  // 每种元件独立外形，所有实际引脚都来自关卡布局。
  function drawPart(part) {
    const { x, y, type } = part;
    if (type === "resistor") {
      drawResistor(x, y);
      return;
    }
    const pins = state.joints.filter((j) => j.part === part.key);
    const failed = pins.some(
      (j) => j.bridge || ["过热", "冷焊"].includes(j.quality),
    );
    const powered = state.phase === "power" && state.powerTime > 1 && !failed;
    ctx.save();
    ctx.translate(x, y);
    for (const pin of pins)
      line(
        ctx,
        [
          [pin.x - x, pin.y - y],
          [Math.max(-35, Math.min(35, pin.x - x)), -18],
        ],
        "#bdc5ac",
        4,
      );
    ctx.shadowColor = "#0009";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 8;
    if (type === "led") {
      const brightness = pins.every((j) => j.quality === "完美") ? 1 : 0.65;
      if (powered) {
        ctx.shadowColor = "#ff4b22";
        ctx.shadowBlur = 38 * brightness;
      }
      const g = ctx.createRadialGradient(-10, -47, 2, 0, -30, 35);
      g.addColorStop(0, powered ? "#fff2bd" : "#ffc19e");
      g.addColorStop(0.2, powered ? "#ff824c" : "#c64c33");
      g.addColorStop(1, "#501611");
      rr(ctx, -28, -62, 56, 49, 22, g, "#b96541");
      ellipse(ctx, 0, -15, 31, 12, "#7e2114", "#b96541");
      ellipse(ctx, -12, -43, 4, 10, "#ffe4c47f");
    } else if (type === "capacitor") {
      const g = ctx.createLinearGradient(-30, 0, 30, 0);
      g.addColorStop(0, "#17262b");
      g.addColorStop(0.35, "#597070");
      g.addColorStop(0.65, "#223c3e");
      g.addColorStop(1, "#0b171c");
      rr(ctx, -29, -65, 58, 64, 6, g, "#84948c");
      ellipse(ctx, 0, -64, 29, 10, "#aeb7ac", "#e0e1c8");
      line(
        ctx,
        [
          [-16, -69],
          [15, -59],
        ],
        "#52615b",
        1.5,
      );
      line(
        ctx,
        [
          [16, -69],
          [-15, -59],
        ],
        "#52615b",
        1.5,
      );
      text(ctx, "10 μF", 0, -26, 10, "#d3dfc8", "center");
    } else if (type === "transistor") {
      rr(ctx, -37, -60, 74, 42, 8, "#172321", "#6e7f6c");
      ellipse(ctx, 0, -60, 37, 13, "#34433b", "#859480");
      text(ctx, "驱动", 0, -37, 11, "#91a38a", "center");
    } else if (type === "smd") {
      rr(ctx, -28, -13, 56, 26, 3, "#131c1a", "#8a9c82");
      rr(ctx, -29, -13, 10, 26, 2, "#afbeb1");
      rr(ctx, 19, -13, 10, 26, 2, "#afbeb1");
      text(ctx, "221", 0, 4, 10, "#cad2be", "center");
    } else if (type === "ic") {
      rr(ctx, -96, -30, 192, 60, 5, "#101a18", "#5b7061");
      rr(ctx, -90, -26, 180, 47, 3, "#22302a");
      ellipse(ctx, -78, -13, 4, 4, "#b2b59a");
      text(ctx, "精密控制 / 八引脚", 0, 4, 13, "#a3b39a", "center");
    }
    ctx.restore();
  }

  // 放置预览在板坐标中绘制，与触屏坐标使用同一套变换。
  function drawPlacement() {
    if (!state.placing || !state.mouse.visible) return;
    const p = localPoint(state.mouse.x, state.mouse.y);
    const spec = TYPES[state.placing];
    ctx.save();
    ctx.setLineDash([6, 5]);
    rr(
      ctx,
      p.x - spec.width / 2,
      p.y - spec.height / 2,
      spec.width,
      spec.height,
      8,
      "#bddd8115",
      "#d3eaa5",
    );
    text(ctx, "点击放置 · " + spec.name, p.x, p.y, 12, "#e0eabc", "center");
    ctx.restore();
  }
  // 每帧合成缓存板、元件、粒子和操作工具。
  function render() {
    const { joints, shake, sceneTime, particles, popups } = state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#101813";
    ctx.fillRect(0, 0, width, height);
    const lamp = ctx.createRadialGradient(
      width * 0.2,
      90,
      0,
      width * 0.25,
      150,
      width * 0.9,
    );
    lamp.addColorStop(0, "#be954322");
    lamp.addColorStop(0.45, "#7a753b0b");
    lamp.addColorStop(1, "#00000018");
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#a9bd8d08";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x < width; x += 27) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y < height; y += 27) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    // 工作台标识与暖色台灯。
    text(ctx, "工作区域 / 保持清洁", width - 23, 95, 8, "#69765d66", "right");
    ctx.save();
    ctx.translate(width / 2, centerY);
    if (shake > 0)
      ctx.translate(
        Math.sin(sceneTime * 85) * shake,
        Math.cos(sceneTime * 95) * shake,
      );
    ctx.rotate(-0.105);
    ctx.scale(scale, scale);
    ctx.save();
    ctx.shadowColor = "#000b";
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 24;
    rr(ctx, -348, -210, 696, 419, 16, "#0e1d12");
    ctx.restore();
    ctx.drawImage(boardCache, -400, -265, 800, 530);
    // 连锡以相邻焊盘间的金属桥表现。
    joints
      .filter((j) => j.bridge)
      .forEach((j) => {
        const n = nearestJoint(j, joints);
        const g = ctx.createLinearGradient(j.x, j.y - 5, j.x, j.y + 6);
        g.addColorStop(0, "#a8b9aa");
        g.addColorStop(0.4, "#e0e8d5");
        g.addColorStop(1, "#4e6c5a");
        line(
          ctx,
          [
            [j.x, j.y],
            [n.x, n.y],
          ],
          g,
          10,
        );
      });
    state.parts.forEach(drawPart);
    joints.forEach(drawJoint);
    drawPlacement();
    ctx.restore();
    for (const p of particles) {
      const pos = boardPoint(p.x, p.y);
      ctx.globalAlpha = (p.life / p.max) * 0.28;
      const r = p.size * (1 + (1 - p.life / p.max) * 2) * scale;
      const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r);
      g.addColorStop(0, p.dark ? "#a58d63" : "#d6dcc5");
      g.addColorStop(1, "#b8c2a000");
      ellipse(ctx, pos.x, pos.y, r, r, g);
    }
    ctx.globalAlpha = 1;
    drawIron();
    for (const p of popups) {
      const pos = boardPoint(p.x, p.y);
      ctx.globalAlpha = Math.min(1, p.life);
      text(
        ctx,
        p.text,
        pos.x,
        pos.y - (2.8 - p.life) * 15,
        15,
        p.color,
        "center",
      );
    }
    ctx.globalAlpha = 1;
  }

  return {
    render,
    resize,
    buildBoard,
    boardPoint,
    localPoint,
    get scale() {
      return scale;
    },
    get dpr() {
      return dpr;
    },
  };
}
