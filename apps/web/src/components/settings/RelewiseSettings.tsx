import { useState } from "react";

import { useRelewiseSettings, useUpdateRelewiseSettings } from "~/relewiseSettings";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function RelewiseSettings() {
  const settings = useRelewiseSettings();
  const updateSettings = useUpdateRelewiseSettings();
  const [email, setEmail] = useState(settings.userEmail);

  const commitEmail = () => {
    const nextEmail = email.trim();
    setEmail(nextEmail);
    if (nextEmail !== settings.userEmail) {
      updateSettings({ userEmail: nextEmail });
    }
  };

  return (
    <SettingsPageContainer>
      <SettingsSection title="Relewise Settings" id="relewise-settings">
        <SettingsRow
          {...searchableSetting("relewise-user-email")}
          description="The email address used for Relewise-specific features."
          control={
            <Input
              aria-label="User email"
              autoCapitalize="none"
              autoComplete="email"
              className="w-full sm:w-72"
              inputMode="email"
              type="email"
              value={email}
              onBlur={commitEmail}
              onChange={(event) => setEmail(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("relewise-show-open-in-editor")}
          description="Show the Open control in the thread header."
          control={
            <Switch
              aria-label="Show Open in editor"
              checked={settings.showOpenInEditor}
              onCheckedChange={(checked) => updateSettings({ showOpenInEditor: checked })}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("relewise-show-commit-and-push")}
          description="Show the Commit & push control in the thread header."
          control={
            <Switch
              aria-label="Show Commit and push"
              checked={settings.showCommitAndPush}
              onCheckedChange={(checked) => updateSettings({ showCommitAndPush: checked })}
            />
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
