declare module 'virtual:state-surface/islands' {
  /** componentId → client component (eager until per-island chunks). */
  const components: Record<string, import('lithent').TagFunction | undefined>;
  export default components;
}
