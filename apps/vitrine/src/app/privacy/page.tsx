"use client";

import { PageFrame } from "@/components/PageFrame";
import { Section } from "@/components/site";

export default function PrivacyPage() {
  return (
    <PageFrame active="">
      <section style={{ background: "var(--navy)", color: "#fff" }}>
        <div style={{ padding: "80px clamp(24px, 5vw, 64px)" }}>
          <div className="eyebrow" style={{ color: "var(--orange)" }}>Legal</div>
          <h1 style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: "clamp(30px, 4.5vw, 52px)", lineHeight: 1.05, margin: "12px 0 0" }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 14, color: "var(--on-navy-muted)", margin: "12px 0 0" }}>Last updated: June 2026</p>
        </div>
      </section>

      <Section bg="#fff" max={740} pad="72px 32px 96px">
        <div style={{ fontSize: 15, lineHeight: 1.8, color: "var(--fg2)" }}>
          <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "32px 0 12px" }}>1. Who we are</h2>
          <p style={{ margin: "0 0 16px" }}>
            Dakar American University of Science and Technology (DAUST) is an accredited private university located in Somone, Senegal. This privacy policy explains how we collect, use, and protect your personal information when you use our website and apply for admission.
          </p>

          <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "32px 0 12px" }}>2. Information we collect</h2>
          <p style={{ margin: "0 0 8px" }}>When you submit an application through our website, we collect:</p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
            <li>Full name</li>
            <li>Email address</li>
            <li>Country of residence</li>
            <li>Academic track (first-year or transfer)</li>
            <li>Program of interest</li>
            <li>Baccalauréat score (if provided)</li>
          </ul>
          <p style={{ margin: "0 0 16px" }}>
            We also collect standard web server logs (IP address, browser type, pages visited) for security and performance monitoring.
          </p>

          <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "32px 0 12px" }}>3. How we use your information</h2>
          <p style={{ margin: "0 0 8px" }}>We use your information to:</p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
            <li>Process your admission application</li>
            <li>Communicate with you about your application status</li>
            <li>Calculate and apply merit scholarships</li>
            <li>Send you information about DAUST programs and events</li>
            <li>Improve our website and services</li>
          </ul>

          <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "32px 0 12px" }}>4. Data sharing</h2>
          <p style={{ margin: "0 0 16px" }}>
            We do not sell or rent your personal information to third parties. We may share your data with trusted service providers who assist in operating our website and processing applications, bound by confidentiality obligations.
          </p>

          <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "32px 0 12px" }}>5. Data security</h2>
          <p style={{ margin: "0 0 16px" }}>
            We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.
          </p>

          <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "32px 0 12px" }}>6. Your rights</h2>
          <p style={{ margin: "0 0 16px" }}>
            You have the right to access, correct, or delete your personal information. To exercise these rights, contact us at <a href="mailto:info@daust.org" style={{ color: "var(--navy)", fontWeight: 600 }}>info@daust.org</a>.
          </p>

          <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "32px 0 12px" }}>7. Cookies</h2>
          <p style={{ margin: "0 0 16px" }}>
            Our website uses essential cookies for session management. We do not use tracking or advertising cookies.
          </p>

          <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "32px 0 12px" }}>8. Changes to this policy</h2>
          <p style={{ margin: "0 0 16px" }}>
            We may update this policy from time to time. Changes will be posted on this page with an updated revision date.
          </p>

          <h2 style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--fg1)", margin: "32px 0 12px" }}>9. Contact</h2>
          <p style={{ margin: 0 }}>
            For questions about this privacy policy, contact us at{" "}
            <a href="mailto:info@daust.org" style={{ color: "var(--navy)", fontWeight: 600 }}>info@daust.org</a> or call{" "}
            <a href="tel:+221774882515" style={{ color: "var(--navy)", fontWeight: 600 }}>+221 77 488 25 15</a>.
          </p>
        </div>
      </Section>
    </PageFrame>
  );
}
