import { useTranslation } from 'react-i18next';
import { cleanCompanyProfile, missingProfileFields, type CompanyProfile } from '@shared/companyProfile';
import { CompanyProfileFields } from './CompanyProfileFields';
import { hint } from './fieldText';

export interface CompanyProfileDraft {
  name: string;
  profile: CompanyProfile;
}

/**
 * Settings, Company profile: every field of the company profile, editable
 * after setup (src/shared/companyProfile.ts). A save reaches running agents on
 * their next message (the hook delivers the profile when it changes), and the
 * page points to Memory & Knowledge for anything that isn't a short fact.
 * Settings owns the draft and saves it with the rest of the form, so changing
 * sections cannot discard the owner's edits.
 */
export function CompanyProfileSettings({ value, needsIndustry, onChange, onOpenKnowledge }: {
  value: CompanyProfileDraft;
  needsIndustry: boolean;
  onChange: (next: CompanyProfileDraft) => void;
  onOpenKnowledge: () => void;
}) {
  const { t } = useTranslation();
  const { name, profile } = value;
  const gaps = missingProfileFields(cleanCompanyProfile(profile), needsIndustry);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={hint}>
        {t('companyProfile.intro')}
      </div>
      <CompanyProfileFields
        businessName={{ value: name, onChange: (name) => onChange({ ...value, name }) }}
        value={profile}
        onChange={(next) => onChange({ ...value, profile: next })}
        parts={['essentials', 'details', 'hint']}
        needsIndustry={needsIndustry}
        missing={gaps}
        onOpenKnowledge={onOpenKnowledge}
      />
      {gaps.length > 0 && (
        <span role="status" style={hint}>
          {t('companyProfile.stillMissing')}
        </span>
      )}
    </div>
  );
}
