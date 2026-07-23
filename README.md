# 中印供应链依赖图谱

一个可脱离 ChatGPT Sites 独立运行的 React + Vite 单页研究站点。项目完整保留依赖矩阵、行业与 HS 筛选、商品详情、月度与五年趋势、结论准确度、替代供应国、工程设备专题、第三国路径信号阈值、政策时间线、来源中心和移动端布局。

## 环境要求

- Node.js 22.13 或更高版本
- npm 10 或更高版本

## 本地运行

```bash
npm install
npm run dev
```

Vite 会在终端显示本地访问地址。

## 构建与预览

```bash
npm run build
npm run preview
```

生产文件输出到 `dist/`。Vite 配置使用相对路径，可部署到普通静态文件服务器、对象存储、CDN、GitHub Pages、Netlify、Vercel 或 Nginx。

不要直接双击 `dist/index.html` 通过 `file://` 打开；请使用 `npm run preview` 或任何静态 HTTP 服务器。

## 项目结构

```text
├─ public/
│  ├─ favicon.svg
│  └─ og.png
├─ src/
│  ├─ data/
│  │  └─ monthlyTrade.ts # 2024-12—2026-06 月度数据
│  ├─ App.tsx          # 页面、年度数据、商品报告和全部交互逻辑
│  ├─ main.tsx         # React 入口
│  └─ styles.css       # 完整视觉与响应式样式
├─ scripts/
│  └─ fetch-monthly-data.mjs # 从 UN Comtrade 重建月度数据文件
├─ index.html
├─ package.json
├─ vite.config.ts
└─ tsconfig*.json
```

## 数据口径

- 2025 完整自然年 HS4 矩阵来自 UN Comtrade 静态快照。
- 商品详情的月度序列覆盖 2024-12—2026-06；没有从官方 API 取回的月份保留为空，不插值、不预测。
- 2026 最新数据引用印度 DGCI&S TradeStat 与贸易情报和分析门户。
- 页面浏览时不会调用外部数据 API；外部请求仅发生在用户主动打开来源链接或加载 Google Fonts 时。
- “依赖”指同一时期、同一 HS 编码下“印度自中国进口额 ÷ 印度全球进口额”，不等于印度国内消费或生产的总体依赖。
- 路径结果仅为贸易流筛查信号，不认定实际转口、规避管制或违法。

## 更新数据

年度矩阵、商品分析、结论与准确度规则位于 `src/App.tsx`；月度记录位于 `src/data/monthlyTrade.ts`。人工更新时可直接修改对应商品 ID 下的月份、进口额、占比与状态。

也可以运行下列命令，按当前 16 个 HS4 编码从 UN Comtrade 重新生成整个月度文件：

```bash
node scripts/fetch-monthly-data.mjs
```

更新时应同步修改快照日期、数据期、来源发布日期、访问日期和限制说明，并重新执行：

```bash
npm run typecheck
npm run build
```

2026 年 ITC HS 调整应使用显式对照表；无法可靠对应的数据不要跨期合并，缺失月份不要插值。

## 安全说明

本项目不需要 API Key、账号密码或后端服务。不要把 `.env`、令牌、私钥或云服务凭据提交到仓库。`.gitignore` 已排除常见本地配置和密钥文件。

## 许可与免责声明

站点用于研究与合规初筛，不构成法律意见。转载或公开部署时，请保留数据来源链接、口径说明与风险提示，并遵守各数据源的使用条款。
