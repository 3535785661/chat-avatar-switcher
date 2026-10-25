# 聊天档案独立头像（测试版）

为当前 SillyTavern 聊天档案设置独立角色头像；设置保存在当前聊天的 `chatMetadata` 中，不写入角色卡数据。

## 文件
- `manifest.json`
- `index.js`
- `style.css`

## 安装
1. 在你自己的 SillyTavern 服务器上，进入 `public/scripts/extensions/third-party/`（为所有用户安装）或 `data/<你的用户目录>/extensions/`（仅当前用户）。
2. 创建文件夹 `chat-avatar-switcher`。
3. 将这三个文件放入该文件夹。
4. 重启 SillyTavern，刷新网页，在扩展管理中启用“聊天档案独立头像”。

也可以把文件放进 Git 仓库，然后从 Extensions → Install Extension 安装仓库地址。

## 使用
1. 打开一个单角色聊天档案。
2. 点击右下角“头像”。
3. 选择图片；设置会保存到当前聊天元数据。
4. 切换到另一个聊天档案后，为它单独设置头像。
5. 点击“恢复角色卡默认头像”可移除当前聊天的自定义头像。

## 重要说明
这是针对较新官方 SillyTavern 的实验性初版。由于不同版本和主题的头像 DOM 结构可能不同，消息头像与顶部头像选择器可能需要按你的实际界面微调。请先在测试档案上试用并备份聊天数据。头像图片以压缩后的 data URL 写入聊天元数据，会增加聊天文件体积。群聊头像未作为首版目标。
