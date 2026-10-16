import { token } from '../../lib/secret';

export default function Gauge() {
  return <p>{token.length}</p>;
}
