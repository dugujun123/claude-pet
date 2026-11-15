---
name: niang
description: 把 Claude 娘叫出来
disable-model-invocation: true
---

用户输入了 /niang，想打开 Claude 娘宠物面板。面板由 niang-pet 插件的钩子模块绘制，钩子运行时会直接接住这条命令；走到这里说明钩子没有运行，常见原因是设置里开了 disableAllHooks，或者插件没有启用。用一句话把这个原因告诉用户，不要做别的事。
