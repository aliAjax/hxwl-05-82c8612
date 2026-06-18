import { useMemo, useState } from "react";
import type {
  Customer,
  TankProfile,
  WaterRecord,
  WaterChangePlan,
  RecordStatus,
  AlertItem,
} from "../db/types";
import type { TankDashboardInfo, CustomerDashboardInfo, RiskFilter, ViewMode } from "./types";
import { TankDetailPanel } from "./TankDetailPanel";
import { RiskTraceabilityView } from "./RiskTraceabilityView";
import { assessTankRisk, getRiskLevelColor, type RiskLevel } from "../riskEngine";
import "../styles.css";

interface DashboardProps {
  customers: Customer[];
  tanks: TankProfile[];
  waterRecords: WaterRecord[];
  waterChangePlans: WaterChangePlan[];
  alerts: AlertItem[];
  tankTypes: string[];
  onJumpToAlert?: (alertId: string) => void;
  onJumpToWaterChangePlan?: (planId: string) => void;
  onJumpToAllAlerts?: () => void;
  onJumpToAllPlans?: () => void;
}

const aggregateRisk = (risks: RecordStatus[]): RecordStatus => {
  if (risks.includes("异常")) return "异常";
  if (risks.includes("关注")) return "关注";
  return "稳定";
};

const aggregateRiskLevel = (levels: RiskLevel[]): RiskLevel => {
  if (levels.includes("严重风险")) return "严重风险";
  if (levels.includes("高风险")) return "高风险";
  if (levels.includes("中风险")) return "中风险";
  return "低风险";
};

const getStatusClass = (status: RecordStatus) => {
  switch (status) {
    case "稳定": return "status-ok";
    case "关注": return "status-watch";
    case "异常": return "status-danger";
  }
};

const formatDateShort = (dateStr?: string) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const getPlanDaysText = (plan?: WaterChangePlan): string => {
  if (!plan) return "—";
  if (plan.completedAt) return "已完成";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDate = new Date(plan.nextDate);
  nextDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "明天";
  if (diffDays > 0) return `${diffDays}天后`;
  return `逾期${Math.abs(diffDays)}天`;
};

const getPlanStatus = (plan?: WaterChangePlan): "overdue" | "upcoming" | "normal" | "completed" | "none" => {
  if (!plan) return "none";
  if (plan.completedAt) return "completed";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDate = new Date(plan.nextDate);
  nextDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "upcoming";
  return "normal";
};

