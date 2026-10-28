import { LEVELS, TYPES, makePart, makeJoints } from "./levels.js";
import { stepPhysics, COLORS } from "./physics.js";
import { stepParticles } from "./particles.js";
import { inspectBoard } from "./scoring.js";
import { loadProgress, saveProgress } from "./storage.js";
import { WorkshopAudio } from "./audio.js";
import { createRenderer } from "./render.js";
import { bindInput } from "./input.js";
import { createUI } from "./ui.js";
import { updateHUD } from "./hud.js";

document.documentElement.classList.toggle(
  "touch-device",
  navigator.maxTouchPoints > 0,
);
const canvas = document.getElementById("game");
const state = {
  phase: "select",
  mode: "campaign",
  level: LEVELS[0],
  parts: [],
  joints: [],
  active: null,
  lastJoint: null,
  score: 0,
  combo: 0,
  maxCombo: 0,
  elapsed: 0,
  started: false,
  sceneTime: 0,
  shake: 0,
  particles: [],
  popups: [],
  mouse: { x: 0, y: 0, visible: false },
  input: {
    left: false,
    right: false,
    space: false,
    touchHeat: false,
    touchFeed: false,
  },
  progress: loadProgress(),
  placing: null,
  powerTime: 0,
  powerStage: 0,
  result: null,
};
const audio = new WorkshopAudio();
const renderer = createRenderer(state, canvas);
const release = bindInput(state, canvas, renderer, audio, placePart);
const ui = createUI(
  state,
  {
    start,
    sandbox,
    menu,
    retry,
    clear: clearSandbox,
    release,
    result: showResult,
  },
  audio,
);
let manualClock = false;

// 全部关卡共享一个状态机、渲染循环和音频引擎。
function resetBoard(parts) {
  release();
  audio.stop();
  Object.assign(state, {
    phase: "play",
    parts: parts.map((part) => ({ ...part })),
    joints: makeJoints(parts),
    active: null,
    lastJoint: null,
    score: 0,
    combo: 0,
    maxCombo: 0,
    elapsed: 0,
    started: false,
    particles: [],
    popups: [],
    shake: 0,
    mouse: { x: 0, y: 0, visible: false },
    placing: null,
    powerTime: 0,
    powerStage: 0,
    result: null,
  });
  ui.showWorkshop();
  renderer.resize();
}

function start(id) {
  if (
    !Number.isInteger(id) ||
    !LEVELS[id] ||
    (id > 0 && !state.progress[id - 1].stars)
  )
    return false;
  state.mode = "campaign";
  state.level = LEVELS[id];
  resetBoard(state.level.parts);
  return true;
}
function sandbox() {
  state.mode = "sandbox";
  resetBoard([makePart("resistor", -140, -40), makePart("led", 170, 35)]);
}
function retry() {
  resetBoard(state.mode === "sandbox" ? state.parts : state.level.parts);
}
function menu() {
  release();
  audio.stop();
  state.phase = "select";
  state.placing = null;
  ui.showSelection();
}
function clearSandbox() {
  if (state.mode === "sandbox") resetBoard([]);
}

// 沙盒限制边界与重叠，以保证所有元件引脚都可操作。
function placePart(point) {
  if (state.mode !== "sandbox" || !state.placing) return false;
  const spec = TYPES[state.placing];
  const message = document.getElementById("sandbox-message");
  const x = point.x,
    y = point.y;
  if (
    Math.abs(x) + spec.width / 2 > 300 ||
    y - spec.height / 2 < -145 ||
    y + spec.height / 2 > 140
  ) {
    message.textContent = "请放在板内，给元件四周留出空间。";
    return false;
  }
  if (
    state.parts.some(
      (p) =>
        Math.abs(p.x - x) < (p.width + spec.width) / 2 + 8 &&
        Math.abs(p.y - y) < (p.height + spec.height) / 2 + 8,
    )
  ) {
    message.textContent = "这里已有元件，请选择另一块空白区域。";
    return false;
  }
  const type = state.placing;
  const number =
    Math.max(
      0,
      ...state.parts
        .filter((p) => p.prefix === spec.prefix)
        .map((p) => Number(p.name.slice(1))),
    ) + 1;
  const part = makePart(type, x, y, number);
  state.parts.push(part);
  const added = makeJoints([part]).map((j, i) => ({
    ...j,
    id: state.joints.length + i,
  }));
  state.joints.push(...added);
  state.placing = null;
  renderer.buildBoard();
  ui.tray();
  message.textContent = `${TYPES[type].name}已放置，可以焊接，或继续添加元件。`;
  return true;
}

function settle(joint) {
  state.lastJoint = joint;
  if (joint.quality === "完美") {
    state.combo++;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    joint.points = 1000 + Math.min(state.combo - 1, 5) * 100;
    state.shake = 2.6;
  } else {
    state.combo = 0;
    joint.points = { 良好: 650, 冷焊: 150, 锡过多: 100, 过热: 0 }[
      joint.quality
    ];
  }
  if (joint.bridge || state.mode === "sandbox") joint.points = 0;
  if (state.mode !== "sandbox") state.score += joint.points;
  audio.chime(joint.quality === "完美");
  state.popups.push({
    x: joint.x,
    y: joint.y - 42,
    text:
      state.mode === "sandbox"
        ? joint.quality
        : `${joint.quality}  +${joint.points}`,
    color: COLORS[joint.quality],
    life: 2.8,
  });
}

