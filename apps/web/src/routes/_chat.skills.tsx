import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SkillsPage } from "../components/skills/SkillsPage";

interface SkillsSearch {
  skill?: string;
}

function SkillsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <SkillsPage
      selectedSkill={search.skill ?? null}
      onSelectSkill={(name) =>
        void navigate({
          search: (prev): SkillsSearch => {
            const { skill: _skill, ...rest } = prev;
            return name ? { ...rest, skill: name } : rest;
          },
        })
      }
    />
  );
}

export const Route = createFileRoute("/_chat/skills")({
  validateSearch: (raw: Record<string, unknown>): SkillsSearch =>
    typeof raw.skill === "string" && raw.skill ? { skill: raw.skill } : {},
  component: SkillsRoute,
});
