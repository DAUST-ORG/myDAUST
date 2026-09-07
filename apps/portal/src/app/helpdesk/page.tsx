"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  GitBranch,
  Loader2,
  Lock,
  MessageSquarePlus,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { PortalShell } from "@/components/PortalShell";
import { portalForRoles, type PortalKey } from "@/lib/nav";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui";
import {
  type ChildSummary,
  type HelpdeskAttachment,
  type HelpdeskCategory,
  type HelpdeskGithubSyncResult,
  type HelpdeskPriority,
  type HelpdeskQueueItem,
  type HelpdeskRoutingType,
  type HelpdeskStatus,
  type HelpdeskTicketDetail,
  type HelpdeskTicketSummary,
  type HelpdeskCommentSummary,
  type Me,
  HELP_DESK_CATEGORY_LABELS,
  HELP_DESK_PRIORITY_LABELS,
  HELP_DESK_ROUTING_LABELS,
  HELP_DESK_STATUS_LABELS,
  HELPDESK_CATEGORIES,
  HELPDESK_PRIORITIES,
  HELPDESK_ROUTING_TYPES,
  HELPDESK_STATUSES,
  HELPDESK_STATUS_TRANSITIONS,
  addHelpdeskComment,
  createHelpdeskTicket,
  helpdeskAttachmentUrl,
  getHelpdeskQueue,
  getHelpdeskTicket,
  getMe,
  getMyChildren,
  getMyHelpdeskTickets,
  isValidHelpdeskStatusTransition,
  retryHelpdeskGithubSync,
  updateHelpdeskTicket,
  uploadHelpdeskAttachment,
} from "@/lib/api";
import styles from "./helpdesk.module.css";

/* ============================================================================
   Shared screen pieces.
   ==========================================================================*/

const STAFF_QUEUE_ROLES = new Set([
  "registrar",
  "admissions",
  "dining",
  "it_admin",
  "admin",
]);

const STATUS_TONE: Record<HelpdeskStatus, "info" | "warning" | "success" | "neutral"> = {
  new: "info",
  in_progress: "warning",
  waiting_on_requester: "neutral",
  resolved: "success",
};

const PRIORITY_TONE: Record<HelpdeskPriority, "neutral" | "warning" | "error"> = {
  low: "neutral",
  normal: "warning",
  high: "error",
};

const CATEGORY_OPTIONS = HELPDESK_CATEGORIES.map((c) => ({
  value: c,
  label: HELP_DESK_CATEGORY_LABELS[c],
}));
const PRIORITY_OPTIONS = HELPDESK_PRIORITIES.map((p) => ({
  value: p,
  label: HELP_DESK_PRIORITY_LABELS[p],
}));
const STATUS_OPTIONS = HELPDESK_STATUSES.map((s) => ({
  value: s,
  label: HELP_DESK_STATUS_LABELS[s],
}));
const ROUTING_OPTIONS = HELPDESK_ROUTING_TYPES.map((r) => ({
  value: r,
  label: HELP_DESK_ROUTING_LABELS[r],
}));

const ASSIGNMENT_NULL_VALUE = "__unassigned__";

/** Format an ISO timestamp as "Aug 12 · 14:02". Skips year for the current year. */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

/** First-error message from a thrown ApiError or generic Error. */
function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function isStaff(me: Me): boolean {
  return me.roles.some((r) => STAFF_QUEUE_ROLES.has(r));
}

/* ============================================================================
   Page entry.
   ==========================================================================*/

