export function StatCard({
  label,
  value,
  tone = "neutral",
  note
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "risk";
  note?: string;
}) {
  return (
    <section className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </section>
  );
}
