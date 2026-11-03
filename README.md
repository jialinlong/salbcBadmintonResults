# SALBC Badminton Results

羽毛球记分助手，基于微信原生小程序和微信云开发，用于管理球员、记录双打比分、查看历史结算及分析个人战绩。小程序使用 JavaScript、WXML、WXSS，后端由 Node.js 云函数、云数据库和云存储组成。

## 功能入口

| 页面 | 路径 | 功能 |
| --- | --- | --- |
| 首页 | `miniprogram/pages/home/` | 进入比赛录入、球员录入、排行榜和历史记录 |
| 记录比赛 | `miniprogram/pages/match/` | 选择四名球员，按姓名、拼音或首字母搜索，录入比分，连续记录时保留队员 |
| 录入球员 | `miniprogram/pages/addPlayer/` | 密码验证、姓名去重检查、新增球员 |
| 排行榜 | `miniprogram/pages/rank/` | 月榜、总榜及荣誉榜，点击球员进入个人战绩 |
| 历史记录 | `miniprogram/pages/history/` | 按日期、球员筛选，按天分页，计算当日积分，删除比赛 |
| 个人战绩 | `miniprogram/pages/player/` | 胜率、连胜、搭档和对手分析、成就、活跃日历、月度趋势、头像及分享卡片 |

实际路由以 [app.json](miniprogram/app.json) 为准，首页为 `pages/home/home`。`pages/index/` 是未注册的模板页面。

## 项目结构

```text
.
├── miniprogram/
│   ├── app.js                 # 云环境初始化与全局刷新标记
│   ├── app.json               # 页面路由与窗口配置
│   ├── app.wxss               # 全局样式
│   ├── pages/                 # 业务页面
│   ├── components/            # 小程序组件
│   ├── images/                # 图标等静态资源
│   └── utils/                 # 缓存、拼音、积分、性能日志等工具
├── cloudfunctions/            # 每个子目录是独立部署的云函数
├── project.config.json        # 公共开发者工具配置
├── project.private.config.json # 本机开发者工具配置，可覆盖公共配置
└── README.md
```

仓库没有根级 `package.json`。云函数各自通过目录内的 `package.json` 声明 `wx-server-sdk` 依赖，版本声明并不完全相同；维护时以对应目录为准。

## 开发环境与部署

### 配置入口

准备有项目权限的微信开发者账号、小程序 AppID、微信开发者工具，以及可访问的云开发环境。

| 文件 | 需要核对的内容 |
| --- | --- |
| [project.config.json](project.config.json) | `appid`、`miniprogramRoot`、`cloudfunctionRoot`；公共基础库版本为 `3.12.0` |
| [project.private.config.json](project.private.config.json) | 同名字段覆盖公共配置；当前基础库版本为 `3.16.1` |
| [miniprogram/app.js](miniprogram/app.js) | `wx.cloud.init` 的 `env` 是小程序实际访问的云环境 ID |
| [cloudfunctions/verifyPassword/index.js](cloudfunctions/verifyPassword/index.js) | `MATCH_PASSWORD` 是录入比赛和球员共用的校验密码配置 |

`miniprogram/envList.js` 中的 `envList` 数组为空，应用并不从该文件选择云环境。切换环境需要调整 `app.js` 中的初始化配置，例如：

```js
wx.cloud.init({
  env: '<你的云环境 ID>',
  traceUser: true
})
```

云函数使用 `cloud.DYNAMIC_CURRENT_ENV`，访问各自部署所在的环境。小程序环境、云函数部署环境、数据库及云存储必须对应。

### 部署顺序

1. 用微信开发者工具导入仓库根目录，核对 AppID，以及 `miniprogram/`、`cloudfunctions/` 两个目录配置。
2. 确认目标云开发环境，并按上表配置小程序环境和录入密码。密码通过项目维护者获取，不写入使用示例。
3. 在目标数据库建立 `players`、`matches` 集合；使用备份功能时再建立 `backup_records`。
4. 按实际访问路径配置数据库和云存储权限：新增球员页面直接查询、写入 `players`；比赛记录、统计和备份由云函数访问；个人页向 `avatars/` 上传头像并读取图片。
5. 将云函数目录分别部署到同一目标环境，确保对应 `wx-server-sdk` 依赖可用。受限网络环境应先由维护者准备可用的部署环境和依赖，不把本地联网安装作为默认步骤。
6. 核对核心云函数是否齐全，再在允许调试的环境中录入球员和比赛，查看历史记录与排行榜。

核心云函数包括 `verifyPassword`、`getAllPlayers`、`recordMatch`、`getMatchStats`、`getPlayerStats`、`deleteMatch`、`updatePlayerAvatar`。`backupDatabase` 和 `updatePlayerPinyin` 为维护工具，按需部署、调用。

