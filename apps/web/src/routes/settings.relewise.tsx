import { createFileRoute } from "@tanstack/react-router";

import { RelewiseSettings } from "../components/settings/RelewiseSettings";

function SettingsRelewiseRoute() {
  return <RelewiseSettings />;
}

export const Route = createFileRoute("/settings/relewise")({
  component: SettingsRelewiseRoute,
});
