// The build manifest the surface() plugin generates (server entry and tests).
declare module 'virtual:state-surface/manifest' {
  const manifest: import('state-surface/server').ServerManifest;
  export default manifest;
}
// Handler options of surface.server.ts (empty without it), shared by dev and production.
declare module 'virtual:state-surface/handler' {
  const handler: import('state-surface/server').HandlerConfig;
  export default handler;
}