数据库权限、索引和云端运行参数没有随仓库完整导出，需要在目标环境核对。`config.json` 中的 `permissions.openapi` 不是数据库访问规则。当前 `backupDatabase/config.json` 也没有定时触发器，部署该函数不等于启用定时备份。

### 录入权限的当前实现

录入比赛和录入球员均调用 `verifyPassword`，传入 `type: 'match'`。验证成功后分别在客户端保存 `match_permission` 和 `player_permission`。比赛页还保存 `match_permission_time`，但当前没有读取该时间实现过期校验。

这些标记用于页面入口控制。当前 `recordMatch`、`deleteMatch`、`updatePlayerAvatar` 没有在函数内校验该密码或球员归属，不能将页面密码视为完整的服务端鉴权。部署时需要单独核对云端访问权限。

## 数据结构

### players 集合

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `_id` | String | 球员文档 ID，比赛录入时用于更新累计字段 |
| `name` | String | 球员姓名；新增页面去除首尾空格并检查重名 |
| `total_matches` | Number | 新增时为 0，录入比赛时加 1；删除比赛目前不会回退此字段 |
| `wins`、`losses` | Number | 累计胜场、负场，新建时均为 0 |
| `createTime` | Date | 新增球员的服务器时间 |
| `fullPinyin`、`firstLetters` | String，可选 | 姓名全拼、首字母；缺失时比赛页在客户端补算 |
| `avatar` | String，可选 | 头像地址或云存储 fileID，空字符串表示默认头像 |
| `avatarUpdateTime` | Date，可选 | 最近修改头像的服务器时间 |

姓名仍被个人统计、排行榜汇总、删除比赛和头像更新用作关联条件。新增页面的重名检查不等于数据库唯一约束；维护数据时需保持姓名唯一，避免直接改名导致历史记录与球员关联不一致。

### matches 集合

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `_id` | String | 比赛文档 ID，删除时作为 `matchId` 传入 |
| `createTime` | Date | `db.serverDate()` 生成的比赛记录时间 |
| `teamA`、`teamB` | Array | 双打队伍；正常页面录入时每队两名球员 |
| `teamA[]._id`、`teamB[]._id` | String | 球员 ID |
| `teamA[].name`、`teamB[].name` | String | 录入时保存的球员姓名 |
| `scoreA`、`scoreB` | Number | 两队比分，前端提交前使用 `parseInt` 转换 |
| `winner` | String | `'A'` 或 `'B'`；按 `scoreA > scoreB` 判断 A 队获胜，否则为 B 队 |

新比赛中的球员对象只保存 `_id` 和 `name`，不会保存头像、展示名或统计字段。历史数据可能包含额外字段。日期必须保持数据库日期类型，不能用普通显示字符串替代，否则会影响时间范围查询、排序和按天聚合。

### backup_records 集合

备份元数据包含 `backupTime`、毫秒时间戳 `backupTimestamp`、`totalRecords`、`files` 和 `collections`。`files` 中保存每个集合的 `collection`、`fileName`、`fileID`、`count`，用于定位和清理备份文件。

## 云函数接口

小程序通过 `wx.cloud.callFunction({ name, data })` 调用，业务返回值位于 `res.result`。调用完成后仍需检查 `success`。失败信息按函数不同放在 `errMsg`、`msg` 或 `error` 字段中。

| 云函数 | 主要入参 | 主要返回或行为 |
| --- | --- | --- |
| [verifyPassword](cloudfunctions/verifyPassword/index.js) | `password`、`type: 'match'` | 校验录入密码，返回 `success` |
| [getAllPlayers](cloudfunctions/getAllPlayers/index.js) | 可选 `traceId` | 返回 `players`、`todayMatches`，用于选人和当天活跃标识 |
| [recordMatch](cloudfunctions/recordMatch/index.js) | `teamA`、`teamB`、`scoreA`、`scoreB`；队员需含 `_id`、`name` | 保存比赛，并按球员 ID 增加场次及胜负计数 |
| [getMatchStats](cloudfunctions/getMatchStats/index.js) | `type` 及筛选参数，见下表 | 历史筛选选项、按天分页或排行榜 |
| [getPlayerStats](cloudfunctions/getPlayerStats/index.js) | `playerName` | 在 `data` 中返回个人统计、头像、搭档、成就和趋势等 |
| [deleteMatch](cloudfunctions/deleteMatch/index.js) | `matchId` | 按姓名回退胜负场次，然后删除比赛 |
| [updatePlayerAvatar](cloudfunctions/updatePlayerAvatar/index.js) | `playerName`、`avatarUrl` | 更新该姓名匹配到的首个球员；空地址恢复默认头像 |
| [backupDatabase](cloudfunctions/backupDatabase/index.js) | 无业务必填参数 | 备份两个业务集合，返回文件信息和记录数，并尝试清理过期备份 |
| [updatePlayerPinyin](cloudfunctions/updatePlayerPinyin/index.js) | `dryRun`，默认 `true` | 预览或执行拼音字段补充，返回更新计数及 `errors` |

