/**
 * 前端特性开关（临时显隐用）。
 *
 * SHOW_BUSINESS_SCOPE_SWITCHER：
 *   false = 隐藏左侧菜单底部「业务范围（北仑/菜鸟）」整个区域（切换 Segmented、
 *           固定账号的范围 Tag、折叠态图标按钮都不渲染）。
 *   true  = 恢复原「按 business_scope.switch 权限显示」的行为（回归清单 §30 口径）。
 *
 * 2026-09-15 应用户要求先隐藏，待管理员通知后再改回 true（仅此一行）。
 * 路由与接口层面的业务范围隔离不受此开关影响，仅隐藏 UI 入口。
 */
export const SHOW_BUSINESS_SCOPE_SWITCHER = false;
