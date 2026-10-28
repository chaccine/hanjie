import assert from "node:assert/strict";
import { stepPhysics } from "../js/physics.js";
import { makePart, makeJoints, LEVELS } from "../js/levels.js";
import { inspectBoard } from "../js/scoring.js";

// 使用输入序列验证原型手感，不直接写入温度、锡量或品质。
function board(type = "resistor") {
  return {
    joints: makeJoints([makePart(type, 0, 0)]),
    input: {},
    active: null,
    started: false,
    maxCombo: 0,
    elapsed: 0,
    level: LEVELS[0],
  };
}
function drive(state, id, seconds, heat, feed) {
  state.active = state.joints[id] || null;
  state.input = { left: heat, right: feed };
  for (let t = 0; t < Math.round(seconds * 100); t++) {
    stepPhysics(state, 0.01, (j) => {
      if (j.quality === "完美") state.maxCombo++;
    });
    state.elapsed += 0.01;
  }
}
function perfect(state, id) {
  drive(state, id, 2.3, true, false);
  drive(state, id, 1.55, true, true);
  drive(state, id, 2, false, false);
}

const normal = board();
drive(normal, 0, 0.5, true, true);
assert.equal(normal.joints[0].tin, 0, "低于熔点不能增加锡量");
const pristine = board();
perfect(pristine, 0);
perfect(pristine, 1);
assert.deepEqual(
  pristine.joints.map((j) => j.quality),
  ["完美", "完美"],
);
assert.ok(
  Math.abs(pristine.joints[0].peak - 370.2920467543061) < 0.001,
  "原型热惯性轨迹不漂移",
);
assert.ok(
  Math.abs(pristine.joints[0].tin - 0.8215) < 0.00001,
  "保留每秒 53% 送锡",
);
assert.equal(inspectBoard(pristine).stars, 3);

const cold = board();
drive(cold, 0, 1.7, true, false);
drive(cold, 0, 0.25, true, true);
drive(cold, 0, 2, false, false);
assert.equal(cold.joints[0].quality, "冷焊");
const burnt = board();
drive(burnt, 0, 8, true, false);
drive(burnt, 0, 3, false, false);
assert.equal(burnt.joints[0].quality, "过热");
assert.equal(inspectBoard(burnt).stars, 0);

const drag = board("ic");
for (let i = 0; i < 8; i++) drive(drag, i, 3.9, true, true);
drive(drag, -1, 2, false, false);
assert.ok(
  drag.joints.every((j) => j.quality === "完美"),
  "沿引脚连续加热送锡能够完美拖焊",
);
const fast = board("ic");
for (let i = 0; i < 8; i++) drive(fast, i, 0.15, true, true);
drive(fast, -1, 3, false, false);
assert.ok(
  fast.joints.every((j) => j.quality === "冷焊"),
  "拖太快需要返工",
);

const bridge = board("ic");
drive(bridge, 0, 2.3, true, false);
for (let i = 0; i < 90; i++)
  drive(bridge, 0, 0.05, bridge.joints[0].temp < 340, true);
drive(bridge, -1, 3, false, false);
assert.equal(bridge.joints[0].quality, "锡过多");
assert.equal(bridge.joints[0].bridge, true);
assert.ok(
  inspectBoard(bridge).reasons.some((reason) => reason.includes("连锡桥连")),
);
assert.equal(inspectBoard(pristine, true).stars, 0, "超时覆盖良好的焊点评分");
assert.equal(LEVELS.length, 9);
assert.deepEqual(
  LEVELS.map((level) => level.count),
  [2, 2, 4, 6, 3, 4, 7, 8, 10],
);
console.log(
  "通过：低温拒锡、原型完美轨迹、冷焊、过热、连续拖焊、快速拖焊、桥连、超时与关卡数量。",
);