### getMatchStats 操作

| `type` | 参数 | 返回字段 |
| --- | --- | --- |
| `getFilterOptions` | 可选 `traceId` | `dates`、`players`、`totalCount`，从比赛记录提取 |
| `getHistoryDays` | `dayPage` 从 0 开始，`daysPerPage` 默认 3；可选 `filterDate`、`filterPlayer`、`traceId` | `matches`、`days`、`hasMore` |
| `getRankings` | `tab: 'month'` 为月榜，页面用 `'total'` 请求总榜 | `rankList`、`mostActive`、`bestPlayer`、`topScorer`、`totalMatches`、`totalPlayers` |

历史查询参数示例：

```json
{
  "type": "getHistoryDays",
  "dayPage": 0,
  "daysPerPage": 3,
  "filterDate": "",
  "filterPlayer": ""
}
```

`filterDate` 使用 `YYYY-MM-DD`，空字符串表示不筛选。未指定日期时，默认一页包含最多三个有比赛记录的完整自然日，可用 `daysPerPage` 调整；指定日期后仅返回该日，`hasMore` 为 `false`。球员筛选按两队成员的姓名匹配。

## 统计规则

### 历史积分

历史页根据 [common.js](miniprogram/utils/common.js) 的 `calculateMatchPoints` 计算当日结算。胜方每名球员获得对应积分，败方每名球员扣除同样积分。

| 败方得分 | 每名球员的积分绝对值 | 标签 |
| --- | --- | --- |
| 小于 6 | 4 | 梦游局 |
| 6 至 10 | 2 | 碾压局 |
| 11 及以上 | 1 | 标准局 |

例如 21:5 时，胜方每人加 4、败方每人减 4。积分根据页面当前加载的比赛计算，不单独存库；选择球员筛选后，结算范围也只包含筛选后的比赛。

### 排行榜与个人统计

- 月榜至少参加 5 场，总榜至少参加 10 场才上榜。排序先比较四舍五入后的整数胜率，再按场次降序；荣誉榜也从满足场次门槛的球员中选取。
- 净胜分按每场比分差累加：胜方增加分差，败方扣除分差。它与历史页的当日积分是两种指标。
- 排行榜接口返回的总比赛数和总人数包含未达到上榜门槛的数据，可能大于榜单展示范围。
- 个人战绩从该球员最近最多 1000 场比赛重新计算，超过此范围时不代表完整生涯统计。排行榜查询则按每批 1000 条继续读取满足条件的比赛。

历史按天查询明确使用 `+08:00`。当天活跃、月榜边界及部分日期展示使用运行环境的本地日期方法；在其他时区运行时，需要核对日期归属是否一致。

## 缓存与性能排查

缓存实现位于 [cache.js](miniprogram/utils/cache.js)，使用小程序本地存储。

| 缓存类型 | 有效期 | 当前使用方式 |
| --- | --- | --- |
| `matchPlayers` | 5 分钟 | 比赛页先显示缓存，再请求云端更新；新增球员后清除 |
| `rankings` | 5 分钟 | 按 `month`、`total` 分别缓存；命中后直接展示 |
| `filterOptions` | 10 分钟 | 历史筛选选项；录入、删除比赛后清除或刷新 |
| `playerStats` | 3 分钟 | 工具中有配置，当前个人页没有使用该缓存 |

录入比赛成功后会设置 `app.globalData.needRefreshHistory`，历史页再次显示时刷新。当前录入和删除比赛均未清除 `rankings`，因此排行榜可能在缓存有效期内显示旧数据。定向清除排行榜缓存时，需要指定对应的 `month` 或 `total` 子键。

[singleFlight.js](miniprogram/utils/singleFlight.js) 合并尚未完成的同类请求，当前用于比赛页球员加载和历史筛选选项加载。[playerData.js](miniprogram/utils/playerData.js) 优先复用已保存的拼音字段，并将当天活跃球员排在前面。

比赛页、历史页以及对应查询云函数输出如下格式的性能日志：

```text
[PERF][scope][traceId] stage durationMs=... count=...
```

通过同一 `traceId` 对照客户端调用与云端查询；`durationMs`、批次数和返回数量可帮助区分查询、数据处理及页面更新耗时。

### 数据量与索引核对

| 查询位置 | 重点核对 |
| --- | --- |
| `players` 的姓名查询 | 新增去重、头像和删除逻辑均依赖 `name`；核对该字段的索引和唯一性要求 |
| `matches` 的时间查询 | 核对 `createTime` 范围查询和倒序排序的索引支持 |
| `matches` 的球员筛选 | 核对 `teamA.name`、`teamB.name` 条件与时间排序组合的查询表现 |
| 过期备份查询 | 核对 `backup_records.backupTimestamp` 的范围查询 |

