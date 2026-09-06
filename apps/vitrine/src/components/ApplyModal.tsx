"use client";

import { useEffect, useMemo, useState } from "react";
import { COUNTRIES, referralDetailKind } from "@mydaust/shared";
import { Icon } from "./icons";
import {
  feePiSpi,
  feePiSpiStatus,
  getPrograms,
  piSpiEnabled as loadPiSpiEnabled,
  type PiSpiRequest,
  submitApplication,
  verifyPiSpiAlias,
} from "@/lib/api";
import type { ApplyResult } from "@/lib/api";
import type { Content, Lang } from "@/lib/content";

const PROGRAMS: { code: string; en: string; fr: string }[] = [
  { code: "BSCS", en: "Computer Science", fr: "Informatique" },
  { code: "BSME", en: "Mechanical Engineering", fr: "Génie mécanique" },
  { code: "BSEE", en: "Electrical Engineering", fr: "Génie électrique" },
  { code: "BSCHE", en: "Chemical Engineering", fr: "Génie chimique" },
  {
    code: "IEP",
    en: "Intensive English Program",
    fr: "Programme d’anglais intensif",
  },
];
const TERMS = ["Fall 2026"];

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "12px 14px",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  outline: "none",
};
const labelSt: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "var(--fg2)",
  display: "block",
  marginBottom: 6,
};

interface FormState {
  programCode: string;
  term: string;
  origin: "" | "high-school" | "transfer";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  city: string;
  country: string;
  score: string;
  school: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  allergies: string;
  source: string;
  sourceDetail: string;
}

const EMPTY: FormState = {
  programCode: "",
  term: "",
  origin: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  gender: "",
  nationality: "",
  city: "",
  country: "",
  score: "",
  school: "",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  allergies: "",
  source: "",
  sourceDetail: "",
};

