// Tokens mirror DESIGN.md (Cursor analysis): warm-cream canvas, warm-ink text,
// scarce Cursor Orange CTAs, hairline-only depth, 5 timeline pastels for
// in-product AI-action stages.

export const colors = {
  // Canvas / surfaces — warm cream, never pure white at the page level
  background: '#f7f7f4',
  canvas: '#f7f7f4',
  canvasSoft: '#fafaf7',
  surface: '#ffffff',
  surfaceCard: '#ffffff',
  surfaceSoft: '#fafaf7',
  surfaceMuted: '#efeee8',
  surfaceStrong: '#e6e5e0',
  outline: '#e6e5e0',

  // Brand voltage — Cursor Orange, used scarcely for CTAs and wordmark
  primary: '#f54e00',
  primaryStrong: '#d04200',
  primaryActive: '#d04200',
  primarySoft: '#fde7da',
  primaryDeep: '#a83600',
  onPrimary: '#ffffff',

  // Status (semantic — kept distinct from timeline pastels)
  success: '#1f8a65',
  successSoft: '#dff1e9',
  warning: '#a16207',
  warningSoft: '#fef3c7',
  error: '#cf2d56',
  errorSoft: '#fbe1e7',

  // Dark surfaces — used only when an "ink" inversion is needed (pricing-featured, etc.)
  darkSurface: '#26251e',
  darkPanel: '#1a1914',
  darkSurfaceMid: '#33322a',
  darkOnSurface: '#f7f7f4',
  darkOnSurfaceMuted: '#cfcdc4',
  darkOnSurfaceSubtle: '#a09c92',
  darkOutline: '#3a3930',

  // Text — warm near-black, body, muted ladder
  onBackground: '#26251e',
  ink: '#26251e',
  inkDeep: '#1a1914',
  charcoal: '#33322a',
  body: '#5a5852',
  bodyStrong: '#26251e',
  slate: '#5a5852',
  steel: '#807d72',
  stone: '#807d72',
  mutedSoft: '#a09c92',
  muted: '#a09c92',

  // Hairlines — the only depth this system has
  hairline: '#e6e5e0',
  hairlineSoft: '#efeee8',
  hairlineStrong: '#cfcdc4',

  // AI timeline pastels — scoped to in-product agent action stages only
  timelineThinking: '#dfa88f',
  timelineGrep: '#9fc9a2',
  timelineRead: '#9fbbe0',
  timelineEdit: '#c0a8dd',
  timelineDone: '#c08532',

  // Compatibility aliases retained from earlier palette
  linkBlue: '#f54e00',
  linkBluePressed: '#d04200',
  semanticSuccess: '#1f8a65',
  semanticWarning: '#a16207',
  semanticError: '#cf2d56',
  onDark: '#f7f7f4',
  onDarkMuted: '#cfcdc4',
  onDarkSubtle: '#a09c92',
  brandNavy: '#26251e',
  brandNavyDeep: '#1a1914',
  brandNavyMid: '#33322a',
  brandNavyHairline: '#3a3930'
} as const;

export const radius = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  full: '9999px'
} as const;

export const spacing = {
  xxs: '4px',
  xs: '8px',
  sm: '12px',
  md: '16px',
  base: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
  '3xl': '64px',
  'section-sm': '48px',
  section: '80px',
  'section-lg': '96px',
  hero: '120px',
  gutter: '24px'
} as const;

// Hairline-only depth. We keep keys for compatibility but values are very subtle.
export const shadow = {
  card: '0 0 0 1px rgba(38, 37, 30, 0.04)',
  hover: '0 1px 0 rgba(38, 37, 30, 0.06)',
  panelDark: '0 1px 0 rgba(0, 0, 0, 0.18)',
  support: '0 1px 0 rgba(245, 78, 0, 0.20)',
  modal: '0 12px 36px rgba(38, 37, 30, 0.16)',
  mockup: '0 1px 0 rgba(38, 37, 30, 0.06)'
} as const;

