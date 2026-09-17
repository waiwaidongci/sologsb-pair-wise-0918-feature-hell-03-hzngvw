import { useMemo, useState } from "react";
import "./styles.css";

/* ================= 类型 ================= */

type FillMethod = "空气" | "高氧" | "Trimix";

type FillRecord = {
  id: string;
  residual: number;
  target: number;
  o2: number;
  he: number;
  method: FillMethod;
  operator: string;
  createdAt: string;
  status: "待充填" | "已签收";
  signedAt?: string;
  signedBy?: string;
};

type ServiceOrder = {
  id: string;
  sentAt: string; // 送检日
  expectedReturn: string; // 预计返回日
  oldValidUntil: string; // 原检验有效期
  status: "送检中" | "已关闭";
  receipt?: {
    newValidUntil: string; // 新有效期
    conclusion: string; // 检修结论
    receivedAt: string; // 回执提交时间
  };
};

type Tank = {
  id: string;
  name: string;
  volume: string;
  validUntil: string; // 检验有效期
  records: FillRecord[];
  serviceOrders: ServiceOrder[];
};

/* ================= 工具 ================= */

const DAY = 86400000;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function daysUntil(dateStr: string) {
  return Math.round(
    (new Date(dateStr + "T00:00:00").getTime() - new Date(todayStr() + "T00:00:00").getTime()) / DAY
  );
}

function nowTime() {
  const d = new Date();
  return `${todayStr()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

let seq = 100;
function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}`;
}

const openOrder = (t: Tank) => t.serviceOrders.find((o) => o.status === "送检中");
const pendingCount = (t: Tank) => t.records.filter((r) => r.status === "待充填").length;

/* ================= 初始数据 ================= */

const initialTanks: Tank[] = [
  {
    id: "TANK-204",
    name: "12L 铝瓶",
    volume: "12L",
    validUntil: addDays(todayStr(), 200),
    records: [
      {
        id: "F-1",
        residual: 55,
        target: 200,
        o2: 21,
        he: 0,
        method: "空气",
        operator: "阿海",
        createdAt: addDays(todayStr(), -1) + " 09:20",
        status: "待充填",
      },
      {
        id: "F-2",
        residual: 30,
        target: 200,
        o2: 21,
        he: 0,
        method: "空气",
        operator: "阿海",
        createdAt: addDays(todayStr(), -20) + " 15:05",
        status: "已签收",
        signedAt: addDays(todayStr(), -20) + " 16:10",
        signedBy: "老周",
      },
    ],
    serviceOrders: [],
  },
  {
    id: "TANK-219",
    name: "11L 钢瓶",
    volume: "11L",
    validUntil: addDays(todayStr(), 90),
    records: [
      {
        id: "F-3",
        residual: 40,
        target: 200,
        o2: 32,
        he: 0,
        method: "高氧",
        operator: "小蓝",
        createdAt: addDays(todayStr(), -2) + " 11:40",
        status: "待充填",
      },
    ],
    serviceOrders: [],
  },
  {
    id: "TANK-231",
    name: "双瓶组",
    volume: "2×12L",
    validUntil: addDays(todayStr(), 12),
    records: [],
    serviceOrders: [
      {
        id: "S-1",
        sentAt: addDays(todayStr(), -3),
        expectedReturn: addDays(todayStr(), 4),
        oldValidUntil: addDays(todayStr(), 12),
        status: "送检中",
      },
    ],
  },
  {
    id: "TANK-240",
    name: "15L 钢瓶",
    volume: "15L",
    validUntil: addDays(todayStr(), -6),
    records: [],
    serviceOrders: [],
  },
];

const emptyFillForm = {
  tankId: "",
  residual: "",
  target: "200",
  o2: "21",
  he: "0",
  method: "空气" as FillMethod,
  operator: "",
};

const emptyServiceForm = { sentAt: todayStr(), expectedReturn: "", oldValidUntil: "" };
const emptyReceiptForm = { newValidUntil: "", conclusion: "" };

/* ================= 组件 ================= */

