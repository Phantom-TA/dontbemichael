import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNeedsYou } from '@/shell/useNeedsYou';
import { groupName, panelStyle } from './fieldText';
import { GetMichaelReady } from './GetMichaelReady';
import { InfoTip } from './InfoTip';

/**
 * Settings > Agents: how the team on Claude signs in, the owner's Claude
 * account or an Anthropic API key, and the way to change it. An office set up
 * before skips the wizard, so without this a stop card was the only place that
 * showed it. Shown once Claude Code is here and in use: a missing Claude has
 * its own Needs you card, and opening Settings never starts an install.
 */
export function ClaudeSignInSettings() {
  const { t } = useTranslation();
  const { engineSetup } = useNeedsYou();
  if (!engineSetup?.applies || !engineSetup.installed) return null;
  return (
    <div data-claude-sign-in="" style={group}>
      <h3 style={{ ...groupName, display: 'flex', gap: 6, alignItems: 'center' }}>
        {t('settings.claudeSignIn.title')}<InfoTip text={t('settings.claudeSignIn.tip')} />
      </h3>
      <GetMichaelReady manage />
    </div>
  );
}

const group: CSSProperties = { ...panelStyle, gap: 10 };
