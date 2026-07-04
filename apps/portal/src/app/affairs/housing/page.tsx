"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type Hall,
  type HousingRequest,
  type HousingRow,
  assignRoom,
  getHalls,
  getHousingRequests,
  getHousingRoster,
} from "@/lib/api";

export default function HousingPage() {
  const [roster, setRoster] = useState<HousingRow[]>([]);
  const [requests, setRequests] = useState<HousingRequest[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [hallId, setHallId] = useState("");
  const [room, setRoom] = useState("");
  const [fee, setFee] = useState("");

  const load = useCallback(() => {
    getHousingRoster().then(setRoster).catch(() => {});
    getHousingRequests().then(setRequests).catch(() => {});
    getHalls().then((h) => { setHalls(h); if (h[0]) setHallId(h[0].id); }).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function doAssign(id: string) {
    if (!hallId || !room) return;
    await assignRoom(id, hallId, room, fee ? Number(fee) : undefined);
    setAssigning(null);
    setRoom("");
    setFee("");
    load();
  }

  return (
    <>
      <p className="eyebrow">Residence</p>
      <h1 className="page-title">Housing & Residence</h1>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Pending assignments ({requests.length})</p>
        {requests.length === 0 ? <p className="muted">No pending requests.</p> : (
          <table>
            <thead><tr><th>Student</th><th>Need</th><th>Assign</th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.assignmentId}>
                  <td>{r.name}<br /><span className="muted" style={{ fontSize: 12 }}>{r.studentNo}</span></td>
                  <td>{r.need}</td>
                  <td>
                    {assigning === r.assignmentId ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <select value={hallId} onChange={(e) => setHallId(e.target.value)}>{halls.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
                        <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room #" style={{ width: 80 }} />
                        <input value={fee} onChange={(e) => setFee(e.target.value)} type="number" placeholder="Fee XOF (opt.)" style={{ width: 110 }} title="Bills a housing invoice (cost center 3700) on the student's account" />
                        <button className="primary" onClick={() => doAssign(r.assignmentId)} style={{ fontSize: 12 }}>Save</button>
                      </span>
                    ) : (
                      <button onClick={() => setAssigning(r.assignmentId)} style={{ fontSize: 12 }}>Assign room</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Residence roster</p>
        <table>
          <thead><tr><th>Student</th><th>Program</th><th>Hall</th><th>Room</th><th>Status</th></tr></thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.assignmentId}>
                <td>{r.name}<br /><span className="muted" style={{ fontSize: 12 }}>{r.studentNo}</span></td>
                <td>{r.program}</td>
                <td>{r.hall}</td>
                <td>{r.room}</td>
                <td><span className={`badge ${r.status === "assigned" ? "completed" : "pending"}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
