import { createFileRoute, useLocation } from "@tanstack/react-router";

import { DashboardPage } from "../components/dashboard/DashboardPage";

export const Route = createFileRoute("/_chat/dashboard")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const activation = useLocation({
    select: (location) => location.state.globalDashboardActivation,
  });
  return <DashboardPage key={activation} />;
}
