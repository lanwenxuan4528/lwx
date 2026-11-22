# 岗位夹

把招聘截图整理成个人岗位仓库。可以上传单张截图，检查并修改识别结果，添加多个分类，再在仓库里筛选和比较。没有 AI 配置时，也可以上传截图并手动填写，或者直接录入纯文字岗位。

在 `lwx` 仓库中，先进入 `job-pocket/` 目录再运行下方本地命令。部署后台时，以 `job-pocket` 作为 Render 的 **Root Directory**。下文的 Git 和 Pages 发布示例适用于独立仓库。如果希望与 Unlive 共用站点，应先检查现有 Pages 发布配置，再将本项目的 `docs/` 内容发布到站点的 `job-pocket/` 子路径，保留 Unlive 的现有发布入口。

## 1. 在电脑上启动

项目使用原生 HTML、CSS、JavaScript 模块和 IndexedDB。后台使用 Node.js 24 自带的 HTTP、环境变量和 Fetch 接口。前后端均无需安装 npm 依赖。

1. 从 [Node.js 官网](https://nodejs.org/) 安装 Node.js 24。在终端运行 `node --version`，确认出现 `v24`。
2. 在终端进入本项目目录，也就是能看到本 README 和 `server.mjs` 的目录。
3. 运行以下命令，后台会同时提供静态网页和 API。没有密钥时，首页仍然可以使用手动录入。

```console
node server.mjs
```

4. 用浏览器打开 [本地页面](http://127.0.0.1:8787/)。选择一张截图，再点「手动填写」，即可完成一次本地保存。按 Ctrl+C 可停止服务器。

只想运行前端时，可以安装 Python 3，然后在项目根目录执行 `python -m http.server 8080 --bind 127.0.0.1 --directory docs`。打开 [静态前端](http://127.0.0.1:8080/)。同时运行独立后台时，把 `docs/config.mjs` 的 `API_BASE` 设为 `http://127.0.0.1:8787`，并把 `http://127.0.0.1:8080` 加到后台的 `ALLOWED_ORIGINS`。从不同端口打开的浏览器数据是独立的。请通过 HTTP 打开页面，直接双击 HTML 文件可能无法加载模块。

## 2. 启用 AI 识图

后台接入 OpenAI Responses API，默认模型为 `gpt-4.1-mini`，向模型发送图片并要求返回八个结构化字段。后台不保存截图或识别结果，也不输出密钥或截图到应用日志。识别请求设置了 `store: false`，服务商侧的数据处理仍按其政策执行。点击「开始识别」才会发送截图。上传预览和手动填写在浏览器中完成。[视觉输入文档](https://developers.openai.com/api/docs/guides/images-vision) · [结构化输出文档](https://developers.openai.com/api/docs/guides/structured-outputs) · [API 数据控制](https://developers.openai.com/api/docs/guides/your-data)

1. 在有 API 使用权限和计费额度的 OpenAI 项目中创建 API 密钥。ChatGPT 订阅与 API 计费分开。先确认服务在你所处地区可用。[API 价格](https://openai.com/api/pricing/) · [API 支持地区](https://developers.openai.com/api/docs/supported-countries)
2. 把项目根目录里的 `.env.example` 复制成 `.env`。Windows PowerShell 可运行 `Copy-Item .env.example .env`，macOS 或 Linux 可运行 `cp .env.example .env`。
3. 用本地文本编辑器打开 `.env`，将实际密钥填在 `OPENAI_API_KEY=` 后面。密钥只由后台读取。请勿提交 `.env`、公开粘贴密钥或写入前端配置。
4. 停止旧进程，再运行以下命令。刷新网页，确认出现「AI 服务已配置」。这个提示表示后台检测到了密钥，密钥有效性和模型额度要在实际调用时验证。

```console
node --env-file=.env server.mjs
```

5. 选一张可公开使用的招聘截图，点「开始识别」，检查八个字段是否均可编辑，再决定是否保存。此操作可能产生 API 费用。若遇到失败，界面会提示重试或手动填写。

| 后台变量 | 含义 |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI 项目 API 密钥。留空时仅提供手动流程。 |
| `OPENAI_MODEL` | 默认 `gpt-4.1-mini`。替换时选择同时支持视觉输入和结构化输出的模型。 |
| `ALLOWED_ORIGINS` | 允许调用的前端来源，用英文逗号分隔。包括协议、域名及非默认端口，省略仓库路径和末尾斜杠。同源运行时可留空。 |
| `AI_ACCESS_CODE` | 可选共享识别访问码，用于限制谁可以发起 AI 请求。通过私下渠道分发，访客在网页中临时输入。该码与 API 密钥独立，发布到公网时应设置足够长的随机值。 |
| `AI_REQUESTS_PER_MINUTE` | 每个后台进程每分钟最多受理的模型请求数，默认 10。另有每进程 2 个同时处理的识别请求上限。 |
| `HOST` / `PORT` | 本机默认 `127.0.0.1:8787`。容器内由 Dockerfile 设置 `HOST=0.0.0.0`，端口可由托管平台注入。 |

后台支持 PNG、JPEG 和 WebP，限制 8 MB，并检查文件声明类型和文件头。CORS 限制浏览器中的跨站调用，访问码用于验证调用者。多实例环境的限流按进程分别计算，重启会重置计数。公开运营时可在网关启用登录鉴权、集中限流并设置账单告警。识别调用和后台托管都可能收费，请在部署前核对价格与套餐。[Render 价格](https://render.com/pricing)

## 3. 上传代码到 GitHub

在 GitHub 创建空仓库（下面以 `job-pocket` 为例）。在项目根目录执行这些命令。将 `YOUR_USERNAME` 换成你的 GitHub 用户名；如果终端要求配置 Git 用户名或邮箱，按提示完成后重试提交。首次推送可能需要在浏览器登录 GitHub。

```console
git init -b main
git add .
git status --short
git commit -m "Initial Job Pocket app"
git remote add origin https://github.com/YOUR_USERNAME/job-pocket.git
git push -u origin main
```

提交前检查列表，实际 `.env`、招聘截图和导出的用户备份均应留在仓库之外。可先使用 [GitHub 的本地代码上传说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/adding-locally-hosted-code-to-github)。

## 4. 部署网页与后台

**前端 GitHub Pages**

1. 打开仓库的 **Settings → Pages**，选择 **Deploy from a branch**，选择 `main` 和 `/docs` 后保存。
2. 等待页面构建完成，再打开 Pages 显示的链接。仓库名为 `job-pocket` 时，地址通常是 `https://YOUR_USERNAME.github.io/job-pocket/`。网页使用相对资源路径和哈希导航，支持仓库子路径。
3. 只部署前端时，`API_BASE` 保持空字符串，页面显示「AI 服务尚未配置」。Pages 网站的公开范围和仓库权限应单独核对。[GitHub Pages 发布配置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

**后台示例 Render**

1. 在 Render 新建 **Web Service**，连接 GitHub 仓库，选择 **Docker**，构建目录保持仓库根目录，使用项目的 `Dockerfile`。
2. 在服务 **Environment** 添加 `OPENAI_API_KEY`、`ALLOWED_ORIGINS` 和 `AI_ACCESS_CODE`。如前端地址为 `https://YOUR_USERNAME.github.io/job-pocket/`，来源填 `https://YOUR_USERNAME.github.io`。可另外降低 `AI_REQUESTS_PER_MINUTE`。使用托管平台分配的端口即可。
3. 服务上线后，访问后台 HTTPS 地址下的 `/api/status`，确认 JSON 中的 `configured` 为 `true`。如需设置健康检查路径，可用 `/api/status`。
4. 修改 `docs/config.mjs`，将 `API_BASE` 设为后台根地址，如 `https://your-service.onrender.com`。提交并推送前端更新。只在这里填写后台地址，访问码由访客输入，API 密钥仅放在后台环境变量中。
5. 在 Pages 重新构建后，用手机打开 Pages 链接，先检查页面和手动流程。完成计费配置后，可用一张经过核对的截图实际验证识别质量。[Render Web Service](https://render.com/docs/web-services) · [托管环境变量](https://render.com/docs/configure-environment-variables)

想在同一 Wi-Fi 上用真机测试时，可在本机启动前设置 `HOST=0.0.0.0`，用手机打开 `http://电脑局域网IP:8787/`。以 Windows PowerShell 为例，先运行 `$env:HOST='0.0.0.0'`，再运行 `node server.mjs`。手机和电脑需要能通过网络互访。局域网 HTTP 适合手动流程验收，使用识别访问码的公网环境应走 HTTPS。

## 5. 日常使用与数据限制

- 一次选择一张截图。识别完先核对，字段可补写、改成「待确认」或留空。空岗位名和公司名会用回退名称。确认后才会把岗位和截图写入 IndexedDB。
- 在仓库分别选择分类和关注条目。薪资排序只处理可明确识别的币种、周期和金额，例如 `12k–16k 人民币/月`、`300 元/天`、`USD 45k–60k/year`。组内按最低值降序，等值维持最近保存优先。面议、`10k–15k/月` 等币种不明确的文本，以及带有复杂条件或多种口径的文本，进入「无法排序」，原文照常显示。
- 详情页可以查看并放大原始截图，也可以编辑和删除岗位。向右滑动列表行会露出「编辑」。删除岗位会一起移除截图。删除分类仅移除标签及其关联，岗位会保留，两个删除操作都会要求确认。
- 本地数据跟随浏览器及站点来源。清理站点数据、换浏览器、迁移域名或换设备时，先在设置中导出备份。隐私模式里的存储可能随会话结束而清除。
- JSON 备份含原始岗位信息和以 Base64 存储的截图，文件未加密，请存放在可信位置。合并复用同名分类，保留已有相同 ID 的岗位。覆盖将以备份替换当前数据，需额外确认。单次导入上限为 100 MB，Base64 会增大文件体积。大仓库接近上限时，可先保留完整导出，再根据需要清理本地记录，重新导出较小备份。浏览器可用存储量视设备和设置而定。

## 6. 实测与待验收

| 项目 | 本地结果 |
| --- | --- |
| 预览与手动录入 | 在浏览器选择一张测试 PNG，确认能预览，未配置 AI 时可手动保存。 |
| 持久化与详情 | 保存后刷新能查到岗位，详情保留所有字段，可点击放大截图。 |
| 分类与关注条目 | 验证新建、重命名、分类筛选配合地点展示，以及确认删除分类后保留岗位。 |
| 薪资 | 浏览器验证人民币月薪、人民币日薪和美元月薪分组，月薪范围按最低值降序，面议进入「无法排序」。 |
| 编辑与删除 | 验证详情进入编辑、保存修改、窄屏右拖露出编辑入口，以及确认删除后回到空仓库。 |
| 备份 | 从浏览器下载备份，删除后覆盖恢复岗位、分类和截图，合并同一备份未产生重复岗位。 |
| 布局与路径 | 浏览器验证 320 px、390 px 和 1280 px 布局，以及在本地用 `/job-pocket/` 子路径载入。右滑入口使用浏览器鼠标拖动验证，手机真机触控仍待验收。 |
| 实际模型请求与公网可达性 | 当前环境没有配置有效的 API 密钥，且尚未部署到公网。已完成接入代码和本地无密钥流程，实际截图识别和公网部署需配置后验收。 |

可用 `node --test` 运行薪资规则和备份校验测试。前端文件位于 `docs/`，后台入口位于 `server.mjs`。