export function Dashboard({
  customers,
  tanks,
  waterRecords,
  waterChangePlans,
  alerts,
  tankTypes,
  onJumpToAlert,
  onJumpToWaterChangePlan,
  onJumpToAllAlerts,
  onJumpToAllPlans,
}: DashboardProps) {
  const [customerFilter, setCustomerFilter] = useState<string>("全部");
  const [maintainerFilter, setMaintainerFilter] = useState<string>("全部");
  const [tankTypeFilter, setTankTypeFilter] = useState<string>("全部");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("全部");
  const [viewMode, setViewMode] = useState<ViewMode>("byCustomer");
  const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
  const [traceabilityTankId, setTraceabilityTankId] = useState<string | null>(null);

  const maintainerOptions = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => c.maintainer && set.add(c.maintainer));
    tanks.forEach((t) => t.maintainer && set.add(t.maintainer));
    return ["全部", ...Array.from(set)];
  }, [customers, tanks]);

  const tankInfoMap = useMemo(() => {
    const map = new Map<string, TankDashboardInfo>();
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    tanks.forEach((tank) => {
      const tankRecords = waterRecords.filter(
        (r) => r.tankId === tank.id || r.tankName === tank.name
      );
      const sortedRecords = [...tankRecords].sort(
        (a, b) =>
          new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
      );
      const latestRecord = sortedRecords[sortedRecords.length - 1];

      const tankPlans = waterChangePlans.filter(
        (p) => p.tankId === tank.id || p.tankName === tank.name
      );
      const activePlans = tankPlans.filter((p) => !p.completedAt);
      const nextPlan = activePlans.sort(
        (a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime()
      )[0];

      const tankAlerts = alerts.filter(
        (a) => (a.tankId === tank.id || a.tankName === tank.name) && a.status === "pending"
      );
      const allTankAlerts = alerts.filter(
        (a) => a.tankId === tank.id || a.tankName === tank.name
      );

      const riskAssessment = assessTankRisk({
        tank,
        records: sortedRecords,
        plans: tankPlans,
        alerts: allTankAlerts,
      });

      map.set(tank.id, {
        tank,
        customer: customerMap.get(tank.customerId || ""),
        latestRecord,
        nextPlan,
        riskLevel: riskAssessment.recordStatus,
        pendingAlerts: tankAlerts.length,
        riskAssessment,
      });
    });

    return map;
  }, [customers, tanks, waterRecords, waterChangePlans, alerts]);

  const filteredTankIds = useMemo(() => {
    return Array.from(tankInfoMap.values())
      .filter((info: TankDashboardInfo) => {
        if (customerFilter !== "全部" && info.tank.customerId !== customerFilter) {
          return false;
        }
        if (
          maintainerFilter !== "全部" &&
          info.tank.maintainer !== maintainerFilter &&
          info.customer?.maintainer !== maintainerFilter
        ) {
          return false;
        }
        if (tankTypeFilter !== "全部" && info.tank.tankType !== tankTypeFilter) {
          return false;
        }
        if (riskFilter !== "全部" && info.riskLevel !== riskFilter) {
          return false;
        }
        return true;
      })
      .map((info: TankDashboardInfo) => info.tank.id);
  }, [tankInfoMap, customerFilter, maintainerFilter, tankTypeFilter, riskFilter]);

  const customerGroups = useMemo(() => {
    const groups: CustomerDashboardInfo[] = [];
    const unassignedTanks: TankDashboardInfo[] = [];

    customers.forEach((customer) => {
      const customerTanks = tanks
        .filter(
          (t) =>
            t.customerId === customer.id && filteredTankIds.includes(t.id)
        )
        .map((t) => tankInfoMap.get(t.id)!)
        .filter(Boolean);

      if (customerTanks.length > 0 || customerFilter === customer.id) {
        groups.push({
          customer,
          tanks: customerTanks,
          overallRisk: aggregateRisk(customerTanks.map((t) => t.riskLevel)),
          overallRiskLevel: aggregateRiskLevel(
            customerTanks.map((t) => t.riskAssessment.riskLevel)
          ),
        });
      }
    });

    const orphanTanks = tanks
      .filter(
        (t) =>
          !t.customerId &&
          filteredTankIds.includes(t.id)
      )
      .map((t) => tankInfoMap.get(t.id)!)
      .filter(Boolean);

    if (orphanTanks.length > 0) {
      unassignedTanks.push(...orphanTanks);
    }

    return { groups, unassignedTanks };
  }, [customers, tanks, filteredTankIds, tankInfoMap, customerFilter]);

  const stats = useMemo(() => {
    const filteredInfos = filteredTankIds
      .map((id: string) => tankInfoMap.get(id))
      .filter(Boolean) as TankDashboardInfo[];
    return {
      total: filteredInfos.length,
      ok: filteredInfos.filter((t) => t.riskAssessment.riskLevel === "低风险").length,
      medium: filteredInfos.filter((t) => t.riskAssessment.riskLevel === "中风险").length,
      watch: filteredInfos.filter((t) => t.riskAssessment.riskLevel === "高风险").length,
      danger: filteredInfos.filter((t) => t.riskAssessment.riskLevel === "严重风险").length,
    };
  }, [filteredTankIds, tankInfoMap]);

  const selectedTankInfo = selectedTankId
    ? tankInfoMap.get(selectedTankId)
    : null;

  const selectedTankRecords = selectedTankId
    ? waterRecords
        .filter(
          (r) => r.tankId === selectedTankId || r.tankName === selectedTankInfo?.tank.name
        )
        .sort(
          (a, b) =>
            new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
        )
    : [];

  const renderTankCard = (info: TankDashboardInfo) => {
    const risk = info.riskAssessment;
    const mainFactors = risk.factors.slice(0, 2);
    return (
      <article
        key={info.tank.id}
        className={`dashboard-tank-card dashboard-tank-${info.riskLevel}`}
        onClick={() => setSelectedTankId(info.tank.id)}
      >
        <header className="dashboard-tank-header">
          <div>
            <span className={`tank-type-tag tank-type-${info.tank.tankType}`}>
              {info.tank.tankType}
            </span>
            <h3>{info.tank.name}</h3>
            {info.customer && (
              <p className="dashboard-customer-name">
                👤 {info.customer.name}
              </p>
            )}
          </div>
          <div className="dashboard-risk-indicator">
            <span
              className="record-status risk-tag-clickable"
              style={{
                backgroundColor: getRiskLevelColor(risk.riskLevel),
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setTraceabilityTankId(info.tank.id);
              }}
              title="点击查看风险溯源"
            >
              {risk.riskLevel} 🔍
            </span>
            {info.pendingAlerts > 0 && (
              <span className="dashboard-alert-badge">
                {info.pendingAlerts}
              </span>
            )}
          </div>
        </header>
        {risk.factors.length > 0 && (
          <div className="dashboard-risk-reasons">
            {mainFactors.map((f, idx) => (
              <span
                key={idx}
                className={`risk-reason-tag risk-reason-${f.severity}`}
                title={f.evidence || f.description}
              >
                {f.metricLabel || "综合"}{f.severity === "severe" ? "⚠" : "·"}{f.description.length > 12 ? f.description.slice(0, 12) + "..." : f.description}
              </span>
            ))}
            {risk.factors.length > 2 && (
              <span className="risk-reason-more">+{risk.factors.length - 2}</span>
            )}
          </div>
        )}
        <dl className="dashboard-info-list">
          <div>
            <dt>最近检测</dt>
            <dd>{formatDateShort(info.latestRecord?.recordedAt)}</dd>
          </div>
          <div>
            <dt>下次换水</dt>
            <dd className={`dashboard-date-${getPlanStatus(info.nextPlan)}`}>
              {info.nextPlan?.nextDate || "—"}
              <span className="dashboard-days">
                {getPlanDaysText(info.nextPlan)}
              </span>
            </dd>
          </div>
          <div>
            <dt>负责人</dt>
            <dd>{info.tank.maintainer || info.customer?.maintainer || "—"}</dd>
          </div>
          <div>
            <dt>风险评分</dt>
            <dd
              style={{
                fontWeight: 600,
                color: getRiskLevelColor(risk.riskLevel),
              }}
            >
              {risk.totalScore}
            </dd>
          </div>
        </dl>
      </article>
    );
  };

  return (
    <section className="dashboard panel">
      <div className="section-heading">
        <div>
          <p>多客户维护</p>
          <h2>水族店维护看板</h2>
        </div>
        <div className="dashboard-view-toggle">
          <button
            className={viewMode === "byCustomer" ? "chip-active" : ""}
            onClick={() => setViewMode("byCustomer")}
          >
            按客户分组
          </button>
          <button
            className={viewMode === "flat" ? "chip-active" : ""}
            onClick={() => setViewMode("flat")}
          >
            全部鱼缸
          </button>
        </div>
      </div>

      <div className="dashboard-stats">
        <div className="dashboard-stat-item">
          <span className="dashboard-stat-label">鱼缸总数</span>
          <strong className="dashboard-stat-value">{stats.total}</strong>
        </div>
        <div className="dashboard-stat-item dashboard-stat-ok">
          <span className="dashboard-stat-label">低风险</span>
          <strong className="dashboard-stat-value">{stats.ok}</strong>
        </div>
        <div className="dashboard-stat-item" style={{ background: "#fef3c7", color: "#92400e" }}>
          <span className="dashboard-stat-label">中风险</span>
          <strong className="dashboard-stat-value">{stats.medium}</strong>
        </div>
        <div className="dashboard-stat-item dashboard-stat-watch">
          <span className="dashboard-stat-label">高风险</span>
          <strong className="dashboard-stat-value">{stats.watch}</strong>
        </div>
        <div className="dashboard-stat-item dashboard-stat-danger">
          <span className="dashboard-stat-label">严重风险</span>
          <strong className="dashboard-stat-value">{stats.danger}</strong>
        </div>
      </div>

      <div className="dashboard-filters">
        <div className="dashboard-filter-group">
          <label className="dashboard-filter-label">客户</label>
          <div className="chips muted">
            <button
              className={customerFilter === "全部" ? "chip-active" : ""}
              onClick={() => setCustomerFilter("全部")}
            >
              全部
              <span className="chip-count">{tanks.length}</span>
            </button>
            {customers.map((c) => {
              const count = tanks.filter((t) => t.customerId === c.id).length;
              return (
                <button
                  key={c.id}
                  className={customerFilter === c.id ? "chip-active" : ""}
                  onClick={() => setCustomerFilter(c.id)}
                >
                  {c.name}
                  <span className="chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="dashboard-filter-group">
          <label className="dashboard-filter-label">维护师</label>
          <div className="chips muted">
            {maintainerOptions.map((m) => (
              <button
                key={m}
                className={maintainerFilter === m ? "chip-active" : ""}
                onClick={() => setMaintainerFilter(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-filter-group">
          <label className="dashboard-filter-label">缸型</label>
          <div className="chips muted">
            <button
              className={tankTypeFilter === "全部" ? "chip-active" : ""}
              onClick={() => setTankTypeFilter("全部")}
            >
              全部
            </button>
            {tankTypes.map((t) => (
              <button
                key={t}
                className={tankTypeFilter === t ? "chip-active" : ""}
                onClick={() => setTankTypeFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-filter-group">
          <label className="dashboard-filter-label">异常状态</label>
          <div className="chips muted">
            {(["全部", "稳定", "关注", "异常"] as RiskFilter[]).map((r) => (
              <button
                key={r}
                className={riskFilter === r ? "chip-active" : ""}
                onClick={() => setRiskFilter(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredTankIds.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>没有匹配的鱼缸</h3>
          <p>尝试调整筛选条件，或清除筛选查看全部鱼缸。</p>
        </div>
      ) : viewMode === "flat" ? (
        <div className="dashboard-tank-grid">
          {filteredTankIds
            .map((id: string) => tankInfoMap.get(id))
            .filter(Boolean)
            .map((info) => renderTankCard(info as TankDashboardInfo))}
        </div>
      ) : (
        <div className="dashboard-customer-groups">
          {customerGroups.groups.map((group) => (
            <div key={group.customer.id} className="dashboard-customer-group">
              <header className="dashboard-customer-header">
                <div>
                  <h3>
                    <span
                      className="dashboard-risk-dot"
                      style={{
                        backgroundColor: getRiskLevelColor(group.overallRiskLevel),
                      }}
                    />
                    {group.customer.name}
                    <span
                      className="customer-risk-tag"
                      style={{
                        backgroundColor: getRiskLevelColor(group.overallRiskLevel),
                        color: "#fff",
                      }}
                    >
                      {group.overallRiskLevel}
                    </span>
                  </h3>
                  <p className="dashboard-customer-meta">
                    {group.customer.address} · {group.customer.phone} · 维护师：
                    {group.customer.maintainer}
                  </p>
                </div>
                <div className="dashboard-customer-count">
                  {group.tanks.length} 个鱼缸
                </div>
              </header>
              {group.tanks.length > 0 ? (
                <div className="dashboard-tank-grid">
                  {group.tanks.map((info) => renderTankCard(info))}
                </div>
              ) : (
                <div className="dashboard-empty-group">
                  该客户下暂无符合条件的鱼缸
                </div>
              )}
            </div>
          ))}
          {customerGroups.unassignedTanks.length > 0 && (
            <div className="dashboard-customer-group">
              <header className="dashboard-customer-header">
                <div>
                  <h3>
                    <span
                      className="dashboard-risk-dot"
                      style={{
                        backgroundColor: aggregateRiskLevel(
                          customerGroups.unassignedTanks.map((t) => t.riskAssessment.riskLevel)
                        ) === "低风险"
                          ? "#16a34a"
                          : getRiskLevelColor(
                              aggregateRiskLevel(
                                customerGroups.unassignedTanks.map((t) => t.riskAssessment.riskLevel)
                              )
                            ),
                      }}
                    />
                    未分配客户
                  </h3>
                  <p className="dashboard-customer-meta">尚未分配到客户的鱼缸</p>
                </div>
                <div className="dashboard-customer-count">
                  {customerGroups.unassignedTanks.length} 个鱼缸
                </div>
              </header>
              <div className="dashboard-tank-grid">
                {customerGroups.unassignedTanks.map((info) => renderTankCard(info))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTankInfo && (
        <TankDetailPanel
          info={selectedTankInfo}
          records={selectedTankRecords}
          onClose={() => setSelectedTankId(null)}
        />
      )}

      {traceabilityTankId && tankInfoMap.get(traceabilityTankId) && (
        <RiskTraceabilityView
          info={tankInfoMap.get(traceabilityTankId)!}
          records={waterRecords
            .filter(
              (r) =>
                r.tankId === traceabilityTankId ||
                r.tankName === tankInfoMap.get(traceabilityTankId)?.tank.name
            )
            .sort(
              (a, b) =>
                new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
            )}
          overduePlans={waterChangePlans.filter((p) => {
            const match =
              p.tankId === traceabilityTankId ||
              p.tankName === tankInfoMap.get(traceabilityTankId)?.tank.name;
            if (!match || p.completedAt) return false;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const nextDate = new Date(p.nextDate);
            nextDate.setHours(0, 0, 0, 0);
            return nextDate.getTime() < today.getTime();
          })}
          pendingAlerts={alerts.filter(
            (a) =>
              (a.tankId === traceabilityTankId ||
                a.tankName === tankInfoMap.get(traceabilityTankId)?.tank.name) &&
              a.status === "pending"
          )}
          onClose={() => setTraceabilityTankId(null)}
          onJumpToAlert={(alertId) => {
            setTraceabilityTankId(null);
            setTimeout(() => onJumpToAlert?.(alertId), 50);
          }}
          onJumpToWaterChangePlan={(planId) => {
            setTraceabilityTankId(null);
            setTimeout(() => onJumpToWaterChangePlan?.(planId), 50);
          }}
          onJumpToAllAlerts={() => {
            setTraceabilityTankId(null);
            setTimeout(() => onJumpToAllAlerts?.(), 50);
          }}
          onJumpToAllPlans={() => {
            setTraceabilityTankId(null);
            setTimeout(() => onJumpToAllPlans?.(), 50);
          }}
        />
      )}
    </section>
  );
}
