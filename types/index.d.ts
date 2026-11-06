export type Server = { key: string; name: string; status: string; tools: number }
export type ThemeName = 'default' | 'naadi'

declare module 'claude-code' {
  interface PluginState {
    'mcp-lights': {
      servers: Server[]
      active: Record<string, number>
      isHidden: boolean
      theme: ThemeName
    }
  }
}
