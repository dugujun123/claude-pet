export type Mood = 'idle' | 'working' | 'done'
export type Skin = 'auto' | 'claude' | 'deepseek'

declare module 'claude-code' {
  interface PluginState {
    'niang-pet': { mood: Mood; tool: string; skin: Skin }
  }
}
