import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { Mood, Skin } from '../types'
import { SVG_BODY, SVG_PX, TERM, TERM_CELLS } from './frames'
import { SVG_BODY_DEEPSEEK } from './frames_deepseek'

const PANE = 'niang-pet'
const TITLE = 'Claude 娘'
// /niang 声明在 skills/niang：桌面客户端读命令清单的临时进程不跑钩子，只认得出 skill 自带的短名别名。
// command.run 不调 next 直接回话，skill 正文只在钩子没运行时才会发给模型。
const COMMAND = 'niang-pet:niang'
// 做完之后保持「做完」表情多久再回到空闲
const REST_MS = 8000

const mood = atom({ plugin: 'niang-pet', key: 'mood' } as const, 'idle')
const tool = atom({ plugin: 'niang-pet', key: 'tool' } as const, '')
// 皮肤：auto 按当前模型名自动选；/niang deepseek、/niang claude 手动指定，手动优先
const skin = atom({ plugin: 'niang-pet', key: 'skin' } as const, 'auto')

type Look = 'claude' | 'deepseek'
const BODY: Record<Look, Record<Mood, string>> = { claude: SVG_BODY, deepseek: SVG_BODY_DEEPSEEK }
const NAME: Record<Look, string> = { claude: 'Claude 娘', deepseek: 'DeepSeek 娘' }
const SKINS: readonly Skin[] = ['auto', 'claude', 'deepseek']

// 画不出图的编辑器（如 Trae）只显示替代文字，用颜文字顶上
const FACE: Record<Mood, string> = {
  idle: '(・ω・)',
  working: '(｀・ω・´)φ',
  done: '(≧▽≦)ノ',
}

const say = (state: Mood, running: string): string => {
  if (state === 'working') {
    return running === '' ? '在想……' : `在干活：${running}`
  }

  return state === 'done' ? '做完啦' : '等你开口'
}

// 像素画：每种颜色一条 path，不内嵌位图（VSCode 里内嵌 PNG 不显示）
const svg = (look: Look, state: Mood): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_PX * 2}" height="${SVG_PX * 2}" viewBox="0 0 ${SVG_PX} ${SVG_PX}" shape-rendering="crispEdges">` +
  `${BODY[look][state]}</svg>`

// 第三方后端（如 CC Switch 接 DeepSeek）在 /model 里会显示它的模型名；读不到就当 Claude
const look = async ($: { session: { model: () => Promise<string> } }, chosen: Skin): Promise<Look> => {
  if (chosen !== 'auto') {
    return chosen
  }

  try {
    return /deepseek/i.test(await $.session.model()) ? 'deepseek' : 'claude'
  } catch {
    return 'claude'
  }
}

export const register: Register = on => {
  let rest: Timer | undefined

  const open = { id: PANE, title: TITLE, columns: TERM.columns + 2, rows: TERM.rows + 2 }

  on('session.start', ($, e, next) => {
    void $.ui.open(open)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg !== '') {
      if (!SKINS.includes(arg as Skin)) {
        return { text: '只认得 /niang、/niang deepseek、/niang claude、/niang auto。' }
      }

      await update($, skin, () => arg as Skin)
    }

    const who = NAME[await look($, await read($, skin))]
    const opened = await $.ui.open(open)

    if (!opened.isPlaced) {
      return { text: `${who}还没法出来：${opened.reason}` }
    }

    return { text: arg === 'auto' ? `换回自动了，现在是${who}。` : `${who}来了。` }
  }).catch(($, e, next) => (next.called ? next(e) : { text: 'Claude 娘这次没出来，再输一次 /niang 试试。' }))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      rest?.cancel()
      await update($, tool, () => '')
      await update($, mood, () => 'working')
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await update($, tool, () => String(e.tool))

    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      rest?.cancel()
      await update($, tool, () => '')

      if (e.reason === 'answer') {
        await update($, mood, () => 'done')
        rest = $.clock.after(REST_MS, () => {
          void update($, mood, () => 'idle')
        })
      } else {
        await update($, mood, () => 'idle')
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const state = await read($, mood)
    const line = say(state, await read($, tool))

    if (e.surface === 'terminal') {
      const { Box, Raster, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column" alignItems="center">
          <Raster key="pet" columns={TERM.columns} rows={TERM.rows} cells={TERM_CELLS[state]} />
          <Text>{line}</Text>
        </Box>
      )
    }

    // 换肤只换桌面、VSCode、手机端的图，终端帧不变
    const which = await look($, await read($, skin))
    const { Box, Svg, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" alignItems="center">
        <Svg source={svg(which, state)} alt={`${NAME[which]} ${FACE[state]}`} width={192} />
        <Text>{which === 'deepseek' ? `${line} · DeepSeek` : line}</Text>
      </Box>
    )
  })
}
