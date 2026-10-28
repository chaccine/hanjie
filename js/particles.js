// 限制烟雾总量，保留原型烟雾寿命、速度与受热生成频率。
export function stepParticles(state, dt) {
  for (const j of state.joints) {
    const poweredFault =
      state.phase === "power" &&
      state.powerTime > 1 &&
      (j.damage >= 1 || j.bridge);
    if (
      ((j.temp > 245 && !j.settled) || poweredFault) &&
      Math.random() < dt * (j.damage > 0.1 || poweredFault ? 24 : 8)
    ) {
      state.particles.push({
        x: j.x + (Math.random() - 0.5) * 9,
        y: j.y - 10,
        life: 1.8,
        max: 1.8,
        size: 8 + Math.random() * 7,
        vx: (Math.random() - 0.4) * 16,
        vy: -24 - Math.random() * 22,
        dark: j.damage > 0.1 || poweredFault,
      });
    }
  }
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt + Math.sin(state.sceneTime * 3 + p.y) * dt * 7;
    p.y += p.vy * dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0).slice(-120);
  for (const p of state.popups) p.life -= dt;
  state.popups = state.popups.filter((p) => p.life > 0);
}
