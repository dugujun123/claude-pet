import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import type { Mood } from '../types'
import { SVG_BODY, SVG_PX, TERM, TERM_CELLS } from './frames'

const PANE = 'niang-pet'
const TITLE = 'Claude 娘'
// /niang 声明在 skills/niang：桌面客户端读命令清单的临时进程不跑钩子，只认得出 skill 自带的短名别名。
// command.run 不调 next 直接回话，skill 正文只在钩子没运行时才会发给模型。
const COMMAND = 'niang-pet:niang'
// 做完之后保持「做完」表情多久再回到空闲
const REST_MS = 8000

const mood = atom({ plugin: 'niang-pet', key: 'mood' } as const, 'idle')
const tool = atom({ plugin: 'niang-pet', key: 'tool' } as const, '')

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
const svg = (state: Mood): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_PX * 2}" height="${SVG_PX * 2}" viewBox="0 0 ${SVG_PX} ${SVG_PX}" shape-rendering="crispEdges">` +
  `${SVG_BODY[state]}</svg>`

export const register: Register = on => {
  let rest: Timer | undefined

  const open = { id: PANE, title: TITLE, columns: TERM.columns + 2, rows: TERM.rows + 2 }

  on('session.start', ($, e, next) => {
    void $.ui.open(open)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const opened = await $.ui.open(open)

    return { text: opened.isPlaced ? 'Claude 娘来了。' : `Claude 娘还没法出来：${opened.reason}` }
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

    const { Box, Svg, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" alignItems="center">
        <Svg source={svg(state)} alt={`${TITLE} ${FACE[state]}`} width={192} />
        <Text>{line}</Text>
      </Box>
    )
  })
}
