import { adminApi } from '../../../src/lib/api';
import { Playground } from '../../../src/views/Playground';

export const dynamic = 'force-dynamic';

export default function PlaygroundPage() {
  return <Playground api={{ search: adminApi.playgroundSearch }} />;
}
