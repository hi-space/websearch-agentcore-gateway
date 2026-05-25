'use client';

import { adminApi } from '../../../src/lib/api';
import { Playground } from '../../../src/views/Playground';

export default function PlaygroundPage() {
  return <Playground api={{ search: adminApi.playgroundSearch }} />;
}
