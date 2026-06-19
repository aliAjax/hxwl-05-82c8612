# hxwl-05 水族箱水质监测

多鱼缸水质趋势、换水和异常指标提醒

## 技术栈

React + Vite + TypeScript + CSS

## 日常开发

```bash
npm install
npm run dev
```

开发端口：5105

## 校验流程（本地 & CI）

项目覆盖四层校验：**类型检查 → 构建 → 纯函数单元测试 → 浏览器冒烟测试**。

### 常用命令速查

| 命令 | 说明 | 退出码非零条件 |
| --- | --- | --- |
| `npm run typecheck` | TypeScript 类型检查（`tsc --noEmit`） | 任何类型错误 |
| `npm run build` | Vite 生产构建 | 构建失败 |
| `npm run test:unit` | Vitest 纯函数测试（单文件 run 模式） | 任何断言失败 |
| `npm run test:unit:watch` | Vitest 监听模式（开发时持续运行） | 不适用 |
| `npm run test:smoke` | Playwright 浏览器冒烟测试（需先安装 chromium） | 任何用例失败 |
| `npm run test:smoke:ui` | Playwright UI 模式（逐步调试用例） | 不适用 |
| `npm run test:smoke:debug` | Playwright 调试模式（配合 inspector） | 不适用 |
| `npm run test:all` | 顺序执行 typecheck → build → unit → smoke | 任意一步失败 |
| `npm run playwright:install` | 安装 Playwright chromium 浏览器 + 系统依赖 | 安装失败 |

### 首次本地准备

```bash
npm install
npm run playwright:install
```

### 开发时推荐循环

1. 修改代码 → `npm run test:unit:watch`
2. 代码定型 → `npm run typecheck`
3. 涉及 UI/交互 → `npm run test:smoke`
4. 提交前 → `npm run test:all`

### 测试稳定性保证

- **localStorage**：Vitest setup.ts 注入完整 LocalStorageMock，Playwright 通过上下文隔离自动清理
- **IndexedDB**：Playwright browser context 相互独立，冒烟测试每个 case 前调用 `clearStorages()` + `indexedDB.deleteDatabase()`
- **随机离线同步结果**：Vitest 与 Playwright 均通过 LCG 种子生成器替换 `Math.random`，`createSeededRandom(seed)` 产出确定性序列
- **日期时间依赖**：Vitest `vi.useFakeTimers + vi.setSystemTime('2026-06-15T10:30:00.000Z')`；Playwright 注入 mock `Date` 类，无参构造返回固定时间

### 排查失败

**1. 类型检查失败**

```bash
npm run typecheck          # 查看全部错误
npx tsc --noEmit --pretty  # 直接调用 tsc 查看彩色输出
```

定位思路：从第一条错误开始修，通常是类型不兼容或导入路径错误。

**2. 构建失败**

```bash
npm run build
```

通常伴随 `Could not resolve`、`Rollup failed` 等错误，检查依赖是否安装、导入路径大小写是否正确。

**3. 纯函数单元测试失败**

```bash
npm run test:unit                           # 一次性运行并看全部失败
npm run test:unit:watch -- riskEngine       # 只重跑风险引擎相关
npm run test:unit:watch -- auditLogger      # 只重跑审计日志相关
```

- 用例中日期依赖用 `setFixedDate()` 包裹，避免依赖真实时间
- 随机逻辑用 `mockMathRandom()` 注入种子

**4. 浏览器冒烟测试失败**

```bash
npm run test:smoke:debug                                    # 单步调试
npx playwright show-trace <trace.zip 路径>                  # 回放失败录制
```

常见原因：
- 端口 5105 被占用 → `lsof -ti:5105 \| xargs kill -9`
- 选择器找不到元素 → 查看 `test-results/<失败用例>/test-failed-1.png` 截图和 `error-context.md` 页面快照
- 数据残留 → Playwright 每个 browser context 已自动隔离；如仍有问题检查 `prepareTestPage()` 中清理流程
- CI 与本地不一致 → 检查 `TZ=UTC` 与固定时间种子，避免时区差异

**5. GitHub Actions 产物下载**

失败的 CI 运行会在 Actions → Summary 底部上传：
- `dist`：构建产物
- `unit-test-results`：Vitest 报告
- `smoke-test-results`：Playwright 截图、录像、trace（失败时 14 天保留）

下载 trace.zip 后用 `npx playwright show-trace trace.zip` 本地回放。

## 初始功能

- 领域指标看板
- 角色和分类筛选
- 专业字段录入区
- 示例记录列表
- 可继续扩展IndexedDB、权限、后端API和复杂图表

