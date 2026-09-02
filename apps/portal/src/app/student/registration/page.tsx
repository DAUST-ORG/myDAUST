"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { orderRegistrationPlanSectionIds } from "@mydaust/shared";
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  GraduationCap,
  Info,
  Link2,
  Lock,
  MapPin,
  SearchX,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Modal,
  PageHeader,
  SearchInput,
} from "@/components/ui";
import {
  type EnrollmentOverrideGate,
  type RecommendationStatus,
  type RegistrationCatalog,
  type RegistrationRecommendation,
  type RegistrationRecommendationCorequisite,
  type RegistrationSection,
  enrollSection,
  enrollSectionBundle,
  getRegistrationCatalog,
  submitEnrollmentOverride,
} from "@/lib/api";
import {
  COURSE_COLORS,
  hourFloat,
  parseDayIndexes,
} from "@/lib/student-schedule";
import styles from "./registration.module.css";

const isConflict = (reason: string) => /conflict|clash|overlap/i.test(reason);

type Feedback = { kind: "ok" | "err" | "info"; text: string };
type OverrideTarget = { section: RegistrationSection; reason: string };
type BundleDialog = {
  recommendation: RegistrationRecommendation;
  dependentSectionId: string;
  choices: Record<string, string>;
};

export default function StudentRegistration() {
  const [data, setData] = useState<RegistrationCatalog | null>(null);
  const [cart, setCart] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sectionChoices, setSectionChoices] = useState<Record<string, string>>(
    {},
  );
  const [bundleDialog, setBundleDialog] = useState<BundleDialog | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(
    null,
  );
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideResult, setOverrideResult] = useState<Feedback | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getRegistrationCatalog());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load registration.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(
    () =>
      new Map(
        (data?.sections ?? []).map((section) => [section.sectionId, section]),
      ),
    [data],
  );
  const sectionsByCourse = useMemo(() => {
    const grouped = new Map<string, RegistrationSection[]>();
    for (const section of data?.sections ?? []) {
      const existing = grouped.get(section.courseId) ?? [];
      existing.push(section);
      grouped.set(section.courseId, existing);
    }
    return grouped;
  }, [data]);
  const recommendations = useMemo(
    () => [...(data?.recommendations ?? [])].sort((a, b) => a.rank - b.rank),
    [data],
  );
  const recommendationByCourse = useMemo(
    () =>
      new Map(
        recommendations.map((recommendation) => [
          recommendation.courseId,
          recommendation,
        ]),
      ),
    [recommendations],
  );
  const recommendedCourseIds = useMemo(
    () =>
      new Set(recommendations.map((recommendation) => recommendation.courseId)),
    [recommendations],
  );
  const cartSet = useMemo(() => new Set(cart), [cart]);
  const planned = useMemo(
    () =>
      cart
        .map((id) => byId.get(id))
        .filter((section): section is RegistrationSection => !!section),
    [byId, cart],
  );
  const plannedCredits = planned.reduce(
    (sum, section) => sum + section.credits,
    0,
  );
  const currentCredits = data?.currentCredits ?? 0;
  const totalCredits = currentCredits + plannedCredits;
  const maxCredits = data?.maxCredits ?? 30;
  const overload = totalCredits > maxCredits;
  const blockedByHold = (data?.holds.length ?? 0) > 0;
  const registrationOpen = data?.registration.open ?? false;

  function clashesWithPlan(section: RegistrationSection): string | null {
    for (const plannedSection of planned) {
      if (
        plannedSection.sectionId === section.sectionId ||
        plannedSection.courseId === section.courseId
      )
        continue;
      if (overlaps(plannedSection, section)) return plannedSection.courseCode;
    }
    return null;
  }

  function reasonForSection(section: RegistrationSection): string | null {
    if (section.blockedReason) return section.blockedReason;
    const clash = clashesWithPlan(section);
    if (clash) return `Time conflict with ${clash}`;
    if (!registrationOpen)
      return closedRegistrationCopy(data?.registration.closedReason ?? null);
    return null;
  }

  const otherSections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.sections ?? []).filter((section) => {
      if (recommendedCourseIds.has(section.courseId)) return false;
      if (section.status !== "open") return false;
      if (!needle) return true;
      return (
        section.courseCode.toLowerCase().includes(needle) ||
        section.title.toLowerCase().includes(needle) ||
        section.sectionCode.toLowerCase().includes(needle) ||
        (section.instructor ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, q, recommendedCourseIds]);

  const readyRecommendations = recommendations.filter(
    (recommendation) =>
      recommendation.readiness === "ready" &&
      recommendation.availability !== "not_offered",
  );
  const attentionRecommendations = recommendations.filter(
    (recommendation) =>
      recommendation.readiness !== "ready" ||
      recommendation.availability === "not_offered",
  );

  function selectedSectionId(
    recommendation: RegistrationRecommendation,
  ): string | null {
    const current = sectionChoices[recommendation.courseId];
    if (current && recommendation.sectionIds.includes(current)) return current;
    return (
      recommendation.availableSectionIds[0] ??
      recommendation.sectionIds[0] ??
      null
    );
  }

  function addSection(sectionId: string) {
    setFeedback(null);
    setCart((current) => addOneSectionPerCourse(current, [sectionId], byId));
  }

  function removeSection(sectionId: string) {
    setCart((current) => current.filter((id) => id !== sectionId));
  }

  function queueRecommendation(
    recommendation: RegistrationRecommendation,
    sectionId: string,
  ) {
    const section = byId.get(sectionId);
    if (!section || recommendation.readiness !== "ready") return;
    const reason = reasonForSection(section);
    const pendingCorequisites = unresolvedCorequisiteClosure(recommendation);
    const plannedCourseCodes = new Set(
      [...planned.map((item) => item.courseCode), section.courseCode].map(
        normalizeCourseCode,
      ),
    );
    const resolvableCorequisiteGate =
      (pendingCorequisites.length > 0 && isCorequisiteGate(reason)) ||
      (!!reason && isResolvableCorequisiteGate(reason, plannedCourseCodes));
    if ((reason && !resolvableCorequisiteGate) || blockedByHold) {
      setOverrideTarget({
        section,
        reason: reason ?? "Registration is blocked by an active hold.",
      });
      setOverrideReason("");
      setOverrideResult(null);
      return;
    }

    if (pendingCorequisites.length === 0) {
      addSection(sectionId);
      return;
    }

    const choices: Record<string, string> = {};
    const intendedCourseCodes = new Set(
      [
        ...planned.map((plannedSection) => plannedSection.courseCode),
        section.courseCode,
        ...pendingCorequisites.map((corequisite) => corequisite.courseCode),
      ].map(normalizeCourseCode),
    );
    for (const corequisite of pendingCorequisites) {
      const choicesForCourse = sectionsByCourse.get(corequisite.courseId) ?? [];
      const available = choicesForCourse.find((candidate) => {
        const candidateReason = reasonForSection(candidate);
        return (
          !candidateReason ||
          isResolvableCorequisiteGate(candidateReason, intendedCourseCodes)
        );
      });
      if (available) choices[corequisite.courseId] = available.sectionId;
    }
    setBundleDialog({ recommendation, dependentSectionId: sectionId, choices });
  }

  function unresolvedCorequisiteClosure(
    root: RegistrationRecommendation,
  ): RegistrationRecommendationCorequisite[] {
    const coveredCourseIds = new Set([
      root.courseId,
      ...planned.map((section) => section.courseId),
    ]);
    const visited = new Set<string>();
    const collected = new Map<string, RegistrationRecommendationCorequisite>();

    function visit(recommendation: RegistrationRecommendation) {
      if (visited.has(recommendation.courseId)) return;
      visited.add(recommendation.courseId);
      for (const corequisite of recommendation.corequisites) {
        if (["satisfied", "enrolled"].includes(corequisite.status)) continue;
        if (!coveredCourseIds.has(corequisite.courseId)) {
          collected.set(corequisite.courseId, corequisite);
        }
        const nested = recommendationByCourse.get(corequisite.courseId);
        if (nested) visit(nested);
      }
    }

    visit(root);
    return [...collected.values()];
  }

  function bundleCorequisites(
    dialog: BundleDialog,
  ): RegistrationRecommendationCorequisite[] {
    return unresolvedCorequisiteClosure(dialog.recommendation);
  }

  function bundleProblem(dialog: BundleDialog): string | null {
    if (blockedByHold)
      return "Resolve the active hold before adding a course bundle.";
    if (!registrationOpen)
      return closedRegistrationCopy(data?.registration.closedReason ?? null);
    const selected: RegistrationSection[] = [];
    const dependent = byId.get(dialog.dependentSectionId);
    if (!dependent)
      return "The selected course section is no longer available.";
    selected.push(dependent);

    for (const corequisite of bundleCorequisites(dialog)) {
      const sectionId = dialog.choices[corequisite.courseId];
      if (!sectionId) return `Choose a section for ${corequisite.courseCode}.`;
      const section = byId.get(sectionId);
      if (!section)
        return `${corequisite.courseCode} is not offered in the registration term.`;
      selected.push(section);
    }

    const selectedCourseCodes = new Set(
      [...planned, ...selected].map((section) =>
        normalizeCourseCode(section.courseCode),
      ),
    );
    for (const section of selected) {
      const reason = reasonForSection(section);
      if (reason && !isResolvableCorequisiteGate(reason, selectedCourseCodes)) {
        const requiredCorequisites = corequisiteGateCourseCodes(reason);
        const missingCodes =
          requiredCorequisites?.filter(
            (courseCode) => !selectedCourseCodes.has(courseCode),
          ) ?? [];
        if (missingCodes.length > 0) {
          return `${section.courseCode} also requires ${missingCodes.join(", ")}. Add ${missingCodes.length === 1 ? "that corequisite" : "those corequisites"} to your plan first, then retry.`;
        }
        return `${section.courseCode}: ${reason}`;
      }
    }

    for (let left = 0; left < selected.length; left += 1) {
      for (let right = left + 1; right < selected.length; right += 1) {
        if (overlaps(selected[left]!, selected[right]!)) {
          return `${selected[left]!.courseCode} conflicts with ${selected[right]!.courseCode}.`;
        }
      }
    }

    const plannedCourseIds = new Set(
      planned.map((section) => section.courseId),
    );
    const newCredits = selected
      .filter((section) => !plannedCourseIds.has(section.courseId))
      .reduce((sum, section) => sum + section.credits, 0);
    if (totalCredits + newCredits > maxCredits) {
      return `This bundle would exceed the ${maxCredits}-credit limit.`;
    }
    return null;
  }

  function addBundle(dialog: BundleDialog) {
    if (bundleProblem(dialog)) return;
    const corequisiteIds = bundleCorequisites(dialog)
      .map((corequisite) => dialog.choices[corequisite.courseId])
      .filter((id): id is string => !!id);
    setCart((current) =>
      addOneSectionPerCourse(
        current,
        [...corequisiteIds, dialog.dependentSectionId],
        byId,
      ),
    );
    setBundleDialog(null);
    setFeedback({
      kind: "info",
      text: "The course and its corequisite sections were added to your registration plan.",
    });
  }

  async function confirm() {
    if (cart.length === 0 || overload || blockedByHold || !registrationOpen)
      return;
    setBusy(true);
    setError(null);
    setFeedback(null);

    const failures: { sectionIds: string[]; message: string }[] = cart
      .filter((sectionId) => !byId.has(sectionId))
      .map((sectionId) => ({
        sectionIds: [sectionId],
        message: `${sectionId}: section is no longer available`,
      }));
    const succeeded: string[] = [];
    const ordered = orderRegistrationPlanSectionIds(
      cart.flatMap((sectionId) => {
        const section = byId.get(sectionId);
        return section
          ? [{ sectionId: section.sectionId, courseId: section.courseId }]
          : [];
      }),
      recommendations.map((recommendation) => ({
        courseId: recommendation.courseId,
        corequisiteCourseIds: recommendation.corequisites.map(
          (corequisite) => corequisite.courseId,
        ),
      })),
    );

    const submissionUnits = connectedCorequisiteUnits(
      ordered,
      byId,
      recommendations,
    );

    for (const sectionIds of submissionUnits) {
      const labels = sectionIds.map(
        (sectionId) => byId.get(sectionId)?.courseCode ?? sectionId,
      );
      try {
        if (sectionIds.length > 1) {
          await enrollSectionBundle(sectionIds);
        } else {
          await enrollSection(sectionIds[0]!);
        }
        succeeded.push(...sectionIds);
      } catch (cause) {
        failures.push({
          sectionIds,
          message: `${labels.join(" + ")}: ${cause instanceof Error ? cause.message : "failed"}`,
        });
      }
    }

    setCart(failures.flatMap((failure) => failure.sectionIds));
    try {
      setData(await getRegistrationCatalog());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh registration.",
      );
    }
    setBusy(false);

    if (failures.length === 0) {
      setFeedback({
        kind: "ok",
        text: `Enrollment confirmed for ${succeeded.length} section${succeeded.length === 1 ? "" : "s"}.`,
      });
    } else {
      setFeedback({
        kind: "err",
        text: `${succeeded.length > 0 ? `${succeeded.length} section${succeeded.length === 1 ? " was" : "s were"} enrolled. ` : ""}${failures.map((failure) => failure.message).join(" · ")} Failed items remain in your plan.`,
      });
    }
  }

  async function submitOverride() {
    if (!overrideTarget || overrideReason.trim().length < 1) return;
    const wordCount = overrideReason.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 50) return;
    setOverrideSubmitting(true);
    setOverrideResult(null);
    try {
      await submitEnrollmentOverride({
        sectionId: overrideTarget.section.sectionId,
        reason: overrideReason,
        requestedWaivers: extractFailedGates(overrideTarget.reason),
      });
      setOverrideResult({
        kind: "ok",
        text: "Override request submitted. Your instructor or registrar will review it.",
      });
      setOverrideReason("");
    } catch (cause) {
      setOverrideResult({
        kind: "err",
        text:
          cause instanceof Error ? cause.message : "Could not submit request.",
      });
    } finally {
      setOverrideSubmitting(false);
    }
  }

  const termName = data?.term?.name ?? "Registration";
  const subtitle = loading
    ? "Loading your registration term and approved academic plan…"
    : data?.registration.open
      ? `${termName} · Select sections and review your complete plan before enrolling.`
      : `${termName} · ${closedRegistrationCopy(data?.registration.closedReason ?? null)}`;

  return (
    <>
      <PageHeader title="Course Registration" subtitle={subtitle} />

      <div aria-live="polite">
        {feedback && <FeedbackBanner feedback={feedback} />}
        {error && <FeedbackBanner feedback={{ kind: "err", text: error }} />}
      </div>

      {data && !data.registration.open && (
        <div className={styles.closedBanner}>
          <Lock size={18} aria-hidden="true" />
          <div>
            <strong>Enrollment is not open.</strong>
            <p>{closedRegistrationCopy(data.registration.closedReason)}</p>
          </div>
        </div>
      )}

      {blockedByHold && (
        <div className={styles.holdBanner}>
          <Lock size={18} aria-hidden="true" />
          <div>
            <strong>Registration is blocked by an active hold.</strong>
            <p>
              {data?.holds.map((hold) => hold.reason ?? hold.type).join(" · ")}{" "}
              — contact the registrar to clear it.
            </p>
          </div>
        </div>
      )}

      <div className={styles.layout}>
        <main className={styles.catalogColumn}>
          {loading && !data ? (
            <div className={styles.loadingCard}>
              Loading your approved plan…
            </div>
          ) : data ? (
            <>
              <RecommendationPanel
                data={data}
                ready={readyRecommendations}
                attention={attentionRecommendations}
                sectionsByCourse={sectionsByCourse}
                selectedSectionId={selectedSectionId}
                onSelectSection={(courseId, sectionId) =>
                  setSectionChoices((current) => ({
                    ...current,
                    [courseId]: sectionId,
                  }))
                }
                cartSet={cartSet}
                blockedByHold={blockedByHold}
                registrationOpen={registrationOpen}
                reasonForSection={reasonForSection}
                onQueue={queueRecommendation}
                onRemove={removeSection}
                onOverride={(section, reason) => {
                  setOverrideTarget({ section, reason });
                  setOverrideReason("");
                  setOverrideResult(null);
                }}
              />

              <section
                className={styles.otherSection}
                aria-labelledby="other-sections-heading"
              >
                <div className={styles.sectionHeading}>
                  <div>
                    <h2 id="other-sections-heading">Other open sections</h2>
                    <p>
                      These courses are offered in {termName}, but they are not
                      part of your current plan recommendations.
                    </p>
                  </div>
                  <SearchInput
                    value={q}
                    onChange={setQ}
                    placeholder="Search code, course, section or instructor…"
                    width="min(100%, 390px)"
                  />
                </div>

                {otherSections.length === 0 ? (
                  <div className={styles.emptyState}>
                    <SearchX size={32} aria-hidden="true" />
                    <p>{otherSectionsEmptyCopy(q, data, termName)}</p>
                  </div>
                ) : (
                  <div className={styles.sectionList}>
                    {otherSections.map((section, index) => {
                      const inCart = cartSet.has(section.sectionId);
                      const reason = inCart ? null : reasonForSection(section);
                      return (
                        <SectionRow
                          key={section.sectionId}
                          section={section}
                          color={
                            COURSE_COLORS[index % COURSE_COLORS.length] ??
                            "var(--daust-navy)"
                          }
                          inCart={inCart}
                          reason={reason}
                          blockedByHold={blockedByHold}
                          registrationOpen={registrationOpen}
                          onAdd={() => addSection(section.sectionId)}
                          onRemove={() => removeSection(section.sectionId)}
                          onOverride={() => {
                            setOverrideTarget({
                              section,
                              reason:
                                reason ??
                                "Registration is blocked by an active hold.",
                            });
                            setOverrideReason("");
                            setOverrideResult(null);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </main>

        <RegistrationPlan
          sections={planned}
          currentCredits={currentCredits}
          plannedCredits={plannedCredits}
          totalCredits={totalCredits}
          maxCredits={maxCredits}
          overload={overload}
          blockedByHold={blockedByHold}
          registrationOpen={registrationOpen}
          busy={busy}
          onRemove={removeSection}
          onConfirm={() => void confirm()}
        />
      </div>

      <CorequisitePickerModal
        dialog={bundleDialog}
        sectionsByCourse={sectionsByCourse}
        byId={byId}
        corequisites={bundleDialog ? bundleCorequisites(bundleDialog) : []}
        problem={bundleDialog ? bundleProblem(bundleDialog) : null}
        cartCourseCodes={planned.map((section) => section.courseCode)}
        onChoice={(courseId, sectionId) =>
          setBundleDialog((current) =>
            current
              ? {
                  ...current,
                  choices: { ...current.choices, [courseId]: sectionId },
                }
              : current,
          )
        }
        onClose={() => setBundleDialog(null)}
        onConfirm={() => bundleDialog && addBundle(bundleDialog)}
      />

      <OverrideRequestModal
        target={overrideTarget}
        reason={overrideReason}
        onReasonChange={setOverrideReason}
        submitting={overrideSubmitting}
        result={overrideResult}
        onClose={() => setOverrideTarget(null)}
        onSubmit={() => void submitOverride()}
      />
    </>
  );
}

function RecommendationPanel({
  data,
  ready,
  attention,
  sectionsByCourse,
  selectedSectionId,
  onSelectSection,
  cartSet,
  blockedByHold,
  registrationOpen,
  reasonForSection,
  onQueue,
  onRemove,
  onOverride,
}: {
  data: RegistrationCatalog;
  ready: RegistrationRecommendation[];
  attention: RegistrationRecommendation[];
  sectionsByCourse: Map<string, RegistrationSection[]>;
  selectedSectionId: (
    recommendation: RegistrationRecommendation,
  ) => string | null;
  onSelectSection: (courseId: string, sectionId: string) => void;
  cartSet: Set<string>;
  blockedByHold: boolean;
  registrationOpen: boolean;
  reasonForSection: (section: RegistrationSection) => string | null;
  onQueue: (
    recommendation: RegistrationRecommendation,
    sectionId: string,
  ) => void;
  onRemove: (sectionId: string) => void;
  onOverride: (section: RegistrationSection, reason: string) => void;
}) {
  const context = data.recommendationContext;
  const contextCopy = recommendationContextCopy(context.status);
  const target =
    context.targetYearIndex && context.semester
      ? `Year ${context.targetYearIndex} · ${context.semester}`
      : (context.semester ?? null);

  return (
    <section
      className={styles.recommendationPanel}
      aria-labelledby="recommendations-heading"
    >
      <div className={styles.recommendationHeader}>
        <div className={styles.recommendationTitle}>
          <span className={styles.recommendationIcon}>
            <Sparkles size={19} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.eyebrow}>
              Director-approved academic catalog
            </span>
            <h2 id="recommendations-heading">Recommended for your plan</h2>
            <p>{contextCopy}</p>
          </div>
        </div>
        {context.status === "ready" && (
          <div className={styles.contextBadges}>
            {target && <Badge tone="navy">{target}</Badge>}
            {context.catalogLabel && (
              <Badge tone="neutral">
                Catalog {context.catalogLabel}
                {context.catalogRevision
                  ? ` · Rev ${context.catalogRevision}`
                  : ""}
              </Badge>
            )}
          </div>
        )}
      </div>

      {context.status === "ready" ? (
        <>
          {ready.length > 0 ? (
            <div className={styles.recommendationList}>
              {ready.map((recommendation) => {
                const sections =
                  sectionsByCourse.get(recommendation.courseId) ?? [];
                return (
                  <RecommendationCourse
                    key={recommendation.courseId}
                    recommendation={recommendation}
                    sections={sections}
                    selectedId={selectedSectionId(recommendation)}
                    onSelect={(sectionId) =>
                      onSelectSection(recommendation.courseId, sectionId)
                    }
                    cartSet={cartSet}
                    blockedByHold={blockedByHold}
                    registrationOpen={registrationOpen}
                    reasonForSection={reasonForSection}
                    onQueue={(sectionId) => onQueue(recommendation, sectionId)}
                    onRemove={onRemove}
                    onOverride={onOverride}
                  />
                );
              })}
            </div>
          ) : (
            <div className={styles.planComplete}>
              <CheckCircle2 size={19} aria-hidden="true" />
              <span>No plan courses are ready to add right now.</span>
            </div>
          )}

          {attention.length > 0 && (
            <div className={styles.attentionArea}>
              <div className={styles.attentionHeading}>
                <AlertTriangle size={17} aria-hidden="true" />
                <div>
                  <h3>Needs attention</h3>
                  <p>
                    These courses remain academically relevant, but cannot be
                    added yet.
                  </p>
                </div>
              </div>
              <div className={styles.attentionList}>
                {attention.map((recommendation) => (
                  <AttentionCourse
                    key={recommendation.courseId}
                    recommendation={recommendation}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.contextState}>
          <Info size={18} aria-hidden="true" />
          <div>
            <strong>{recommendationContextTitle(context.status)}</strong>
            <p>
              {contextCopy} You can still browse all ordinary sections below.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function RecommendationCourse({
  recommendation,
  sections,
  selectedId,
  onSelect,
  cartSet,
  blockedByHold,
  registrationOpen,
  reasonForSection,
  onQueue,
  onRemove,
  onOverride,
}: {
  recommendation: RegistrationRecommendation;
  sections: RegistrationSection[];
  selectedId: string | null;
  onSelect: (sectionId: string) => void;
  cartSet: Set<string>;
  blockedByHold: boolean;
  registrationOpen: boolean;
  reasonForSection: (section: RegistrationSection) => string | null;
  onQueue: (sectionId: string) => void;
  onRemove: (sectionId: string) => void;
  onOverride: (section: RegistrationSection, reason: string) => void;
}) {
  const selected =
    sections.find((section) => section.sectionId === selectedId) ?? null;
  const selectedInCart = !!selected && cartSet.has(selected.sectionId);
  const slot = recommendation.plannedYearIndex
    ? `Year ${recommendation.plannedYearIndex}${recommendation.plannedSemester ? ` · ${recommendation.plannedSemester}` : ""}`
    : recommendation.plannedSemester;

  return (
    <article className={styles.recommendationCourse}>
      <div className={styles.courseSummary}>
        <div>
          <div className={styles.courseTitleRow}>
            <h3>{recommendation.courseCode}</h3>
            <Badge tone={kindTone(recommendation.kind)}>
              {kindLabel(recommendation.kind)}
            </Badge>
            <Badge tone="neutral">{recommendation.credits} cr</Badge>
            {slot && <span className={styles.planSlot}>{slot}</span>}
          </div>
          <p className={styles.courseName}>{recommendation.title}</p>
          <p className={styles.recommendationReason}>{recommendation.reason}</p>
        </div>
        <span className={styles.readyState}>
          <Check size={13} aria-hidden="true" /> Academically ready
        </span>
      </div>

      {(recommendation.prerequisites.length > 0 ||
        recommendation.corequisites.length > 0 ||
        recommendation.unlocks.length > 0) && (
        <div className={styles.requirementStrip}>
          {recommendation.prerequisites.map((prerequisite) => (
            <RequirementPill
              key={prerequisite.courseId}
              label={`${prerequisite.courseCode}${prerequisite.minGrade ? ` · min ${prerequisite.minGrade}` : ""}`}
              status={prerequisite.status}
            />
          ))}
          {recommendation.corequisites.map((corequisite) => (
            <RequirementPill
              key={corequisite.courseId}
              label={`With ${corequisite.courseCode}`}
              status={corequisite.status}
            />
          ))}
          {recommendation.unlocks.length > 0 && (
            <span className={styles.unlocks}>
              <Link2 size={12} aria-hidden="true" /> Unlocks{" "}
              {recommendation.unlocks.join(", ")}
            </span>
          )}
        </div>
      )}

      <fieldset className={styles.sectionChoices}>
        <legend>
          {sections.length > 0
            ? `Choose a section · ${sections.length} option${sections.length === 1 ? "" : "s"}`
            : "No section offered"}
        </legend>
        {sections.length === 0 ? (
          <p className={styles.noSection}>
            The registrar has not scheduled this course for the target term.
          </p>
        ) : (
          sections.map((section) => {
            const checked = selectedId === section.sectionId;
            const inCart = cartSet.has(section.sectionId);
            const reason = inCart ? null : reasonForSection(section);
            const actionReason =
              recommendation.corequisites.some(
                (corequisite) =>
                  !["satisfied", "enrolled"].includes(corequisite.status),
              ) && isCorequisiteGate(reason)
                ? null
                : reason;
            return (
              <div
                key={section.sectionId}
                className={`${styles.sectionChoice} ${checked ? styles.sectionChoiceSelected : ""}`}
              >
                <input
                  id={`recommendation-${recommendation.courseId}-${section.sectionId}`}
                  type="radio"
                  name={`recommendation-${recommendation.courseId}`}
                  checked={checked}
                  onChange={() => onSelect(section.sectionId)}
                />
                <label
                  htmlFor={`recommendation-${recommendation.courseId}-${section.sectionId}`}
                >
                  <strong>§{section.sectionCode}</strong>
                  <span>
                    <Meta icon={<Clock size={12} />} text={section.schedule} />
                    <Meta
                      icon={<MapPin size={12} />}
                      text={section.room ?? "Room TBA"}
                    />
                    <Meta
                      icon={<Users size={12} />}
                      text={`${section.seatsLeft} seat${section.seatsLeft === 1 ? "" : "s"} left`}
                    />
                    <Meta
                      icon={<User size={12} />}
                      text={section.instructor ?? "Staff"}
                    />
                  </span>
                  {reason && <small>{reason}</small>}
                </label>
                {checked && (
                  <SectionAction
                    section={section}
                    inCart={inCart}
                    reason={actionReason}
                    blockedByHold={blockedByHold}
                    registrationOpen={registrationOpen}
                    onAdd={() => onQueue(section.sectionId)}
                    onRemove={() => onRemove(section.sectionId)}
                    onOverride={() =>
                      onOverride(
                        section,
                        actionReason ??
                          "Registration is blocked by an active hold.",
                      )
                    }
                  />
                )}
              </div>
            );
          })
        )}
      </fieldset>
    </article>
  );
}

function AttentionCourse({
  recommendation,
}: {
  recommendation: RegistrationRecommendation;
}) {
  const waiting = recommendation.prerequisites.filter(
    (prerequisite) => prerequisite.status === "in_progress",
  );
  const missing = recommendation.prerequisites.filter(
    (prerequisite) => prerequisite.status === "missing",
  );
  const missingCorequisites = recommendation.corequisites.filter(
    (corequisite) => corequisite.status === "missing",
  );
  const slot = recommendation.plannedYearIndex
    ? `Year ${recommendation.plannedYearIndex}${recommendation.plannedSemester ? ` · ${recommendation.plannedSemester}` : ""}`
    : recommendation.plannedSemester;
  const issues = [
    ...(recommendation.availability === "not_offered"
      ? ["Not offered in the registration term."]
      : []),
    ...waiting.map(
      (prerequisite) =>
        `${prerequisite.courseCode} is in progress; an official passing grade${prerequisite.minGrade ? ` of at least ${prerequisite.minGrade}` : ""} is required.`,
    ),
    ...missing.map(
      (prerequisite) =>
        `Complete ${prerequisite.courseCode}${prerequisite.minGrade ? ` with at least ${prerequisite.minGrade}` : ""} first.`,
    ),
    ...missingCorequisites.map(
      (corequisite) =>
        `Required corequisite ${corequisite.courseCode} is not available in the registration term.`,
    ),
  ];
  if (issues.length === 0) {
    issues.push(
      "A requirement must be resolved before this course can be added.",
    );
  }

  return (
    <article className={styles.attentionCourse}>
      <div>
        <div className={styles.attentionCourseTitle}>
          <strong>{recommendation.courseCode}</strong>
          <span>{recommendation.title}</span>
          <Badge tone="neutral">{recommendation.credits} cr</Badge>
          {slot && <span className={styles.planSlot}>{slot}</span>}
          <Badge
            tone={
              recommendation.readiness === "ready"
                ? "success"
                : recommendation.readiness === "conditional"
                  ? "neutral"
                  : "error"
            }
          >
            {recommendation.readiness === "ready"
              ? "Academically ready"
              : recommendation.readiness === "conditional"
                ? "Grade pending"
                : "Requirements missing"}
          </Badge>
        </div>
        <p>{recommendation.reason}</p>
        <ul className={styles.attentionIssues}>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </div>
      <span className={styles.attentionStatus}>
        {recommendation.availability === "not_offered"
          ? "Not offered"
          : "Add disabled"}
      </span>
    </article>
  );
}

function SectionRow({
  section,
  color,
  inCart,
  reason,
  blockedByHold,
  registrationOpen,
  onAdd,
  onRemove,
  onOverride,
}: {
  section: RegistrationSection;
  color: string;
  inCart: boolean;
  reason: string | null;
  blockedByHold: boolean;
  registrationOpen: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onOverride: () => void;
}) {
  return (
    <article className={styles.sectionRow} style={{ borderLeftColor: color }}>
      <div className={styles.sectionRowBody}>
        <div className={styles.courseTitleRow}>
          <h3>{section.courseCode}</h3>
          <Badge tone="neutral">{section.credits} cr</Badge>
          <span className={styles.sectionCode}>§{section.sectionCode}</span>
          {reason && isConflict(reason) && (
            <Badge tone="error">Time conflict</Badge>
          )}
        </div>
        <p className={styles.courseName}>{section.title}</p>
        <div className={styles.sectionMeta}>
          <Meta
            icon={<User size={12} />}
            text={section.instructor ?? "Staff"}
          />
          <Meta icon={<Clock size={12} />} text={section.schedule} />
          <Meta icon={<MapPin size={12} />} text={section.room ?? "Room TBA"} />
          <Meta
            icon={<Users size={12} />}
            text={`${section.seatsTaken}/${section.capacity} seats`}
          />
        </div>
        {reason && !isConflict(reason) && (
          <p className={styles.blockedReason}>{reason}</p>
        )}
      </div>
      <SectionAction
        section={section}
        inCart={inCart}
        reason={reason}
        blockedByHold={blockedByHold}
        registrationOpen={registrationOpen}
        onAdd={onAdd}
        onRemove={onRemove}
        onOverride={onOverride}
      />
    </article>
  );
}

function SectionAction({
  section,
  inCart,
  reason,
  blockedByHold,
  registrationOpen,
  onAdd,
  onRemove,
  onOverride,
}: {
  section: RegistrationSection;
  inCart: boolean;
  reason: string | null;
  blockedByHold: boolean;
  registrationOpen: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onOverride: () => void;
}) {
  if (inCart) {
    return (
      <button
        className={styles.addedButton}
        onClick={onRemove}
        aria-label={`Remove ${section.courseCode} section ${section.sectionCode} from plan`}
      >
        <Check size={14} aria-hidden="true" /> Added
      </button>
    );
  }
  if (reason || blockedByHold || !registrationOpen) {
    const waiverReason =
      reason ??
      (blockedByHold
        ? "Registration is blocked by an active hold."
        : "The add period is closed.");
    if (extractFailedGates(waiverReason).length === 0) {
      return (
        <button className={styles.unavailableButton} disabled>
          Unavailable
        </button>
      );
    }
    return (
      <button className={styles.overrideButton} onClick={onOverride}>
        Request override
      </button>
    );
  }
  return (
    <button className={styles.addButton} onClick={onAdd}>
      + Add
    </button>
  );
}

function RegistrationPlan({
  sections,
  currentCredits,
  plannedCredits,
  totalCredits,
  maxCredits,
  overload,
  blockedByHold,
  registrationOpen,
  busy,
  onRemove,
  onConfirm,
}: {
  sections: RegistrationSection[];
  currentCredits: number;
  plannedCredits: number;
  totalCredits: number;
  maxCredits: number;
  overload: boolean;
  blockedByHold: boolean;
  registrationOpen: boolean;
  busy: boolean;
  onRemove: (sectionId: string) => void;
  onConfirm: () => void;
}) {
  return (
    <aside className={styles.planColumn} aria-label="Registration plan">
      <Card
        title={
          <div className={styles.planTitle}>
            <ClipboardList size={18} aria-hidden="true" />
            <h2>Registration plan</h2>
          </div>
        }
      >
        <p className={styles.planCount}>
          {sections.length} section{sections.length === 1 ? "" : "s"} selected
        </p>

        {sections.length === 0 ? (
          <div className={styles.emptyPlan}>
            <BookOpenCheck size={23} aria-hidden="true" />
            <span>Choose a section to build your plan.</span>
          </div>
        ) : (
          <div className={styles.plannedList}>
            {sections.map((section) => (
              <div key={section.sectionId} className={styles.plannedCourse}>
                <div>
                  <strong>{section.courseCode}</strong>
                  <span>
                    §{section.sectionCode} · {section.schedule}
                  </span>
                </div>
                <button
                  onClick={() => onRemove(section.sectionId)}
                  aria-label={`Remove ${section.courseCode} section ${section.sectionCode}`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.creditSummary}>
          <SummaryRow label="Current credits" value={`${currentCredits} cr`} />
          <SummaryRow label="Planned" value={`${plannedCredits} cr`} />
          <SummaryRow
            label="Total"
            value={`${totalCredits} cr`}
            tone={overload ? "var(--error-500)" : undefined}
            bold
          />
        </div>

        <Button
          variant="primary"
          full
          onClick={onConfirm}
          disabled={
            busy ||
            sections.length === 0 ||
            overload ||
            blockedByHold ||
            !registrationOpen
          }
        >
          {busy
            ? "Enrolling…"
            : `Enroll in ${sections.length} section${sections.length === 1 ? "" : "s"}`}
        </Button>

        <div className={styles.planGuidance}>
          {overload && (
            <p className={styles.errorText}>
              <Info size={12} aria-hidden="true" /> Over the {maxCredits}-credit
              ceiling.
            </p>
          )}
          {blockedByHold && (
            <p className={styles.errorText}>
              <Lock size={12} aria-hidden="true" /> Resolve holds before
              enrolling.
            </p>
          )}
          {!registrationOpen && (
            <p className={styles.errorText}>
              <Lock size={12} aria-hidden="true" /> Enrollment is not open.
            </p>
          )}
          <p>
            <Info size={12} aria-hidden="true" /> Maximum load: {maxCredits}{" "}
            credits per term
          </p>
        </div>
      </Card>
    </aside>
  );
}

function CorequisitePickerModal({
  dialog,
  sectionsByCourse,
  byId,
  corequisites,
  cartCourseCodes,
  problem,
  onChoice,
  onClose,
  onConfirm,
}: {
  dialog: BundleDialog | null;
  sectionsByCourse: Map<string, RegistrationSection[]>;
  byId: Map<string, RegistrationSection>;
  corequisites: RegistrationRecommendationCorequisite[];
  cartCourseCodes: string[];
  problem: string | null;
  onChoice: (courseId: string, sectionId: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dependent = dialog ? byId.get(dialog.dependentSectionId) : null;
  const intendedCourseCodes = new Set(
    [
      ...cartCourseCodes,
      ...(dependent ? [dependent.courseCode] : []),
      ...corequisites.map((corequisite) => corequisite.courseCode),
    ].map(normalizeCourseCode),
  );
  return (
    <Modal
      open={!!dialog}
      onClose={onClose}
      title="Choose corequisite sections"
      width={620}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={!!problem}>
            Add bundle to plan
          </Button>
        </>
      }
    >
      {dialog && dependent && (
        <div className={styles.bundleModal}>
          <div className={styles.bundleIntro}>
            <GraduationCap size={20} aria-hidden="true" />
            <div>
              <strong>
                {dialog.recommendation.courseCode} has a corequisite.
              </strong>
              <p>
                Select every required section. The corequisite will be enrolled
                together in one transaction when you confirm your plan.
              </p>
            </div>
          </div>

          <div className={styles.bundleDependent}>
            <span>Course section</span>
            <strong>
              {dependent.courseCode} §{dependent.sectionCode}
            </strong>
            <small>{dependent.schedule}</small>
          </div>

          {corequisites.map((corequisite) => {
            const sections = sectionsByCourse.get(corequisite.courseId) ?? [];
            return (
              <label key={corequisite.courseId} className={styles.bundleField}>
                <span>
                  {corequisite.courseCode}{" "}
                  <Badge tone="navy">Corequisite</Badge>
                </span>
                <select
                  value={dialog.choices[corequisite.courseId] ?? ""}
                  onChange={(event) =>
                    onChoice(corequisite.courseId, event.target.value)
                  }
                >
                  <option value="">Choose a section</option>
                  {sections.map((section) => (
                    <option
                      key={section.sectionId}
                      value={section.sectionId}
                      disabled={
                        !!section.blockedReason &&
                        !isResolvableCorequisiteGate(
                          section.blockedReason,
                          intendedCourseCodes,
                        )
                      }
                    >
                      §{section.sectionCode} · {section.schedule} ·{" "}
                      {section.seatsLeft} seats
                      {section.blockedReason
                        ? ` · ${section.blockedReason}`
                        : ""}
                    </option>
                  ))}
                </select>
                {sections.length === 0 && (
                  <small>
                    No section is offered for this corequisite in the target
                    term.
                  </small>
                )}
              </label>
            );
          })}

          {problem && (
            <div className={styles.bundleProblem} role="alert">
              <AlertTriangle size={15} aria-hidden="true" /> {problem}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function RequirementPill({
  label,
  status,
}: {
  label: string;
  status: "satisfied" | "in_progress" | "missing" | "enrolled" | "recommended";
}) {
  const tone =
    status === "satisfied" || status === "enrolled"
      ? "success"
      : status === "in_progress" || status === "recommended"
        ? "info"
        : "warning";
  const suffix =
    status === "in_progress"
      ? "in progress"
      : status === "recommended"
        ? "add together"
        : status;
  return (
    <Badge tone={tone}>
      {label} · {suffix.replace("_", " ")}
    </Badge>
  );
}

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  const Icon =
    feedback.kind === "ok"
      ? CheckCircle2
      : feedback.kind === "err"
        ? AlertTriangle
        : Info;
  return (
    <div
      className={`${styles.feedback} ${styles[`feedback_${feedback.kind}`]}`}
    >
      <Icon size={17} aria-hidden="true" />
      <span>{feedback.text}</span>
    </div>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className={styles.meta}>
      {icon}
      {text}
    </span>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: string;
  bold?: boolean;
}) {
  return (
    <div className={styles.summaryRow}>
      <span>{label}</span>
      <strong style={{ color: tone, fontWeight: bold ? 700 : 500 }}>
        {value}
      </strong>
    </div>
  );
}

function kindLabel(kind: RegistrationRecommendation["kind"]): string {
  if (kind === "catch_up") return "Catch-up";
  if (kind === "prerequisite") return "Prerequisite";
  return "Scheduled";
}

function kindTone(
  kind: RegistrationRecommendation["kind"],
): "navy" | "info" | "neutral" {
  if (kind === "catch_up") return "neutral";
  if (kind === "prerequisite") return "info";
  return "navy";
}

function recommendationContextTitle(status: RecommendationStatus): string {
  const titles: Record<RecommendationStatus, string> = {
    disabled: "Plan recommendations are turned off",
    ready: "Plan recommendations are ready",
    missing_program: "Your program is not assigned",
    missing_catalog_year: "Your catalog year is not assigned",
    missing_approved_catalog: "No approved catalog is available",
    missing_curriculum: "The approved catalog has no course sequence",
    unmapped_term: "The registration term is not mapped to a semester",
    missing_plan_position: "Your position in the plan could not be determined",
  };
  return titles[status];
}

function recommendationContextCopy(status: RecommendationStatus): string {
  const copy: Record<RecommendationStatus, string> = {
    disabled:
      "The registrar has left plan recommendations disabled for this registration period.",
    ready:
      "Based on your approved program sequence, official results, and the designated registration term.",
    missing_program:
      "Ask the registrar to assign your official program before plan recommendations can be calculated.",
    missing_catalog_year:
      "Ask the registrar to assign your catalog year before plan recommendations can be calculated.",
    missing_approved_catalog:
      "Your assigned academic year does not yet have a director-approved catalog revision.",
    missing_curriculum:
      "Your program does not yet have an approved course sequence in the assigned catalog.",
    unmapped_term:
      "The registrar must map the registration term to Fall, Spring, or Summer.",
    missing_plan_position:
      "Your year level and catalog chronology do not identify an applicable plan slot. Ask the registrar to review your placement.",
  };
  return copy[status];
}

function closedRegistrationCopy(
  reason: RegistrationCatalog["registration"]["closedReason"],
): string {
  if (reason === "closed_by_registrar")
    return "The registrar has closed student registration.";
  if (reason === "configuration_invalid")
    return "The registration term configuration needs registrar attention.";
  if (reason === "no_term_available")
    return "The registrar has not designated a registration term.";
  if (reason === "term_ended") return "This term has ended.";
  if (reason === "add_deadline_passed") return "The add deadline has passed.";
  return "Enrollment is not open for this term.";
}

function otherSectionsEmptyCopy(
  query: string,
  data: RegistrationCatalog,
  termName: string,
): string {
  const normalizedQuery = query.trim();
  if (normalizedQuery) return `No other sections match “${normalizedQuery}”.`;
  if (!data.term) {
    return "No registration term is designated, so there are no sections to browse.";
  }
  if (!data.registration.open) {
    return `${closedRegistrationCopy(data.registration.closedReason)} No open sections are available to add.`;
  }
  if (data.sections.length === 0) {
    return `No open sections are scheduled for ${termName}.`;
  }
  return "Every open section is already represented in your recommendations.";
}

function isCorequisiteGate(reason: string | null): boolean {
  return !!reason && /corequisite|taken with|taken together/i.test(reason);
}

function normalizeCourseCode(code: string): string {
  return code.normalize("NFKC").trim().toLocaleUpperCase();
}

function isResolvableCorequisiteGate(
  reason: string,
  selectedCourseCodes: Set<string>,
): boolean {
  const requiredCodes = corequisiteGateCourseCodes(reason);
  return (
    requiredCodes !== null &&
    requiredCodes.every((courseCode) => selectedCourseCodes.has(courseCode))
  );
}

function corequisiteGateCourseCodes(reason: string): string[] | null {
  const match = reason.match(/^Must be taken with \(or after\) (.+)$/i);
  if (!match?.[1]) return null;
  const requiredCodes = match[1]
    .split(",")
    .map(normalizeCourseCode)
    .filter(Boolean);
  return requiredCodes.length > 0 ? requiredCodes : null;
}

function connectedCorequisiteUnits(
  orderedSectionIds: string[],
  sectionsById: Map<string, RegistrationSection>,
  recommendations: RegistrationRecommendation[],
): string[][] {
  const order = new Map(
    orderedSectionIds.map((sectionId, index) => [sectionId, index]),
  );
  const firstSectionByCourse = new Map<string, string>();
  const adjacent = new Map<string, Set<string>>();

  for (const sectionId of orderedSectionIds) {
    const section = sectionsById.get(sectionId);
    if (!section) continue;
    if (!firstSectionByCourse.has(section.courseId)) {
      firstSectionByCourse.set(section.courseId, sectionId);
    }
    adjacent.set(sectionId, new Set());
  }

  for (const recommendation of recommendations) {
    const dependentId = firstSectionByCourse.get(recommendation.courseId);
    if (!dependentId) continue;
    for (const corequisite of recommendation.corequisites) {
      if (["satisfied", "enrolled"].includes(corequisite.status)) continue;
      const corequisiteId = firstSectionByCourse.get(corequisite.courseId);
      if (!corequisiteId || corequisiteId === dependentId) continue;
      adjacent.get(dependentId)?.add(corequisiteId);
      adjacent.get(corequisiteId)?.add(dependentId);
    }
  }

  const visited = new Set<string>();
  const units: string[][] = [];
  for (const sectionId of orderedSectionIds) {
    if (visited.has(sectionId)) continue;
    const pending = [sectionId];
    const unit: string[] = [];
    visited.add(sectionId);
    while (pending.length > 0) {
      const current = pending.shift()!;
      unit.push(current);
      const neighbors = [...(adjacent.get(current) ?? [])].sort(
        (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
      );
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    units.push(
      unit.sort(
        (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
      ),
    );
  }
  return units;
}

function addOneSectionPerCourse(
  current: string[],
  additions: string[],
  byId: Map<string, RegistrationSection>,
): string[] {
  const addedCourseIds = new Set(
    additions
      .map((sectionId) => byId.get(sectionId)?.courseId)
      .filter((courseId): courseId is string => !!courseId),
  );
  const uniqueAdditions: string[] = [];
  const seenAddedCourses = new Set<string>();
  for (const sectionId of additions) {
    const courseId = byId.get(sectionId)?.courseId;
    if (!courseId || seenAddedCourses.has(courseId)) continue;
    seenAddedCourses.add(courseId);
    uniqueAdditions.push(sectionId);
  }
  return [
    ...current.filter((sectionId) => {
      const courseId = byId.get(sectionId)?.courseId;
      return !courseId || !addedCourseIds.has(courseId);
    }),
    ...uniqueAdditions,
  ];
}

/** Mirrors the server clash rule so the cart can self-check before submission. */
function overlaps(a: RegistrationSection, b: RegistrationSection): boolean {
  const aDays = parseDayIndexes(a.days);
  const bDays = parseDayIndexes(b.days);
  if (!aDays.some((day) => bDays.includes(day))) return false;
  const [aStart, aEnd, bStart, bEnd] = [
    hourFloat(a.startTime),
    hourFloat(a.endTime),
    hourFloat(b.startTime),
    hourFloat(b.endTime),
  ];
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart < bEnd && bStart < aEnd;
}

/** Translate preview copy into the structured waiver set requested from the registrar. */
function extractFailedGates(reason: string): EnrollmentOverrideGate[] {
  const out: EnrollmentOverrideGate[] = [];
  const normalized = reason.toLowerCase();
  if (/prereq|prerequisite|needs/.test(normalized)) out.push("prerequisite");
  if (/coreq|corequisite|taken with/.test(normalized)) out.push("corequisite");
  if (/full|capacity|seat/.test(normalized)) out.push("capacity");
  if (/hold/.test(normalized)) out.push("holds");
  if (/\bcredit\b/.test(normalized)) out.push("credit_cap");
  if (/standing|level/.test(normalized)) out.push("standing");
  if (/major|program|restricted/.test(normalized))
    out.push("major_restriction");
  if (/installment|verified|payment|record.?status/.test(normalized))
    out.push("record_status");
  if (/add (?:deadline|period)|registration window/.test(normalized)) {
    out.push("add_deadline");
  }
  return out;
}

function OverrideRequestModal({
  target,
  reason,
  onReasonChange,
  submitting,
  result,
  onClose,
  onSubmit,
}: {
  target: OverrideTarget | null;
  reason: string;
  onReasonChange: (value: string) => void;
  submitting: boolean;
  result: Feedback | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const wordCount = reason.trim().split(/\s+/).filter(Boolean).length;
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Request enrollment override"
    >
      {target && (
        <div className={styles.overrideModal}>
          <div>
            <strong>
              {target.section.courseCode} — {target.section.title}
            </strong>
            <p>
              §{target.section.sectionCode} · {target.section.schedule}
            </p>
            <div className={styles.overrideBlocker}>
              <strong>Why enrollment is blocked:</strong> {target.reason}
            </div>
          </div>
          <label>
            <span>Reason for your instructor (max 50 words)</span>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              rows={4}
              maxLength={500}
            />
            <small className={wordCount > 50 ? styles.errorText : ""}>
              {wordCount} / 50 words
            </small>
          </label>
          {result && <FeedbackBanner feedback={result} />}
          <div className={styles.modalActions}>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="navy"
              onClick={onSubmit}
              disabled={submitting || wordCount === 0 || wordCount > 50}
            >
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
