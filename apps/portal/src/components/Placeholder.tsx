export function Placeholder({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      <div className="card">
        <p className="muted">{note}</p>
      </div>
    </>
  );
}
