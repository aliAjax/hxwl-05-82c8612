import type { TankDashboardInfo } from "./types";
import type { WaterRecord, WaterMetrics } from "../db/types";

interface TankDetailPanelProps {
  info: TankDashboardInfo;
  records: WaterRecord[];
  onClose: () => void;
}

const METRIC_LABELS: Record<keyof Omit<WaterMetrics, "waterChange">, string> = {
  ph: "pH",
  ammonia: "氨氮",
  nitrite: "亚硝酸盐",
  nitrate: "硝酸盐",
  hardness: "硬度",
  temperature: "温度",
};

const METRIC_UNITS: Record<keyof Omit<WaterMetrics, "waterChange">, string> = {
  ph: "",
  ammonia: "ppm",
  nitrite: "ppm",
  nitrate: "ppm",
  hardness: "dGH",
  temperature: "°C",
};

export function TankDetailPanel({ info, records, onClose }: TankDetailPanelProps) {
  const { tank, customer, latestRecord, nextPlan, riskLevel, pendingAlerts } = info;

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="detail-header">
          <div>
            <div className="detail-title-row">
              <span className={`tank-type-tag tank-type-${tank.tankType}`}>
                {tank.tankType}
              </span>
              <h2>{tank.name}</h2>
              <span className={`record-status record-status-${riskLevel}`}>
                {riskLevel}
              </span>
              {pendingAlerts > 0 && (
                <span className="dashboard-alert-badge">
                  {pendingAlerts} 条待处理告警
                </span>
              )}
            </div>
            {customer && (
              <p className="detail-customer">
                👤 {customer.name} · {customer.address} · {customer.phone}
              </p>
            )}
          </div>
          <button className="detail-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="detail-body">
          <section className="detail-section">
            <h3>鱼缸信息</h3>
            <div className="detail-info-grid">
              <div>
                <dt>容量</dt>
                <dd>{tank.capacity || "—"}</dd>
              </div>
              <div>
                <dt>开缸日期</dt>
                <dd>{tank.setupDate || "—"}</dd>
              </div>
              <div>
                <dt>主要生物</dt>
                <dd>{tank.mainCreatures || "—"}</dd>
              </div>
              <div>
                <dt>维护负责人</dt>
                <dd>{tank.maintainer || customer?.maintainer || "—"}</dd>
              </div>
            </div>
          </section>

          {nextPlan && (
            <section className="detail-section">
              <h3>换水计划</h3>
              <div className="detail-info-grid">
                <div>
                  <dt>下次换水</dt>
                  <dd className="detail-highlight">
                    {nextPlan.nextDate}
                    <span className="dashboard-days">
                      {(() => {
                        if (nextPlan.completedAt) return "已完成";
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const d = new Date(nextPlan.nextDate);
                        d.setHours(0, 0, 0, 0);
                        const diff = Math.ceil(
                          (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                        );
                        if (diff === 0) return "今天";
                        if (diff === 1) return "明天";
                        if (diff > 0) return `${diff}天后`;
                        return `逾期${Math.abs(diff)}天`;
                      })()}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>换水周期</dt>
                  <dd>每 {nextPlan.cycleDays} 天</dd>
                </div>
                <div>
                  <dt>换水比例</dt>
                  <dd>{nextPlan.waterRatio}%</dd>
                </div>
                <div>
                  <dt>备注</dt>
                  <dd>{nextPlan.note || "—"}</dd>
                </div>
              </div>
            </section>
          )}

          {latestRecord && (
            <section className="detail-section">
              <h3>最近一次检测（{latestRecord.recordedAt}）</h3>
              <div className="detail-metrics-grid">
                {(Object.keys(METRIC_LABELS) as (keyof Omit<WaterMetrics, "waterChange">)[]).map(
                  (key) => {
                    const value = latestRecord.metrics[key];
                    if (!value) return null;
                    return (
                      <div key={key} className="detail-metric-card">
                        <span className="detail-metric-label">
                          {METRIC_LABELS[key]}
                        </span>
                        <strong className="detail-metric-value">
                          {value}
                          <span className="detail-metric-unit">
                            {METRIC_UNITS[key]}
                          </span>
                        </strong>
                      </div>
                    );
                  }
                )}
                {latestRecord.metrics.waterChange && (
                  <div className="detail-metric-card">
                    <span className="detail-metric-label">换水量</span>
                    <strong className="detail-metric-value">
                      {latestRecord.metrics.waterChange}
                    </strong>
                  </div>
                )}
              </div>
              {latestRecord.note && (
                <p className="detail-note">{latestRecord.note}</p>
              )}
            </section>
          )}

          <section className="detail-section">
            <h3>近期水质记录（{records.length}条）</h3>
            {records.length === 0 ? (
              <div className="empty-state empty-state-compact">
                <div className="empty-icon">💧</div>
                <p>暂无水质记录</p>
              </div>
            ) : (
              <div className="detail-record-list">
                {records.slice(0, 20).map((record, idx) => (
                  <article key={record.id} className="detail-record-item">
                    <div className={`record-index ${
                      record.status === "稳定" ? "status-ok" :
                      record.status === "关注" ? "status-watch" : "status-danger"
                    }`}>
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                    <div className="detail-record-content">
                      <header className="detail-record-header">
                        <span className="record-time">{record.recordedAt}</span>
                        <span className={`record-status record-status-${record.status}`}>
                          {record.status}
                        </span>
                      </header>
                      <div className="detail-record-metrics">
                        {(Object.keys(METRIC_LABELS) as (keyof Omit<WaterMetrics, "waterChange">)[]).map(
                          (key) => {
                            const v = record.metrics[key];
                            if (!v) return null;
                            return (
                              <span key={key} className="detail-metric-chip">
                                {METRIC_LABELS[key]} {v}{METRIC_UNITS[key]}
                              </span>
                            );
                          }
                        )}
                        {record.metrics.waterChange && (
                          <span className="detail-metric-chip">
                            换水量 {record.metrics.waterChange}
                          </span>
                        )}
                      </div>
                      {record.note && (
                        <p className="detail-record-note">{record.note}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
