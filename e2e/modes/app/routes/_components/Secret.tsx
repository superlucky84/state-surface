import { defineServerComponent } from 'state-surface/server';
import { SECRET } from '../../server/secret.server';
import { FLAG } from '../../server/flags';

export default defineServerComponent({
  async load({ id }: { id: string }) {
    return { id, size: SECRET.length + FLAG.length };
  },
  render: ({ id, size }) => (
    <p class="secret">
      secret {id}: {size}
    </p>
  ),
});
