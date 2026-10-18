import type { SurfaceContext } from 'state-surface/server';
import Layout from '../layouts/Layout';

export default function PageA(ctx: SurfaceContext) {
  return <Layout title="Page A" ctx={ctx} />;
}
