export const AWS_REGION = process.env.NEXT_PUBLIC_REGION || 'ap-northeast-2';
export const GATEWAY_ID = process.env.NEXT_PUBLIC_GATEWAY_ID || '';
export const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '';
export const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '';
export const COGNITO_CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';

export const TIME_RANGES = {
  '1h': { label: '1시간', minutes: 60 },
  '6h': { label: '6시간', minutes: 360 },
  '24h': { label: '24시간', minutes: 1440 },
  '7d': { label: '7일', minutes: 10080 },
} as const;

export type TimeRangeKey = keyof typeof TIME_RANGES;

// X-Ray GetTraceSummaries allows a max 24h window, so traces use a subset of
// the metric/log time ranges (no 7d).
export const TRACE_TIME_RANGES = {
  '1h': { label: '1시간', minutes: 60 },
  '6h': { label: '6시간', minutes: 360 },
  '24h': { label: '24시간', minutes: 1440 },
} as const;

export type TraceTimeRangeKey = keyof typeof TRACE_TIME_RANGES;
