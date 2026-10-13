import { expect, test } from 'claude-code/testing'

import { serverOf } from '../hooks/register'

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
