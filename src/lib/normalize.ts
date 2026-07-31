/**
 * Channel name canonicalization — collapses casing/alias variants
 * (e.g. LinkedIN / linkedin / Linked In → LinkedIn) across KPI + Spends data.
 */

const CHANNEL_ALIASES: Record<string, string> = {
  // Meta / Facebook
  meta: 'Meta',
  'meta ads': 'Meta',
  metaads: 'Meta',
  facebook: 'Meta',
  'facebook ads': 'Meta',
  fb: 'Meta',
  'fb ads': 'Meta',
  'meta platforms': 'Meta',

  // LinkedIn
  linkedin: 'LinkedIn',
  'linked in': 'LinkedIn',
  'linked-in': 'LinkedIn',
  'linkedin ads': 'LinkedIn',
  linkedinads: 'LinkedIn',
  li: 'LinkedIn',

  // Google
  google: 'Google',
  'google ads': 'Google',
  googleads: 'Google',
  adwords: 'Google',
  'google adwords': 'Google',
  'google search': 'Google',
  'google demand gen': 'Google',
  'demand gen': 'Google',
  dv360: 'DV360',
  'display video 360': 'DV360',

  // YouTube
  youtube: 'YouTube',
  'you tube': 'YouTube',
  'youtube ads': 'YouTube',

  // TikTok
  tiktok: 'TikTok',
  'tik tok': 'TikTok',
  'tiktok ads': 'TikTok',

  // Snapchat
  snapchat: 'Snapchat',
  snap: 'Snapchat',
  'snap ads': 'Snapchat',

  // X / Twitter
  x: 'X',
  twitter: 'X',
  'twitter ads': 'X',
  'x ads': 'X',

  // Bing / Microsoft
  bing: 'Bing',
  'bing ads': 'Bing',
  'microsoft ads': 'Bing',
  microsoft: 'Bing',

  // Apple
  'apple search ads': 'Apple Search Ads',
  asa: 'Apple Search Ads',
  apple: 'Apple Search Ads',
  'apple ads': 'Apple Search Ads',

  // Common media buckets
  display: 'Display',
  programmatic: 'Programmatic',
  affiliates: 'Affiliates',
  affiliate: 'Affiliates',
  branding: 'Branding',
  brand: 'Branding',
  marketplace: 'Marketplace',
  marketplaces: 'Marketplace',
  organic: 'Organic',
  seo: 'SEO',
  email: 'Email',
  sms: 'SMS',
  crm: 'CRM',
  others: 'Others',
  other: 'Others',
  na: 'N/A',
  'n/a': 'N/A',
  'n.a.': 'N/A',
};

function channelKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_/\\|]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseWords(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word; // keep acronyms if already upper
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Canonical display name for a channel / channelVendor string. */
export function canonicalizeChannel(raw: string | null | undefined): string {
  if (raw == null) return 'N/A';
  const trimmed = raw.toString().trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'N/A';

  const key = channelKey(trimmed);
  if (CHANNEL_ALIASES[key]) return CHANNEL_ALIASES[key];

  // Soft match: strip trailing "ads"
  const withoutAds = key.replace(/\s+ads$/, '').trim();
  if (withoutAds !== key && CHANNEL_ALIASES[withoutAds]) {
    return CHANNEL_ALIASES[withoutAds];
  }

  return titleCaseWords(trimmed);
}
