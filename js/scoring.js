// 用焊点质量模拟电路连续性；问题始终定位到元件与具体引脚。
export function inspectBoard(state, timedOut = false) {
  const reasons = [];
  const warnings = [];
  for (const j of state.joints) {
    if (!j.settled) reasons.push(`${j.name} 未完成，电路断开`);
    else if (j.bridge) reasons.push(`${j.name} 连锡桥连，触发短路保护`);
    else if (j.quality === "过热") reasons.push(`${j.name} 过热，焊盘烧损`);
    else if (j.quality === "冷焊") reasons.push(`${j.name} 冷焊，接触不良`);
    else if (j.quality === "锡过多")
      warnings.push(`${j.name} 锡量过多，连接不稳定`);
  }
  if (timedOut) reasons.unshift("急修时间耗尽，未能按时完成交付");
  const quality = Math.round(
    (state.joints.reduce(
      (sum, j) =>
        sum +
        ({ 完美: 100, 良好: 80, 锡过多: 40, 冷焊: 15, 过热: 0 }[j.quality] ||
          0),
      0,
    ) /
      Math.max(1, state.joints.length)) *
      0.7,
  );
  const speed = Math.round(
    20 * Math.min(1, state.level.par / Math.max(state.elapsed, 1)),
  );
  const combo = Math.round(
    (10 * state.maxCombo) / Math.max(1, state.joints.length),
  );
  const total = quality + speed + combo;
  const success = reasons.length === 0;
  const stars = success ? (total >= 90 ? 3 : total >= 70 ? 2 : 1) : 0;
  return {
    success,
    reasons,
    warnings,
    quality,
    speed,
    combo,
    total,
    stars,
    timedOut,
  };
}
