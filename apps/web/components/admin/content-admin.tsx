"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Markdown } from "@/lib/markdown";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Page {
  slug: string;
  title: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  published: boolean;
  updatedAt: string;
}
interface Announcement {
  id: number;
  title: string;
  body: string;
  kind: "banner" | "popup" | "news";
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

function PageEditor({ page }: { page: Page }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState(page);
  const [preview, setPreview] = useState(false);
  useEffect(() => setF(page), [page]);
  const save = useMutation({
    mutationFn: () => api(`/admin/content/pages/${page.slug}`, { method: "PUT", json: { title: f.title, content: f.content, metaTitle: f.metaTitle || null, metaDescription: f.metaDescription || null, published: f.published } }),
    onSuccess: () => {
      toast(`"${f.title}" saved and published`);
      qc.invalidateQueries({ queryKey: ["admin", "pages"] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't save", "danger"),
  });
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Field label="Address" value={`/${page.slug}`} readOnly hint="Linked from the site footer." />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="page-body" className="text-[13px] font-medium text-ink-2">
            Content
          </label>
          <button type="button" onClick={() => setPreview((p) => !p)} aria-pressed={preview} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            {preview ? <Pencil className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />} {preview ? "Edit" : "Preview"}
          </button>
        </div>
        {preview ? (
          <div className="min-h-[320px] rounded-[11px] border border-line bg-surface-2 p-5">
            <Markdown source={f.content} />
          </div>
        ) : (
          <textarea
            id="page-body"
            rows={16}
            value={f.content}
            onChange={(e) => setF({ ...f, content: e.target.value })}
            className="rounded-[11px] border border-line bg-surface p-3 font-mono text-[13px] leading-relaxed focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
        )}
        <p className="text-[13px] text-ink-3">Formatting: # Heading, ## Subheading, - list item, **bold**, [link](https://…). Blank line = new paragraph.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Search title (optional)" value={f.metaTitle ?? ""} onChange={(e) => setF({ ...f, metaTitle: e.target.value })} />
        <Field label="Search description (optional)" value={f.metaDescription ?? ""} onChange={(e) => setF({ ...f, metaDescription: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Switch checked={f.published} onChange={(v) => setF({ ...f, published: v })} label="Published" />
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Save page
        </Button>
      </div>
    </div>
  );
}

const emptyNotice = { title: "", body: "", kind: "banner" as const, active: true, startsAt: null, endsAt: null };

function NoticeForm({ notice, onClose }: { notice: Partial<Announcement> | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ ...emptyNotice, ...notice });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => {
      const body = { title: f.title, body: f.body, kind: f.kind, active: f.active, startsAt: f.startsAt || null, endsAt: f.endsAt || null };
      return notice?.id ? api(`/admin/content/announcements/${notice.id}`, { method: "PUT", json: body }) : api("/admin/content/announcements", { method: "POST", json: body });
    },
    onSuccess: () => {
      toast(notice?.id ? "Notice saved" : "Notice published");
      qc.invalidateQueries({ queryKey: ["admin", "announcements"] });
      onClose();
    },
    onError: (e) => e instanceof ApiError && e.fields && setErrors(e.fields),
  });
  const toLocal = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
  return (
    <Dialog
      open
      onClose={onClose}
      title={notice?.id ? "Edit notice" : "New notice"}
      description="Banners show at the top of the customer dashboard. Pop-ups appear once per customer."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {notice?.id ? "Save notice" : "Publish notice"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} autoFocus />
        <div className="grid gap-1.5">
          <label htmlFor="notice-body" className="text-[13px] font-medium text-ink-2">
            Message
          </label>
          <textarea
            id="notice-body"
            rows={4}
            value={f.body}
            onChange={(e) => setF({ ...f, body: e.target.value })}
            className="rounded-[11px] border border-line bg-surface p-3 text-[14px] focus:border-accent focus:shadow-[var(--ring)] focus:outline-none"
          />
          {errors.body && <p className="text-[13px] text-danger">{errors.body}</p>}
        </div>
        <Select label="Show as" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Announcement["kind"] })}>
          <option value="banner">Banner on the dashboard</option>
          <option value="popup">Pop-up (once per customer)</option>
          <option value="news">News only (updates list)</option>
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts (optional)" type="datetime-local" value={toLocal(f.startsAt)} onChange={(e) => setF({ ...f, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          <Field label="Ends (optional)" type="datetime-local" value={toLocal(f.endsAt)} onChange={(e) => setF({ ...f, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </div>
        <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />
      </div>
    </Dialog>
  );
}

export function ContentAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const pages = useQuery({ queryKey: ["admin", "pages"], queryFn: () => api<Page[]>("/admin/content/pages") });
  const notices = useQuery({ queryKey: ["admin", "announcements"], queryFn: () => api<Announcement[]>("/admin/content/announcements") });
  const [slug, setSlug] = useState("terms");
  const [editing, setEditing] = useState<Partial<Announcement> | null | false>(false);
  const del = useMutation({
    mutationFn: (id: number) => api(`/admin/content/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => (toast("Notice deleted"), qc.invalidateQueries({ queryKey: ["admin", "announcements"] })),
  });
  const page = pages.data?.find((p) => p.slug === slug);

  return (
    <>
      <PageHeader title="Pages & notices" description="Edit your legal pages and post notices to customers." />
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <FileText className="size-4 text-ink-3" aria-hidden /> Pages
          </h2>
          <div role="tablist" aria-label="Page" className="mt-4 flex gap-1 rounded-xl bg-bg-subtle p-1">
            {(pages.data ?? []).map((p) => (
              <button
                key={p.slug}
                role="tab"
                aria-selected={slug === p.slug}
                onClick={() => setSlug(p.slug)}
                className={cn("h-9 flex-1 rounded-lg text-[13px] font-medium transition-[background-color,box-shadow,color]", slug === p.slug ? "bg-surface text-ink shadow-1" : "text-ink-3 hover:text-ink")}
              >
                {p.title}
              </button>
            ))}
          </div>
          <div className="mt-5">{pages.isLoading ? <Skeleton className="h-80" /> : page ? <PageEditor key={page.slug} page={page} /> : null}</div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-1 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Megaphone className="size-4 text-ink-3" aria-hidden /> Notices
            </h2>
            <Button size="sm" onClick={() => setEditing(null)}>
              <Plus className="size-3.5" aria-hidden /> New notice
            </Button>
          </div>
          {notices.isLoading ? (
            <Skeleton className="mt-4 h-40" />
          ) : notices.data?.length ? (
            <ul className="mt-4 divide-y divide-line">
              {notices.data.map((n) => (
                <li key={n.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[14px] font-medium">{n.title}</p>
                      <Badge tone={n.active ? "success" : "neutral"}>{n.active ? "Live" : "Off"}</Badge>
                      <Badge>{n.kind === "banner" ? "Banner" : n.kind === "popup" ? "Pop-up" : "News"}</Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-3">{n.body}</p>
                  </div>
                  <button onClick={() => setEditing(n)} aria-label={`Edit ${n.title}`} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-bg-subtle hover:text-ink">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => del.mutate(n.id)} aria-label={`Delete ${n.title}`} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-danger-soft hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-center text-[14px] text-ink-3">No notices yet. Use them for new services, price changes or downtime.</p>
          )}
        </section>
      </div>
      {editing !== false && <NoticeForm notice={editing} onClose={() => setEditing(false)} />}
    </>
  );
}
