// Tokens mirror DESIGN.md (Nike-design-analysis): pure white canvas, near-black ink,
// soft-cloud as the only neutral surface, sale-red as the single semantic accent,
// pill geometry (rounded-full = 30px), hairline-only depth, 8px spacing scale.
//
// The token *keys* match the historical names used across the admin-console so
// existing component class names keep resolving — only the *values* change.

export const colors = {
  // Canvas / surfaces — Nike is binary: pure white pages, soft-cloud staging.
  background: '#ffffff',
  canvas: '#ffffff',
  canvasSoft: '#ffffff',
  surface: '#ffffff',
  surfaceCard: '#ffffff',
  surfaceSoft: '#f5f5f5',
  surfaceMuted: '#f5f5f5',
  surfaceStrong: '#e5e5e5',
  outline: '#cacacb',

  // Brand voltage — Nike has none. The "primary" CTA is just ink-black.
  // We bind primary to ink so existing `bg-primary` calls render the universal
  // black pill the spec demands.
  primary: '#111111',
  primaryStrong: '#000000',
  primaryActive: '#000000',
  primarySoft: '#f5f5f5',
  primaryDeep: '#000000',
  onPrimary: '#ffffff',

  // Status (semantic — sale-red is the only chromatic moment in retail chrome)
  success: '#007d48',
  successSoft: '#e6f4ec',
  warning: '#d30005',
  warningSoft: '#fdecec',
  error: '#d30005',
  errorSoft: '#fdecec',
  sale: '#d30005',
  saleDeep: '#780700',
  successBright: '#1eaa52',
  info: '#1151ff',
  infoDeep: '#0034e3',

  // Dark surfaces — when an inverted block is needed (member-benefit, hero overlay)
  darkSurface: '#111111',
  darkPanel: '#000000',
  darkSurfaceMid: '#39393b',
  darkOnSurface: '#ffffff',
  darkOnSurfaceMuted: '#9e9ea0',
  darkOnSurfaceSubtle: '#707072',
  darkOutline: '#39393b',

  // Text ladder — true ink, charcoal, ash, mute, stone.
  onBackground: '#111111',
  ink: '#111111',
  inkDeep: '#000000',
  charcoal: '#39393b',
  body: '#39393b',
  bodyStrong: '#111111',
  slate: '#4b4b4d',
  steel: '#707072',
  stone: '#9e9ea0',
  mutedSoft: '#9e9ea0',
  muted: '#707072',

  // Hairlines — the only depth the system has.
  hairline: '#e5e5e5',
  hairlineSoft: '#f5f5f5',
  hairlineStrong: '#cacacb',

  // Editorial / category accent palette — sparingly used (swatch dots, soft tiles).
  // Kept under timeline* keys for source-compat with existing JourneyStepCard etc.
  timelineThinking: '#ed1aa0',
  timelineGrep: '#0a7281',
  timelineRead: '#1151ff',
  timelineEdit: '#beaffd',
  timelineDone: '#007d48',

  // Compatibility aliases retained from earlier palette
  linkBlue: '#111111',
  linkBluePressed: '#000000',
  semanticSuccess: '#007d48',
  semanticWarning: '#d30005',
  semanticError: '#d30005',
  onDark: '#ffffff',
  onDarkMuted: '#9e9ea0',
  onDarkSubtle: '#707072',
  brandNavy: '#111111',
  brandNavyDeep: '#000000',
  brandNavyMid: '#39393b',
  brandNavyHairline: '#39393b',

  // Editorial accents (sport / collection chips)
  accentPink: '#ed1aa0',
  accentPinkSoft: '#ffb0dd',
  accentPurpleSoft: '#beaffd',
  accentPurplePale: '#d6d1ff',
  accentTeal: '#0a7281',
  accentPinkDeep: '#4c012d'
} as const;

// Pill geometry. Existing class names (`rounded-md`, `rounded-full`) keep working;
// values are remapped to Nike's pill scale.
export const radius = {
  none: '0px',
  xs: '0px',
  sm: '18px',
  md: '24px',
  lg: '30px',
  xl: '30px',
  '2xl': '30px',
  '3xl': '30px',
  full: '9999px'
} as const;

// 8px base spacing scale per Nike spec.
export const spacing = {
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  base: '12px',
  lg: '18px',
  xl: '24px',
  '2xl': '30px',
  '3xl': '48px',
  'section-sm': '32px',
  section: '48px',
  'section-lg': '64px',
  hero: '96px',
  gutter: '24px'
} as const;

