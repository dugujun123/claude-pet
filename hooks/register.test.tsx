import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'niang-pet',
  component: 'Pane',
  requestId: 'niang-pet',
  props: {
    title: 'Claude 娘',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const RUN = {
  command: 'niang-pet:niang',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

test('/niang 由钩子直接回话，不走 skill 正文', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const { text } = await $.command.run(RUN)
  expect(text).toBe('Claude 娘来了。')
})

test('开面板出错时也由钩子回话', async ($, on) => {
  on('ui.open', () => {
    throw new Error('boom')
  })

  const { text } = await $.command.run(RUN)
  expect(text).toBe('Claude 娘这次没出来，再输一次 /niang 试试。')
})

test('三个状态在四个端都画得出来', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: 'ok' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('等你开口')
    await ui.unmount()
  }

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('在干活：Bash')
    await ui.unmount()
  }

  await $.turn.complete({ answer: 'ok', durationMs: 0, isAborted: false, turnId: 't1', reason: 'answer' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('做完啦')
    await ui.unmount()
  }
})
