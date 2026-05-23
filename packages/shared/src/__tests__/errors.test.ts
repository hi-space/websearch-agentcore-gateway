import { describe, it, expect } from 'vitest';
import { SearchError, ErrorCode } from '../errors.js';

describe('SearchError', () => {
  it('captures code, message, retryAfterSec and provider in JSON', () => {
    const err = new SearchError(ErrorCode.RATE_LIMITED, 'over quota', {
      retryAfterSec: 60,
      provider: 'arxiv'
    });
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe('over quota');
    expect(err.retryAfterSec).toBe(60);
    expect(err.provider).toBe('arxiv');
    expect(err.toJSON()).toEqual({
      code: 'RATE_LIMITED',
      message: 'over quota',
      retryAfterSec: 60,
      provider: 'arxiv'
    });
  });

  it('omits undefined fields from toJSON', () => {
    const err = new SearchError(ErrorCode.INTERNAL, 'boom');
    expect(err.toJSON()).toEqual({ code: 'INTERNAL', message: 'boom' });
  });
});
