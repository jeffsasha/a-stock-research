# A股研究台

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![Node.js 22.13 or newer](https://img.shields.io/badge/Node.js-22.13%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#开发与运行)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-2563eb?style=flat-square)](#上游与许可证)

按股票名称或代码汇总公开市场数据、新闻和研报，在同一个页面查看数据日期、来源、口径和研究摘要。支持沪深北现行A股的名称与代码查询，具体数据覆盖由各来源决定。

## 功能

- Next.js App Router 搜索首页、霓虹灯点亮标题、真实人气趋势、持久化明暗主题；首页不预加载任何指定股票。
- 同花顺小时/日人气榜；失败时尝试东方财富当前人气榜＋腾讯行情，明确说明备用源周期与数据时间。

- 腾讯行情与250根前复权日线；均线、区间收益与价格图。
- 新浪财报三表、同比、现金流、存货、合同负债及TTM利润；行情估值与财报重算估值。
- 东财资金流，失败时尝试新浪不同口径的备用源。
- 东财新闻短摘录、原文链接；东财和新浪研报合并，提供机构、评级、按年份标注的EPS和可用PDF链接。
- 同花顺EPS机构预测汇总；该来源不可用时，统计近一年公开研报中每家机构、每个年份的最新EPS样本，并标注为研报样本，不冒充完整一致预期。固定规则生成事实摘要和待验证风险。
- 每项数据独立返回成功、空记录或错误；保留日期、来源、缓存状态和错误说明。

本网站实现原技能中的七类数据入口，并非其87个端点的完整移植。摘要不调用大模型，不自动推断公司业务或给出目标价。研报只索引公开信息和原文链接，不复制付费报告全文。

## 开发与运行

需要 Node.js >=22.13 和 npm。使用真实 Next.js 构建静态前端，动态市场 API 由同包 Cloudflare Worker 提供。GitHub Pages 单独托管不能运行这些 API。

Windows首次运行：安装包含npm的Node.js，重新打开PowerShell，进入含`package.json`的项目目录；不需要管理员权限。若PowerShell限制`npm.ps1`，使用`npm.cmd`。

```sh
cd a-stock-research
npm ci
npm test
npm run dev
```

打开 `http://127.0.0.1:4173`。开发模式运行真正的 Next.js 服务，同一个 Node 主机处理市场API。生产预览：

```sh
npm run build
npm run local
```

`npm run build`执行`next build --webpack`，导出前端到`out/`，并打包实时API Worker到`dist/server/index.js`、前端资源到`dist/client/`。`npm run local`直接预览构建结果，仍提供真实API；可运行`node scripts/local-server.mjs --check`进行HTTP检查。原始Python技能需要Python依赖，网站运行时不依赖Python或IWENCAI_API_KEY。

标题动画为独立实现的CSS霓虹灯点亮效果，未安装或复制需要许可证的React Bits Pro Signal Type。GradientWaves和RubberSegment根据用户提供的React Bits JSX/CSS接入，分别使用ogl和motion；支持键盘操作及减少动画设置，无需REACTBITS_LICENSE_KEY。主题使用next-themes保存在本地。背景包含WebGL波浪与鼠标视差；无WebGL时降级为CSS背景，减少动画设置下停止动效。

真实来源复测：`node scripts/live-test.mjs`，结果写入 `verification/live-test.json`，任一请求的数据类别失败都会使检查失败。接口边界验证：`node scripts/api-test.mjs`。最新测试时间见各JSON的`tested_at`；历史快照具有明确日期，页面打开后会逐项查询更新。

## API

GET `/api/trending?period=hour` 返回真实人气榜（`day`为日榜）。返回排名、股票、概念、涨跌幅、来源和抓取时间；无生成时间时`as_of=null`。

GET `/api/search?q=东威科技` 搜索股票。

GET `/api/research/688700` 返回七项数据和研究摘要。

GET `/api/research/688700/{section}` 单独取数，section为：`quote`、`daily`、`financials`、`fund-flow`、`news`、`reports`、`forecast`。完整说明在网站 `/api/docs`。

有效请求中上游错误仍可能返回HTTP200，必须检查每项 `status`：`ok`、`empty`、`error`。无效代码返回400，未知项目404。金额通常为人民币元；`marketCapYi`单位为亿元。`as_of`是数据日期；`fetched_at`是UTC抓取时间；报价另含北京时间戳。

Sites部署默认为仅所有者可访问；API遵循同样的登录访问权限。支持登录后同源浏览器调用，当前没有单独发行外部机器客户端API密钥。

## 研究方法与局限

TTM利润＝上一年年报＋本期累计－上一年同期累计。只有当年EPS为正且不少于3家机构预测时计算预期PE。股票停牌或无有效报价时暂停价格估值判断。比较价格趋势前检查日线与报价日期。财报累计期间不可直接混为单季度。

新闻按股票名称检索，可能包含行业相关内容；空结果不代表没有新闻。研报来源更新节奏可能不同，合并后仍需核对原文。同花顺均值不是业绩保证。大单与超大单分类不等于机构账户行为。

北交所920代码报价支持已实测；腾讯北交所历史日线覆盖不足时明确显示错误。旧43/83/87代码可能冻结，要求通过公司名称查现行代码。行情在休市或节假日期间保持最近成交日，不能将抓取时间视为成交时间。

东财在单实例内串行，间隔至少1.1秒加随机抖动；新浪研报间隔6.1秒。内存缓存不跨实例或重启持久化。公开源可能限流或因部署地区不可达；按需单用户查询适用。多用户、多实例扩展需要共享限流和缓存。

## 上游与许可证

来源：[simonlin1212/a-stock-data](https://github.com/simonlin1212/a-stock-data)，版本v3.10.2，提交 `f814dcfe209dd7958f4858f9d878d591ee85fb56`。

`vendor/a-stock-data/SKILL.md`、`README.md`和`LICENSE`保留上游原文。SKILL.md SHA256：`4d23acf79e86be4241024759ba966d6a43fc5944b53019890ebd229807535cea`。`lib/market.mjs`是从相关嵌入Python代码改写的JavaScript适配器，改动包括返回结构、单位核对、缓存、限流、错误隔离和原文链接。上游Apache-2.0许可证保留于vendor目录；适配器与网站新增代码按Apache-2.0提供，框架及UI依赖遵循各自许可证。

本项目作为独立仓库维护，网站与API代码位于仓库根目录，上游原始技能保存在 `vendor/a-stock-data/`。环境文件、依赖目录、短期凭证和构建缓存不提交。
