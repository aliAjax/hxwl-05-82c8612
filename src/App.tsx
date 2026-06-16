import { useState, useMemo } from "react";
import "./styles.css";

const project = {
  "id": "hxwl-05",
  "port": 5105,
  "title": "水族箱水质监测",
  "subtitle": "多鱼缸水质趋势、换水和异常指标提醒",
  "stack": "React + Vite + TypeScript + CSS",
  "theme": [
    "#0891b2",
    "#16a34a",
    "#f59e0b"
  ],
  "domain": "水族养护",
  "users": [
    "水族店员",
    "玩家",
    "维护师"
  ],
  "metrics": [
    "pH",
    "氨氮",
    "硝酸盐",
    "换水周期"
  ],
  "filters": [
    "草缸",
    "海缸",
    "三湖缸",
    "繁殖缸"
  ],
  "fields": [
    "pH",
    "氨氮",
    "亚硝酸盐",
    "硝酸盐",
    "硬度",
    "温度",
    "换水量"
  ],
  "records": [
    [
      "草缸A",
      "pH 6.8",
      "稳定",
      "硝酸盐18ppm，计划周末换水30%"
    ],
    [
      "海缸B",
      "pH 8.1",
      "关注",
      "钙硬度偏低，需复测"
    ],
    [
      "繁殖缸C",
      "pH 7.2",
      "异常",
      "亚硝酸盐升高，停止投喂"
    ]
  ]
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

const TANK_TYPES = ["草缸", "海缸", "三湖缸", "繁殖缸"];

type RecordStatus = "稳定" | "关注" | "异常";

interface WaterMetrics {
  ph: string;
  ammonia: string;
  nitrite: string;
  nitrate: string;
  hardness: string;
  temperature: string;
  waterChange: string;
}

interface WaterRecord {
  id: string;
  tankName: string;
  tankId?: string;
  recordedAt: string;
  metrics: WaterMetrics;
  status: RecordStatus;
  note: string;
}

const METRIC_RANGES: Record<
  keyof Omit<WaterMetrics, "waterChange">,
  { ok: [number, number]; watch: [number, number]; unit: string; label: string }
> = {
  ph: { ok: [6.5, 7.5], watch: [6.0, 8.0], unit: "", label: "pH" },
  ammonia: { ok: [0, 0], watch: [0, 0.25], unit: "ppm", label: "氨氮" },
  nitrite: { ok: [0, 0], watch: [0, 0.5], unit: "ppm", label: "亚硝酸盐" },
  nitrate: { ok: [0, 20], watch: [0, 40], unit: "ppm", label: "硝酸盐" },
  hardness: { ok: [4, 12], watch: [2, 18], unit: "dGH", label: "硬度" },
  temperature: { ok: [24, 28], watch: [20, 32], unit: "°C", label: "温度" },
};

const emptyWaterMetrics: WaterMetrics = {
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  hardness: "",
  temperature: "",
  waterChange: "",
};

interface TankProfile {
  id: string;
  name: string;
  tankType: string;
  capacity: string;
  setupDate: string;
  mainCreatures: string;
  maintainer: string;
}

type PlanStatus = "normal" | "upcoming" | "overdue" | "completed";

interface WaterChangePlan {
  id: string;
  tankName: string;
  tankId?: string;
  cycleDays: string;
  waterRatio: string;
  nextDate: string;
  note: string;
  completedAt?: string;
  createdAt: string;
}

const emptyForm: Omit<TankProfile, "id"> = {
  name: "",
  tankType: "草缸",
  capacity: "",
  setupDate: "",
  mainCreatures: "",
  maintainer: "",
};

const emptyPlanForm: Omit<WaterChangePlan, "id" | "createdAt"> = {
  tankName: "",
  tankId: "",
  cycleDays: "7",
  waterRatio: "30",
  nextDate: "",
  note: "",
};

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function evaluateMetric(
  key: keyof Omit<WaterMetrics, "waterChange">,
  raw: string
): RecordStatus {
  const value = parseFloat(raw);
  if (isNaN(value)) return "稳定";
  const range = METRIC_RANGES[key];
  if (value < range.watch[0] || value > range.watch[1]) return "异常";
  if (value < range.ok[0] || value > range.ok[1]) return "关注";
  return "稳定";
}

function evaluateRecordStatus(metrics: WaterMetrics): { status: RecordStatus; note: string } {
  const metricKeys = Object.keys(METRIC_RANGES) as (keyof Omit<WaterMetrics, "waterChange">)[];
  const issues: { key: keyof Omit<WaterMetrics, "waterChange">; status: RecordStatus }[] = [];
  let overall: RecordStatus = "稳定";

  for (const key of metricKeys) {
    const raw = metrics[key];
    if (!raw.trim()) continue;
    const st = evaluateMetric(key, raw);
    if (st !== "稳定") {
      issues.push({ key, status: st });
    }
    if (st === "异常") overall = "异常";
    else if (st === "关注" && overall !== "异常") overall = "关注";
  }

  let note = "";
  if (issues.length === 0) {
    note = "各项指标正常，继续保持";
  } else {
    const dangerItems = issues.filter((i) => i.status === "异常");
    const watchItems = issues.filter((i) => i.status === "关注");
    const parts: string[] = [];
    if (dangerItems.length > 0) {
      parts.push(
        dangerItems
          .map((i) => {
            const r = METRIC_RANGES[i.key];
            return `${r.label}${metrics[i.key]}${r.unit}异常`;
          })
          .join("、")
      );
    }
    if (watchItems.length > 0) {
      parts.push(
        watchItems
          .map((i) => `${METRIC_RANGES[i.key].label}${metrics[i.key]}需关注`)
          .join("、")
      );
    }
    note = parts.join("；");
    if (metrics.waterChange.trim()) {
      note += `；本次换水${metrics.waterChange}`;
    }
    if (dangerItems.length > 0) {
      note += "，建议立即处理";
    }
  }
  return { status: overall, note };
}

function getPlanStatus(plan: WaterChangePlan): PlanStatus {
  if (plan.completedAt) return "completed";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDate = new Date(plan.nextDate);
  nextDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "upcoming";
  return "normal";
}

function getPlanStatusText(status: PlanStatus): string {
  switch (status) {
    case "normal": return "正常";
    case "upcoming": return "即将到期";
    case "overdue": return "已逾期";
    case "completed": return "已完成";
  }
}

function getPlanDaysText(plan: WaterChangePlan): string {
  if (plan.completedAt) return "已完成";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDate = new Date(plan.nextDate);
  nextDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "明天";
  if (diffDays > 0) return `${diffDays}天后`;
  return `逾期${Math.abs(diffDays)}天`;
}

function App() {
  const values = project.metrics.map((metric: string, index: number) => {
    const base = [84, 12, 31, 7][index % 4];
    return String(base + index * 3);
  });

  const [tanks, setTanks] = useState<TankProfile[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("全部");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<TankProfile, "id">>(emptyForm);

  const filterOptions = ["全部", ...TANK_TYPES];

  const filteredTanks = useMemo(() => {
    if (activeFilter === "全部") return tanks;
    return tanks.filter((t) => t.tankType === activeFilter);
  }, [tanks, activeFilter]);

  const openAddModal = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (tank: TankProfile) => {
    setEditingId(tank.id);
    setFormData({
      name: tank.name,
      tankType: tank.tankType,
      capacity: tank.capacity,
      setupDate: tank.setupDate,
      mainCreatures: tank.mainCreatures,
      maintainer: tank.maintainer,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingId) {
      setTanks((prev) =>
        prev.map((t) => (t.id === editingId ? { ...formData, id: editingId } : t))
      );
    } else {
      const newTank: TankProfile = {
        ...formData,
        id: Date.now().toString(),
      };
      setTanks((prev) => [...prev, newTank]);
    }
    closeModal();
  };

  const handleDelete = (id: string) => {
    if (window.confirm("确定删除该鱼缸档案吗？")) {
      setTanks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const updateForm = (key: keyof Omit<TankProfile, "id">, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const [waterFormData, setWaterFormData] = useState<WaterMetrics>(emptyWaterMetrics);
  const [selectedTankForRecord, setSelectedTankForRecord] = useState<string>("");
  const [customTankName, setCustomTankName] = useState<string>("");
  const [waterRecords, setWaterRecords] = useState<WaterRecord[]>([]);

  const updateWaterForm = (key: keyof WaterMetrics, value: string) => {
    setWaterFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleWaterRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tankName =
      (selectedTankForRecord && tanks.find((t) => t.id === selectedTankForRecord)?.name) ||
      customTankName.trim();
    if (!tankName) {
      alert("请选择鱼缸或填写鱼缸名称");
      return;
    }
    const hasAnyMetric = (Object.keys(waterFormData) as (keyof WaterMetrics)[]).some(
      (k) => waterFormData[k].trim() !== ""
    );
    if (!hasAnyMetric) {
      alert("请至少填写一项水质指标");
      return;
    }
    const { status, note } = evaluateRecordStatus(waterFormData);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const recordedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newRecord: WaterRecord = {
      id: Date.now().toString(),
      tankName,
      tankId: selectedTankForRecord || undefined,
      recordedAt,
      metrics: { ...waterFormData },
      status,
      note,
    };
    setWaterRecords((prev) => [newRecord, ...prev]);
    setWaterFormData(emptyWaterMetrics);
    setSelectedTankForRecord("");
    setCustomTankName("");
  };

  const getStatusClass = (status: RecordStatus) => {
    switch (status) {
      case "稳定":
        return "status-ok";
      case "关注":
        return "status-watch";
      case "异常":
        return "status-danger";
    }
  };

  const buildMetricSummary = (metrics: WaterMetrics) => {
    const parts: string[] = [];
    (Object.keys(METRIC_RANGES) as (keyof Omit<WaterMetrics, "waterChange">)[]).forEach((k) => {
      if (metrics[k].trim()) {
        const r = METRIC_RANGES[k];
        parts.push(`${r.label} ${metrics[k]}${r.unit}`);
      }
    });
    if (metrics.waterChange.trim()) {
      parts.push(`换水量 ${metrics.waterChange}`);
    }
    return parts.join(" · ");
  };

  const displayRecords = useMemo(() => {
    return [...waterRecords];
  }, [waterRecords]);

  const [waterChangePlans, setWaterChangePlans] = useState<WaterChangePlan[]>([]);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planFormData, setPlanFormData] = useState<Omit<WaterChangePlan, "id" | "createdAt">>(emptyPlanForm);
  const [planFilter, setPlanFilter] = useState<string>("全部");

  const planFilterOptions = ["全部", "已逾期", "即将到期", "正常", "已完成"];

  const openAddPlanModal = () => {
    setPlanFormData({ ...emptyPlanForm });
    setPlanModalOpen(true);
  };

  const closePlanModal = () => {
    setPlanModalOpen(false);
    setPlanFormData({ ...emptyPlanForm });
  };

  const updatePlanForm = (key: keyof Omit<WaterChangePlan, "id" | "createdAt">, value: string) => {
    setPlanFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handlePlanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tankName =
      (planFormData.tankId && tanks.find((t) => t.id === planFormData.tankId)?.name) ||
      planFormData.tankName.trim();
    if (!tankName) {
      alert("请选择鱼缸或填写鱼缸名称");
      return;
    }
    if (!planFormData.nextDate) {
      alert("请选择下次维护日期");
      return;
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newPlan: WaterChangePlan = {
      ...planFormData,
      tankName,
      id: Date.now().toString(),
      createdAt,
    };
    setWaterChangePlans((prev) => [...prev, newPlan]);
    closePlanModal();
  };

  const handleCompletePlan = (planId: string) => {
    if (!window.confirm("确认已完成本次换水？完成后将自动更新下次维护日期。")) return;
    const plan = waterChangePlans.find((p) => p.id === planId);
    if (!plan) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const completedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const cycleDays = parseInt(plan.cycleDays) || 7;
    const nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + cycleDays);
    const nextDateStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;
    const newPlan: WaterChangePlan = {
      ...plan,
      nextDate: nextDateStr,
      completedAt: undefined,
    };
    setWaterChangePlans((prev) => prev.map((p) => (p.id === planId ? newPlan : p)));
  };

  const handleDeletePlan = (planId: string) => {
    if (!window.confirm("确定删除该换水计划吗？")) return;
    setWaterChangePlans((prev) => prev.filter((p) => p.id !== planId));
  };

  const filteredPlans = useMemo(() => {
    let plans = [...waterChangePlans];
    if (planFilter !== "全部") {
      plans = plans.filter((p) => {
        const status = getPlanStatus(p);
        if (planFilter === "已逾期") return status === "overdue";
        if (planFilter === "即将到期") return status === "upcoming";
        if (planFilter === "正常") return status === "normal";
        if (planFilter === "已完成") return status === "completed";
        return true;
      });
    }
    plans.sort((a, b) => {
      const statusRank: Record<PlanStatus, number> = {
        overdue: 0,
        upcoming: 1,
        normal: 2,
        completed: 3,
      };
      const rankA = statusRank[getPlanStatus(a)];
      const rankB = statusRank[getPlanStatus(b)];
      if (rankA !== rankB) return rankA - rankB;
      return new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime();
    });
    return plans;
  }, [waterChangePlans, planFilter]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={values[index]} index={index} />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: string) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted">
            {project.filters.map((filter: string) => (
              <button key={filter}>{filter}</button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <form onSubmit={handleWaterRecordSubmit}>
            <div className="section-heading">
              <div>
                <p>{project.domain}</p>
                <h2>水质记录录入</h2>
              </div>
              <button type="submit" className="primary-action">
                提交记录
              </button>
            </div>
            <div className="field-grid">
              <label>
                <span>鱼缸</span>
                <select
                  value={selectedTankForRecord}
                  onChange={(e) => setSelectedTankForRecord(e.target.value)}
                >
                  <option value="">— 选择已有鱼缸 —</option>
                  {tanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>或自定义鱼缸名称</span>
                <input
                  type="text"
                  value={customTankName}
                  onChange={(e) => setCustomTankName(e.target.value)}
                  placeholder="例如：草缸A"
                />
              </label>
              <label>
                <span>pH</span>
                <input
                  type="number"
                  step="0.1"
                  value={waterFormData.ph}
                  onChange={(e) => updateWaterForm("ph", e.target.value)}
                  placeholder="例如 6.8"
                />
              </label>
              <label>
                <span>氨氮 (ppm)</span>
                <input
                  type="number"
                  step="0.01"
                  value={waterFormData.ammonia}
                  onChange={(e) => updateWaterForm("ammonia", e.target.value)}
                  placeholder="例如 0"
                />
              </label>
              <label>
                <span>亚硝酸盐 (ppm)</span>
                <input
                  type="number"
                  step="0.01"
                  value={waterFormData.nitrite}
                  onChange={(e) => updateWaterForm("nitrite", e.target.value)}
                  placeholder="例如 0"
                />
              </label>
              <label>
                <span>硝酸盐 (ppm)</span>
                <input
                  type="number"
                  step="1"
                  value={waterFormData.nitrate}
                  onChange={(e) => updateWaterForm("nitrate", e.target.value)}
                  placeholder="例如 20"
                />
              </label>
              <label>
                <span>硬度 (dGH)</span>
                <input
                  type="number"
                  step="1"
                  value={waterFormData.hardness}
                  onChange={(e) => updateWaterForm("hardness", e.target.value)}
                  placeholder="例如 8"
                />
              </label>
              <label>
                <span>温度 (°C)</span>
                <input
                  type="number"
                  step="0.5"
                  value={waterFormData.temperature}
                  onChange={(e) => updateWaterForm("temperature", e.target.value)}
                  placeholder="例如 26"
                />
              </label>
              <label className="field-full">
                <span>换水量</span>
                <input
                  type="text"
                  value={waterFormData.waterChange}
                  onChange={(e) => updateWaterForm("waterChange", e.target.value)}
                  placeholder="例如 30%"
                />
              </label>
            </div>
          </form>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>水质历史</p>
            <h2>近期记录</h2>
          </div>
          <button disabled={displayRecords.length === 0}>导出摘要</button>
        </div>
        {displayRecords.length === 0 ? (
          <div className="empty-state empty-state-compact">
            <div className="empty-icon">💧</div>
            <h3>暂无水质记录</h3>
            <p>在上方「水质记录录入」表单中填写数据并提交，记录将出现在这里。</p>
          </div>
        ) : (
          <div className="record-list">
            {displayRecords.map((record, index) => (
              <article key={record.id} className="record-card">
                <div className={`record-index ${getStatusClass(record.status)}`}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="record-main">
                  <header className="record-header">
                    <h3>{record.tankName}</h3>
                    <span className={`record-status record-status-${record.status}`}>
                      {record.status}
                    </span>
                  </header>
                  <p className="record-metrics">
                    {buildMetricSummary(record.metrics) || "未填写指标"}
                  </p>
                  <p className="record-note">{record.note}</p>
                  <p className="record-time">{record.recordedAt}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="tank-profiles panel">
        <div className="section-heading">
          <div>
            <p>档案管理</p>
            <h2>鱼缸档案</h2>
          </div>
          <button className="primary-action" onClick={openAddModal}>
            + 新增档案
          </button>
        </div>

        <div className="chips muted tank-filter-chips">
          {filterOptions.map((filter) => (
            <button
              key={filter}
              className={activeFilter === filter ? "chip-active" : ""}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
              {filter !== "全部" && (
                <span className="chip-count">
                  {tanks.filter((t) => t.tankType === filter).length}
                </span>
              )}
              {filter === "全部" && (
                <span className="chip-count">{tanks.length}</span>
              )}
            </button>
          ))}
        </div>

        {filteredTanks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🐠</div>
            <h3>暂无鱼缸档案</h3>
            <p>
              {tanks.length === 0
                ? "点击右上角「新增档案」，开始记录您的第一个鱼缸信息。"
                : `当前「${activeFilter}」分类下暂无档案，试试切换其他筛选分类。`}
            </p>
            {tanks.length === 0 && (
              <button className="primary-action" onClick={openAddModal}>
                + 新增档案
              </button>
            )}
          </div>
        ) : (
          <div className="tank-grid">
            {filteredTanks.map((tank) => (
              <article key={tank.id} className="tank-card">
                <header className="tank-card-header">
                  <div>
                    <span className={`tank-type-tag tank-type-${tank.tankType}`}>
                      {tank.tankType}
                    </span>
                    <h3>{tank.name}</h3>
                  </div>
                  <div className="tank-actions">
                    <button className="tank-action-btn" onClick={() => openEditModal(tank)}>
                      编辑
                    </button>
                    <button
                      className="tank-action-btn tank-action-delete"
                      onClick={() => handleDelete(tank.id)}
                    >
                      删除
                    </button>
                  </div>
                </header>
                <dl className="tank-info-list">
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
                    <dd>{tank.maintainer || "—"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="water-change-plans panel">
        <div className="section-heading">
          <div>
            <p>维护管理</p>
            <h2>换水计划</h2>
          </div>
          <button className="primary-action" onClick={openAddPlanModal}>
            + 新增计划
          </button>
        </div>

        <div className="chips muted plan-filter-chips">
          {planFilterOptions.map((filter) => {
            let count = 0;
            if (filter === "全部") {
              count = waterChangePlans.length;
            } else {
              count = waterChangePlans.filter((p) => {
                const status = getPlanStatus(p);
                if (filter === "已逾期") return status === "overdue";
                if (filter === "即将到期") return status === "upcoming";
                if (filter === "正常") return status === "normal";
                if (filter === "已完成") return status === "completed";
                return false;
              }).length;
            }
            return (
              <button
                key={filter}
                className={planFilter === filter ? "chip-active" : ""}
                onClick={() => setPlanFilter(filter)}
              >
                {filter}
                <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </div>

        {filteredPlans.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>暂无换水计划</h3>
            <p>
              {waterChangePlans.length === 0
                ? "点击右上角「新增计划」，为您的鱼缸设置定期换水提醒。"
                : `当前「${planFilter}」分类下暂无计划，试试切换其他筛选分类。`}
            </p>
            {waterChangePlans.length === 0 && (
              <button className="primary-action" onClick={openAddPlanModal}>
                + 新增计划
              </button>
            )}
          </div>
        ) : (
          <div className="plan-grid">
            {filteredPlans.map((plan) => {
              const status = getPlanStatus(plan);
              const statusText = getPlanStatusText(status);
              const daysText = getPlanDaysText(plan);
              return (
                <article key={plan.id} className={`plan-card plan-card-${status}`}>
                  <header className="plan-card-header">
                    <div>
                      <span className={`plan-status plan-status-${status}`}>
                        {statusText}
                      </span>
                      <h3>{plan.tankName}</h3>
                    </div>
                    <div className="plan-actions">
                      {status !== "completed" && (
                        <button
                          className="plan-action-btn plan-action-complete"
                          onClick={() => handleCompletePlan(plan.id)}
                        >
                          ✓ 完成换水
                        </button>
                      )}
                      <button
                        className="plan-action-btn plan-action-delete"
                        onClick={() => handleDeletePlan(plan.id)}
                      >
                        删除
                      </button>
                    </div>
                  </header>
                  <dl className="plan-info-list">
                    <div>
                      <dt>换水周期</dt>
                      <dd>每 {plan.cycleDays} 天</dd>
                    </div>
                    <div>
                      <dt>换水比例</dt>
                      <dd>{plan.waterRatio}%</dd>
                    </div>
                    <div>
                      <dt>下次维护</dt>
                      <dd className={`plan-date plan-date-${status}`}>
                        {plan.nextDate}
                        <span className="plan-days">{daysText}</span>
                      </dd>
                    </div>
                    {plan.note && (
                      <div className="plan-note-full">
                        <dt>备注</dt>
                        <dd>{plan.note}</dd>
                      </div>
                    )}
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {planModalOpen && (
        <div className="modal-overlay" onClick={closePlanModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>新增换水计划</h2>
              <button className="modal-close" onClick={closePlanModal}>
                ×
              </button>
            </header>
            <form onSubmit={handlePlanSubmit} className="modal-form">
              <div className="form-grid">
                <label>
                  <span>鱼缸</span>
                  <select
                    value={planFormData.tankId || ""}
                    onChange={(e) => updatePlanForm("tankId", e.target.value)}
                  >
                    <option value="">— 选择已有鱼缸 —</option>
                    {tanks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>或自定义鱼缸名称</span>
                  <input
                    type="text"
                    value={planFormData.tankName}
                    onChange={(e) => updatePlanForm("tankName", e.target.value)}
                    placeholder="例如：草缸A"
                  />
                </label>
                <label>
                  <span>换水周期（天）</span>
                  <input
                    type="number"
                    min="1"
                    value={planFormData.cycleDays}
                    onChange={(e) => updatePlanForm("cycleDays", e.target.value)}
                    placeholder="例如 7"
                  />
                </label>
                <label>
                  <span>计划换水比例（%）</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={planFormData.waterRatio}
                    onChange={(e) => updatePlanForm("waterRatio", e.target.value)}
                    placeholder="例如 30"
                  />
                </label>
                <label className="form-full">
                  <span>下次维护日期 *</span>
                  <input
                    type="date"
                    value={planFormData.nextDate}
                    onChange={(e) => updatePlanForm("nextDate", e.target.value)}
                  />
                </label>
                <label className="form-full">
                  <span>备注</span>
                  <input
                    type="text"
                    value={planFormData.note}
                    onChange={(e) => updatePlanForm("note", e.target.value)}
                    placeholder="例如：周日上午换水，注意水温"
                  />
                </label>
              </div>
              <footer className="modal-footer">
                <button type="button" onClick={closePlanModal}>
                  取消
                </button>
                <button type="submit" className="primary-action">
                  确认新增
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>{editingId ? "编辑鱼缸档案" : "新增鱼缸档案"}</h2>
              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </header>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-grid">
                <label>
                  <span>鱼缸名称 *</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    placeholder="例如：草缸A"
                    required
                  />
                </label>
                <label>
                  <span>缸型</span>
                  <select
                    value={formData.tankType}
                    onChange={(e) => updateForm("tankType", e.target.value)}
                  >
                    {TANK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>容量</span>
                  <input
                    type="text"
                    value={formData.capacity}
                    onChange={(e) => updateForm("capacity", e.target.value)}
                    placeholder="例如：60L 或 120×50×50cm"
                  />
                </label>
                <label>
                  <span>开缸日期</span>
                  <input
                    type="date"
                    value={formData.setupDate}
                    onChange={(e) => updateForm("setupDate", e.target.value)}
                  />
                </label>
                <label className="form-full">
                  <span>主要生物</span>
                  <input
                    type="text"
                    value={formData.mainCreatures}
                    onChange={(e) => updateForm("mainCreatures", e.target.value)}
                    placeholder="例如：红绿灯、宝莲灯、迷你矮珍珠"
                  />
                </label>
                <label className="form-full">
                  <span>维护负责人</span>
                  <input
                    type="text"
                    value={formData.maintainer}
                    onChange={(e) => updateForm("maintainer", e.target.value)}
                    placeholder="例如：张师傅"
                  />
                </label>
              </div>
              <footer className="modal-footer">
                <button type="button" onClick={closeModal}>
                  取消
                </button>
                <button type="submit" className="primary-action">
                  {editingId ? "保存修改" : "确认新增"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
