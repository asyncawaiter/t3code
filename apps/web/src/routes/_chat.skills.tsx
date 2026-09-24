import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SkillsPage, type SkillsPageView } from "../components/skills/SkillsPage";

interface SkillsSearch {
  skill?: string;
  view?: SkillsPageView;
}

function SkillsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <SkillsPage
      selectedSkill={search.skill ?? null}
      view={search.view ?? "library"}
      onSelectSkill={(name) =>
        void navigate({
          search: (prev): SkillsSearch => {
            const { skill: _skill, ...rest } = prev;
            return name ? { ...rest, skill: name } : rest;
          },
        })
      }
      onViewChange={(view) =>
        void navigate({ search: (prev): SkillsSearch => ({ ...prev, view }) })
      }
    />
  );
}

export const Route = createFileRoute("/_chat/skills")({
  validateSearch: (raw: Record<string, unknown>): SkillsSearch => ({
    ...(typeof raw.skill === "string" && raw.skill ? { skill: raw.skill } : {}),
    ...(raw.view === "library" || raw.view === "gaps" ? { view: raw.view } : {}),
  }),
  component: SkillsRoute,
});