type FontEntry = [string, { lineHeight: string; letterSpacing?: string; fontWeight?: string }];

// Cursor's editorial voice — display stays at 400 with negative tracking,
// body at 400, titles at 600, monospace JetBrains for code.
export const fontSize: Record<string, FontEntry> = {
  'hero-title': ['72px', { lineHeight: '1.1', letterSpacing: '-2.16px', fontWeight: '400' }],
  'hero-display': ['72px', { lineHeight: '1.1', letterSpacing: '-2.16px', fontWeight: '400' }],
  'display-mega': ['72px', { lineHeight: '1.1', letterSpacing: '-2.16px', fontWeight: '400' }],
  'display-lg': ['36px', { lineHeight: '1.2', letterSpacing: '-0.72px', fontWeight: '400' }],
  'display-md': ['26px', { lineHeight: '1.25', letterSpacing: '-0.325px', fontWeight: '400' }],
  'display-sm': ['22px', { lineHeight: '1.3', letterSpacing: '-0.11px', fontWeight: '400' }],
  'section-title': ['36px', { lineHeight: '1.2', letterSpacing: '-0.72px', fontWeight: '400' }],
  'heading-1': ['48px', { lineHeight: '1.15', letterSpacing: '-1px', fontWeight: '400' }],
  'heading-2': ['36px', { lineHeight: '1.2', letterSpacing: '-0.72px', fontWeight: '400' }],
  'heading-3': ['26px', { lineHeight: '1.25', letterSpacing: '-0.325px', fontWeight: '400' }],
  'card-title': ['22px', { lineHeight: '1.3', letterSpacing: '-0.11px', fontWeight: '400' }],
  'heading-4': ['22px', { lineHeight: '1.3', letterSpacing: '-0.11px', fontWeight: '400' }],
  'heading-5': ['18px', { lineHeight: '1.4', fontWeight: '600' }],
  'title-md': ['18px', { lineHeight: '1.4', fontWeight: '600' }],
  'title-sm': ['16px', { lineHeight: '1.4', fontWeight: '600' }],
  subtitle: ['18px', { lineHeight: '1.5', fontWeight: '400' }],
  'body-lg': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
  'body-md': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
  'body-md-medium': ['16px', { lineHeight: '1.5', fontWeight: '500' }],
  'body-tracked': ['16px', { lineHeight: '1.5', letterSpacing: '0.08px', fontWeight: '400' }],
  'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
  'body-sm-medium': ['14px', { lineHeight: '1.5', fontWeight: '500' }],
  caption: ['13px', { lineHeight: '1.4', fontWeight: '400' }],
  'caption-bold': ['13px', { lineHeight: '1.4', fontWeight: '600' }],
  'label-sm': ['11px', { lineHeight: '1.4', letterSpacing: '0.88px', fontWeight: '600' }],
  micro: ['12px', { lineHeight: '1.4', fontWeight: '500' }],
  'micro-uppercase': ['11px', { lineHeight: '1.4', letterSpacing: '0.88px', fontWeight: '600' }],
  'caption-uppercase': ['11px', { lineHeight: '1.4', letterSpacing: '0.88px', fontWeight: '600' }],
  'button-md': ['14px', { lineHeight: '1.0', fontWeight: '500' }],
  'nav-link': ['14px', { lineHeight: '1.4', fontWeight: '500' }],
  code: ['13px', { lineHeight: '1.5', fontWeight: '400' }]
};

export const fontFamily = {
  sans: [
    'Inter',
    '-apple-system',
    'system-ui',
    'Helvetica Neue',
    'Helvetica',
    'Arial',
    'sans-serif'
  ],
  mono: [
    'JetBrains Mono',
    'Fira Code',
    'ui-monospace',
    'SFMono-Regular',
    'Menlo',
    'Consolas',
    'monospace'
  ]
} as const;
