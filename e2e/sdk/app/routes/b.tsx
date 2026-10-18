import type { SurfaceContext } from 'state-surface/server';
import Layout from '../layouts/Layout';

export default function PageB(ctx: SurfaceContext) {
  return <Layout title="Page B" ctx={ctx} />;
}