export default function HelpdeskPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "detail" | "new">("list");
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  const openTicket = useCallback((id: string) => {
    setActiveTicketId(id);
    setView("detail");
  }, []);

  const backToList = useCallback(() => {
    setActiveTicketId(null);
    setView("list");
  }, []);

  if (loading) {
    return (
      <PortalShell portal="student">
        <div style={{ padding: 32, color: "var(--fg3)" }}>
          <Loader2 size={18} style={{ animation: "spin 0.9s linear infinite", marginRight: 8 }} />
          Loading your helpdesk…
        </div>
      </PortalShell>
    );
  }

  if (!me) return null;

  return (
    <PortalShell portal={resolvePortalKey(me.roles)}>
      <HelpdeskScreen
        me={me}
        view={view}
        setView={setView}
        activeTicketId={activeTicketId}
        openTicket={openTicket}
        backToList={backToList}
      />
    </PortalShell>
  );
}

/** Map a user's home route (from `portalForRoles`) to the matching `PortalKey`
 *  for `PortalShell.portal`. The two encodings share an ordering so a single
 *  prefix walk is enough. */
const KNOWN_PORTALS = new Set([
  "director",
  "registrar",
  "admissions",
  "finance",
  "comms",
  "faculty",
  "it",
  "infirmary",
  "dining",
  "parent",
  "student",
]);
function resolvePortalKey(roles: string[]): PortalKey {
  // Stay in the shell the viewer came from: a registrar clicking Helpdesk keeps
  // the registrar sidebar instead of bouncing to the director home their admin
  // role would otherwise resolve to.
  try {
    const last = window.localStorage.getItem("mydaust_last_portal");
    if (last && KNOWN_PORTALS.has(last)) return last as PortalKey;
  } catch {
    /* private mode — fall through to role home */
  }
  const home = portalForRoles(roles).home;
  if (home.startsWith("/director")) return "director";
  if (home.startsWith("/admin")) return "registrar";
  if (home.startsWith("/admissions")) return "admissions";
  if (home.startsWith("/finance")) return "finance";
  if (home.startsWith("/comms")) return "comms";
  if (home.startsWith("/faculty")) return "faculty";
  if (home.startsWith("/it")) return "it";
  if (home.startsWith("/infirmary")) return "infirmary";
  if (home.startsWith("/dining")) return "dining";
  if (home.startsWith("/parent")) return "parent";
  return "student";
}

interface HelpdeskScreenProps {
  me: Me;
  view: "list" | "detail" | "new";
  setView: (v: "list" | "detail" | "new") => void;
  activeTicketId: string | null;
  openTicket: (id: string) => void;
  backToList: () => void;
}

function HelpdeskScreen({
  me,
  view,
  setView,
  activeTicketId,
  openTicket,
  backToList,
}: HelpdeskScreenProps) {
  const staff = isStaff(me);

  return (
    <div className={styles.shell}>
      <PageHeader
        eyebrow="Support"
        title="Helpdesk"
        subtitle={
          staff
            ? "Shared queue across admissions, academics, student affairs, IT / portal, and other requests."
            : "Open a ticket for admissions, academics, student affairs, IT / portal, or anything else."
        }
        actions={
          view === "detail" ? (
            <Button variant="ghost" size="sm" onClick={backToList}>
              ← Back to {staff ? "queue" : "my tickets"}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={15} />}
              onClick={() => setView("new")}
            >
              New request
            </Button>
          )
        }
      />

      {view === "new" ? (
        <NewRequestCard
          me={me}
          onCreated={(id) => openTicket(id)}
          onCancel={backToList}
        />
      ) : view === "detail" && activeTicketId ? (
        <DetailView ticketId={activeTicketId} me={me} />
      ) : staff ? (
        <StaffQueue onOpen={openTicket} me={me} />
      ) : (
        <RequesterList me={me} onOpen={openTicket} />
      )}
    </div>
  );
}

/* ============================================================================
   Requester views.
   ==========================================================================*/