export function ApplyModal({
  tx,
  lang,
  onClose,
  onOpenAI,
}: {
  tx: Content["tx"];
  lang: Lang;
  onClose: () => void;
  onOpenAI: () => void;
}) {
  const fr = lang === "fr";
  const t = (en: string, frr: string) => (fr ? frr : en);

  const [f, setF] = useState<FormState>(EMPTY);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [feeBusy, setFeeBusy] = useState(false);
  const [feeNote, setFeeNote] = useState<string | null>(null);
  // Instant payment (PI-SPI): a request pushed to the applicant's own bank app.
  const [piOn, setPiOn] = useState(false);
  const [piOpen, setPiOpen] = useState(false);
  const [piAlias, setPiAlias] = useState("");
  const [piPayer, setPiPayer] = useState<string | null>(null);
  const [piReq, setPiReq] = useState<PiSpiRequest | null>(null);
  const [piBusy, setPiBusy] = useState<"verify" | "send" | null>(null);
  const [piErr, setPiErr] = useState<string | null>(null);
  // Programs come from the real SIS so a choice always resolves; static list is the offline fallback.
  const [programList, setProgramList] = useState<
    { code: string; label: string }[]
  >(PROGRAMS.map((p) => ({ code: p.code, label: fr ? p.fr : p.en })));
  useEffect(() => {
    getPrograms().then((real) => {
      if (real)
        setProgramList(real.map((p) => ({ code: p.code, label: p.name })));
    });
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const genderOpts = [
    { value: "Female", label: t("Female", "Femme") },
    { value: "Male", label: t("Male", "Homme") },
  ];
  const sourceOpts = [
    t("Website", "Site web"),
    t("Social media", "Réseaux sociaux"),
    t("School counselor", "Conseiller scolaire"),
    t("Alumni referral", "Recommandation d’un ancien"),
    t("DAUST open day", "Journée portes ouvertes DAUST"),
    t("Friend / family", "Ami / famille"),
    t("Other", "Autre"),
  ];

  const steps = useMemo(
    () => [
      t("Program", "Programme"),
      t("Personal", "Personnel"),
      t("Academic", "Parcours"),
      t("Guardian", "Tuteur"),
      t("Details", "Détails"),
      t("Review", "Récapitulatif"),
    ],
    [fr],
  );

  const schoolLabel =
    f.origin === "transfer"
      ? t("Previous university", "Université précédente")
      : t("High school name", "Nom du lycée");

  const detailKind = referralDetailKind(
    f.source.trim() === "" ? null : f.source,
  );
  const phoneOk = (v: string) =>
    v.trim() === "" || /^\+\d[\d\s\-.()]{5,38}$/.test(v.trim());
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
  };

  function next() {
    setErr(null);
    if (
      step === 1 &&
      (!f.firstName.trim() || !f.lastName.trim() || !f.email.trim())
    ) {
      setErr(
        t(
          "First name, last name and email are required.",
          "Prénom, nom et e-mail sont obligatoires.",
        ),
      );
      return;
    }
    if (step === 1 && (!phoneOk(f.phone) || !phoneOk(f.parentPhone))) {
      // Parent phone lives on step 3, but both share the rule — surface it early.
      if (!phoneOk(f.phone)) {
        setErr(
          t(
            "Phone must include the country code, e.g. +221 77 123 45 67.",
            "Le téléphone doit inclure l’indicatif pays, ex. +221 77 123 45 67.",
          ),
        );
        return;
      }
    }
    if (step === 1 && f.dateOfBirth !== "" && f.dateOfBirth > todayKey()) {
      setErr(
        t(
          "Date of birth cannot be in the future.",
          "La date de naissance ne peut pas être dans le futur.",
        ),
      );
      return;
    }
    if (
      step === 4 &&
      (detailKind === "person" || detailKind === "online") &&
      f.sourceDetail.trim() === ""
    ) {
      setErr(
        detailKind === "person"
          ? t(
              "Please give the name of the person who referred you.",
              "Veuillez donner le nom de la personne qui vous a recommandé.",
            )
          : t(
              "Please tell us which site or page led you to DAUST.",
              "Veuillez indiquer quel site ou page vous a mené à DAUST.",
            ),
      );
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }
  function back() {
    setErr(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setErr(null);
    if (!f.firstName.trim() || !f.lastName.trim() || !f.email.trim()) {
      setErr(
        t(
          "First name, last name and email are required.",
          "Prénom, nom et e-mail sont obligatoires.",
        ),
      );
      setStep(1);
      return;
    }
    setBusy(true);
    const nn = (v: string) => (v.trim() === "" ? undefined : v.trim());
    const em = (v: string) =>
      v.trim() === "" ? undefined : v.trim().toLowerCase();
    if (
      (detailKind === "person" || detailKind === "online") &&
      f.sourceDetail.trim() === ""
    ) {
      setErr(
        detailKind === "person"
          ? t(
              "Please give the name of the person who referred you.",
              "Veuillez donner le nom de la personne qui vous a recommandé.",
            )
          : t(
              "Please tell us which site or page led you to DAUST.",
              "Veuillez indiquer quel site ou page vous a mené à DAUST.",
            ),
      );
      setStep(4);
      setBusy(false);
      return;
    }
    try {
      const res = await submitApplication({
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        email: f.email.trim().toLowerCase(),
        track: f.origin === "transfer" ? "transfer" : "first-year",
        programCode: nn(f.programCode),
        term: nn(f.term) as "Fall 2026" | undefined,
        origin: f.origin === "" ? undefined : f.origin,
        phone: nn(f.phone),
        dateOfBirth: nn(f.dateOfBirth),
        gender: nn(f.gender) as
          "Male" | "Female" | "Homme" | "Femme" | undefined,
        nationality: nn(f.nationality),
        city: nn(f.city),
        country: nn(f.country),
        score: f.score.trim() === "" ? undefined : Number(f.score),
        school: nn(f.school),
        parentName: nn(f.parentName),
        parentPhone: nn(f.parentPhone),
        parentEmail: em(f.parentEmail),
        allergies: nn(f.allergies),
        source: nn(f.source),
        sourceDetail: nn(f.sourceDetail),
      });
      setResult(res);
    } catch (e) {
      const msg = (e as Error).message;
      setErr(
        msg.includes("400")
          ? t(
              "Please check your details and try again.",
              "Veuillez vérifier vos informations et réessayer.",
            )
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadPiSpiEnabled()
      .then(setPiOn)
      .catch(() => setPiOn(false));
  }, []);

  // Poll while the applicant approves the request in their banking app.
  useEffect(() => {
    if (!result || !piReq) return;
    if (piReq.status !== "sent" && piReq.status !== "initiated") return;
    const id = setInterval(() => {
      feePiSpiStatus(result.id, piReq.txId)
        .then(setPiReq)
        .catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [result, piReq]);

  async function verifyAlias() {
    const value = piAlias.trim();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      setPiErr(
        t(
          "That does not look like a PI alias.",
          "Cet alias PI semble invalide.",
        ),
      );
      return;
    }
    setPiBusy("verify");
    setPiErr(null);
    try {
      setPiPayer((await verifyPiSpiAlias(value)).name);
    } catch {
      setPiPayer(null);
      setPiErr(t("We could not find that alias.", "Alias introuvable."));
    } finally {
      setPiBusy(null);
    }
  }

  async function sendPiRequest() {
    if (!result) return;
    setPiBusy("send");
    setPiErr(null);
    try {
      setPiReq(await feePiSpi(result.id, piAlias.trim()));
    } catch {
      setPiErr(t("Could not send the request.", "Envoi impossible."));
    } finally {
      setPiBusy(null);
    }
  }

  async function payFee() {
    if (!result) return;
    window.location.href = `/admissions/payment/?id=${encodeURIComponent(result.id)}`;
  }

  const ghostBtn: React.CSSProperties = {
    fontFamily: "var(--font-body)",
    fontWeight: 700,
    fontSize: 12.5,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    border: "1.5px solid var(--border)",
    borderRadius: 4,
    padding: "13px 24px",
    background: "#fff",
    color: "var(--daust-navy)",
    cursor: "pointer",
  };
  const solidBtn: React.CSSProperties = {
    fontFamily: "var(--font-body)",
    fontWeight: 700,
    fontSize: 12.5,
    letterSpacing: ".05em",
    textTransform: "uppercase",
    border: "none",
    borderRadius: 4,
    padding: "13px 28px",
    background: "var(--daust-orange)",
    color: "#fff",
    cursor: "pointer",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(15,44,80,.55)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: "0 30px 70px rgba(15,44,80,.4)",
          animation: "daustPop .2s cubic-bezier(.2,.7,.3,1) both",
        }}
      >
        {/* header */}
        <div
          style={{
            background: "var(--daust-navy)",
            padding: "22px 28px",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--daust-orange)",
            }}
          >
            {tx.applyKicker}
          </span>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 23,
              color: "#fff",
              margin: "8px 0 0",
            }}
          >
            {tx.applyTitle}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              right: 18,
              top: 18,
              width: 34,
              height: 34,
              borderRadius: 3,
              background: "rgba(255,255,255,.12)",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {result ? (
          <div
            style={{
              padding: "44px 28px",
              textAlign: "center",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                width: 66,
                height: 66,
                borderRadius: 3,
                background: "rgba(46,125,82,.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
              }}
            >
              <Icon name="check" size={34} color="#2e7d52" />
            </div>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 22,
                color: "var(--fg1)",
                margin: "20px 0 0",
              }}
            >
              {tx.thankTitle}
            </h3>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 15,
                lineHeight: 1.6,
                color: "var(--fg2)",
                margin: "10px auto 0",
                maxWidth: 400,
              }}
            >
              {tx.thankBody}
            </p>
            {feeNote && (
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  color: "var(--fg2)",
                  margin: "16px auto 0",
                  maxWidth: 400,
                }}
              >
                {feeNote}
              </p>
            )}
            {piReq && piReq.status === "settled" ? (
              <div
                style={{
                  margin: "20px auto 0",
                  maxWidth: 420,
                  background: "rgba(46,125,82,.10)",
                  border: "1px solid rgba(46,125,82,.35)",
                  borderRadius: 6,
                  padding: "14px 16px",
                  fontFamily: "var(--font-body)",
                  fontSize: 13.5,
                  color: "#1d6b34",
                }}
              >
                <strong>
                  {t("Application fee received", "Frais de dossier reçus")}
                </strong>
                <div style={{ marginTop: 4 }}>
                  {t(
                    "Thank you. Your payment has been recorded.",
                    "Merci. Votre paiement a été enregistré.",
                  )}
                </div>
              </div>
            ) : piReq &&
              (piReq.status === "sent" || piReq.status === "initiated") ? (
              <div
                style={{
                  margin: "20px auto 0",
                  maxWidth: 420,
                  background: "#fff7e8",
                  border: "1px solid #f1d3a7",
                  borderRadius: 6,
                  padding: "14px 16px",
                  fontFamily: "var(--font-body)",
                  fontSize: 13.5,
                  color: "#8a5319",
                }}
              >
                <strong>
                  {t(
                    "Waiting for your approval",
                    "En attente de votre validation",
                  )}
                </strong>
                <div style={{ marginTop: 4, lineHeight: 1.5 }}>
                  {t(
                    "Open your banking app and approve the request. This page updates by itself.",
                    "Ouvrez votre application bancaire et validez la demande. Cette page se met à jour automatiquement.",
                  )}
                </div>
              </div>
            ) : piOpen ? (
              <div
                style={{
                  margin: "20px auto 0",
                  maxWidth: 420,
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "16px",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 700,
                    fontSize: 13.5,
                    color: "var(--fg1)",
                  }}
                >
                  {t("Instant payment", "Paiement instantané")}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12.5,
                    color: "var(--fg2)",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {t(
                    "Enter your PI alias. We send a request you approve in your own bank app.",
                    "Saisissez votre alias PI. Nous envoyons une demande que vous validez dans votre application bancaire.",
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    value={piAlias}
                    onChange={(e) => {
                      setPiAlias(e.target.value);
                      setPiPayer(null);
                    }}
                    placeholder="550e8400-e29b-41d4-a716-446655440000"
                    spellCheck={false}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "9px 11px",
                      border: "1.5px solid var(--border)",
                      borderRadius: 4,
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 12.5,
                    }}
                  />
                  <button
                    onClick={verifyAlias}
                    disabled={piBusy !== null}
                    style={{
                      ...ghostBtn,
                      padding: "9px 16px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {piBusy === "verify" ? "…" : t("Verify", "Vérifier")}
                  </button>
                </div>
                {piPayer && (
                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      color: "#1d6b34",
                    }}
                  >
                    ✓ <strong>{piPayer}</strong>
                  </div>
                )}
                {piErr && (
                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: "var(--font-body)",
                      fontSize: 12.5,
                      color: "#b3261e",
                    }}
                  >
                    {piErr}
                  </div>
                )}
                <button
                  onClick={sendPiRequest}
                  disabled={!piPayer || piBusy !== null}
                  style={{
                    ...solidBtn,
                    width: "100%",
                    marginTop: 12,
                    opacity: piPayer && piBusy === null ? 1 : 0.55,
                    cursor: piPayer ? "pointer" : "not-allowed",
                  }}
                >
                  {piBusy === "send"
                    ? "…"
                    : t("Send payment request", "Envoyer la demande")}
                </button>
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                flexWrap: "wrap",
                marginTop: 26,
              }}
            >
              {!piReq && (
                <button
                  onClick={payFee}
                  disabled={feeBusy}
                  style={{ ...solidBtn, opacity: feeBusy ? 0.7 : 1 }}
                >
                  {feeBusy
                    ? "…"
                    : t(
                        "Pay application fee (30,000 FCFA)",
                        "Payer les frais (30 000 FCFA)",
                      )}
                </button>
              )}
              {piOn && !piOpen && !piReq && (
                <button onClick={() => setPiOpen(true)} style={ghostBtn}>
                  {t("Pay instantly (PI-SPI)", "Payer instantanément (PI-SPI)")}
                </button>
              )}
              <button onClick={onClose} style={ghostBtn}>
                {tx.done}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* stepper */}
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "16px 28px 0",
                flexShrink: 0,
              }}
            >
              {steps.map((s, i) => (
                <div
                  key={s}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background:
                        i <= step ? "var(--daust-orange)" : "var(--border)",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: ".04em",
                      textTransform: "uppercase",
                      color: i === step ? "var(--daust-navy)" : "var(--fg3)",
                    }}
                  >
                    {s}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ padding: "22px 28px", overflowY: "auto", flex: 1 }}>
              {step === 0 && (
                <Grid>
                  <F label={t("Program of choice", "Programme choisi")}>
                    <select
                      value={f.programCode}
                      onChange={(e) => set("programCode", e.target.value)}
                      style={{ ...field, background: "#fff" }}
                    >
                      <option value="">
                        {t("Select a program", "Choisir un programme")}
                      </option>
                      {programList.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </F>
                  <Row>
                    <F label={t("Intake term", "Session d’entrée")}>
                      <select
                        value={f.term}
                        onChange={(e) => set("term", e.target.value)}
                        style={{ ...field, background: "#fff" }}
                      >
                        <option value=""></option>
                        {TERMS.map((tm) => (
                          <option key={tm} value={tm}>
                            {tm}
                          </option>
                        ))}
                      </select>
                    </F>
                    <F label={t("Applying from", "Vous candidatez depuis")}>
                      <select
                        value={f.origin}
                        onChange={(e) =>
                          set("origin", e.target.value as FormState["origin"])
                        }
                        style={{ ...field, background: "#fff" }}
                      >
                        <option value=""></option>
                        <option value="high-school">
                          {t("High school", "Lycée")}
                        </option>
                        <option value="transfer">
                          {t("University transfer", "Transfert universitaire")}
                        </option>
                      </select>
                    </F>
                  </Row>
                </Grid>
              )}

              {step === 1 && (
                <Grid>
                  <Row>
                    <F label={t("First name*", "Prénom*")}>
                      <input
                        value={f.firstName}
                        onChange={(e) => set("firstName", e.target.value)}
                        style={field}
                      />
                    </F>
                    <F label={t("Last name*", "Nom*")}>
                      <input
                        value={f.lastName}
                        onChange={(e) => set("lastName", e.target.value)}
                        style={field}
                      />
                    </F>
                  </Row>
                  <Row>
                    <F label={t("Email*", "E-mail*")}>
                      <input
                        type="email"
                        value={f.email}
                        onChange={(e) => set("email", e.target.value)}
                        placeholder="you@email.com"
                        style={field}
                      />
                    </F>
                    <F label={t("Phone", "Téléphone")}>
                      <input
                        value={f.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        placeholder="+221 77 123 45 67"
                        style={field}
                      />
                      <span
                        style={{
                          fontSize: 11.5,
                          color: "var(--fg3)",
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        {t(
                          "Include the country code.",
                          "Incluez l’indicatif pays.",
                        )}
                      </span>
                    </F>
                  </Row>
                  <Row>
                    <F label={t("Date of birth", "Date de naissance")}>
                      <DobPicker
                        value={f.dateOfBirth}
                        onChange={(v) => set("dateOfBirth", v)}
                        t={t}
                        fr={fr}
                      />
                    </F>
                    <F label={t("Gender", "Genre")}>
                      <select
                        value={f.gender}
                        onChange={(e) => set("gender", e.target.value)}
                        style={{ ...field, background: "#fff" }}
                      >
                        <option value=""></option>
                        {genderOpts.map((g) => (
                          <option key={g.value} value={g.value}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </F>
                  </Row>
                  <Row>
                    <F label={t("Nationality", "Nationalité")}>
                      <select
                        value={f.nationality}
                        onChange={(e) => set("nationality", e.target.value)}
                        style={{ ...field, background: "#fff" }}
                      >
                        <option value=""></option>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.en}>
                            {fr ? c.fr : c.en}
                          </option>
                        ))}
                      </select>
                    </F>
                    <F label={t("City of residence", "Ville de résidence")}>
                      <input
                        value={f.city}
                        onChange={(e) => set("city", e.target.value)}
                        style={field}
                      />
                    </F>
                  </Row>
                  <F label={t("Country", "Pays")}>
                    <select
                      value={f.country}
                      onChange={(e) => set("country", e.target.value)}
                      style={{ ...field, background: "#fff" }}
                    >
                      <option value=""></option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.en}>
                          {fr ? c.fr : c.en}
                        </option>
                      ))}
                    </select>
                  </F>
                </Grid>
              )}

              {step === 2 && (
                <Grid>
                  <F
                    label={t("Entrance / BAC score", "Note BAC / d’entrée")}
                    hint={t("0–20, optional", "0–20, facultatif")}
                  >
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step="0.01"
                      value={f.score}
                      onChange={(e) => set("score", e.target.value)}
                      style={field}
                    />
                  </F>
                  <F label={schoolLabel}>
                    <input
                      value={f.school}
                      onChange={(e) => set("school", e.target.value)}
                      style={field}
                    />
                  </F>
                </Grid>
              )}

              {step === 3 && (
                <Grid>
                  <Row>
                    <F label={t("Guardian name", "Nom du tuteur")}>
                      <input
                        value={f.parentName}
                        onChange={(e) => set("parentName", e.target.value)}
                        style={field}
                      />
                    </F>
                    <F label={t("Guardian phone", "Téléphone du tuteur")}>
                      <input
                        value={f.parentPhone}
                        onChange={(e) => set("parentPhone", e.target.value)}
                        placeholder="+221 77 123 45 67"
                        style={field}
                      />
                    </F>
                  </Row>
                  <F label={t("Guardian email", "E-mail du tuteur")}>
                    <input
                      type="email"
                      value={f.parentEmail}
                      onChange={(e) => set("parentEmail", e.target.value)}
                      style={field}
                    />
                  </F>
                </Grid>
              )}

              {step === 4 && (
                <Grid>
                  <Row>
                    <F label={t("Allergies / medical", "Allergies / médical")}>
                      <input
                        value={f.allergies}
                        onChange={(e) => set("allergies", e.target.value)}
                        style={field}
                      />
                    </F>
                    <F
                      label={t(
                        "How did you hear about DAUST?",
                        "Comment avez-vous connu DAUST ?",
                      )}
                    >
                      <select
                        value={f.source}
                        onChange={(e) => {
                          set("source", e.target.value);
                          if (
                            referralDetailKind(
                              e.target.value.trim() === ""
                                ? null
                                : e.target.value,
                            ) === null
                          )
                            set("sourceDetail", "");
                        }}
                        style={{ ...field, background: "#fff" }}
                      >
                        <option value=""></option>
                        {sourceOpts.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </F>
                  </Row>
                  {detailKind === "person" && (
                    <F
                      label={t(
                        "Name of the person who referred you*",
                        "Nom de la personne qui vous a recommandé*",
                      )}
                    >
                      <input
                        value={f.sourceDetail}
                        onChange={(e) => set("sourceDetail", e.target.value)}
                        placeholder={t("Full name", "Nom complet")}
                        style={field}
                      />
                    </F>
                  )}
                  {detailKind === "online" && (
                    <F
                      label={t(
                        "Which site or page?*",
                        "Quel site ou page ?*",
                      )}
                    >
                      <input
                        value={f.sourceDetail}
                        onChange={(e) => set("sourceDetail", e.target.value)}
                        placeholder={t(
                          "e.g. Instagram, Google search",
                          "ex. Instagram, recherche Google",
                        )}
                        style={field}
                      />
                    </F>
                  )}
                  {detailKind === "other" && (
                    <F label={t("Tell us more", "Dites-nous en plus")}>
                      <input
                        value={f.sourceDetail}
                        onChange={(e) => set("sourceDetail", e.target.value)}
                        style={field}
                      />
                    </F>
                  )}
                </Grid>
              )}

              {step === 5 && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      color: "var(--fg2)",
                      margin: "0 0 12px",
                    }}
                  >
                    {t(
                      "Review your application before submitting.",
                      "Vérifiez votre candidature avant de l’envoyer.",
                    )}
                  </p>
                  <Review
                    label={t("Name", "Nom")}
                    value={`${f.firstName} ${f.lastName}`.trim()}
                  />
                  <Review label={t("Email", "E-mail")} value={f.email} />
                  <Review
                    label={t("Program", "Programme")}
                    value={
                      programList.find((p) => p.code === f.programCode)
                        ?.label ?? "N/A"
                    }
                  />
                  <Review
                    label={t("Intake", "Session")}
                    value={f.term || "N/A"}
                  />
                  <Review
                    label={t("Phone", "Téléphone")}
                    value={f.phone || "N/A"}
                  />
                  <Review label={t("Score", "Note")} value={f.score || "N/A"} />
                  <Review
                    label={t("Guardian", "Tuteur")}
                    value={f.parentName || "N/A"}
                  />
                  {f.sourceDetail.trim() !== "" && (
                    <Review
                      label={t("Referral detail", "Détail recommandation")}
                      value={f.sourceDetail}
                    />
                  )}
                </div>
              )}

              {err && (
                <div
                  style={{
                    color: "var(--error-500)",
                    fontSize: 13,
                    marginTop: 14,
                  }}
                >
                  {err}
                </div>
              )}
            </div>

            {/* footer nav */}
            <div
              style={{
                padding: "16px 28px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexShrink: 0,
              }}
            >
              <button onClick={step === 0 ? onClose : back} style={ghostBtn}>
                {step === 0 ? t("Cancel", "Annuler") : t("Back", "Retour")}
              </button>
              {step < steps.length - 1 ? (
                <button onClick={next} style={solidBtn}>
                  {t("Continue", "Continuer")} →
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={busy}
                  style={{ ...solidBtn, opacity: busy ? 0.7 : 1 }}
                >
                  {busy ? "…" : tx.applySubmit}
                </button>
              )}
            </div>
            {step <= 1 && (
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  color: "var(--fg3)",
                  textAlign: "center",
                  margin: 0,
                  padding: "0 28px 16px",
                }}
              >
                {tx.applyQ}{" "}
                <button
                  onClick={onOpenAI}
                  style={{
                    color: "var(--daust-navy)",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 12,
                  }}
                >
                  {tx.applyAI}
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DobPicker({
  value,
  onChange,
  t,
  fr,
}: {
  value: string;
  onChange: (v: string) => void;
  t: (en: string, fr: string) => string;
  fr: boolean;
}) {
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y >= thisYear - 60; y--) years.push(y);
  const [py, pm, pd] = value === "" ? ["", "", ""] : value.split("-");
  const [yy, setYy] = useState(py ?? "");
  const [mm, setMm] = useState(pm ?? "");
  const [dd, setDd] = useState(pd ?? "");
  const daysInMonth =
    yy !== "" && mm !== "" ? new Date(Number(yy), Number(mm), 0).getDate() : 31;

  function pick(ny: string, nm: string, nd: string) {
    setYy(ny);
    setMm(nm);
    setDd(nd);
    if (ny === "" || nm === "" || nd === "") {
      onChange("");
      return;
    }
    const day = Math.min(
      Number(nd),
      new Date(Number(ny), Number(nm), 0).getDate(),
    );
    onChange(`${ny}-${nm.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`);
  }

  const sel = { ...field, background: "#fff", padding: "12px 10px" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
      <select aria-label={t("Year", "Année")} value={yy} onChange={(e) => pick(e.target.value, mm, dd)} style={sel}>
        <option value="">{t("Year", "Année")}</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select aria-label={t("Month", "Mois")} value={mm !== "" ? `${Number(mm)}` : ""} onChange={(e) => pick(yy, e.target.value, dd)} style={sel}>
        <option value="">{t("Month", "Mois")}</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {new Date(2000, i, 1).toLocaleString(fr ? "fr" : "en", { month: "short" })}
          </option>
        ))}
      </select>
      <select aria-label={t("Day", "Jour")} value={dd !== "" ? `${Number(dd)}` : ""} onChange={(e) => pick(yy, mm, e.target.value)} style={sel}>
        <option value="">{t("Day", "Jour")}</option>
        {Array.from({ length: daysInMonth }, (_, i) => (
          <option key={i + 1} value={i + 1}>{i + 1}</option>
        ))}
      </select>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {children}
    </div>
  );
}
function F({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={labelSt}>
        {label}
        {hint && (
          <span
            style={{
              textTransform: "none",
              fontWeight: 400,
              color: "var(--fg3)",
              marginLeft: 6,
            }}
          >
            ({hint})
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
function Review({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 0",
        borderBottom: "1px solid var(--divider)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--fg3)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          fontWeight: 600,
          color: "var(--fg1)",
          textAlign: "right",
        }}
      >
        {value || "N/A"}
      </span>
    </div>
  );
}
