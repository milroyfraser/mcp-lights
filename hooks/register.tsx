import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Server } from '../types'

const servers = atom({ plugin: 'mcp-lights', key: 'servers' } as const, [])
const active = atom({ plugin: 'mcp-lights', key: 'active' } as const, {})
const isHidden = atom({ plugin: 'mcp-lights', key: 'isHidden' } as const, false)

const STATUS_TOOL = 'mcp__ccd_connectors__session_connectors_status'

// `mcp__<server>__<tool>`: the server part is everything between the prefix
// and the last `__`.
export const serverOf = (tool: string): string | undefined => {
  if (!tool.startsWith('mcp__')) return undefined
  const rest = tool.slice(5)
  const cut = rest.lastIndexOf('__')
  return cut > 0 ? rest.slice(0, cut) : undefined
}

const toKey = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, '_')

// The app's own plumbing servers; shown only while in use.
const isInternal = (key: string) =>
  key.startsWith('ccd_') || key.startsWith('Claude_') || key === 'computer-use' || key === 'terminal' || key === 'mcp-registry'

type StatusRow = { name: string; id?: string; status: string; tool_count?: number }

const refresh = async ($: EngineInterface) => {
  const counts = new Map<string, number>()
  for (const t of await $.tool.list()) {
    const key = t.mcp ? serverOf(t.name) : undefined
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  let rows: StatusRow[] = []
  try {
    const { text } = await $.tool.call({ tool: STATUS_TOOL } as never) as { text?: string }
    rows = (JSON.parse(text ?? '{}').servers ?? []) as StatusRow[]
  } catch {
    // Not in the desktop app, or the status tool is unavailable: names come from tool names.
  }

  const list: Server[] = rows.length
    ? rows.map(r => {
        const key = r.id ?? toKey(r.name)
        return { key, name: r.name.replace(/^plugin:[^:]+:/, ''), status: r.status, tools: r.tool_count ?? counts.get(key) ?? 0 }
      })
    : [...counts]
        .filter(([key]) => !isInternal(key))
        .map(([key, tools]) => ({ key, name: key, status: 'connected', tools }))

  await update($, servers, () => list)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    $.clock.after(1500, () => void refresh($).catch(() => {}))
    return started
  })

  on('tool.call', async ($, e, next) => {
    const key = serverOf(e.tool)
    if (!key) return next(e)

    await update($, active, a => ({ ...a, [key]: (a[key] ?? 0) + 1 }))
    try {
      return await next(e)
    } finally {
      await update($, active, a => {
        const n = (a[key] ?? 1) - 1
        const { [key]: _, ...rest } = a
        return n > 0 ? { ...rest, [key]: n } : rest
      })
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const list = await read($, servers)
    const lit = await read($, active)
    const extras = Object.keys(lit).filter(k => !list.some(s => s.key === k))
    if (list.length === 0 && extras.length === 0) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    const chip = (key: string, name: string, tools: number | undefined, status: string) => {
      const running = lit[key] ?? 0
      const isLit = running > 0
      // Idle: the server's tool count. Running: calls in flight / tool count.
      const detail = isLit ? ` ${running}${tools ? `/${tools}` : ''}` : tools ? ` ${tools}` : ''
      const dot = isLit ? '●' : status === 'connected' ? '○' : '✕'
      return (
        <Text key={key} color={isLit ? 'inverseText' : status === 'connected' ? undefined : 'error'} backgroundColor={isLit ? 'success' : undefined} bold={isLit} dimColor={!isLit && status === 'connected'}>
          {` ${dot} ${name}${detail} `}
        </Text>
      )
    }

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {list.map(s => chip(s.key, s.name, s.tools, s.status))}
        {extras.map(k => chip(k, k, undefined, 'connected'))}
        <Button key="refresh" plain label="↻" onPress={() => refresh($)} />
        <Button key="hide" plain label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