function App() {
  const [tanks, setTanks] = useState<Tank[]>(initialTanks);
  const [selectedId, setSelectedId] = useState<string>(initialTanks[0].id);
  const [filter, setFilter] = useState("全部");
  const [fillForm, setFillForm] = useState(emptyFillForm);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [receiptForm, setReceiptForm] = useState(emptyReceiptForm);
  const [receiptError, setReceiptError] = useState("");
  const [fillError, setFillError] = useState("");
  const [serviceMsg, setServiceMsg] = useState("");
  const [signer, setSigner] = useState<Record<string, string>>({});

  const selected = tanks.find((t) => t.id === selectedId) ?? tanks[0];
  const selectedOpen = openOrder(selected);

  /* ---------- 统计 ---------- */
  const stats = useMemo(() => {
    const allRecords = tanks.flatMap((t) => t.records);
    const pending = allRecords.filter((r) => r.status === "待充填").length;
    const expired = tanks.filter((t) => daysUntil(t.validUntil) < 0).length;
    const expiring = tanks.filter((t) => {
      const d = daysUntil(t.validUntil);
      return d >= 0 && d <= 30;
    }).length;
    const o2List = allRecords.map((r) => r.o2);
    const avgO2 = o2List.length
      ? (o2List.reduce((a, b) => a + b, 0) / o2List.length).toFixed(1)
      : "—";
    const signed = allRecords.filter((r) => r.status === "已签收").length;
    const servicing = tanks.filter((t) => openOrder(t)).length;
    return { pending, expired, expiring, avgO2, signed, servicing };
  }, [tanks]);

  /* ---------- 待充填队列（含过滤） ---------- */
  const queue = useMemo(() => {
    const rows: { tank: Tank; record: FillRecord }[] = [];
    for (const tank of tanks) {
      for (const record of tank.records) {
        if (record.status !== "待充填") continue;
        if (filter === "待检验") {
          if (!openOrder(tank)) continue;
        } else if (filter !== "全部" && record.method !== filter) {
          continue;
        }
        rows.push({ tank, record });
      }
    }
    return rows;
  }, [tanks, filter]);

  /* ---------- 充填登记 ---------- */
  function submitFill() {
    const tank = tanks.find((t) => t.id === fillForm.tankId);
    if (!tank) return setFillError("请选择气瓶");
    if (openOrder(tank)) return setFillError("该气瓶正在送检中，暂不能登记充填");
    const residual = Number(fillForm.residual);
    const target = Number(fillForm.target);
    const o2 = Number(fillForm.o2);
    const he = Number(fillForm.he);
    if (fillForm.residual === "" || residual < 0) return setFillError("请填写残压");
    if (!target || target <= residual) return setFillError("目标压力需大于残压");
    if (o2 < 21 || o2 > 100) return setFillError("氧含量需在 21–100% 之间");
    if (he < 0 || he > 79) return setFillError("氦含量需在 0–79% 之间");
    if (o2 + he > 100) return setFillError("氧含量 + 氦含量不能超过 100%");
    if (!fillForm.operator.trim()) return setFillError("请填写操作员");

    const record: FillRecord = {
      id: nextId("F"),
      residual,
      target,
      o2,
      he,
      method: fillForm.method,
      operator: fillForm.operator.trim(),
      createdAt: nowTime(),
      status: "待充填",
    };
    setTanks((prev) =>
      prev.map((t) => (t.id === tank.id ? { ...t, records: [record, ...t.records] } : t))
    );
    setFillForm({ ...emptyFillForm, tankId: tank.id });
    setFillError("");
  }

  /* ---------- 签收 ---------- */
  function signRecord(tankId: string, recordId: string) {
    const name = (signer[recordId] ?? "").trim();
    if (!name) return;
    setTanks((prev) =>
      prev.map((t) =>
        t.id === tankId
          ? {
              ...t,
              records: t.records.map((r) =>
                r.id === recordId
                  ? { ...r, status: "已签收", signedAt: nowTime(), signedBy: name }
                  : r
              ),
            }
          : t
      )
    );
    setSigner((prev) => ({ ...prev, [recordId]: "" }));
  }

  /* ---------- 送检 ---------- */
  function submitService() {
    if (!selected) return;
    if (openOrder(selected)) {
      return setServiceMsg("该气瓶已有未关闭的送检单，不能重复送检");
    }
    if (!serviceForm.sentAt || !serviceForm.expectedReturn || !serviceForm.oldValidUntil) {
      return setServiceMsg("请完整填写送检日、预计返回日和原检验有效期");
    }
    if (serviceForm.expectedReturn < serviceForm.sentAt) {
      return setServiceMsg("预计返回日不能早于送检日");
    }
    const order: ServiceOrder = {
      id: nextId("S"),
      sentAt: serviceForm.sentAt,
      expectedReturn: serviceForm.expectedReturn,
      oldValidUntil: serviceForm.oldValidUntil,
      status: "送检中",
    };
    setTanks((prev) =>
      prev.map((t) =>
        t.id === selected.id ? { ...t, serviceOrders: [order, ...t.serviceOrders] } : t
      )
    );
    setServiceForm(emptyServiceForm);
    setServiceMsg(`已建立送检单 ${order.id}，气瓶进入送检中`);
  }

  /* ---------- 回执 ---------- */
  function submitReceipt() {
    if (!selected || !selectedOpen) return;
    const { newValidUntil, conclusion } = receiptForm;
    if (!newValidUntil) return setReceiptError("请填写新有效期");
    if (newValidUntil < selectedOpen.expectedReturn) {
      return setReceiptError(
        `新有效期 ${newValidUntil} 早于预计返回日 ${selectedOpen.expectedReturn}，已拒绝提交`
      );
    }
    if (!conclusion.trim()) {
      setReceiptError("检修结论为空：回执未提交，送检单仍为「送检中」");
      return;
    }
    setTanks((prev) =>
      prev.map((t) =>
        t.id === selected.id
          ? {
              ...t,
              validUntil: newValidUntil,
              serviceOrders: t.serviceOrders.map((o) =>
                o.id === selectedOpen.id
                  ? {
                      ...o,
                      status: "已关闭",
                      receipt: { newValidUntil, conclusion: conclusion.trim(), receivedAt: nowTime() },
                    }
                  : o
              ),
            }
          : t
      )
    );
    setReceiptForm(emptyReceiptForm);
    setReceiptError("");
    setServiceMsg(`回执已提交，送检单 ${selectedOpen.id} 关闭，检验有效期更新为 ${newValidUntil}`);
  }

  /* ================= 渲染 ================= */

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62010 · 潜水气瓶充填 · Port 62010</p>
        <h1>潜水气瓶充填记录</h1>
        <span>
          记录气瓶编号、容积、检验有效期、残压、目标压力、氧含量、氦含量、充填方式和操作员；支持待充填队列、
          混合气比例提示、检验过期提醒、充填完成签收、单瓶历史，以及瓶阀检修送检单与回执闭环管理。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>待充填</small>
          <strong>{stats.pending}</strong>
        </article>
        <article>
          <small>过期提醒</small>
          <strong>
            {stats.expired}
            <em className="unit">过期 / {stats.expiring} 临期</em>
          </strong>
        </article>
        <article>
          <small>平均氧含量</small>
          <strong>{stats.avgO2 === "—" ? "—" : `${stats.avgO2}%`}</strong>
        </article>
        <article>
          <small>签收单</small>
          <strong>{stats.signed}</strong>
        </article>
        <article>
          <small>送检中</small>
          <strong>{stats.servicing}</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>充填分类</h2>
          <div className="chips">
            {["全部", "空气", "高氧", "Trimix", "待检验"].map((item) => (
              <button
                key={item}
                className={filter === item ? "chip-active" : ""}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <h2 style={{ marginTop: 22 }}>气瓶台账</h2>
          <div className="tank-list">
            {tanks.map((t) => {
              const d = daysUntil(t.validUntil);
              const servicing = !!openOrder(t);
              return (
                <button
                  key={t.id}
                  className={`tank-item ${t.id === selected?.id ? "tank-active" : ""}`}
                  onClick={() => {
                    setSelectedId(t.id);
                    setReceiptError("");
                    setServiceMsg("");
                  }}
                >
                  <b>{t.id}</b>
                  <span>
                    {t.name} · {servicing ? "送检中" : d < 0 ? `已过期 ${-d} 天` : `余 ${d} 天`}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>专业字段</p>
              <h2>新增充填记录</h2>
            </div>
            <button className="primary" onClick={submitFill}>
              保存记录
            </button>
          </div>
          <div className="field-grid">
            <label>
              <span>气瓶编号</span>
              <select
                value={fillForm.tankId}
                onChange={(e) => setFillForm({ ...fillForm, tankId: e.target.value })}
              >
                <option value="">请选择气瓶</option>
                {tanks.map((t) => (
                  <option key={t.id} value={t.id} disabled={!!openOrder(t)}>
                    {t.id}（{t.name}）{openOrder(t) ? " · 送检中" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>充填方式</span>
              <select
                value={fillForm.method}
                onChange={(e) => setFillForm({ ...fillForm, method: e.target.value as FillMethod })}
              >
                <option>空气</option>
                <option>高氧</option>
                <option>Trimix</option>
              </select>
            </label>
            <label>
              <span>残压 (bar)</span>
              <input
                type="number"
                min="0"
                placeholder="填写残压"
                value={fillForm.residual}
                onChange={(e) => setFillForm({ ...fillForm, residual: e.target.value })}
              />
            </label>
            <label>
              <span>目标压力 (bar)</span>
              <input
                type="number"
                min="0"
                placeholder="填写目标压力"
                value={fillForm.target}
                onChange={(e) => setFillForm({ ...fillForm, target: e.target.value })}
              />
            </label>
            <label>
              <span>氧含量 (%)</span>
              <input
                type="number"
                min="21"
                max="100"
                placeholder="填写氧含量"
                value={fillForm.o2}
                onChange={(e) => setFillForm({ ...fillForm, o2: e.target.value })}
              />
            </label>
            <label>
              <span>氦含量 (%)</span>
              <input
                type="number"
                min="0"
                max="79"
                placeholder="填写氦含量"
                value={fillForm.he}
                onChange={(e) => setFillForm({ ...fillForm, he: e.target.value })}
              />
            </label>
            <label>
              <span>操作员</span>
              <input
                placeholder="填写操作员"
                value={fillForm.operator}
                onChange={(e) => setFillForm({ ...fillForm, operator: e.target.value })}
              />
            </label>
          </div>

          {(() => {
            const o2 = Number(fillForm.o2) || 0;
            const he = Number(fillForm.he) || 0;
            const n2 = Math.max(0, 100 - o2 - he);
            const fo2 = (o2 / 100).toFixed(2);
            const mod = o2 > 0 ? Math.floor((10 / (o2 / 100) - 10) * 10) / 10 : 0;
            return (
              <div className="mix-hint">
                <b>混合气比例提示：</b>
                氧 {o2}% · 氦 {he}% · 氮 {n2}%
                {he > 0 ? `（Trimix ${o2}/${he}）` : o2 > 21 ? `（EAN${o2}）` : "（空气）"}
                ｜ FO₂ {fo2}，约 MOD {mod.toFixed(1)}m（1.6bar 上限请人工复核）
              </div>
            );
          })()}
          {fillError && <p className="error">{fillError}</p>}
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>待充填队列</p>
            <h2>待办与签收（{queue.length}）</h2>
          </div>
        </div>
        <div className="records">
          {queue.length === 0 && <p className="empty">当前过滤条件下没有待充填记录</p>}
          {queue.map(({ tank, record }, index) => (
            <article key={record.id}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h3>
                  {tank.id} · {record.method}
                  {openOrder(tank) && <span className="tag tag-warn">送检中</span>}
                  {daysUntil(tank.validUntil) < 0 && <span className="tag tag-danger">检验已过期</span>}
                </h3>
                <p>
                  残压 {record.residual}bar → 目标 {record.target}bar ｜ O₂ {record.o2}% / He{" "}
                  {record.he}% ｜ 操作员 {record.operator} ｜ 登记 {record.createdAt}
                </p>
                <div className="sign-row">
                  <input
                    placeholder="签收人"
                    value={signer[record.id] ?? ""}
                    onChange={(e) => setSigner((prev) => ({ ...prev, [record.id]: e.target.value }))}
                  />
                  <button
                    className="primary"
                    disabled={!(signer[record.id] ?? "").trim()}
                    onClick={() => signRecord(tank.id, record.id)}
                  >
                    充填完成签收
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="workspace">
        <section className="panel">
          <div className="heading">
            <div>
              <p>瓶阀检修</p>
              <h2>送检单 · {selected?.id}</h2>
            </div>
          </div>

          {selectedOpen ? (
            <div className="notice notice-warn">
              送检单 {selectedOpen.id} 进行中：送检日 {selectedOpen.sentAt}，预计返回{" "}
              {selectedOpen.expectedReturn}，原检验有效期 {selectedOpen.oldValidUntil}。
              未关闭前不得重复送检。
            </div>
          ) : (
            <>
              <div className="field-grid">
                <label>
                  <span>送检日</span>
                  <input
                    type="date"
                    value={serviceForm.sentAt}
                    onChange={(e) => setServiceForm({ ...serviceForm, sentAt: e.target.value })}
                  />
                </label>
                <label>
                  <span>预计返回日</span>
                  <input
                    type="date"
                    value={serviceForm.expectedReturn}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, expectedReturn: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>原检验有效期</span>
                  <input
                    type="date"
                    value={serviceForm.oldValidUntil}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, oldValidUntil: e.target.value })
                    }
                  />
                </label>
              </div>
              <button className="primary block-btn" onClick={submitService}>
                建立送检单
              </button>
            </>
          )}
          {serviceMsg && <p className="info">{serviceMsg}</p>}

          <h3 style={{ marginTop: 20 }}>送检记录（{selected?.serviceOrders.length ?? 0}）</h3>
          <div className="records">
            {(selected?.serviceOrders ?? []).length === 0 && (
              <p className="empty">该气瓶暂无送检记录</p>
            )}
            {(selected?.serviceOrders ?? []).map((o) => (
              <article key={o.id}>
                <b>{o.status === "送检中" ? "检" : "闭"}</b>
                <div>
                  <h3>
                    {o.id}
                    <span className={`tag ${o.status === "送检中" ? "tag-warn" : "tag-ok"}`}>
                      {o.status}
                    </span>
                  </h3>
                  <p>
                    送检 {o.sentAt} ｜ 预计返回 {o.expectedReturn} ｜ 原有效期 {o.oldValidUntil}
                    {o.receipt &&
                      ` ｜ 回执：新有效期 ${o.receipt.newValidUntil}，结论「${o.receipt.conclusion}」（${o.receipt.receivedAt}）`}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>检修回执</p>
              <h2>填写回执 · {selectedOpen ? selectedOpen.id : "无进行中送检单"}</h2>
            </div>
          </div>
          {selectedOpen ? (
            <>
              <div className="field-grid">
                <label>
                  <span>新有效期（不得早于预计返回日 {selectedOpen.expectedReturn}）</span>
                  <input
                    type="date"
                    value={receiptForm.newValidUntil}
                    onChange={(e) => {
                      setReceiptForm({ ...receiptForm, newValidUntil: e.target.value });
                      setReceiptError("");
                    }}
                  />
                </label>
                <label>
                  <span>检修结论（为空则保持送检中）</span>
                  <input
                    placeholder="如：瓶阀更换密封件，测试合格"
                    value={receiptForm.conclusion}
                    onChange={(e) => {
                      setReceiptForm({ ...receiptForm, conclusion: e.target.value });
                      setReceiptError("");
                    }}
                  />
                </label>
              </div>
              <button className="primary block-btn" onClick={submitReceipt}>
                提交回执并关闭送检单
              </button>
              {receiptError && <p className="error">{receiptError}</p>}
            </>
          ) : (
            <p className="empty">当前气瓶没有送检中的单据；关闭后的送检单可再次建立新单。</p>
          )}
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>单瓶历史</p>
            <h2>
              {selected?.id} · {selected?.name}
            </h2>
          </div>
          <span
            className={`tag ${
              selected
                ? daysUntil(selected.validUntil) < 0
                  ? "tag-danger"
                  : daysUntil(selected.validUntil) <= 30
                  ? "tag-warn"
                  : "tag-ok"
                : "tag-ok"
            }`}
          >
            检验有效期 {selected?.validUntil}
            {selected &&
              (daysUntil(selected.validUntil) < 0
                ? `（已过期 ${-daysUntil(selected.validUntil)} 天）`
                : `（余 ${daysUntil(selected.validUntil)} 天）`)}
          </span>
        </div>
        <div className="records">
          {(selected?.records ?? []).length === 0 && <p className="empty">该气瓶暂无充填记录</p>}
          {(selected?.records ?? []).map((r, index) => (
            <article key={r.id}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h3>
                  {r.method} · {r.target}bar
                  <span className={`tag ${r.status === "已签收" ? "tag-ok" : "tag-warn"}`}>
                    {r.status}
                  </span>
                </h3>
                <p>
                  残压 {r.residual}bar ｜ O₂ {r.o2}% / He {r.he}% ｜ 操作员 {r.operator} ｜ 登记{" "}
                  {r.createdAt}
                  {r.status === "已签收" && ` ｜ 签收 ${r.signedBy}（${r.signedAt}）`}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