`getFilterOptions` 会分批读取全部比赛的日期与队伍字段，总榜也会读取全部比赛再在内存中统计。按天历史查询先聚合日期，再分批读取日期范围内的完整比赛；一页三个日期并不限制比赛条数。

`getAllPlayers` 目前只请求最多 1000 名球员，没有继续翻页；当天比赛查询未显式分页，受服务端单次查询限制，数据多时可能影响活跃标识。备份虽然每批读取 100 条，仍会在内存中累计两个集合后生成文件。数据增长时需关注这些路径的响应时间、内存和云函数超时。

## 数据维护

### 备份

`backupDatabase` 将 `matches`、`players` 分别写入云存储 `database-backup/`，文件名为 `backup_<集合名>_<日期>_<时间>.json`。文件内容是 JSONL，即每行一个 JSON 对象；顶层日期字段转换为 `{ "$date": "..." }`。

成功返回的 `uploadedFiles` 包含文件 ID 和条数。函数同时尝试写入 `backup_records`，并根据 `backupTimestamp` 清理超过 14 天的备份文件及记录。元数据保存失败不会使主备份失败，但没有元数据的文件无法由这段清理逻辑追踪；清理查询也没有分页，不能保证单次清完所有过期记录。

需要定时备份时，由维护者在目标环境单独配置触发器。仓库没有一键恢复函数；恢复前先在独立环境核对集合、文档 ID、日期类型和记录数。备份只导出两个业务集合，不包含头像文件、权限规则、索引或云函数配置。

### 拼音维护

`updatePlayerPinyin` 默认 `dryRun: true`，只查询并输出预览。检查日志、`playersList` 和 `errors` 后，确需写入时再显式传入 `dryRun: false`。

该函数查询缺少 `firstLetters` 字段的球员，同时分批扫描比赛，为队伍成员补充缺失的拼音。球员查询没有分页，也不会选中仅缺少 `fullPinyin`、但已有 `firstLetters` 的文档。新比赛本身只保存球员 `_id` 和 `name`，该工具会额外写回拼音字段，使用前需确认维护范围。

## 当前限制与常见问题

- **删除后的累计场次**：`deleteMatch` 只回退 `wins`、`losses`，没有回退 `total_matches`。核对现存比赛场次应以 `matches` 为依据，不能假设该累计字段始终准确。
- **写入的一致性**：录入和删除都涉及比赛与球员的多次独立写操作，没有事务或幂等控制。中途失败、重复提交或并发删除可能导致计数与比赛不一致；遇到失败先核对记录及日志，再决定是否重试。
- **比分校验**：页面检查是否选齐四人和填写比分，但云函数没有完整校验比分范围、平分或队员唯一性。当前相同比分会被判断为 B 队获胜，录入时应使用有效且不相等的比分。
- **球员新增失败**：先检查云环境是否一致、`players` 是否存在，以及客户端查询和新增权限；通过页面密码校验不代表数据库权限已满足。
- **排行榜没有球员或更新延迟**：先核对上榜场次门槛、榜单范围及 5 分钟缓存，再检查比赛记录。
- **头像不显示**：检查 `avatars/` 文件访问权限、`players.avatar` 的 fileID 和个人页临时链接转换日志。恢复默认头像仅清空数据库地址，不删除旧文件。
- **历史日期缺失或分组异常**：检查 `createTime` 类型、筛选条件和时区。历史页虽实现了下拉刷新处理函数，当前页面配置未启用下拉刷新，不应将它作为默认可用的排查入口。

## 开发与验证约定

仅修改与需求直接相关的内容，保持现有风格。涉及数据库的变更需检查查询范围、索引、分页、循环查询及内存占用；录入和删除逻辑还需检查空值、异常信息与并发一致性。

现有自动化用例使用 Node.js 内置 `node:test`，分布在：

- `miniprogram/utils/__tests__/`：缓存、拼音数据处理、请求合并和性能日志。
- `miniprogram/pages/history/__tests__/history.lifecycle.test.js`：历史页首次刷新调用。
- `cloudfunctions/getAllPlayers/queries.test.js`：独立查询并行发起。

当前项目约定：未经明确要求，不编译、不运行自动化测试、不执行联网依赖安装或构建，不主动执行 Maven/Gradle 命令，也不升级依赖。部分云函数的 `npm test` 仍是占位脚本，不能视为项目统一测试入口。

文档调整使用路径、字段、参数和差异的静态核对。获准进行功能验证时，在测试云环境检查新增球员、四人双打录入、历史筛选与分页、榜单门槛、个人战绩和删除回退；涉及维护工具时另外检查预览结果及备份文件。