function RequesterList({
  me: _me,
  onOpen,
}: {
  me: Me;
  onOpen: (id: string) => void;
}) {
  const [tickets, setTickets] = useState<HelpdeskTicketSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HelpdeskStatus | "all">("all");

  const load = useCallback(() => {
    setError(null);
    getMyHelpdeskTickets()
      .then(setTickets)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!tickets) return [];
    if (filter === "all") return tickets;
    return tickets.filter((t) => t.status === filter);
  }, [tickets, filter]);

  if (error) {
    return <div className={styles.errorBanner}>{error}</div>;
  }

  if (tickets === null) {
    return (
      <p className="muted" style={{ padding: 24 }}>
        Loading your tickets…
      </p>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<MessageSquarePlus size={28} />}
          title="No tickets yet"
          note="When you open a request it shows up here so you can track replies and attachments."
        />
      </Card>
    );
  }

  return (
    <div className={styles.requesterLayout}>
      <div className={styles.controlRow}>
        <Select
          value={filter}
          onChange={(v) => setFilter(v as HelpdeskStatus | "all")}
          options={[
            { value: "all", label: "All statuses" },
            ...STATUS_OPTIONS,
          ]}
        />
      </div>
      <div className={styles.requesterList}>
        {visible.length === 0 ? (
          <EmptyState title="No tickets match this filter" />
        ) : (
          visible.map((t) => (
            <button
              key={t.id}
              type="button"
              className={styles.requesterRow}
              onClick={() => onOpen(t.id)}
            >
              <div className={styles.queueRowMeta}>
                <Badge tone={STATUS_TONE[t.status]}>
                  {HELP_DESK_STATUS_LABELS[t.status]}
                </Badge>
                <Badge tone={PRIORITY_TONE[t.priority]}>
                  {HELP_DESK_PRIORITY_LABELS[t.priority]}
                </Badge>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {HELP_DESK_CATEGORY_LABELS[t.category]}
                </span>
                <span style={{ flex: 1 }} />
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {formatStamp(t.updatedAt)}
                </span>
              </div>
              <div className={styles.queueRowTitle}>{t.title}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function NewRequestCard({
  me,
  onCreated,
  onCancel,
}: {
  me: Me;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const isParent = me.roles.includes("parent");
  const [children, setChildren] = useState<ChildSummary[] | null>(null);
  const [childId, setChildId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<HelpdeskCategory>("other");
  const [priority, setPriority] = useState<HelpdeskPriority>("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isParent) return;
    getMyChildren()
      .then((list) => {
        setChildren(list);
        if (list.length === 1) setChildId(list[0]!.studentId);
      })
      .catch((e: Error) => setError(e.message));
  }, [isParent]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (title.trim().length < 3) {
        setError("Title must be at least 3 characters.");
        return;
      }
      if (!description.trim()) {
        setError("Please describe what you need help with.");
        return;
      }
      if (isParent && !childId) {
        setError("Select which child this request is about.");
        return;
      }
      setBusy(true);
      try {
        const created = await createHelpdeskTicket({
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          ...(isParent && childId ? { studentId: childId } : {}),
        });
        onCreated(created.id);
      } catch (err) {
        setError(errorMessage(err, "Could not create the ticket."));
      } finally {
        setBusy(false);
      }
    },
    [title, description, category, priority, childId, isParent, onCreated],
  );

  return (
    <Card title="New request">
      <form onSubmit={submit}>
        <div className={styles.formGrid}>
          <Field label="Category">
            <Select
              value={category}
              onChange={(v) => setCategory(v as HelpdeskCategory)}
              options={CATEGORY_OPTIONS}
            />
          </Field>
          <Field label="Priority">
            <Select
              value={priority}
              onChange={(v) => setPriority(v as HelpdeskPriority)}
              options={PRIORITY_OPTIONS}
            />
          </Field>
          <div className={styles.formGridWide}>
            <Field label="Title">
              <Input
                value={title}
                onChange={setTitle}
                placeholder="Short summary of what you need"
                invalid={title.length > 0 && title.trim().length < 3}
              />
            </Field>
          </div>
          <div className={styles.formGridWide}>
            <Field label="Description" hint="Plain text — no formatting. Attach screenshots after submitting.">
              <Textarea
                value={description}
                onChange={setDescription}
                rows={6}
                placeholder="What's happening, what you've already tried, and the outcome you want."
              />
            </Field>
          </div>
          {isParent && children && children.length > 1 && (
            <div className={styles.formGridWide}>
              <Field label="On behalf of" hint="Required: only your linked children can be filed about.">
                <Select
                  value={childId}
                  onChange={setChildId}
                  options={children.map((c) => ({
                    value: c.studentId,
                    label: `${c.name} · ${c.studentNo}`,
                  }))}
                />
              </Field>
            </div>
          )}
          {isParent && children && children.length === 0 && (
            <div className={styles.formGridWide}>
              <div className={styles.noticeBanner}>
                You aren't linked to any students yet, so a ticket can't be filed on someone's behalf.
              </div>
            </div>
          )}
        </div>
        {error && (
          <div className={styles.errorBanner} style={{ marginTop: 12 }}>
            <AlertCircle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            {error}
          </div>
        )}
        <div className={styles.formFooter}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={<Send size={14} />}
            disabled={busy}
          >
            {busy ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ============================================================================
   Staff queue.
   ==========================================================================*/

function StaffQueue({
  onOpen: _onOpen,
  me,
}: {
  onOpen: (id: string) => void;
  me: Me;
}) {
  const [items, setItems] = useState<HelpdeskQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [statusF, setStatusF] = useState<HelpdeskStatus | "all">("all");
  const [categoryF, setCategoryF] = useState<HelpdeskCategory | "all">("all");
  const [priorityF, setPriorityF] = useState<HelpdeskPriority | "all">("all");
  const [routingF, setRoutingF] = useState<HelpdeskRoutingType | "all">("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    setError(null);
    getHelpdeskQueue({
      ...(statusF !== "all" ? { status: statusF } : {}),
      ...(categoryF !== "all" ? { category: categoryF } : {}),
      ...(priorityF !== "all" ? { priority: priorityF } : {}),
      ...(routingF !== "all" ? { routingType: routingF } : {}),
      ...(mineOnly ? { mineOnly: true } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
    })
      .then((list) => {
        setItems(list);
        setSelectedId((prev) =>
          prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null,
        );
      })
      .catch((e: Error) => setError(e.message));
  }, [statusF, categoryF, priorityF, routingF, mineOnly, q]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <div className={styles.errorBanner}>{error}</div>;
  }

  const selected = items?.find((r) => r.id === selectedId) ?? null;

  return (
    <div className={styles.layout}>
      <div className={styles.queuePane}>
        <div className={styles.queueHead}>
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search title or description…"
            width="100%"
          />
          <div className={styles.queueFilters}>
            <Select
              value={statusF}
              onChange={(v) => setStatusF(v as HelpdeskStatus | "all")}
              options={[{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS]}
              ariaLabel="Filter by status"
            />
            <Select
              value={categoryF}
              onChange={(v) => setCategoryF(v as HelpdeskCategory | "all")}
              options={[{ value: "all", label: "All categories" }, ...CATEGORY_OPTIONS]}
              ariaLabel="Filter by category"
            />
            <Select
              value={priorityF}
              onChange={(v) => setPriorityF(v as HelpdeskPriority | "all")}
              options={[{ value: "all", label: "All priorities" }, ...PRIORITY_OPTIONS]}
              ariaLabel="Filter by priority"
            />
            <Select
              value={routingF}
              onChange={(v) => setRoutingF(v as HelpdeskRoutingType | "all")}
              options={[{ value: "all", label: "Any routing" }, ...ROUTING_OPTIONS]}
              ariaLabel="Filter by routing"
            />
          </div>
          <div className={styles.controlRow}>
            <Toggle checked={mineOnly} onChange={setMineOnly} label="Only my tickets" />
          </div>
        </div>
        <div className={styles.queueList}>
          {items === null && (
            <p className="muted" style={{ padding: 16 }}>
              Loading queue…
            </p>
          )}
          {items && items.length === 0 && (
            <EmptyState
              title="Queue is empty"
              note="Tickets appear here as soon as they're filed."
            />
          )}
          {items && items.length > 0 && (
            <FilteredRows
              items={items}
              me={me}
              selectedId={selectedId}
              onSelect={setSelectedId}
              q={q}
            />
          )}
        </div>
      </div>

      <div className={styles.detailPane}>
        {selected ? (
          <DetailView
            ticketId={selected.id}
            me={me}
            onQueueChanged={load}
            showHeader={false}
          />
        ) : (
          <div style={{ padding: 32 }}>
            <EmptyState
              title="Select a ticket"
              note="Pick a row from the queue to see its full thread and act on it."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FilteredRows({
  items,
  me,
  selectedId,
  onSelect,
  q,
}: {
  items: HelpdeskQueueItem[];
  me: Me;
  selectedId: string | null;
  onSelect: (id: string) => void;
  q: string;
}) {
  const needle = q.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle
        ? items.filter((r) => r.title.toLowerCase().includes(needle))
        : items,
    [items, needle],
  );

  if (visible.length === 0) {
    return <EmptyState title="No tickets match" note="Adjust the filters to see more." />;
  }

  return (
    <>
      {visible.map((row) => {
        const active = row.id === selectedId;
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row.id)}
            className={`${styles.queueRow} ${active ? styles.queueRowActive : ""}`}
          >
            <div className={styles.queueRowMeta}>
              <Badge tone={STATUS_TONE[row.status]}>
                {HELP_DESK_STATUS_LABELS[row.status]}
              </Badge>
              <Badge tone={PRIORITY_TONE[row.priority]}>
                {HELP_DESK_PRIORITY_LABELS[row.priority]}
              </Badge>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {HELP_DESK_CATEGORY_LABELS[row.category]}
              </span>
            </div>
            <div className={styles.queueRowTitle}>{row.title}</div>
            <div className={styles.queueRowSub}>
              <span>#{row.id.slice(0, 8)}</span>
              <span>·</span>
              <span>{formatStamp(row.updatedAt)}</span>
              {row.assigneeId === me.personId && (
                <>
                  <span>·</span>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>mine</span>
                </>
              )}
            </div>
          </button>
        );
      })}
    </>
  );
}

/* ============================================================================
   Ticket detail (shared between requester and staff).
   ==========================================================================*/

function DetailView({
  ticketId,
  me,
  onQueueChanged,
  showHeader = true,
}: {
  ticketId: string;
  me: Me;
  onQueueChanged?: () => void;
  showHeader?: boolean;
}) {
  const [ticket, setTicket] = useState<HelpdeskTicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getHelpdeskTicket(ticketId)
      .then((t) => {
        setTicket(t);
        onQueueChanged?.();
      })
      .catch((e: Error) => setError(e.message));
  }, [ticketId, onQueueChanged]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <div className={styles.errorBanner}>{error}</div>;
  }
  if (!ticket) {
    return (
      <p className="muted" style={{ padding: 24 }}>
        Loading ticket…
      </p>
    );
  }

  return (
    <DetailBody
      ticket={ticket}
      me={me}
      onChanged={load}
      onQueueChanged={onQueueChanged}
      showHeader={showHeader}
    />
  );
}

function DetailBody({
  ticket,
  me,
  onChanged,
  onQueueChanged,
  showHeader,
}: {
  ticket: HelpdeskTicketDetail;
  me: Me;
  onChanged: () => void;
  onQueueChanged?: () => void;
  showHeader: boolean;
}) {
  const staff = isStaff(me);

  return (
    <>
      {showHeader && (
        <div className={styles.detailHead}>
          <div className={styles.detailTitleRow}>
            <h1 className={styles.detailTitle}>{ticket.title}</h1>
            <Badge tone={STATUS_TONE[ticket.status]}>
              {HELP_DESK_STATUS_LABELS[ticket.status]}
            </Badge>
            <Badge tone={PRIORITY_TONE[ticket.priority]}>
              {HELP_DESK_PRIORITY_LABELS[ticket.priority]}
            </Badge>
          </div>
          <div className={styles.detailMeta}>
            <span>#{ticket.id.slice(0, 8)}</span>
            <span>·</span>
            <span>{HELP_DESK_CATEGORY_LABELS[ticket.category]}</span>
            <span>·</span>
            <span>opened {formatStamp(ticket.createdAt)}</span>
            <span>·</span>
            <span>updated {formatStamp(ticket.updatedAt)}</span>
          </div>
        </div>
      )}

      <div className={styles.detailBody}>
        <section>
          <h2 className={styles.sectionTitle}>Description</h2>
          <div className={styles.description}>{ticket.description}</div>
        </section>

        {staff && (
          <StaffControls
            ticket={ticket}
            me={me}
            onChanged={onChanged}
            onQueueChanged={onQueueChanged}
          />
        )}

        <Conversation ticket={ticket} me={me} onAdded={onChanged} />

        {ticket.attachments.length > 0 && (
          <section>
            <h2 className={styles.sectionTitle}>Attachments</h2>
            <div className={styles.attachments}>
              {ticket.attachments.map((a) => (
                <a
                  key={a.id}
                  className={styles.attachmentChip}
                  href={helpdeskAttachmentUrl(a.id)}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={`${a.name} · ${Math.round(a.size / 1024)} kB`}
                >
                  <FileText size={14} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                    {a.name}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        <AttachmentUpload
          ticketId={ticket.id}
          onUploaded={onChanged}
        />

        {staff && ticket.routingType === "engineering" && (
          <GithubSyncPanel
            ticket={ticket}
            onChanged={onChanged}
          />
        )}
      </div>
    </>
  );
}

/* ============================================================================
   Staff controls.
   ==========================================================================*/

function StaffControls({
  ticket,
  me,
  onChanged,
  onQueueChanged,
}: {
  ticket: HelpdeskTicketDetail;
  me: Me;
  onChanged: () => void;
  onQueueChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const allowedNextStatuses = HELPDESK_STATUS_TRANSITIONS[ticket.status] ?? [];

  const runUpdate = useCallback(
    async (
      next: Partial<{
        status: HelpdeskStatus;
        priority: HelpdeskPriority;
        category: HelpdeskCategory;
        routingType: HelpdeskRoutingType;
        assigneeId: string | null;
      }>,
    ) => {
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        // The API exposes the ticket's `version` on the read DTO; the optimistic
        // concurrency check returns 409 on a stale baseRevision. We send the
        // version we observed when the editor was loaded.
        await updateHelpdeskTicket(ticket.id, {
          ...next,
          baseRevision: ticket.version,
        });
        onChanged();
        onQueueChanged?.();
        setInfo("Ticket updated.");
      } catch (err) {
        setError(errorMessage(err, "Could not save the change."));
      } finally {
        setBusy(false);
      }
    },
    [ticket, onChanged, onQueueChanged],
  );

  return (
    <section>
      <h2 className={styles.sectionTitle}>Staff controls</h2>
      <div className={styles.noticeBanner}>
        You can transition status, reassign, reclassify, and update priority / category.
        Edits go through the server's revision check.
      </div>
      <div style={{ height: 10 }} />
      <div className={styles.controlsGrid}>
        <Field label="Status">
          <Select
            value={ticket.status}
            onChange={(v) => runUpdate({ status: v as HelpdeskStatus })}
            disabled={busy || allowedNextStatuses.length === 0}
            options={[
              { value: ticket.status, label: HELP_DESK_STATUS_LABELS[ticket.status] },
              ...allowedNextStatuses.map((s) => ({
                value: s,
                label: HELP_DESK_STATUS_LABELS[s],
              })),
            ]}
          />
        </Field>
        <Field label="Priority">
          <Select
            value={ticket.priority}
            onChange={(v) => runUpdate({ priority: v as HelpdeskPriority })}
            disabled={busy}
            options={PRIORITY_OPTIONS}
          />
        </Field>
        <Field label="Category">
          <Select
            value={ticket.category}
            onChange={(v) => runUpdate({ category: v as HelpdeskCategory })}
            disabled={busy}
            options={CATEGORY_OPTIONS}
          />
        </Field>
        <Field label="Routing">
          <Select
            value={ticket.routingType}
            onChange={(v) => runUpdate({ routingType: v as HelpdeskRoutingType })}
            disabled={busy}
            options={ROUTING_OPTIONS}
          />
        </Field>
        <Field label="Assignee">
          <Select
            value={ticket.assigneeId ?? ASSIGNMENT_NULL_VALUE}
            onChange={(v) =>
              runUpdate({ assigneeId: v === ASSIGNMENT_NULL_VALUE ? null : v })
            }
            disabled={busy}
            options={[
              ...(ticket.assigneeId
                ? [{ value: ASSIGNMENT_NULL_VALUE, label: "Unassign" }]
                : []),
              { value: me.personId, label: `${me.name} (me)` },
            ]}
          />
        </Field>
      </div>
      {(error || info) && (
        <div style={{ marginTop: 10 }}>
          {error && <div className={styles.errorBanner}>{error}</div>}
          {info && !error && (
            <div className={styles.noticeBanner}>
              <CheckCircle2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              {info}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ============================================================================
   Conversation + reply composer.
   ==========================================================================*/

function Conversation({
  ticket,
  me,
  onAdded,
}: {
  ticket: HelpdeskTicketDetail;
  me: Me;
  onAdded: () => void;
}) {
  const staff = isStaff(me);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight });
  }, [ticket.comments.length]);

  const submit = useCallback(async () => {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addHelpdeskComment(ticket.id, {
        body: body.trim(),
        isInternal: staff && internal,
      });
      setBody("");
      setInternal(false);
      onAdded();
    } catch (err) {
      setError(errorMessage(err, "Could not post the reply."));
    } finally {
      setBusy(false);
    }
  }, [body, internal, staff, ticket.id, onAdded]);

  const visibleComments = useMemo<HelpdeskCommentSummary[]>(
    () =>
      staff
        ? ticket.comments
        : ticket.comments.filter((c) => !c.isInternal),
    [staff, ticket.comments],
  );

  return (
    <section>
      <h2 className={styles.sectionTitle}>Conversation</h2>
      <div ref={listRef} className={styles.thread}>
        {visibleComments.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No replies yet. {staff ? "Use the box below to add a public note or an internal comment." : "Use the box below to add a public reply."}
          </p>
        ) : (
          visibleComments.map((c) => (
            <div
              key={c.id}
              className={`${styles.comment} ${c.isInternal ? styles.commentInternal : ""}`}
            >
              <div className={styles.commentMeta}>
                <UserIcon size={12} />
                <span>
                  {c.authorId === me.personId ? "You" : c.authorId.slice(0, 8)}
                </span>
                <span>·</span>
                <span>{formatStamp(c.createdAt)}</span>
                {c.isInternal && (
                  <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, color: "var(--warning-500)", fontWeight: 600 }}>
                    <Lock size={11} /> Internal
                  </span>
                )}
              </div>
              <div className={styles.commentBody}>{c.body}</div>
            </div>
          ))
        )}
      </div>

      <div className={styles.replyRow}>
        <Textarea
          value={body}
          onChange={setBody}
          rows={4}
          placeholder={
            staff
              ? internal
                ? "Internal note — only the support team sees this."
                : "Public reply — visible to the requester."
              : "Add a reply for the support team."
          }
          disabled={busy}
        />
        <div className={styles.replyControls}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {staff && (
              <Toggle
                checked={internal}
                onChange={setInternal}
                label={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <ShieldCheck size={13} /> Internal note
                  </span>
                }
              />
            )}
            <span className={styles.replyMeta}>{body.trim().length}/8000</span>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Send size={13} />}
            onClick={submit}
            disabled={busy || !body.trim()}
          >
            {busy ? "Posting…" : internal && staff ? "Post internal" : "Post reply"}
          </Button>
        </div>
        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            {error}
          </div>
        )}
      </div>
    </section>
  );
}

/* ============================================================================
   Attachment upload.
   ==========================================================================*/

function AttachmentUpload({
  ticketId,
  onUploaded,
}: {
  ticketId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<HelpdeskAttachment[]>([]);

  const onPick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        for (const f of Array.from(files)) {
          const out = await uploadHelpdeskAttachment(ticketId, f, f.name);
          setDone((prev) => [...prev, out]);
          onUploaded();
        }
      } catch (err) {
        setError(errorMessage(err, "Could not upload the file."));
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [ticketId, onUploaded],
  );

  return (
    <section>
      <h2 className={styles.sectionTitle}>Attach a screenshot</h2>
      <div className={styles.uploadRow}>
        <button
          type="button"
          className={styles.uploadButton}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Paperclip size={14} />
          {busy ? "Uploading…" : "Choose file"}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          PNG, JPEG, GIF, WebP, or AVIF screenshot. Up to the standard upload size limit.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          multiple
          hidden
          onChange={onPick}
        />
      </div>
      {error && (
        <div className={styles.errorBanner} style={{ marginTop: 8 }}>
          <AlertCircle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          {error}
        </div>
      )}
      {done.length > 0 && (
        <div className={styles.uploadedList}>
          {done.map((a) => (
            <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={13} color="var(--success)" />
              <a href={helpdeskAttachmentUrl(a.id)} target="_blank" rel="noreferrer noopener">
                {a.name}
              </a>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================================
   GitHub sync panel (staff, engineering only).
   ==========================================================================*/

function GithubSyncPanel({
  ticket,
  onChanged,
}: {
  ticket: HelpdeskTicketDetail;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HelpdeskGithubSyncResult | null>(null);

  const trigger = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await retryHelpdeskGithubSync(ticket.id);
      setResult(res);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Could not trigger sync."));
    } finally {
      setBusy(false);
    }
  }, [ticket.id, onChanged]);

  const state = result?.state ?? ticket.githubSyncState;
  const url = result?.issueUrl ?? ticket.githubIssueUrl;
  const num = result?.issueNumber ?? ticket.githubIssueNumber;

  return (
    <section>
      <h2 className={styles.sectionTitle}>GitHub sync</h2>
      <div className={styles.githubCard}>
        <GitBranch size={14} />
        <span className={state === "linked" ? styles.githubLinked : state === "failed" ? styles.githubFailed : state === "pending" ? styles.githubPending : styles.githubDisabled}>
          {state === "linked" && num ? `Linked to #${num}` : state === "pending" ? "Sync pending…" : state === "failed" ? "Sync failed" : "Not synced"}
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent)", fontWeight: 600 }}
          >
            View issue <ExternalLink size={11} />
          </a>
        )}
        {(state === "failed" || state === "pending") && (
          <button
            type="button"
            className={styles.retryButton}
            onClick={trigger}
            disabled={busy}
          >
            {busy ? <Loader2 size={12} style={{ animation: "spin 0.9s linear infinite" }} /> : <RefreshCw size={12} />}
            {busy ? "Retrying…" : "Retry sync"}
          </button>
        )}
        {state === "failed" && ticket.githubSyncError && (
          <span style={{ fontSize: 12, color: "var(--fg3)" }}>
            {ticket.githubSyncError}
          </span>
        )}
      </div>
      {error && (
        <div className={styles.errorBanner} style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </section>
  );
}