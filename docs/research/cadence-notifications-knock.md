# Cadence 通知研究：Knock 的能力、界面、费用与接入边界

查询日期：2026-11-22（Asia/Singapore）。范围是方案研究，未创建服务账号、发送真实通知、付费或改动应用。

关联：[了解 Knock：真实能力、界面、费用与接入限制](https://github.com/sAoKirtio/cohort-study01/issues/3)；[Cadence 通知决策地图：从真实服务到应用界面](https://github.com/sAoKirtio/cohort-study01/issues/1)。本报告保存于可丢弃的 `research/cadence-notifications-knock` 分支，不开 PR、不合并。

证据标记：**已证实**＝官方文档、官方源码或本仓库代码明确说明；**推断/建议**＝根据证据对 Cadence 的分析，尚非产品决定；**待验证**＝需要账号、运行环境或用户输入。价格采用当日直接打开的官方价格页，不采用搜索摘要中的旧套餐名与旧额度。

## 先说清它是什么

**已证实：Knock 像一个托管的通知收发室。** 应用告诉它“发生了什么、通知谁”，它运行通知流程，生成消息，保存每个人的站内列表、已看到/已读/归档状态，通过托管 WebSocket 推送变化，也能安排邮件、延迟、合并与条件发送。站内消息由 Knock 自己托管；Postmark 可以继续担当邮件投递商。[站内能力](https://docs.knock.app/in-app-ui/overview)、[Feeds](https://docs.knock.app/in-app-ui/feeds/overview)、[Postmark 集成](https://docs.knock.app/integrations/email/postmark)

**推断：它有能力支撑本次三类通知，但这还不是选型结论。** Knock 不会自动读懂 Cadence 的课程归属、购买人或退款审批规则，不替应用登录用户、授权课程访问、回答问题或退钱。应用需要在业务成功之后产生事件，并提供正确收件人。Knock 可以按已配置的规则、订阅关系与偏好分发，但这些关系仍需要应用提供。[触发 API](https://docs.knock.app/send-notifications/triggering-workflows/api)、[实施指南](https://docs.knock.app/tutorials/implementation-guide)

## 仓库里现在有什么

代码基线：[`979e28535d8b0ddd32b7241e51423c9a381879ad`](https://github.com/sAoKirtio/cohort-study01/tree/979e28535d8b0ddd32b7241e51423c9a381879ad)。以下均为读取代码所得，未读取 `.env` 或任何真实密钥。

| 事实 | 代码证据与对方案的影响 |
| --- | --- |
| React 19.2、React Router 8.3，未安装 Knock SDK | [`package.json`](../../package.json)。不是 Next.js 应用，不能原样照搬官方 Next.js 示例的登录与路由代码。 |
| 已有 Postmark 邮件发送器；未设置 token 时写本地 `.outbox/` | [`app/lib/mailer.server.ts`](../../app/lib/mailer.server.ts)，`postmarkTransport`、`defaultTransport`。`.outbox/` 是邮件 JSON 文件夹，不是可靠消息队列。 |
| 退款批准/拒绝先提交数据库事务，再发邮件 | [`app/lib/refunds.server.ts`](../../app/lib/refunds.server.ts)，`approveRefundRequest`、`declineRefundRequest`；[`app/routes/admin.refunds.tsx`](../../app/routes/admin.refunds.tsx)，`action`。事务成功与外部通知成功之间已有空隙。 |
| Refund Request 结果通知的收件人是 Purchase 的购买者 | `buildDecisionEmail` 用 `purchase.userId` 查邮箱，不能换成 Instructor 或任意 Seat 的领取者。 |
| 问题和回复有两个写入入口 | [`课程课时页`](../../app/routes/courses.$slug.lessons.$lessonId.tsx) 的 `createComment` / `create-comment`；[`Instructor 问题页`](../../app/routes/instructor.questions.tsx) 的 `createComment` / `action`。未来触发点要覆盖两者，避免只从一个入口回复才有通知。 |
| 问题与回复存在于同一张表 | [`app/db/schema.ts`](../../app/db/schema.ts)，`comments.parentId`；顶层问题 `parentId = null`，回复一层。Instructor 队列还排除已删除和部分工作人员自己的问题；这些查询规则不自动等于通知规则。 |
| 当前有开发用切换用户入口 | [`app/routes/api.switch-user.ts`](../../app/routes/api.switch-user.ts)、[`app/lib/session.ts`](../../app/lib/session.ts)。签发 Knock 用户凭据必须基于可信会话；开发切换用户机制不构成生产身份认证。 |
| README 提到 Knock，但不是已接入的证据 | [`README.md`](../../README.md) 的账号准备说明；当前依赖、布局与 schema 没有本次站内通知系统。 |

**推断/待决定的事件映射：** 学生问题收到符合条件的回复 → 问题作者；新问题 → 该课程 Instructor；Refund Request 批准或拒绝 → Purchase 购买者。是否包含学生互相回复、自己回复自己、管理员提问、编辑/删除后的通知撤回，必须留给事件决策票。

`GLOSSARY.md` 区分 Refund Request 的批准与 Refund 实际发出；现有批准函数没有调用支付商确认到账。即使已有邮件使用“on its way”措辞，也不能据此声称款项到账。首批通知应表达申请处理结果，实际文案仍待用户确认。[术语](../../GLOSSARY.md)、[退款实现](../../app/lib/refunds.server.ts)

## 界面实际长什么样

已查看官方文档截图：小铃铛带数字角标，点开是白色卡片列表；上面有筛选和“全部标为已读”；每条可含头像、未读圆点、正文、时间、按钮。它是嵌进 Cadence 页面的一块 React UI，不是把学生送到 Knock 管理后台。截图中的批准/拒绝按钮仅展示组件能力，**不表示本项目应让购买者在通知里审批退款**。

- [官方可交互 demo](https://in-app-demo.knock.app/)：后续原型讨论的首选入口。本次确认入口可访问；页面依赖 JavaScript，未宣称完成浏览器交互验收。
- [官方组件文档及截图](https://docs.knock.app/in-app-ui/react/feed)、[截图原图](https://docs.knock.app/images/in-app-ui/Docs_FeedImage.png)：本次实际查看了截图。
- [官方 demo 源码](https://github.com/knocklabs/in-app-notifications-example-nextjs)：Next.js 示例，不是 Cadence 成品。
- [React SDK 概览](https://docs.knock.app/in-app-ui/react/overview)：`NotificationIconButton` 是铃铛，`NotificationFeedPopover` 是弹出列表，`NotificationFeed` 可做整页收件箱；也有 hooks 用于自己画 UI。

**已证实：** 可覆盖 CSS 变量、单条消息渲染、头像与点击处理，支持深色样式；可设置 Action URL。默认组件语言为英语，能通过组件的 `i18n` 属性自行提供中文。这里的组件文字翻译，与付费表中的“工作流消息多语言管理”不是一回事。[组件定制](https://docs.knock.app/in-app-ui/react/feed)

官方 `@knocklabs/react` 主分支 `package.json` 声明 React/React DOM 17、18、19 的 peer 支持，Next.js 是可选依赖。**推断：** Cadence 的 React 主版本不是明显障碍；**待验证：** 实际安装版本、React Router SSR/hydration、样式冲突、手机布局、键盘与屏幕阅读器体验。本次没有安装 SDK 或跑集成。[第一方包声明](https://github.com/knocklabs/javascript/blob/main/packages/react/package.json)

## 保存、实时与状态

**已证实：** 每人每个 feed 有预先生成的消息列表、状态筛选与聚合计数，实时更新走 Knock 托管 WebSocket。`seen` 表示看到，`read` 表示读过，`archived` 表示归档；默认打开弹窗把消息标成 seen，可调整为 read。角标也可选择计未看到或未读。站内 `delivered` 只表示消息已进入收件人的 feed，不能证明用户在线、更不能证明用户理解了内容。[Feeds](https://docs.knock.app/in-app-ui/feeds/overview)、[组件默认行为](https://docs.knock.app/in-app-ui/react/feed)、[消息状态](https://docs.knock.app/send-notifications/message-statuses)

已发送 feed 消息的内容和 metadata 不能直接修改；可以改变状态，过时消息可以归档并重新发送。因此“回复被编辑/删除后怎么办”需要应用规则，不能假定第三方会跟数据库自动同步。[Feeds 的限制](https://docs.knock.app/in-app-ui/feeds/overview)

**待决定：** 点开铃铛、点开某条、进入目标课时，哪个动作才算已读？多标签页/多设备同步、断网重连恢复与角标一致性需实测；文档仍把部分跨浏览器上下文同步选项标为 experimental。[组件 socket 行为](https://docs.knock.app/in-app-ui/react/feed)

## 后端接入、身份隔离与可靠性

建议理解为四步：业务写入成功 → 后端触发 workflow → Knock 保存并推送 → React 展示和提交已读状态。下列是接入条件，不是已实施方案。

1. **账号和配置。** 需要 Knock 账号、in-app feed channel、已发布 workflow、模板和 channel ID。服务端用 secret API key；浏览器用 public key。用户可以提前 identify，也可以在触发时 inline identify。以应用稳定用户 ID 对应 Knock 用户，而不是拿角色当用户 ID。[组件准备](https://docs.knock.app/in-app-ui/react/feed)、[触发与用户](https://docs.knock.app/send-notifications/triggering-workflows/api)
2. **可信触发。** 后端提供 workflow key、recipients、actor、data；可携带问题/回复/Refund Request ID、标题、目标链接等必要数据。API 返回 workflow run ID，执行是异步的，不是“通知已被读”的确认。每次最多 1,000 个 recipients、data 总量上限 10 MB。[Workflows API](https://docs.knock.app/api-reference/workflows)
3. **用户隔离。** 增强安全默认关闭，只有 public key 时可冒用其他用户。正式使用须启用 enhanced security，由后端验证自身会话后生成带 `sub`、过期时间的 RS256 JWT。浏览器只能得到该用户的 token；secret key 和 signing key 留在后端。可用 `explicit_grants` 限制为读取/更新 feed 与必要偏好。课程和退款页面仍由 Cadence 检查权限，通知里的链接不授予业务访问权。[安全文档](https://docs.knock.app/in-app-ui/security-and-authentication)
4. **环境隔离。** 当前新账号只有 production；需主动启用 environments 才有 development，用户、消息、密钥分别隔离，模板可提交并提升到生产。新环境的邮件凭据要重新配置。不能沿用旧教程假设账号自动有两套环境。[环境文档](https://docs.knock.app/version-control/environments)

**已证实的可靠性边界：** 触发 API 支持 `Idempotency-Key`，最长 255 字符；相同参数在 24 小时内可安全重试，只有成功的 2xx 响应被缓存，目前此机制仅针对 workflow trigger。超过窗口不能当永久去重。trigger 限速为 Tier 5（1,000 次/秒）；其他 endpoint 有各自额度，429 要处理。[API 幂等与限速](https://docs.knock.app/api-reference/overview/openapi)、[trigger 的 Tier](https://docs.knock.app/api-reference/workflows)

Knock 对向下游服务发送的暂时性失败最多重试 8 次、窗口 30 分钟；退信和不可重试错误不会无限重发，最终会进入失败状态。这解决的是 Knock 已收到任务之后的投递，不能补救 Cadence 数据库提交后、还没调用 Knock 就崩溃的情况。[投递与重试](https://docs.knock.app/send-notifications/delivering-notifications)

**推断/建议：** 将来实施需决定如何持久记录待发送业务事件、重试和失败告警，以及使用稳定事件 ID 去重。可以研究事务 outbox，但这不等于要求把第三方的整个通知表复制回来；托管收件箱和应用可靠触发是两个职责。当前退款路由已经能证明这个决策不是假想问题。不得把“Knock 有重试”写成“端到端恰好发送一次”。

## 通知偏好和 Postmark 怎么配合

**已证实：** Knock 可按渠道、类别、workflow 保存偏好，提供托管偏好页或自建偏好 UI。workflow 可显式覆盖收件人偏好；是否这样处理退款结果是产品决定，不能自行打开。[偏好模型](https://docs.knock.app/preferences/overview)

Postmark 接入需要 Postmark server API key、发件地址、收件人 email；发件身份/域名需在 Postmark 验证。若要让 Knock 接收投递和退信状态，需要开启 Knock incoming webhook 并在 Postmark 配置相应 webhook。其默认 transactional stream 是 `outbound`，与当前 mailer 一致。[Postmark 官方集成说明](https://docs.knock.app/integrations/email/postmark)

| 备选接法（尚未决定） | 得到什么、需承担什么 |
| --- | --- |
| Knock 只做站内；原应用继续发 Postmark 邮件 | 保留现有邮件链路，但需协调两个触发出口、分别观察失败；Knock 不会自动知道直接发送的邮件结果。 |
| 同一业务 workflow 做站内和 Postmark 邮件 | Knock 协调两个渠道与偏好；邮件模板/凭据需迁移，同一事件原 `sendEmail` 出口需要切换以免重复。Postmark 费用仍在。 |

技术上能实现“站内先发，延迟后仍未看/未读才发邮件”，但这是选择，尤其退款结果是否必须即时邮件，不能由研究替用户决定。条件依赖前面消息状态，投递异步，通常要配合 delay。[跨渠道说明](https://docs.knock.app/in-app-ui/overview)、[条件规则](https://docs.knock.app/designing-workflows/step-conditions)

本地 `.outbox/` 不会自动变成 Knock 云端站内 feed。Knock 的邮件 channel 有 sandbox；in-app 没有 sandbox，测试生成的 feed 消息也会计入用量。开发和生产用量都会计入套餐。[用量文档](https://docs.knock.app/manage-your-account/knock-plans)

## 价格：先数“人 × 渠道”，再看套餐

当日官方标价为美元/月，均未包含 Postmark 下游服务费用。Free 无需信用卡；免费额度不能当永久超额授权。超过免费额度时官方 FAQ 表示不硬性截断、会联系补充后续账单安排，应在接近额度前作预算决定。[Knock 当前价格与 FAQ](https://knock.app/pricing)

| 套餐 | 通知额度与增量价格 | 本次相关差异 |
| --- | --- | --- |
| Free（旧名 Developer） | $0；每月 10,000 条 | 预制 UI 保留 Knock 品牌 |
| Starter | $250；每月 50,000 条，之后 $0.005/条 | 可移除品牌 |
| Enterprise | 自定义报价 | 可谈量价或按月通知用户计费；不能假定成本 |

一条＝成功发给一个人在一个渠道上的消息。站内＋邮件＝两条；未发送、失败或退信不计该消息用量。只触发流程而没有发出消息不收费。指南弹窗（guides）与 AI credits 另计，不是本次交易通知必须使用的功能；下式假设均不用。[计量定义](https://docs.knock.app/manage-your-account/knock-plans)

以下是**估算方法，不是用户流量预测或付费承诺**：

```text
A = 当月学生回复通知的站内成功收件人次数
B = 当月 Instructor 新问题通知的站内成功收件人次数
C = 当月退款申请处理结果的站内成功收件人次数
E = 经 Knock → Postmark 成功发出的邮件数（另由 Postmark 计费）
T = 开发/测试等其他计费消息数
M = A + B + C + E + T

Knock Free：M ≤ 10,000 时，通知部分 $0
Knock Starter：$250 + max(0, M - 50,000) × $0.005
总直接服务成本 = Knock 成本 + Postmark 当前账号对应邮件成本
```

如果邮件仍由 Cadence 直接调用 Postmark，`E` 不计入 Knock，但仍计入 Postmark。假设每位收件人站内一条、邮件一条，则一次事件通常贡献两条；给十位收件人各一条站内消息则贡献十条。只用于演算：`M = 60,000` 时 Starter 为 `$300/月`，未含 Postmark；不能因此认定 Cadence 需要 Starter。另有税费、汇率和工程运维成本，本报告不填未核实的数值。

后续应收集 A/B/C、邮件比例、测试量、峰值、预算上限和是否必须去品牌；只问“有多少注册用户”不足以算账。

## 保留、删除与将来迁出

**已证实：** in-app FeedItem 可无限期读取和更新状态；普通套餐的消息日志/流程日志等保留 30 天，Enterprise 为 90 天，API logs 统一 30 天。日志过期后，旧 feed 消息仍能读；但不能再从日志端找回全部内容和历史投递细节。不要把“长期收件箱”说成“永久审计日志”。[保留政策](https://docs.knock.app/manage-your-account/data-retention)

官方价格表表示 feed 可配置保留期，而保留政策页面说目前不支持自定义日志保留策略。两者讨论对象不同；具体 feed 到期配置入口与删除语义需账号确认。已存在删除用户及其关联数据的 API。[价格比较表](https://knock.app/pricing)、[用户 API](https://docs.knock.app/api-reference/users/feeds)

迁出能利用 API 读取用户/偏好、分页读 feed；已过保留期的普通 messages 查询不会返回旧消息。Enterprise warehouse export 是分析数据导出，不能等同于一键无损迁移整个通知系统；官方导出说明列出字段与历史范围。[用户与消息查询](https://docs.knock.app/api-reference/users/feeds)、[数据仓库导出](https://docs.knock.app/integrations/extensions/warehouse-export)

**推断/待验证：** 如要迁出，应验证历史 feed 内容、read/seen/archive 时间、分页、归档项、用户与业务 ID 能否完整导出，以及目标服务能否导入原始时间和状态。本次没有找到普通套餐“一键完整备份/恢复到另一家”的承诺；不把公开 API 的存在当作无损迁出保证。应用应保留业务事实和稳定事件 ID，不能把 Knock 通知正文当成退款或评论的唯一记录。

## 一个托管替代对照：Novu Cloud

只对照 Novu Cloud 的通知产品，不扩展到 Novu Connect 或自托管。以下不是“更便宜所以选它”的结论。

| 维度 | Knock | Novu Cloud |
| --- | --- | --- |
| 托管 UI | React feed/popover，支持自定义 UI | `@novu/react` Inbox、偏好和 headless 能力；[官方 Inbox](https://docs.novu.co/platform/inbox) |
| 免费额度单位 | 每月 10,000 条成功渠道消息 | 每月 10,000 workflow runs；一次运行针对一个 subscriber，多渠道仍为一次；[计费文档](https://docs.novu.co/platform/account/billing) |
| 初始付费档 | Starter $250，含 50,000 条 | Pro $30 起，含 30,000 runs，额外 $1.20/1,000 runs；[实时价格页](https://www.novu.co/pricing/) |
| 超免费额度 | 官方称不硬截断，会联系安排计费 | Free 达额度后拒绝新运行（HTTP 402），至周期重置或升级；[计费文档](https://docs.novu.co/platform/account/billing) |
| 历史与环境 | feed 长期；日志 30 天；可启用隔离环境 | Free Inbox 30 天、Pro 90 天；Free/Pro 两环境，activity logs 分别为 1 天/7 天；[官方限制表](https://docs.novu.co/platform/developer/limits) |

Novu 当日直开价格页 Free 为 **5 workflows**，Pro 20；搜索缓存仍出现 Free 20，报告采用直开页面。其计费包含所有环境，下游邮件供应商费用另算。粗估 Pro 基础档可用 `30 + max(0, R - 30,000) × 0.0012`，其中 `R` 是每位收件人的 workflow runs 总数；需以实际选择的用量档与结算规则核对。[价格页](https://www.novu.co/pricing/)、[计费文档](https://docs.novu.co/platform/account/billing)

**待验证：** 若用户希望继续比较，重点应是 Postmark 实际配置、身份签名、SDK 在本仓库的兼容性、免费品牌、Inbox 到期删除及导出、错误恢复和最终结算规则。本次不对 Novu 作与 Knock 同深度的接入保证，也不因其开源背景推断云端数据一定容易迁出。

## 下一步交给决策与实测的事项

1. **产品决定：** 三类事件的准确触发、收件人、自通知/编辑/删除规则；退款批准与到账文案；偏好是否可关闭退款结果；现有邮件保留、迁入 workflow，还是延迟补发。
2. **预算决定：** 月通知量、峰值、预算、能否接受免费品牌，及超过免费额度的处理。不足以据本报告选定 Knock 或付费套餐。
3. **界面决定：** 铃铛弹层或整页收件箱、何时算已读、显示什么信息、链接目的地、中文与移动端体验。可用官方 demo 与可丢弃原型让用户确认。
4. **账号实测：** 若 Knock 保持候选，再准备隔离测试环境；验证两个用户互不串消息、注销/DevUI 切换后的 socket 清理、JWT 续期、断线后补齐、seen/read 与角标、React Router SSR、邮件 webhook 与幂等重试。本次无账号，均未完成。
5. **可靠性决定：** 数据库提交后通知触发失败如何找回；24 小时外重放如何去重；失败由谁观察/补发。第三方保存通知不替代这些边界。
6. **数据决定：** 哪些个人信息/问题摘要可以送到第三方、需要保存历史多久、是否有数据地区要求。本次没有核实账号可选托管地区、组织合同或特殊保留设置，不能作保证。

研究结论止于“能力与条件已查清，Knock 是可继续验证的候选”；最终服务选择与正式实施仍待用户决定。此次只有文档，未修改 `app/`，未运行应用测试；已人工核对引用、价格单位、代码入口与研究范围。
