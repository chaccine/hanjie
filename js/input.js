// 所有输入监听器只安装一次；切场景、失焦、取消触摸都会释放按键。
export function bindInput(state, canvas, renderer, audio, placePart) {
  const input = state.input;
  let heatPointer = null;
  let feedPointer = null;
  let placingGesture = false;
  function release() {
    for (const key of Object.keys(input)) input[key] = false;
    heatPointer = feedPointer = null;
    placingGesture = false;
  }
  function position(event) {
    const rect = canvas.getBoundingClientRect();
    state.mouse = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      visible: true,
    };
  }
  canvas.addEventListener("pointermove", position);
  canvas.addEventListener("pointerdown", (event) => {
    if (state.phase !== "play") return;
    position(event);
    audio.init();
    canvas.focus({ preventScroll: true });
    if (state.placing) {
      event.preventDefault();
      placingGesture = true;
      placePart(renderer.localPoint(state.mouse.x, state.mouse.y));
      return;
    }
    if (event.pointerType !== "mouse") event.preventDefault();
    else {
      if (event.button === 0) input.left = true;
      if (event.button === 2) input.right = true;
    }
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("mousedown", (event) => {
    event.preventDefault();
    if (state.phase !== "play" || state.placing || placingGesture) return;
    if (event.button === 0) input.left = true;
    if (event.button === 2) input.right = true;
  });
  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) input.left = false;
    if (event.button === 2) input.right = false;
    placingGesture = false;
  });
  window.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse") {
      if (event.button === 0) input.left = false;
      if (event.button === 2) input.right = false;
    }
    if (event.pointerId === heatPointer) {
      input.touchHeat = false;
      heatPointer = null;
    }
    if (event.pointerId === feedPointer) {
      input.touchFeed = false;
      feedPointer = null;
    }
    if (event.pointerType !== "mouse") placingGesture = false;
  });
  window.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", (event) => {
    if (event.pointerType === "mouse") {
      input.left = false;
      input.right = false;
    }
  });
  canvas.addEventListener("pointerleave", () => {
    if (!input.left && !input.right) state.mouse.visible = false;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", (event) => {
    if (
      event.code === "Space" &&
      state.phase === "play" &&
      !state.placing &&
      !/BUTTON|INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)
    ) {
      event.preventDefault();
      input.space = true;
      audio.init();
    }
    if (event.code === "Escape") {
      release();
      state.placing = null;
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      input.space = false;
    }
  });
  window.addEventListener("blur", () => {
    release();
    audio.suspend();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      release();
      audio.suspend();
    }
  });
  window.addEventListener("pagehide", () => {
    release();
    audio.suspend();
  });
  for (const [id, key] of [
    ["heat-touch", "touchHeat"],
    ["feed-touch", "touchFeed"],
  ]) {
    const button = document.getElementById(id);
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (state.phase !== "play" || state.placing || !state.joints.length)
        return;
      audio.init();
      button.setPointerCapture(event.pointerId);
      if (!state.mouse.visible) {
        const next = state.joints.find((j) => !j.settled) || state.joints[0];
        state.mouse = { ...renderer.boardPoint(next.x, next.y), visible: true };
      }
      input[key] = true;
      if (key === "touchHeat") heatPointer = event.pointerId;
      else feedPointer = event.pointerId;
    });
    button.addEventListener("lostpointercapture", () => {
      input[key] = false;
    });
  }
  return release;
}
