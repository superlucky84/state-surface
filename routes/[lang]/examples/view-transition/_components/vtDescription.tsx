type DescriptionProps = {
  title: string;
  description: string;
};

const VTDescription = ({ title, description }: DescriptionProps) => (
  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
    <h2 class="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
    <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
  </section>
);

export default VTDescription;
