import { LEVELS, TYPES } from "./levels.js";
import { COLORS } from "./physics.js";
import { formatTime, updateHUD } from "./hud.js";
import { storageUnavailable } from "./storage.js";
const $ = (id) => document.getElementById(id);

// 一次绑定入口事件，换板仅替换内容，不叠加监听器。
export function createUI(state, actions, audio) {
  $("level-grid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-level]");
    if (card && !card.disabled) actions.start(Number(card.dataset.level));
  });
  $("sandbox-entry").onclick = actions.sandbox;
  $("menu").onclick = actions.menu;
  $("reset").onclick = actions.retry;
  $("restart").onclick = actions.retry;
  $("result-menu").onclick = actions.menu;
  $("next-level").onclick = () => actions.start(state.level.id + 1);
  $("view-result").onclick = () => {
    if (state.powerTime >= 4.5) actions.result();
  };
  for (const id of ["summary", "power-dialog"])
    $(id).addEventListener("cancel", (event) => event.preventDefault());
  $("part-type").replaceChildren(
    ...Object.entries(TYPES).map(([key, spec]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = spec.name;
      return option;
    }),
  );
  $("place-part").onclick = () => {
    actions.release();
    state.placing = $("part-type").value;
    $("sandbox-message").textContent =
      "点击板上空白处放置；可再次点击“放置元件”继续添加。";
  };
  $("cancel-place").onclick = () => {
    state.placing = null;
    $("sandbox-message").textContent = "已回到焊接模式。";
  };
  $("clear-sandbox").onclick = actions.clear;
  $("sound").onclick = () => {
    audio.init();
    audio.settings.effects = !audio.settings.effects;
    audio.apply();
    syncAudio();
  };
  $("music").onclick = () => {
    audio.init();
    audio.settings.music = !audio.settings.music;
    audio.apply();
    syncAudio();
  };
  $("volume").oninput = (event) => {
    audio.init();
    audio.settings.volume = Number(event.target.value) / 100;
    audio.apply();
  };

  function syncAudio() {
    $("sound").textContent = audio.settings.effects ? "♫" : "♪";
    $("sound").setAttribute(
      "aria-label",
      audio.settings.effects ? "关闭音效" : "开启音效",
    );
    $("sound").setAttribute("aria-pressed", String(audio.settings.effects));
    $("music").textContent = `氛围音乐 ${audio.settings.music ? "开" : "关"}`;
    $("music").setAttribute("aria-pressed", String(audio.settings.music));
    $("volume").value = audio.settings.volume * 100;
  }

  // 存档只决定已通过关卡之后的解锁，不允许按钮跳过课程。
  function showSelection() {
    closeDialogs();
    $("selection").hidden = false;
    $("workshop").hidden = true;
    $("saved-progress").textContent =
      `${state.progress.reduce((n, p) => n + p.stars, 0)} / 27 星 · ${state.progress.filter((p) => p.stars).length} / 9 已通过`;
    $("level-grid").replaceChildren(
      ...LEVELS.map((level, index) => {
        const unlocked = index === 0 || state.progress[index - 1].stars > 0;
        const stars = state.progress[index].stars;
        const card = document.createElement("button");
        card.className = `level-card ${unlocked ? "unlocked" : "locked"} ${stars ? "completed" : ""}`;
        card.disabled = !unlocked;
        card.dataset.level = index;
        card.innerHTML = `<div class="card-top"><span class="level-number">${String(index + 1).padStart(2, "0")}</span><span class="card-category">${level.category}</span><span class="card-status">${stars ? "已完成" : unlocked ? "可挑战 ↗" : "待解锁"}</span></div><h4>${level.name}</h4><p>${level.target}</p><div class="card-bottom"><span>${level.count} 个焊点 ${level.limit ? "· 限时 75 秒" : ""}</span><span class="card-stars" aria-label="${stars} 星">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span></div>${unlocked ? "" : '<span class="lock-note">完成上一关解锁</span>'}`;
        return card;
      }),
    );
  }

  function closeDialogs() {
    for (const id of ["summary", "power-dialog"]) if ($(id).open) $(id).close();
  }

  function tray() {
    $("component-tray").replaceChildren(
      ...state.parts.map((part) => {
        const div = document.createElement("div");
        div.className = "component-card";
        const art =
          part.type === "resistor"
            ? "resistor"
            : part.type === "led"
              ? "led"
              : `part-${part.type}`;
        div.innerHTML = `<div class="component-art ${art}"><i></i></div><div><strong>${TYPES[part.type].name}</strong><span>${part.name} · ${part.value}</span></div><b id="part-${part.key}">0/0</b>`;
        return div;
      }),
    );
    updateHUD(state);
  }

  function showWorkshop() {
    closeDialogs();
    $("selection").hidden = true;
    $("workshop").hidden = false;
    const sandbox = state.mode === "sandbox";
    $("sandbox-tools").hidden = !sandbox;
    document.querySelector(".level .eyebrow").textContent = sandbox
      ? "自由实验 / 无限制"
      : `课程进度 / ${String(state.level.id + 1).padStart(2, "0")}`;
    document.querySelector(".level strong").textContent = sandbox
      ? "自由沙盒"
      : state.level.name;
    $("mission").textContent = sandbox
      ? "自由放置六类元件，专注练习每一个焊点。无计时，无评分。"
      : state.level.target;
    document.querySelector(".board-caption").textContent = sandbox
      ? "自由实验板 · 选择元件，点击放置"
      : `${state.level.name} · ${state.joints.length} 个连接`;
    document.querySelector(".stage-label .muted:last-child").textContent =
      sandbox ? "自由实验板" : `练习板 ${state.level.id + 1}`;
    document.querySelector(".station-note p").textContent = sandbox
      ? "自由沙盒 / 不计时不评分"
      : state.level.limit
        ? "限时急修 / 首次加热开始计时"
        : "练习模式 / 不限时";
    $("timer").classList.remove("urgent");
    $("reset").title = sandbox ? "清除焊锡，保留布局" : "重新开始本关";
    tray();
  }

  // 依次演示指示灯、蜂鸣器与电机，故障保持可读直到查看结算。
  function power() {
    const t = state.powerTime;
    const r = state.result;
    const complete = t >= 4.5;
    const cold = state.joints.some((j) => j.quality === "冷焊");
    const severe = state.joints.some(
      (j) => j.bridge || j.quality === "过热" || !j.settled,
    );
    const dim = state.joints.some((j) => j.quality !== "完美");
    $("power-title").textContent = complete
      ? r.success
        ? "通电成功，每个连接都在回应。"
        : "通电失败，先找到问题所在。"
      : [
          "检查线路与电源保护…",
          "指示灯自检…",
          "蜂鸣器自检…",
          "电机驱动自检…",
          "正在记录测试结果…",
        ][Math.min(4, Math.floor(t))];
    $("power-dialog").classList.toggle("failed", complete && !r.success);
    $("power-caption").textContent = complete
      ? r.success
        ? "指示灯亮起 · 蜂鸣器响应 · 电机正常转动"
        : "已切断异常供电，请检查下列连接。"
      : "低压供电已接入 · 请稍候";
    $("power-progress").style.width = `${Math.min(100, (t / 4.5) * 100)}%`;
    ["led", "buzzer", "motor"].forEach((name, i) => {
      const el = $("test-" + name);
      const on = t >= i + 1;
      el.className = `test-device ${on ? (r.success ? "powered" : "fault") : ""} ${on && cold && !severe && i === 0 ? "flicker" : ""} ${dim ? "dim" : ""} ${on && severe ? "smoking" : ""}`;
      el.querySelector("span").textContent = !on
        ? "等待供电"
        : r.success
          ? ["稳定发光", "自检鸣响", "运转正常"][i]
          : [
              cold && !severe ? "接触不良 · 闪烁" : "未亮起",
              "电路异常",
              "停止转动",
            ][i];
    });
    $("power-reasons").replaceChildren(
      ...(complete ? [...r.reasons, ...r.warnings] : []).map((reason) => {
        const p = document.createElement("p");
        p.textContent = reason;
        return p;
      }),
    );
    $("view-result").disabled = !complete;
    $("view-result").textContent = complete ? "查看结算 →" : "测试进行中…";
  }

  function showPower() {
    power();
    if (!$("power-dialog").open) $("power-dialog").showModal();
  }

  function showResult() {
    closeDialogs();
    const r = state.result;
    $("result-stars").textContent =
      "★".repeat(r.stars) + "☆".repeat(3 - r.stars);
    $("result-title").textContent = r.success
      ? state.level.id === 8
        ? "急修完成，你已走完全部课程。"
        : "电路已就绪，继续下一次连接。"
      : "找到问题，再焊一次。";
    $("summary-copy").textContent =
      `${state.level.name} · 最高连续完美 ${state.maxCombo} 次。${r.success ? "本关已通过，最佳成绩已保存。" : "通电未通过，本次为 0 星，重试后可解锁下一关。"}${storageUnavailable() ? "浏览器无法保存进度，本次进度仅在当前页面有效。" : ""}`;
    $("final-score").textContent = r.total;
    $("final-perfect").textContent =
      `${state.joints.filter((j) => j.quality === "完美").length} / ${state.joints.length}`;
    $("final-time").textContent = formatTime(state.elapsed);
    $("score-breakdown").textContent =
      `焊点质量 ${r.quality}/70　＋　速度 ${r.speed}/20　＋　连击 ${r.combo}/10${r.success ? "" : "　· 通电失败：0 星"}`;
    $("result-list").replaceChildren(
      ...state.joints.map((j) => {
        const div = document.createElement("div");
        const name = document.createElement("span");
        const quality = document.createElement("span");
        name.textContent = j.name;
        quality.textContent = j.bridge ? "连锡短路" : j.quality || "未完成";
        quality.style.color = COLORS[j.quality] || "#f48663";
        div.append(name, quality);
        return div;
      }),
    );
    $("next-level").hidden = !r.success || state.level.id >= LEVELS.length - 1;
    $("summary").showModal();
  }

  syncAudio();
  return {
    showSelection,
    showWorkshop,
    showPower,
    power,
    showResult,
    tray,
    closeDialogs,
  };
}
