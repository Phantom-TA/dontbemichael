/**
 * react-markdown's link rules plus the app's own `dbm:` places
 * (docs/designs/settings-links-in-replies.md). Every other scheme keeps the
 * default treatment, so javascript:, data: and the rest are still dropped.
 */
import { defaultUrlTransform } from 'react-markdown';
import { PLACE_SCHEME } from '@shared/settingsPlaces';

export function placeUrlTransform(url: string): string {
  return url.slice(0, PLACE_SCHEME.length).toLowerCase() === PLACE_SCHEME ? url : defaultUrlTransform(url);
}
