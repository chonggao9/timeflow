// TimeFlow 设计令牌 —— 暖色亲和（珊瑚橙 + 米白底），支持浅色/深色双板。
// 组件通过 useTheme() 取 colors；radius/shadow 为静态（阴影在深色下本就细微）。
export const lightColors = {
  bg: '#FBF5EF',            // 暖米白底
  surface: '#FFFFFF',       // 卡片/弹层
  primary: '#FF6B6B',       // 珊瑚橙主色
  primaryStrong: '#F24E4E', // 按压/强调
  primarySoft: '#FFE9E4',   // 珊瑚浅色（选中态底）
  primarySofter: '#FFF4F0', // 更浅（图标底）
  ink: '#2B231E',           // 暖黑主文字
  ink2: '#7A6F66',          // 次级文字
  ink3: '#B6A99E',          // 弱文字/占位
  line: '#F1E7DD',          // 发丝分隔线
  line2: '#E9DCD0',         // 时间轴连线
  past: '#E8D9CB',          // 时间轴历史节点
  success: '#4CAE7F',
  danger: '#E08A7A',
  chip: '#FAF6F1',          // 控件填充（出行方式/结束行程/输入框）
  scrim: 'rgba(43,35,30,0.35)', // 模态遮罩
};

export const darkColors = {
  bg: '#1B1511',            // 暖炭黑底
  surface: '#262019',       // 卡片/弹层
  primary: '#FF7A6E',       // 珊瑚橙主色
  primaryStrong: '#FF8F84', // 强调/重点文字
  primarySoft: '#3A2721',   // 珊瑚深色（选中态底）
  primarySofter: '#31201B', // 图标底
  ink: '#F3EDE7',           // 暖白主文字
  ink2: '#C7BCB2',          // 次级文字
  ink3: '#8F8276',          // 弱文字/占位
  line: '#342B23',          // 发丝分隔线
  line2: '#3F352C',         // 时间轴连线
  past: '#3A2F26',          // 时间轴历史节点
  success: '#5CC08F',
  danger: '#F08A7A',
  chip: '#2B241D',          // 控件填充
  scrim: 'rgba(10,6,4,0.55)', // 模态遮罩
};

export const radius = {
  lg: 22,
  md: 16,
  sm: 12,
};

export const shadow = {
  sm: {
    shadowColor: '#2B231E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  primary: {
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
};
