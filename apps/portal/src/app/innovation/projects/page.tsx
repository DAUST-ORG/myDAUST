"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type AdminProject, getAdminProjects } from "@/lib/api";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  useEffect(() => {
    getAdminProjects().then(setProjects).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Studio</p>
      <h1 className="page-title">Projects</h1>
      <div className="card">
        <table>
          <thead><tr><th>Project</th><th>Phase</th><th>Team</th><th>Advisor</th><th>Reviews</th><th /></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td><span className="badge pending" style={{ textTransform: "capitalize" }}>{p.phase}</span></td>
                <td className="muted" style={{ fontSize: 13 }}>{p.members.join(", ")}</td>
                <td>{p.advisor ?? "—"}</td>
                <td>{p.pendingReviews > 0 ? <span className="badge overdue">{p.pendingReviews}</span> : <span className="muted">0</span>}</td>
                <td><Link href={`/innovation/projects/${p.id}`}>Open →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length === 0 && <p className="muted">No projects yet.</p>}
      </div>
    </>
  );
}
