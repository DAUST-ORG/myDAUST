"use client";

import { useCallback, useEffect, useState } from "react";
import { type RoomBooking, bookRoom, getMyBookings } from "@/lib/api";

const ROOMS = ["Lecture Hall A", "Lecture Hall B", "Hardware Lab 3", "Innovation Lab", "Conference Room", "Seminar Room 214"];

export default function BookingPage() {
  const [items, setItems] = useState<RoomBooking[]>([]);
  const [form, setForm] = useState({ room: ROOMS[0]!, date: "", startTime: "09:00", endTime: "10:00", purpose: "" });

  const load = useCallback(() => {
    getMyBookings().then(setItems).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function submit() {
    if (!form.date) return;
    await bookRoom(form);
    setForm({ ...form, date: "", purpose: "" });
    load();
  }

  return (
    <>
      <p className="eyebrow">Facilities</p>
      <h1 className="page-title">Room Booking</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 15 }}>Book a room</p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr auto", gap: 10, alignItems: "end", marginTop: 8 }}>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Room</span><select value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}>{ROOMS.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Date</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>From</span><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>To</span><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Purpose</span><input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></label>
          <button className="primary" onClick={submit}>Book</button>
        </div>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 15 }}>My bookings</p>
        <table>
          <thead><tr><th>Room</th><th>Date</th><th>Time</th><th>Purpose</th><th>Status</th></tr></thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id}>
                <td>{b.room}</td>
                <td>{new Date(b.date).toLocaleDateString()}</td>
                <td>{b.startTime}–{b.endTime}</td>
                <td className="muted">{b.purpose ?? "—"}</td>
                <td><span className="badge completed">{b.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="muted">No bookings yet.</p>}
      </div>
    </>
  );
}
