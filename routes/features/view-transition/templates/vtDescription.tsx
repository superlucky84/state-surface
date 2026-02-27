import { defineTemplate } from '../../../../shared/templateRegistry.js';

type DescriptionProps = {
  title: string;
  description: string;
};

const VTDescription = ({ title, description }: DescriptionProps) => (
  <section class="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
    <p class="text-sm text-slate-600">{description}</p>
  </section>
);

export default defineTemplate('vt:description', VTDescription);
