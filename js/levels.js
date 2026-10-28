// 元件布局以电路板局部坐标表示，热学参数与第一阶段完全相同。
export const TYPES = {
  resistor: {
    name: "碳膜电阻",
    prefix: "R",
    value: "220 Ω",
    width: 220,
    height: 100,
  },
  led: {
    name: "发光二极管",
    prefix: "D",
    value: "红色指示灯",
    width: 130,
    height: 120,
  },
  capacitor: {
    name: "电解电容",
    prefix: "C",
    value: "10 μF",
    width: 140,
    height: 130,
  },
  transistor: {
    name: "三极管",
    prefix: "Q",
    value: "三引脚驱动",
    width: 160,
    height: 120,
  },
  smd: {
    name: "贴片电阻",
    prefix: "R",
    value: "0603 · 精准焊盘",
    width: 120,
    height: 85,
  },
  ic: {
    name: "控制芯片",
    prefix: "U",
    value: "八引脚 · 支持拖焊",
    width: 240,
    height: 190,
  },
};

// 统一生成引脚与元件信息，关卡和沙盒共用。
export function makePart(type, x, y, number = 1) {
  const spec = TYPES[type];
  return {
    ...spec,
    type,
    x,
    y,
    name: `${spec.prefix}${number}`,
    key: `${type}-${number}`,
  };
}

export function makeJoints(parts) {
  return parts
    .flatMap((part) => {
      let pins = [
        [-85, 0, "左脚"],
        [85, 0, "右脚"],
      ];
      if (part.type === "led")
        pins = [
          [-32.5, 0, "正极"],
          [32.5, 0, "负极"],
        ];
      if (part.type === "capacitor")
        pins = [
          [-32, 12, "正极"],
          [32, 12, "负极"],
        ];
      if (part.type === "transistor")
        pins = [
          [-48, 15, "基极"],
          [0, 15, "集电极"],
          [48, 15, "发射极"],
        ];
      if (part.type === "smd")
        pins = [
          [-32, 0, "左焊盘"],
          [32, 0, "右焊盘"],
        ];
      if (part.type === "ic")
        pins = Array.from({ length: 8 }, (_, i) => [
          ((i % 4) - 1.5) * 48,
          i < 4 ? -50 : 50,
          `${i + 1} 脚`,
        ]);
      return pins.map(([dx, dy, label]) => ({
        x: part.x + dx,
        y: part.y + dy,
        name: `${part.name} ${label}`,
        part: part.key,
        type: part.type,
        small: ["smd", "ic"].includes(part.type),
        temp: 25,
        peak: 25,
        heat: 0,
        contact: 0,
        tin: 0,
        wet: 0,
        thermalSum: 0,
        thermalMass: 0,
        damage: 0,
        overTime: 0,
        settled: false,
        quality: null,
        points: 0,
        bridge: false,
        dragTouched: false,
      }));
    })
    .map((joint, id) => ({ ...joint, id }));
}

const p = makePart;
export const LEVELS = [
  {
    name: "第一个连接",
    category: "入门 · 电阻",
    target: "完成电阻两端。预热至 300°C，送锡至 70–100%，松手冷却。",
    parts: [p("resistor", 0, 0)],
    par: 18,
  },
  {
    name: "点亮微光",
    category: "入门 · 发光二极管",
    target: "连接 LED 正负极，用两个可靠的焊点点亮第一束光。",
    parts: [p("led", 0, 0)],
    par: 18,
  },
  {
    name: "储存一点能量",
    category: "基础 · 电容",
    target: "完成电阻与电容。保持充分润湿，留意紧邻的电容引脚。",
    parts: [p("resistor", -145, -45), p("capacitor", 155, 30)],
    par: 32,
  },
  {
    name: "熟悉的练习板",
    category: "基础 · 综合连接",
    target: "两枚电阻与一颗 LED，连续完成六个可靠连接。",
    parts: [
      p("resistor", -150, -95),
      p("resistor", -95, 110, 2),
      p("led", 207.5, -5),
    ],
    par: 45,
  },
  {
    name: "三脚的平衡",
    category: "进阶 · 三极管",
    target: "焊好基极、集电极与发射极。相邻引脚锡多容易桥连。",
    parts: [p("transistor", 0, 0)],
    par: 25,
  },
  {
    name: "毫米之间",
    category: "精密 · 贴片元件",
    target: "两枚贴片电阻，焊盘更小。将尖端准确放入亮圈，再加热送锡。",
    parts: [p("smd", -130, -40), p("smd", 130, 60, 2)],
    par: 34,
  },
  {
    name: "微型驱动板",
    category: "精密 · 混合装配",
    target: "用贴片电阻、三极管与 LED 组装驱动电路，控制每一滴锡。",
    parts: [p("smd", -170, -80), p("transistor", 140, -60), p("led", -20, 105)],
    par: 55,
  },
  {
    name: "一气呵成",
    category: "挑战 · 多引脚拖焊",
    target:
      "按住加热与送锡，沿同一排引脚缓慢拖动。每脚停留约 4 秒，太快冷焊，太慢过热。",
    parts: [p("ic", 0, 0)],
    par: 58,
  },
  {
    name: "最后的抢修",
    category: "终章 · 限时急修",
    target: "在 75 秒内修复控制芯片和指示灯。计时从首次加热开始，冷却也计时。",
    parts: [p("ic", -110, 0), p("led", 205, 20)],
    par: 65,
    limit: 75,
  },
].map((level, id) => ({ ...level, id, count: makeJoints(level.parts).length }));
