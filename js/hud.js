import { COLORS as colors } from "./physics.js";
const $ = (id) => document.getElementById(id);
// 实时温度、润湿与冷却文案继承原型。
export function formatTime(s) {
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
}
export function updateHUD(state) {
  const { active, lastJoint, joints, score, combo, elapsed } = state;
  const { left, right, space, touchHeat, touchFeed } = state.input;
  const j = active || lastJoint,
    temperature = j ? j.temp : 25,
    tin = j ? j.tin : 0,
    done = joints.filter((n) => n.settled).length;
  $("temperature").textContent = Math.round(temperature);
  $("mercury").style.height =
    `${Math.max(2, ((temperature - 25) / 425) * 96)}%`;
  $("temperature").style.color =
    temperature > 375
      ? "#ee9872"
      : temperature >= 300 && temperature <= 360
        ? "#c0e49a"
        : "#edeedf";
  $("temp-caption").textContent =
    "焊盘温度 · " +
    (j?.settled
      ? "已结算"
      : temperature < 100
        ? "待加热"
        : temperature < 250
          ? "预热中"
          : temperature < 300
            ? "可以熔锡"
            : temperature <= 360
              ? "最佳温区"
              : temperature < 385
                ? "注意控温"
                : "温度过高");
  $("count").textContent = `${done} / ${joints.length}`;
  $("progress").style.width = `${(done / Math.max(1, joints.length)) * 100}%`;
  $("score").textContent = String(score).padStart(4, "0");
  $("combo").innerHTML = `${combo}<span> 连击</span>`;
  $("timer").textContent = formatTime(elapsed);
  for (const part of state.parts) {
    const pins = joints.filter((j) => j.part === part.key);
    const el = $("part-" + part.key);
    if (el)
      el.textContent = `${pins.filter((j) => j.settled).length}/${pins.length}`;
  }
  if (state.mode === "sandbox") {
    $("timer").textContent = "自由";
    $("score").textContent = "—";
    $("combo").textContent = "—";
  } else if (state.level.limit) {
    $("timer").textContent = formatTime(
      Math.max(0, state.level.limit - elapsed),
    );
    $("timer").classList.toggle("urgent", state.level.limit - elapsed < 15);
  }
  const percent = Math.round(tin * 100);
  $("fill-percent").innerHTML = `${percent}<span>%</span>`;
  $("quality-ring").style.background =
    `conic-gradient(${tin > 1.4 ? "#e7a56a" : "#bddb86"} ${Math.min(100, percent)}%,#303b2d 0%)`;
  $("solder-fill").style.width = `${(tin / 1.85) * 100}%`;
  $("joint-name").textContent = j ? j.name : "等待选择";
  let quality = "准备焊接",
    detail = "耐心加热，让焊锡自然流动",
    title = "从一个亮圈焊盘开始",
    hint = "移入烙铁，按住左键加热至 300°C",
    index = "01",
    color = "#bddb86";
  if (j) {
    if (j.settled) {
      quality = j.quality;
      detail = `+${j.points} 分 · ${j.bridge ? "连锡短路，注意控制锡量" : j.quality === "完美" ? "银亮内凹，连接可靠" : j.quality === "良好" ? "连接完成，继续保持" : j.quality === "冷焊" ? "润湿不足，下次充分加热" : j.quality === "锡过多" ? "锡量偏多，下次及时停止" : "焊盘受损，下次提早移开"}`;
      title = "焊点已结算";
      hint = "移向下一个亮圈，继续练习";
      index = "✓";
      color = colors[j.quality];
    } else if (j.damage >= 1 || j.temp > 390) {
      quality = "过热";
      detail = "焊盘受损 · 请立即移开烙铁";
      title = "温度过高，停止加热";
      hint = "松开所有按键，等待冷却结算";
      index = "!";
      color = colors["过热"];
    } else if (j.tin > 1.4) {
      quality = "锡过多";
      detail = j.bridge
        ? "焊锡已连到邻近焊盘 · 短路"
        : "焊锡堆成球状，请停止送锡";
      title = "停止送锡，移开烙铁";
      hint = "松开所有按键，等待冷却结算";
      index = "!";
      color = colors["锡过多"];
    } else if (!(left || touchHeat) && j.tin >= 0.1) {
      quality = "冷却中";
      detail = "焊锡正在凝固，稍等片刻";
      title = "让焊点自然冷却";
      hint = "低于 180°C 后自动结算品质";
      index = "03";
    } else if (j.tin >= 0.68) {
      quality = "锡量合适";
      detail = "停止送锡与加热，让焊点自然冷却";
      title = "现在松开所有按键";
      hint = "锡量已足够，移开烙铁，等待结算";
      index = "03";
    } else if (j.temp >= 300) {
      quality = j.tin > 0.05 ? "正在润湿" : "温度正好";
      detail =
        j.tin > 0.05 ? "焊锡正沿引脚攀升" : "保持左键，同时按住右键或空格";
      title = "保持加热，少量送锡";
      hint = "锡量到 70–100% 时，松开所有按键";
      index = "02";
    } else if (j.temp >= 250) {
      quality = "开始熔锡";
      detail = "焊盘接近最佳温区";
      title = "继续加热至绿色温区";
      hint = "右键或空格送锡；建议温度 300–360°C";
      index = "02";
    } else if (j.temp > 45) {
      quality = "预热中";
      detail =
        right || space || touchFeed
          ? "温度不足，锡丝顶住未熔化"
          : "热量正在传入焊盘与引脚";
      title = "继续按住左键加热";
      hint = "达到 300°C 后，再按右键或空格送锡";
    }
  }
  $("quality").textContent = quality;
  $("quality").style.color = color;
  $("quality-detail").textContent = detail;
  $("hint-title").textContent = title;
  $("hint-text").textContent = hint;
  document.querySelector(".hint-index").textContent = index;
}
