import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { TaskListView } from "@/components/tasks/task-list-view";
import type { SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "My Tasks" };

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireUser();
  return <TaskListView me={me} params={await searchParams} scope="my" />;
}
