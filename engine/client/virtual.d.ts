declare module 'virtual:state-surface/islands' {
  /** componentId → lazy loader of the client component chunk. */
  const components: Record<string, (() => Promise<import('lithent').TagFunction>) | undefined>;
  export default components;
}

declare module 'virtual:state-surface/plugins' {
  /** plugin id → lazy loader of the plugin chunk (a definePlugin() definition). */
  const plugins: Record<string, (() => Promise<{ name: string }>) | undefined>;
  export default plugins;
}
