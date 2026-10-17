// The build manifest the surface() plugin generates (server entry and tests).
declare module 'virtual:state-surface/manifest' {
  const manifest: import('state-surface/server').ServerManifest;
  export default manifest;
}
