// Tokens mirror DESIGN.md (Notion-design-analysis, alpha).
// Names are camelCased for Tailwind theme consumption.

export const colors = {
  // Brand accent — single hue, used sparingly (CTAs, links, focus)
  primary: '#5b4fc7',
  primaryPressed: '#473ba8',
  primaryDeep: '#322b78',
  primarySoft: '#eeebfa',
  onPrimary: '#ffffff',
  // Sidebar / dark surfaces — slate, not purple-navy
  brandNavy: '#0f172a',
  brandNavyDeep: '#0a0f1d',
  brandNavyMid: '#1e293b',
  brandNavyHairline: '#334155',
  // Links
  linkBlue: '#2563eb',
  linkBluePressed: '#1d4ed8',
  // Semantic accents (kept muted)
  brandOrange: '#c2410c',
  brandOrangeDeep: '#7c2d12',
  brandPink: '#be185d',
  brandPinkDeep: '#831843',
  brandPurple: '#5b4fc7',
  brandPurple300: '#c7c0ee',
  brandPurple800: '#322b78',
  brandTeal: '#0f766e',
  brandGreen: '#15803d',
  brandYellow: '#a16207',
  brandBrown: '#44403c',
  // Card surface tints — desaturated, near-neutral
  cardTintPeach: '#f9efe5',
  cardTintRose: '#f7eaef',
  cardTintMint: '#e8f0eb',
  cardTintLavender: '#eceaf5',
  cardTintSky: '#e7eef5',
  cardTintYellow: '#f5f0e0',
  cardTintYellowBold: '#ede5c4',
  cardTintCream: '#f5f2ea',
  cardTintGray: '#f1efec',
  // Canvas / hairlines
  canvas: '#ffffff',
  surface: '#f7f7f5',
  surfaceSoft: '#fafaf8',
  hairline: '#e5e5e2',
  hairlineSoft: '#eeeeec',
  hairlineStrong: '#c8c8c4',
  // Ink scale
  inkDeep: '#0a0a0a',
  ink: '#171717',
  charcoal: '#262626',
  slate: '#525252',
  steel: '#737373',
  stone: '#a3a3a3',
  muted: '#d4d4d4',
  // On-dark text scale
  onDark: '#f8fafc',
  onDarkMuted: '#cbd5e1',
  onDarkSubtle: '#94a3b8',
  // Semantic
  semanticSuccess: '#15803d',
  semanticWarning: '#b45309',
  semanticError: '#b91c1c'
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
  lg: '20px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '40px',
  'section-sm': '48px',
  section: '64px',
  'section-lg': '96px',
  hero: '120px'
} as const;

export const shadow = {
  card: '0 1px 2px rgba(15,15,15,0.04)',
  hover: 'rgba(15,15,15,0.08) 0px 4px 12px 0px',
  mockup: 'rgba(15,15,15,0.20) 0px 24px 48px -8px',
  modal: 'rgba(15,15,15,0.16) 0px 16px 48px -8px'
} as const;

// fontSize: [size, { lineHeight, letterSpacing, fontWeight }]
type FontEntry = [string, { lineHeight: string; letterSpacing?: string; fontWeight?: string }];

export const fontSize: Record<string, FontEntry> = {
  'hero-display': ['80px', { lineHeight: '1.05', letterSpacing: '-2px', fontWeight: '600' }],
  'display-lg': ['56px', { lineHeight: '1.10', letterSpacing: '-1px', fontWeight: '600' }],
  'heading-1': ['48px', { lineHeight: '1.15', letterSpacing: '-0.5px', fontWeight: '600' }],
  'heading-2': ['36px', { lineHeight: '1.20', letterSpacing: '-0.5px', fontWeight: '600' }],
  'heading-3': ['28px', { lineHeight: '1.25', fontWeight: '600' }],
  'heading-4': ['22px', { lineHeight: '1.30', fontWeight: '600' }],
  'heading-5': ['18px', { lineHeight: '1.40', fontWeight: '600' }],
  subtitle: ['18px', { lineHeight: '1.50', fontWeight: '400' }],
  'body-md': ['16px', { lineHeight: '1.55', fontWeight: '400' }],
  'body-md-medium': ['16px', { lineHeight: '1.55', fontWeight: '500' }],
  'body-sm': ['14px', { lineHeight: '1.50', fontWeight: '400' }],
  'body-sm-medium': ['14px', { lineHeight: '1.50', fontWeight: '500' }],
  caption: ['13px', { lineHeight: '1.40', fontWeight: '400' }],
  'caption-bold': ['13px', { lineHeight: '1.40', fontWeight: '600' }],
  micro: ['12px', { lineHeight: '1.40', fontWeight: '500' }],
  'micro-uppercase': ['11px', { lineHeight: '1.40', letterSpacing: '1px', fontWeight: '600' }],
  'button-md': ['14px', { lineHeight: '1.30', fontWeight: '500' }]
};

export const fontFamily = {
  sans: [
    'Notion Sans',
    'Inter',
    '-apple-system',
    'system-ui',
    'Segoe UI',
    'Helvetica',
    'sans-serif'
  ]
} as const;
