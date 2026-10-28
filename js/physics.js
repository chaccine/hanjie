export const COLORS = {
  完美: "#c0e49a",
  良好: "#c5d6b6",
  冷焊: "#b7c6cf",
  锡过多: "#f0ba74",
  过热: "#f48663",
};
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// 单次线性查找，不在每一帧排序或分配邻居数组。
export function nearestJoint(joint, joints) {
  let nearest = null;
  let distance = Infinity;
  for (const candidate of joints) {
    if (candidate === joint) continue;
    const d = Math.hypot(candidate.x - joint.x, candidate.y - joint.y);
    if (d < distance) {
      distance = d;
      nearest = candidate;
    }
  }
  return nearest;
}

// 第一阶段五种判定的阈值原样保留。
export function qualityOf(joint) {
  const j = joint;
  const avg = j.thermalMass ? j.thermalSum / j.thermalMass : 0;
  if (j.damage >= 1 || j.peak > 397) return "过热";
  if (j.tin > 1.4) return "锡过多";
  if (j.tin < 0.55 || avg < 282 || j.wet < 0.62 || j.heat < 1.6) return "冷焊";
  if (
    j.tin >= 0.68 &&
    j.tin <= 1.25 &&
    avg >= 295 &&
    j.peak >= 300 &&
    j.peak <= 380 &&
    j.wet >= 0.78 &&
    j.heat <= 5.5
  )
    return "完美";
  return "良好";
}

// 热惯性、熔点、送锡与润湿速率均继承原型，拖焊只改变接触位置。
export function stepPhysics(state, dt, onSettle) {
  const { joints, active, input } = state;
  const heating = Boolean(input.left || input.touchHeat);
  const feeding = Boolean(input.right || input.space || input.touchFeed);
  for (const j of joints) {
    const on = j === active && !j.settled;
    const heat = on && heating;
    j.contact += (Number(heat) - j.contact) * (1 - Math.exp(-dt / 0.12));
    if (!j.settled) {
      if (heat) {
        state.started = true;
        j.heat += dt;
        state.lastJoint = j;
      }
      if (heat && feeding && j.type === "ic") j.dragTouched = true;
      const target = 25 + (415 - 25) * j.contact;
      j.temp =
        target + (j.temp - target) * Math.exp(-dt * (heat ? 0.58 : 0.75));
      j.peak = Math.max(j.peak, j.temp);
      if (j.temp > 385) {
        j.overTime += dt;
        j.damage = Math.min(2, j.damage + (dt * (j.temp - 385)) / 19);
      }
      if (on && feeding && j.temp >= 250) {
        const amount = dt * 0.53;
        j.tin = Math.min(3, j.tin + amount);
        j.thermalSum += j.temp * amount;
        j.thermalMass += amount;
        state.lastJoint = j;
      }
      if (j.temp >= 245 && j.tin > 0)
        j.wet += (1 - j.wet) * (1 - Math.exp(-dt * 2.3));
      const neighbor = nearestJoint(j, joints);
      if (
        j.tin > 1.85 &&
        neighbor &&
        Math.hypot(neighbor.x - j.x, neighbor.y - j.y) < 90
      )
        j.bridge = true;
      // IC 快速扫过留下未润湿的接触，不把它当作尚未操作。
      if (
        !heat &&
        j.temp < 180 &&
        (j.tin >= 0.1 || j.damage >= 1 || (j.dragTouched && j.heat > 0.02))
      ) {
        j.quality = qualityOf(j);
        j.settled = true;
        onSettle(j);
      }
    } else j.temp = 25 + (j.temp - 25) * Math.exp(-dt * 0.75);
  }
}
