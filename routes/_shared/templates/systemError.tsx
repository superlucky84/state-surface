import { defineTemplate } from '../../../shared/templateRegistry.js';

type ErrorProps = { message?: string };

const ErrorPanel = ({ message }: ErrorProps) => (
  <div class="error-panel">
    <strong>Error: </strong>
    {message ?? 'Unknown'}
  </div>
);

export default defineTemplate('system:error', ErrorPanel);
