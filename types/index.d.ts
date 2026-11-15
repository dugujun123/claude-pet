export type Mood = 'idle' | 'working' | 'done'

declare module 'claude-code' {
  interface PluginState {
    'niang-pet': { mood: Mood; tool: string }
  }
}
