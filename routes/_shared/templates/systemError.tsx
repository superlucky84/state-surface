import { defineTemplate } from '../../../engine/shared/templateRegistry.js';

type ErrorProps = { message?: string };

const ErrorPanel = ({ message }: ErrorProps) => (
  <div class="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
    <strong class="font-semibold">Error: </strong>
    {message ?? 'Unknown'}
  </div>
);

export default defineTemplate('system:error', ErrorPanel);
