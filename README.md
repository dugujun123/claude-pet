# Claude 娘

一个待在 Claude Code 侧边的 Q 版小宠物。你发消息，她低头翻书干活；回答完，她举着书笑；没事的时候抱着书等你开口。

粉丝自制，不是 Anthropic 官方出品。

## 安装

在终端的 Claude Code 会话里输入：

```
/plugin install niang-pet --marketplace dugujun123/claude-pet
```

或者在命令行里：

```
claude plugin install niang-pet --marketplace dugujun123/claude-pet
```

Claude 桌面客户端里 `/plugin` 用不了：点输入框旁边的 +，选 Plugins，Add marketplace 填 `dugujun123/claude-pet`，再 Add plugin。

装的过程中会问一次 `Add marketplace?`，回 `y`，然后按回车选用户级安装。

## 怎么用

输入 `/niang` 把她叫出来。终端窗口够宽（144 列以上）时她会自己出现在侧边。

| 状态 | 什么时候 | 她在做什么 |
| --- | --- | --- |
| 空闲 | 没有任务 | 抱着书，「等你开口」 |
| 干活 | 你发了消息，Claude 在跑 | 翻书，下面一行字显示正在用的工具 |
| 做完 | 回答结束 | 举书笑，8 秒后回到空闲 |

回合被打断或者出错时，她直接回到空闲。子 Agent 干活不会让她切表情，她只跟主对话。

### DeepSeek 娘

客户端底层接的是 DeepSeek 时，她会变成 DeepSeek 娘：头发、发饰和衣服照旧，眼睛变蓝，多出一对鲸鳍耳和一条鲸鱼尾巴，图下面那行字后面会加上「· DeepSeek」。

- `/niang deepseek`：手动切成 DeepSeek 娘
- `/niang claude`：手动切回 Claude 娘
- `/niang auto`：自动模式（默认），`/model` 显示的模型名里带 deepseek 就自动切

手动指定的优先于自动识别。如果你用的转发工具把 DeepSeek 的模型名改成了 claude 开头的名字，自动识别认不出来，用 `/niang deepseek` 手动切就行。换皮肤只换桌面端的全身像，终端的半身像不变。

## 各端的情况

- Claude 桌面客户端：显示全身像素画，已实测。
- 终端：用半块字符拼出半身像，36 列宽、16 行高，不挑终端。

## 换成自己的形象

准备三张 512×512 透明底 PNG，命名 `idle.png`、`working.png`、`done.png`，放进同一个目录，然后重新生成素材：

```
python3 tools/build_frames.py <图片目录> hooks/frames.ts
```

DeepSeek 娘的三张图用另一个脚本生成，它只产出桌面端的帧：

```
python3 tools/build_skin.py <图片目录> hooks/frames_deepseek.ts SVG_BODY_DEEPSEEK
```

需要 Python 3 和 Pillow。

## 协议

代码 MIT。角色形象是作者原创，欢迎拿去玩，商用请先打招呼。
