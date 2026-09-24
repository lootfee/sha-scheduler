import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { BenchMetricsResult } from "../types";
import { endOfMonth, formatMonthYear, startOfMonth, toISODate } from "../utils/date";

interface Props {
  anchorDate: Date;
  onClose: () => void;
}

export function BenchMetricsModal({ anchorDate, onClose }: Props) {
  const [result, setResult] = useState<BenchMetricsResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getBenchMetrics(toISODate(startOfMonth(anchorDate)), toISODate(endOfMonth(anchorDate)))
      .then(setResult)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load bench metrics"));
  }, [anchorDate]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal bench-metrics-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Monthly bench distribution</h2>
        <p className="sub">{formatMonthYear(anchorDate)} · percentage of each staff member's assigned bench days</p>
        {error && <p className="error-text">{error}</p>}
        {!result && !error && <p className="empty-state">Loading metrics...</p>}
        {result && result.staff.length === 0 && <p className="empty-state">No active staff found.</p>}
        {result && result.staff.length > 0 && (
          <div className="bench-metrics-table">
            {result.staff.map((person) => (
              <section className="staff-metric-card" key={person.staffId}>
                <div className="staff-metric-heading"><strong>{person.staffName}</strong><span>{person.totalAssignedDays} assigned days</span></div>
                {person.benches.length === 0 ? <p className="field-help">No bench assignments recorded.</p> : person.benches.map((metric) => (
                  <div className="staff-metric-line" key={metric.bench}>
                    <div className="staff-metric-label"><span>{metric.bench}</span><strong>{metric.percentage}%</strong></div>
                    <div className="metric-track"><span style={{ width: `${metric.percentage}%` }} /></div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
