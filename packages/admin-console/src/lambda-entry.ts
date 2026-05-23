import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import next from 'next';

const app = next({ dev: false, dir: process.env.NEXT_DIR ?? '.next/standalone' });
const handle = app.getRequestHandler();
await app.prepare();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const { rawPath, rawQueryString, headers, body, isBase64Encoded, requestContext } = event;
  const url = `https://localhost${rawPath}${rawQueryString ? `?${rawQueryString}` : ''}`;
  const reqBody = body ? (isBase64Encoded ? Buffer.from(body, 'base64') : body) : null;
  const reqInit: RequestInit = {
    method: requestContext.http.method,
    headers: headers as Record<string, string>,
    ...(reqBody && { body: reqBody })
  };
  const req = new Request(url, reqInit);
  const res = await (handle as any)(req);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    statusCode: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: buf.toString('base64'),
    isBase64Encoded: true
  };
};
