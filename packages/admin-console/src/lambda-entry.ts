import type { APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import next from 'next';

const app = next({
  dev: false,
  dir: process.env.NEXT_DIR ?? import.meta.dirname ?? process.cwd()
});
const handle = app.getRequestHandler();
await app.prepare();

class MockSocket extends Duplex {
  bytesWritten = 0;
  remoteAddress = '127.0.0.1';
  remotePort = 0;
  encrypted = true;
  writable = true;
  readable = true;
  capture: Buffer[] = [];
  _read() {}
  _write(chunk: any, enc: BufferEncoding, cb: (err?: Error | null) => void) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc || 'utf8');
    this.capture.push(buf);
    this.bytesWritten += buf.length;
    cb();
  }
  _writev(chunks: Array<{ chunk: any; encoding: BufferEncoding }>, cb: (err?: Error | null) => void) {
    for (const { chunk, encoding } of chunks) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8');
      this.capture.push(buf);
      this.bytesWritten += buf.length;
    }
    cb();
  }
  destroy() { return this; }
  ref() { return this; }
  unref() { return this; }
  setKeepAlive() { return this; }
  setNoDelay() { return this; }
  setTimeout() { return this; }
  cork() {}
  uncork() {}
  address() { return { address: '127.0.0.1', family: 'IPv4', port: 0 }; }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const { rawPath, rawQueryString, headers, body, isBase64Encoded, requestContext } = event;
  const reqBody = body ? (isBase64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body)) : null;

  const socket = new MockSocket() as any;
  const req = new IncomingMessage(socket);
  req.url = `${rawPath}${rawQueryString ? `?${rawQueryString}` : ''}`;
  req.method = requestContext.http.method;
  req.headers = headers as Record<string, string>;
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  if (reqBody) {
    req.push(reqBody);
    req.push(null);
  } else {
    req.push(null);
  }

  const res = new ServerResponse(req);
  (res as any).assignSocket(socket);
  let resolved = false;

  return new Promise<APIGatewayProxyStructuredResultV2>((resolve) => {
    const finalize = () => {
      if (resolved) return;
      resolved = true;
      const raw = Buffer.concat(socket.capture);
      const headerEnd = raw.indexOf('\r\n\r\n');
      const headBuf = headerEnd >= 0 ? raw.subarray(0, headerEnd) : raw;
      const bodyRaw = headerEnd >= 0 ? raw.subarray(headerEnd + 4) : Buffer.alloc(0);
      // Parse status line + headers from wire bytes — this is canonical.
      const headLines = headBuf.toString('utf8').split('\r\n');
      const statusLine = headLines[0] ?? '';
      const m = /^HTTP\/\d\.\d\s+(\d{3})/.exec(statusLine);
      const statusCode = m && m[1] ? parseInt(m[1], 10) : (res.statusCode || 200);
      const responseHeaders: Record<string, string> = {};
      let isChunked = false;
      for (let i = 1; i < headLines.length; i++) {
        const line = headLines[i];
        if (!line) continue;
        const idx = line.indexOf(':');
        if (idx <= 0) continue;
        const k = line.slice(0, idx).trim().toLowerCase();
        const v = line.slice(idx + 1).trim();
        if (k === 'transfer-encoding' && v.toLowerCase().includes('chunked')) isChunked = true;
        if (k === 'transfer-encoding') continue;
        responseHeaders[k] = responseHeaders[k] ? `${responseHeaders[k]}, ${v}` : v;
      }
      // Decode chunked transfer-encoding into raw body bytes.
      let bodyBuf = bodyRaw;
      if (isChunked) {
        const out: Buffer[] = [];
        let offset = 0;
        while (offset < bodyRaw.length) {
          const lineEnd = bodyRaw.indexOf('\r\n', offset);
          if (lineEnd < 0) break;
          const sizeHex = (bodyRaw.subarray(offset, lineEnd).toString('utf8').split(';')[0] ?? '').trim();
          const size = parseInt(sizeHex, 16);
          if (!Number.isFinite(size) || size < 0) break;
          if (size === 0) break;
          const chunkStart = lineEnd + 2;
          out.push(bodyRaw.subarray(chunkStart, chunkStart + size));
          offset = chunkStart + size + 2;
        }
        bodyBuf = Buffer.concat(out);
        responseHeaders['content-length'] = String(bodyBuf.length);
      }
      resolve({
        statusCode,
        headers: responseHeaders,
        body: bodyBuf.toString('base64'),
        isBase64Encoded: true
      });
    };

    res.on('finish', finalize);
    res.on('close', finalize);

    Promise.resolve()
      .then(() => (handle as any)(req, res))
      .catch((err) => {
        console.error('next handler threw:', err);
        if (!resolved) {
          resolved = true;
          resolve({
            statusCode: 500,
            headers: { 'content-type': 'text/plain' },
            body: Buffer.from('Internal Server Error').toString('base64'),
            isBase64Encoded: true
          });
        }
      });
  });
};
