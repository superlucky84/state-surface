import { format } from '../../lib/fmt';

export default function Chart({ value }: { value: number }) {
  return <p>{format(value)}</p>;
}