// Hairline-only depth — Nike has no drop shadows in retail chrome.
export const shadow = {
  card: 'none',
  hover: 'none',
  panelDark: 'none',
  support: 'none',
  modal: '0 16px 40px rgba(17, 17, 17, 0.16)',
  mockup: 'none',
  hairline: 'inset 0 -1px 0 #e5e5e5'
} as const;

type FontEntry = [string, { lineHeight: string; letterSpacing?: string; fontWeight?: string }];

// Nike type system — a single 96px display tier (Futura ND, uppercase) and a
// quiet Helvetica Now ladder under it. Almost nothing in the middle.
export const fontSize: Record<string, FontEntry> = {
  // Editorial campaign tier (Futura ND uppercase — only on hero lockups)
  'hero-title': ['96px', { lineHeight: '0.9', letterSpacing: '0', fontWeight: '500' }],
  'hero-display': ['96px', { lineHeight: '0.9', letterSpacing: '0', fontWeight: '500' }],
  'display-mega': ['96px', { lineHeight: '0.9', letterSpacing: '0', fontWeight: '500' }],
  'display-campaign': ['96px', { lineHeight: '0.9', letterSpacing: '0', fontWeight: '500' }],

  // Section / heading tier
  'display-lg': ['32px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
  'display-md': ['24px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
  'display-sm': ['24px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
  'section-title': ['32px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
  'heading-1': ['32px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
  'heading-2': ['24px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
  'heading-3': ['24px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
  'heading-xl': ['32px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
  'heading-lg': ['24px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
  'heading-md': ['16px', { lineHeight: '1.75', letterSpacing: '0', fontWeight: '500' }],
  'card-title': ['16px', { lineHeight: '1.75', fontWeight: '500' }],
  'heading-4': ['16px', { lineHeight: '1.75', fontWeight: '500' }],
  'heading-5': ['16px', { lineHeight: '1.5', fontWeight: '500' }],
  'title-md': ['16px', { lineHeight: '1.5', fontWeight: '500' }],
  'title-sm': ['14px', { lineHeight: '1.5', fontWeight: '500' }],
  subtitle: ['16px', { lineHeight: '1.5', fontWeight: '400' }],

  // Body / UI tier
  'body-lg': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
  'body-md': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
  'body-md-medium': ['16px', { lineHeight: '1.5', fontWeight: '500' }],
  'body-strong': ['16px', { lineHeight: '1.5', fontWeight: '500' }],
  'body-tracked': ['16px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
  'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
  'body-sm-medium': ['14px', { lineHeight: '1.5', fontWeight: '500' }],
  caption: ['14px', { lineHeight: '1.5', fontWeight: '500' }],
  'caption-md': ['14px', { lineHeight: '1.5', fontWeight: '500' }],
  'caption-sm': ['12px', { lineHeight: '1.5', fontWeight: '500' }],
  'caption-bold': ['14px', { lineHeight: '1.5', fontWeight: '500' }],
  'label-sm': ['12px', { lineHeight: '1.5', fontWeight: '500' }],
  micro: ['12px', { lineHeight: '1.5', fontWeight: '500' }],
  'micro-uppercase': ['12px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '500' }],
  'caption-uppercase': ['12px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '500' }],
  'utility-xs': ['9px', { lineHeight: '1.75', fontWeight: '500' }],

  // Buttons + nav
  'button-lg': ['24px', { lineHeight: '1.2', fontWeight: '500' }],
  'button-md': ['16px', { lineHeight: '1.5', fontWeight: '500' }],
  'button-sm': ['14px', { lineHeight: '1.5', fontWeight: '500' }],
  'nav-link': ['16px', { lineHeight: '1.5', fontWeight: '500' }],
  'link-md': ['16px', { lineHeight: '1.75', fontWeight: '500' }],
  code: ['13px', { lineHeight: '1.5', fontWeight: '400' }]
};

export const fontFamily = {
  // UI text — Helvetica Now (proprietary). Inter is the open-source substitute.
  sans: [
    'Helvetica Now Text',
    'Helvetica Now Display',
    'Inter',
    '-apple-system',
    'system-ui',
    'Helvetica Neue',
    'Helvetica',
    'Arial',
    'sans-serif'
  ],
  // Display campaign — Futura ND. Bebas Neue is the closest free fallback.
  display: [
    'Nike Futura ND',
    'Bebas Neue',
    'Anton',
    'Helvetica Now Display',
    'Inter',
    'Helvetica Neue',
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
