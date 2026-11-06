import { expect, test } from 'claude-code/testing'

import { serverOf, THEMES } from '../hooks/register'

const PROPS = { hasSurvey: false, isWorking: true, maxRows: 3, bodyColumns: 100 }

test('serverOf splits mcp tool names', () => {
  expect(serverOf('mcp__slack__send_message')).toBe('slack')
  expect(serverOf('mcp__plugin_cloudflare_cloudflare__docs')).toBe('plugin_cloudflare_cloudflare')
  expect(serverOf('Bash')).toBe(undefined)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a server's chip is lit while its tool runs (${surface})`, async ($, on) => {
    let litWhileRunning: unknown
    on('ui.render', { component: 'AbovePrompt' }, ($$, e) => { const { Text } = $$.ui.resolve(e); return h(Text, {}, 'engine band') })

    on('tool.call', { tool: 'mcp__slack__send_message' }, async ($$, e) => {
      const ui = await $.ui.mount({ plugin: 'mcp-lights', surface, component: 'AbovePrompt', props: PROPS })
      const chip = await ui.find({ type: 'Text', text: /slack/ })
      litWhileRunning = chip?.props.backgroundColor
      await ui.unmount()
      return { result: 'sent' } as never
    })

    await $.tool.call({ tool: 'mcp__slack__send_message', text: 'hi' } as never)

    expect(litWhileRunning).toBe('success')
    const after = await $.ui.mount({ plugin: 'mcp-lights', surface, component: 'AbovePrompt', props: PROPS })
    expect(await after.find({ type: 'Text', text: /slack/ })).toBe(undefined)
  })
}

test('/mcp-theme switches the chips to a saved theme', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($$, e) => { const { Text } = $$.ui.resolve(e); return h(Text, {}, 'engine band') })

  let saved: unknown
  on('store.set', (_, e) => { saved = e.value; return { value: undefined } as never })

  let lit: unknown
  on('tool.call', { tool: 'mcp__slack__send_message' }, async () => {
    const ui = await $.ui.mount({ plugin: 'mcp-lights', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    lit = (await ui.find({ type: 'Text', text: /slack/ }))?.props.backgroundColor
    await ui.unmount()
    return { result: 'sent' } as never
  })

  const switched = await $.command.run({ command: 'mcp-theme', args: 'naadi' })
  expect(switched.text).toContain('naadi')
  expect(saved).toBe('naadi')
  await $.tool.call({ tool: 'mcp__slack__send_message', text: 'hi' } as never)

  expect(lit).toBe(THEMES.naadi.lit.backgroundColor)
})

test('/mcp-theme refuses an unknown theme and lists the choices', async $ => {
  const { text } = await $.command.run({ command: 'mcp-theme', args: 'neon' })
  expect(text).toContain('default, naadi')
})

test('a name inherited from Object is not a theme', async $ => {
  const { text } = await $.command.run({ command: 'mcp-theme', args: 'constructor' })
  expect(text).toContain("There's no theme")
})
