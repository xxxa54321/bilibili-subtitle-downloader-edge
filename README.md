# B站字幕下载

一款用于 Microsoft Edge 的非官方字幕导出扩展。它可以读取当前视频页面中本来可访问的 AI 或人工字幕，并导出为带视频元数据的 UTF-8 TXT 文件。

## 下载

[下载 B站字幕下载 v1.3.0](https://github.com/xxxa54321/bilibili-subtitle-downloader-edge/releases/tag/v1.3.0)

## 功能

- 支持普通视频页和“稍后再看”播放页。
- 自动识别当前 BVID 和分P。
- 列出当前可访问的 AI 字幕与人工字幕。
- 文件名包含 UP主、视频标题、BVID、发布日期和字幕语言。
- TXT 头部包含标题、UP主、BVID、链接、发布日期、分P、时长、语言、类型和字幕条数。
- 不包含广告、分析、遥测或远程代码。

## 本地安装

1. 打开 `edge://extensions`。
2. 开启“开发人员模式”。
3. 选择“加载解压缩的扩展”。
4. 选择本项目目录。
5. 打开受支持的 B站视频页，点击右下角字幕按钮。

## 权限

- `downloads`：仅在用户主动点击后保存 TXT 文件。
- `https://www.bilibili.com/*`：显示字幕面板并识别当前视频页面。
- `https://api.bilibili.com/*`：读取视频信息与字幕轨道。
- `https://aisubtitle.hdslb.com/*`：下载用户选择的字幕正文。

扩展不读取、不保存 Cookie、Token、密码或 API 密钥。B站接口是扩展运行所必需的公开平台端点，代码中不包含开发者私有 API 或测试凭据。

## 隐私

扩展没有开发者后端，不收集、不出售、不共享用户信息。字幕在浏览器本地解析，TXT 文件保存到用户设备。

问题反馈与隐私相关问题可在 [GitHub Issues](https://github.com/xxxa54321/bilibili-subtitle-downloader-edge/issues) 提交。

## 免责声明

本项目是非官方工具，与 B站、上海宽娱或其关联公司不存在官方隶属、合作或授权关系。扩展仅处理当前页面和当前登录状态下用户本来可以访问的字幕，不绕过登录、付费、地区限制或其他访问控制，也不下载视频、音频、弹幕或其他媒体文件。
