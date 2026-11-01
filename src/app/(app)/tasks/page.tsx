import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { TaskListView } from "@/components/tasks/task-list-view";
import type { SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Team Tasks" };

export default async function TeamTasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireRole(["admin", "team_lead"]);
  return <TaskListView me={me} params={await searchParams} scope="team" />;
}
