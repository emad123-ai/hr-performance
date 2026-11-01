"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Paperclip, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { addComment, addDependency, deleteAttachment, getAttachmentUrl, registerAttachment, removeDependency } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/shared/misc";
import { StatusBadge } from "@/components/shared/badges";
import { fmtBytes, fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EffectiveStatus, TaskAttachment, TaskComment } from "@/lib/types";

const COMMENT_STYLES: Record<string, string> = {
  progress: "border-blue-200 bg-blue-50/50",
  blocker: "border-amber-200 bg-amber-50/60",
  feedback: "border-violet-200 bg-violet-50/50",
  submission: "border-green-200 bg-green-50/50",
};

export function CommentThread({ taskId, comments }: { taskId: string; comments: TaskComment[] }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className={cn("flex gap-3 rounded-md border p-3", COMMENT_STYLES[c.comment_type])}>
            <Avatar name={c.author?.full_name} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author?.full_name ?? "System"}</span>
                {c.comment_type !== "comment" && <span className="ml-1 capitalize">· {c.comment_type}</span>} · {fmtRelative(c.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="space-y-2"
        data-no-print
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await addComment(taskId, body);
            if (!res.ok) return void toast.error(res.error);
            setBody("");
            router.refresh();
          });
        }}
      >
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment or update…" rows={3} maxLength={5000} />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending || !body.trim()}>{pending && <Loader2 className="animate-spin" />} Post comment</Button>
        </div>
      </form>
    </div>
  );
}

const MAX_BYTES = 10 * 1024 * 1024;

export function AttachmentPanel({ taskId, attachments, currentUserId, canManage, canUpload }: {
  taskId: string;
  attachments: TaskAttachment[];
  currentUserId: string;
  canManage: boolean;
  canUpload: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [evidence, setEvidence] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();

  async function upload(file: File) {
    if (file.size > MAX_BYTES) return void toast.error("Files must be 10 MB or smaller (free-tier friendly).");
    setBusy(true);
    try {
      const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
      const path = `${taskId}/${crypto.randomUUID()}-${safe}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("task-attachments").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) return void toast.error(error.message.includes("mime") ? "This file type is not allowed." : `Upload failed: ${error.message}`);
      const res = await registerAttachment(taskId, { file_name: file.name.slice(0, 255), storage_path: path, mime_type: file.type || null, size_bytes: file.size, is_evidence: evidence });
      if (!res.ok) return void toast.error(res.error);
      toast.success("File attached");
      router.refresh();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 && <p className="text-sm text-muted-foreground">No files attached.</p>}
      <ul className="divide-y rounded-md border">
        {attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-3 p-2.5 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{a.file_name}{a.is_evidence && <span className="ml-2 rounded bg-green-50 px-1.5 text-[10px] text-green-700">evidence</span>}</p>
              <p className="text-xs text-muted-foreground">{fmtBytes(a.size_bytes)} · {a.uploader?.full_name ?? "—"} · {fmtDateTime(a.created_at)}</p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Download ${a.file_name}`}
              onClick={() =>
                start(async () => {
                  const res = await getAttachmentUrl(a.storage_path);
                  if (!res.ok || !res.data) return void toast.error(res.ok ? "File not available" : res.error);
                  window.open(res.data.url, "_blank", "noopener");
                })
              }
            >
              <Download />
            </Button>
            {(a.uploaded_by === currentUserId || canManage) && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${a.file_name}`}
                onClick={() =>
                  start(async () => {
                    if (!confirm(`Remove ${a.file_name}?`)) return;
                    const res = await deleteAttachment(a.id);
                    if (!res.ok) toast.error(res.error);
                    else router.refresh();
                  })
                }
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canUpload && (
        <div className="flex flex-wrap items-center gap-3" data-no-print>
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Paperclip />} Attach file
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={evidence} onChange={(e) => setEvidence(e.target.checked)} /> Mark as supporting evidence
          </label>
          <span className="text-xs text-muted-foreground">Max 10 MB · PDF, Office, images, CSV, ZIP</span>
        </div>
      )}
    </div>
  );
}

export function DependencyPanel({ taskId, dependencies, options, canManage }: {
  taskId: string;
  dependencies: { id: string; task_code: string; title: string; effective_status: EffectiveStatus }[];
  options: { id: string; label: string }[];
  canManage: boolean;
}) {
  const [choice, setChoice] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => ReturnType<typeof addDependency>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        setChoice("");
        router.refresh();
      }
    });
  return (
    <div className="space-y-2">
      {dependencies.length === 0 && <p className="text-sm text-muted-foreground">No dependencies.</p>}
      <ul className="space-y-1.5">
        {dependencies.map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-sm">
            <StatusBadge status={d.effective_status} />
            <Link href={`/tasks/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">{d.task_code} · {d.title}</Link>
            {canManage && (
              <Button size="icon-sm" variant="ghost" aria-label="Remove dependency" disabled={pending} onClick={() => run(() => removeDependency(taskId, d.id))}>
                <X />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="flex gap-2" data-no-print>
          <NativeSelect value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Add dependency">
            <option value="">Add a task this one depends on…</option>
            {options.filter((o) => o.id !== taskId && !dependencies.some((d) => d.id === o.id)).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </NativeSelect>
          <Button size="sm" variant="outline" disabled={!choice || pending} onClick={() => run(() => addDependency(taskId, choice))}>Add</Button>
        </div>
      )}
    </div>
  );
}
