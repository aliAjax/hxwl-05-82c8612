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

interface TankProfile {
  id: string;
  name: string;
  tankType: string;
  capacity: string;
  setupDate: string;
  mainCreatures: string;
  maintainer: string;
}

const emptyForm: Omit<TankProfile, "id"> = {
  name: "",
  tankType: "草缸",
  capacity: "",
  setupDate: "",
  mainCreatures: "",
  maintainer: "",
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
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>记录字段</h2>
            </div>
            <button className="primary-action">新增记录</button>
          </div>
          <div className="field-grid">
            {project.fields.map((field: string) => (
              <label key={field}>
                <span>{field}</span>
                <input placeholder={"填写" + field} />
              </label>
            ))}
          </div>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>示例数据</p>
            <h2>近期记录</h2>
          </div>
          <button>导出摘要</button>
        </div>
        <div className="record-list">
          {project.records.map((record: string[], index: number) => (
            <article key={record.join("-")} className="record-card">
              <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{record[0]}</h3>
                <p>{record.slice(1).join(" · ")}</p>
              </div>
            </article>
          ))}
        </div>
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