function beginPower(timedOut = false) {
  release();
  audio.stop();
  state.phase = "power";
  state.active = null;
  state.result = inspectBoard(state, timedOut);
  state.powerTime = 0;
  state.powerStage = 0;
  ui.showPower();
}
function recordResult() {
  if (state.result.success) {
    const previous = state.progress[state.level.id];
    state.progress[state.level.id] = {
      stars: Math.max(previous.stars, state.result.stars),
      best: Math.max(previous.best, state.result.total),
    };
    saveProgress(state.progress);
  }
}
function showResult() {
  if (state.phase !== "power" || state.powerTime < 4.5) return;
  state.phase = "result";
  audio.stop();
  ui.showResult();
}

// 同一个固定语义步进供动画与测试调用，不提供直接写品质的捷径。
function tick(dt) {
  state.sceneTime += dt;
  state.shake = Math.max(0, state.shake - dt * 4);
  if (state.phase === "play") {
    state.active = null;
    if (state.mouse.visible && !state.placing) {
      const point = renderer.localPoint(state.mouse.x, state.mouse.y);
      let distance = Infinity;
      for (const joint of state.joints) {
        const d = Math.hypot(joint.x - point.x, joint.y - point.y);
        const radius = joint.small ? 14 : Math.max(26, 14 / renderer.scale);
        if (d < radius && d < distance) {
          state.active = joint;
          distance = d;
        }
      }
    }
    if (state.started && state.mode !== "sandbox") state.elapsed += dt;
    stepPhysics(state, dt, settle);
    if (state.mode !== "sandbox") {
      if (state.level.limit && state.elapsed >= state.level.limit)
        beginPower(true);
      else if (state.joints.length && state.joints.every((j) => j.settled))
        beginPower();
    }
  } else if (state.phase === "power") {
    state.powerTime += dt;
    const stage = Math.min(4, Math.floor(state.powerTime));
    if (stage > state.powerStage) {
      state.powerStage = stage;
      // 短路保护时蜂鸣器不响；仍播放单独的失败提示。
      if (stage !== 2 || state.result.success)
        audio.powerCue(stage, state.result.success);
    }
    if (state.powerTime >= 4.5 && !state.result.recorded) {
      recordResult();
      state.result.recorded = true;
    }
  }
  stepParticles(state, dt);
  audio.update(state, dt);
}

let lastFrame = 0,
  lastHud = 0;
function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000 || 0, 0.04);
  lastFrame = now;
  if (!document.hidden && state.phase !== "select") {
    if (!manualClock) tick(dt);
    renderer.render();
    if (now - lastHud > 70) {
      updateHUD(state);
      if (state.phase === "power") ui.power();
      lastHud = now;
    }
    if (renderer.dpr !== Math.min(window.devicePixelRatio || 1, 2))
      renderer.resize();
  }
  requestAnimationFrame(frame);
}
const observer = new ResizeObserver(() => {
  if (state.phase !== "select") renderer.resize();
});
observer.observe(canvas);

// 可复现调试接口：通过输入与真实物理步进测试，不绕过品质、锁定或结算。
window.__game = {
  getState: () =>
    JSON.parse(
      JSON.stringify({
        phase: state.phase,
        mode: state.mode,
        level: state.level.id,
        joints: state.joints,
        score: state.score,
        combo: state.combo,
        maxCombo: state.maxCombo,
        elapsed: state.elapsed,
        result: state.result,
        progress: state.progress,
        inputs: state.input,
        active: state.active?.id ?? null,
        parts: state.parts,
        powerTime: state.powerTime,
      }),
    ),
  getJointPosition: (id) => {
    const j = state.joints[id];
    if (!j) return null;
    const p = renderer.boardPoint(j.x, j.y);
    const r = canvas.getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top };
  },
  start,
  reset: retry,
  sandbox,
  menu,
  input: ({ joint, heat = false, feed = false }) => {
    release();
    if (state.phase !== "play") return;
    const j = state.joints[joint];
    if (j) state.mouse = { ...renderer.boardPoint(j.x, j.y), visible: true };
    else state.mouse.visible = false;
    state.input.left = heat;
    state.input.right = feed;
  },
  advance: (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120)
      throw new RangeError("步进范围为 0–120 秒");
    manualClock = true;
    for (let remaining = seconds; remaining > 0.000001; remaining -= 0.01)
      tick(Math.min(0.01, remaining));
    updateHUD(state);
    if (state.phase === "power") ui.power();
    renderer.render();
  },
  resume: () => {
    release();
    manualClock = false;
  },
  audio: () => ({
    initialized: Boolean(audio.context),
    voices: audio.voices.size,
    context: audio.context?.state,
    settings: { ...audio.settings },
  }),
};
ui.showSelection();
requestAnimationFrame(frame);
