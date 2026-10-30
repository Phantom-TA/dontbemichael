/**
 * react-markdown's link rules plus the app's own `dbm:` places
 * (docs/designs/settings-links-in-replies.md) and `email:` links to one email
 * (docs/designs/original-email-view.md). Every other scheme keeps the
 * default treatment, so javascript:, data: and the rest are still dropped.
 */
import { defaultUrlTransform } from 'react-markdown';
import { PLACE_SCHEME } from '@shared/settingsPlaces';
import { EMAIL_SCHEME } from '@shared/emailLink';

export function placeUrlTransform(url: string): string {
  const head = url.slice(0, Math.max(PLACE_SCHEME.length, EMAIL_SCHEME.length)).toLowerCase();
  return head.startsWith(PLACE_SCHEME) || head.startsWith(EMAIL_SCHEME) ? url : defaultUrlTransform(url);
}
