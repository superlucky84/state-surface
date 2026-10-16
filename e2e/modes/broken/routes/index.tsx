import Chart from './_components/Chart';
import Gauge from './_components/Gauge';

export default async function Page() {
  return (
    <html>
      <head />
      <body>
        <Chart value={1} client:load />
        <Gauge client:idle />
      </body>
    </html>
  );
}
