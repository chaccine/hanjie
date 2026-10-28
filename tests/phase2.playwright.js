// 交给 Playwright MCP browser_run_code_unsafe 的 filename 参数运行。
// 每次使用独立浏览器上下文，测试存档不会覆盖正常游玩的进度。
async (page) => {
  const browser = page.context().browser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const p = await context.newPage();
  const errors = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const observe = (target) => {
    target.on("pageerror", (error) => errors.push(error.message));
    target.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
  };
  observe(p);
  const shot = async (target, name) => {
    await target.waitForTimeout(300);
    await target.screenshot({
      path: `/workspace/hanjie/shots/phase2/${name}.png`,
      fullPage: true,
    });
  };
  // 输入序列走真实热学步进，不直接赋值焊点品质。
  const solve = async (level, first = 0) =>
    p.evaluate(
      ({ level, first }) => {
        const g = window.__game;
        if (level !== null && !g.start(level)) throw new Error("关卡未解锁");
        for (let i = first; i < g.getState().joints.length; i++) {
          g.input({ joint: i, heat: true });
          g.advance(2.3);
          g.input({ joint: i, heat: true, feed: true });
          g.advance(1.55);
          g.input({ joint: i });
          g.advance(2);
        }
        g.advance(5);
        return g.getState();
      },
      { level, first },
    );

  try {
    await p.goto("http://127.0.0.1:8812");
    await p.waitForFunction(() => window.__game);
    check(
      await p.locator('[data-level="1"]').isDisabled(),
      "新存档必须锁定第二关",
    );
    check(!(await p.evaluate(() => __game.start(8))), "调试入口也必须遵守锁定");
    await p.locator('[data-level="0"]').click();
    const position = await p.evaluate(() => __game.getJointPosition(0));
    await p.mouse.move(position.x, position.y);
    await p.mouse.down({ button: "left" });
    await p.waitForFunction(() => __game.getState().joints[0].temp >= 300);
    await p.keyboard.down("Space");
    await p.waitForFunction(() => __game.getState().joints[0].tin >= 0.82);
    await p.keyboard.up("Space");
    await p.mouse.up({ button: "left" });
    await p.waitForFunction(() => __game.getState().joints[0].settled);
    check(
      await p.evaluate(() => __game.getState().joints[0].quality === "完美"),
      "真实鼠标与空格完美焊接",
    );
    const first = await solve(null, 1);
    check(first.result.stars === 3, "第一关应获得三星");
    await shot(p, "poweron_success");
    await p.locator("#view-result").click();
    await shot(p, "result");
    await p.locator("#next-level").click();
    const second = await solve(null);
    check(second.result.stars === 3, "第二关应获得三星");
    await p.evaluate(() => __game.menu());
    await shot(p, "levelselect");
    await p.reload();
    await p.waitForFunction(() => window.__game);
    check(
      await p.evaluate(() => __game.getState().progress[1].stars === 3),
      "刷新后星级保存",
    );

    await p.evaluate(() => {
      __game.start(1);
      __game.input({ joint: 0, heat: true });
      __game.advance(8);
      __game.input({});
      __game.advance(3);
    });
    const failure = await solve(null, 1);
    check(
      failure.result.stars === 0 &&
        failure.result.reasons[0].includes("D1 正极 过热"),
      "失败应定位元件引脚",
    );
    check(failure.progress[1].stars === 3, "失败重试不得抹除历史星级");
    await shot(p, "poweron_fail");

    const levels = [first.result.stars, second.result.stars];
    for (let i = 2; i < 9; i++) {
      const result = await solve(i);
      check(result.result.stars === 3, `第 ${i + 1} 关应能按原型手感通关`);
      levels.push(result.result.stars);
    }
    await p.evaluate(() => {
      __game.start(5);
      __game.input({ joint: 0, heat: true });
      __game.advance(2.3);
      __game.input({ joint: 0, heat: true, feed: true });
      __game.advance(1.3);
    });
    await shot(p, "smd");
    await p.evaluate(() => {
      __game.start(7);
      __game.advance(0);
    });
    await shot(p, "ic");
    // 持续按住左右键，只移动烙铁，验证拖焊不依赖松键。
    const positions = await p.evaluate(() =>
      Array.from({ length: 8 }, (_, i) => __game.getJointPosition(i)),
    );
    await p.mouse.move(positions[0].x, positions[0].y);
    await p.mouse.down({ button: "left" });
    await p.mouse.down({ button: "right" });
    for (const point of positions) {
      await p.mouse.move(point.x, point.y);
      await p.evaluate(() => __game.advance(3.9));
    }
    await p.mouse.up({ button: "right" });
    await p.mouse.up({ button: "left" });
    const dragged = await p.evaluate(() => {
      __game.advance(2);
      __game.advance(5);
      return __game.getState();
    });
    check(
      dragged.joints.every((j) => j.quality === "完美"),
      "持续拖焊应该能得到完美",
    );
    const fast = await p.evaluate(() => {
      __game.start(7);
      for (let i = 0; i < 8; i++) {
        __game.input({ joint: i, heat: true, feed: true });
        __game.advance(0.15);
      }
      __game.input({});
      __game.advance(5);
      return __game.getState();
    });
    check(
      fast.joints.every((j) => j.quality === "冷焊"),
      "拖焊太快必须冷焊",
    );
    const timeout = await p.evaluate(() => {
      __game.start(8);
      __game.input({ joint: 0, heat: true });
      __game.advance(0.1);
      __game.input({});
      __game.advance(80);
      return __game.getState();
    });
    check(
      timeout.result.timedOut && timeout.result.stars === 0,
      "最后一关超时必须失败",
    );

    await p.evaluate(() => __game.sandbox());
    await shot(p, "sandbox");
    for (const [type, count] of [
      ["resistor", 2],
      ["led", 2],
      ["capacitor", 2],
      ["transistor", 3],
      ["smd", 2],
      ["ic", 8],
    ]) {
      await p.locator("#clear-sandbox").click();
      await p.selectOption("#part-type", type);
      await p.locator("#place-part").click();
      const box = await p.locator("#game").boundingBox();
      await p.mouse.click(
        box.x + box.width / 2,
        box.y + 98 + (box.height - 260) / 2,
      );
      const state = await p.evaluate(() => __game.getState());
      check(
        state.parts[0]?.type === type && state.joints.length === count,
        `${type} 放置失败`,
      );
      check(!Object.values(state.inputs).some(Boolean), "放置不应误触加热");
    }
    await solve(null);
    const sandboxState = await p.evaluate(() => __game.getState());
    check(
      sandboxState.phase === "play" &&
        sandboxState.score === 0 &&
        sandboxState.elapsed === 0,
      "沙盒无计时无评分无结算",
    );

    await p.setViewportSize({ width: 1280, height: 720 });
    await p.evaluate(() => {
      __game.start(7);
      __game.resume();
    });
    await shot(p, "compact");
    check(
      await p.evaluate(
        () => document.documentElement.scrollWidth === innerWidth,
      ),
      "桌面不能横向溢出",
    );
    const frames = await p.evaluate(
      () =>
        new Promise((resolve) => {
          let previous = 0;
          const intervals = [];
          function sample(now) {
            if (previous) intervals.push(now - previous);
            previous = now;
            if (intervals.length === 90)
              resolve({
                average: intervals.reduce((a, b) => a + b, 0) / 90,
                max: Math.max(...intervals),
              });
            else requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        }),
    );
    await p.evaluate(() => {
      for (let i = 0; i < 25; i++) {
        __game.start(0);
        __game.menu();
      }
    });
    await p.waitForTimeout(800);
    const audio = await p.evaluate(() => __game.audio());
    check(audio.voices === 0, "切关后短音节点应清理");
    check(errors.length === 0, errors.join("\n"));

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const mobile = await mobileContext.newPage();
      observe(mobile);
      await mobile.goto("http://127.0.0.1:8812");
      await mobile.locator('[data-level="0"]').click();
      await mobile.evaluate(() => __game.advance(0));
      const pos = await mobile.evaluate(() => __game.getJointPosition(0));
      await mobile.touchscreen.tap(pos.x, pos.y);
      const heat = await mobile.locator("#heat-touch").boundingBox();
      const feed = await mobile.locator("#feed-touch").boundingBox();
      const cdp = await mobileContext.newCDPSession(mobile);
      const h = {
        x: heat.x + heat.width / 2,
        y: heat.y + heat.height / 2,
        id: 1,
      };
      const f = {
        x: feed.x + feed.width / 2,
        y: feed.y + feed.height / 2,
        id: 2,
      };
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [h],
      });
      await mobile.evaluate(() => __game.advance(2.3));
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [h, f],
      });
      await mobile.evaluate(() => __game.advance(1.55));
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await mobile.evaluate(() => __game.advance(2));
      const touch = await mobile.evaluate(() => __game.getState());
      check(touch.joints[0].quality === "完美", "移动端双指焊接失败");
      check(
        !Object.values(touch.inputs).some(Boolean),
        "触摸结束后不得遗留输入",
      );
      check(
        await mobile.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "移动端不能横向溢出",
      );
      await shot(mobile, "mobile");
    } finally {
      await mobileContext.close();
    }
    check(errors.length === 0, errors.join("\n"));
    return {
      levels,
      actualMouse: "完美",
      drag: "8 个完美",
      fastDrag: "8 个冷焊",
      sandbox: "6 类元件放置通过",
      touch: "双指完美，无残留输入",
      frames,
      audio,
      errors,
    };
  } finally {
    await context.close();
  }
};
