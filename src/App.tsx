import { useState } from "react";
import "./styles.css";

type OrderStatus = "送检中" | "已关闭";

interface Cylinder {
  id: string;
  label: string;
  validUntil: string; // 当前检验有效期
}

interface InspectionOrder {
  id: string;
  cylinderId: string;
  sentDate: string; // 送检日
  expectedReturnDate: string; // 预计返回日
  originalValidUntil: string; // 原检验有效期
  status: OrderStatus;
  newValidUntil: string; // 回执：新有效期
  conclusion: string; // 回执：检修结论
  closedDate?: string;
}

interface Notice {
  kind: "success" | "error" | "info";
  text: string;
}

const todayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const seedCylinders: Cylinder[] = [
  { id: "TANK-204", label: "12L 铝瓶", validUntil: "2028-08-10" },
  { id: "TANK-219", label: "11L 钢瓶", validUntil: "2026-09-05" },
  { id: "TANK-231", label: "双瓶组", validUntil: "2026-09-29" },
  { id: "TANK-236", label: "10L 钢瓶", validUntil: "2027-02-15" },
];

const seedOrders: InspectionOrder[] = [
  {
    id: "INSP-002",
    cylinderId: "TANK-219",
    sentDate: "2026-09-10",
    expectedReturnDate: "2026-09-25",
    originalValidUntil: "2026-09-05",
    status: "送检中",
    newValidUntil: "",
    conclusion: "",
  },
  {
    id: "INSP-001",
    cylinderId: "TANK-204",
    sentDate: "2026-08-02",
    expectedReturnDate: "2026-08-12",
    originalValidUntil: "2026-08-20",
    status: "已关闭",
    newValidUntil: "2028-08-10",
    conclusion: "更换阀杆密封件，气密与水压检测合格",
    closedDate: "2026-08-11",
  },
];

const queueFilters = ["全部", "已过期", "30天内到期"] as const;

function App() {
  const today = todayStr();
  const [cylinders, setCylinders] = useState<Cylinder[]>(seedCylinders);
  const [orders, setOrders] = useState<InspectionOrder[]>(seedOrders);
  const [selectedId, setSelectedId] = useState("TANK-219");
  const [queueFilter, setQueueFilter] = useState<(typeof queueFilters)[number]>("全部");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [form, setForm] = useState({
    cylinderId: "",
    sentDate: today,
    expectedReturnDate: "",
    originalValidUntil: "",
  });
  const [drafts, setDrafts] = useState<Record<string, { newValidUntil: string; conclusion: string }>>({});

  // 派生状态：待充填队列、送检数、单瓶历史均由同一份数据计算，天然同步
  const openOrders = orders.filter((o) => o.status === "送检中");
  const closedCount = orders.length - openOrders.length;
  const openCylinderIds = new Set(openOrders.map((o) => o.cylinderId));
  const queue = cylinders.filter((c) => !openCylinderIds.has(c.id));
  const expiredCount = cylinders.filter((c) => c.validUntil < today).length;

  const daysUntil = (dateStr: string) =>
    Math.round(
      (new Date(dateStr + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000
    );

  const filteredQueue = queue.filter((c) => {
    if (queueFilter === "已过期") return c.validUntil < today;
    if (queueFilter === "30天内到期") return c.validUntil >= today && daysUntil(c.validUntil) <= 30;
    return true;
  });

  const selectedCylinder = cylinders.find((c) => c.id === selectedId);
  const history = orders
    .filter((o) => o.cylinderId === selectedId)
    .sort((a, b) => b.sentDate.localeCompare(a.sentDate) || b.id.localeCompare(a.id));

  const nextOrderId = () => {
    const max = orders.reduce((m, o) => {
      const n = parseInt(o.id.replace("INSP-", ""), 10);
      return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `INSP-${String(max + 1).padStart(3, "0")}`;
  };

  const submitOrder = () => {
    if (!form.cylinderId) return setNotice({ kind: "error", text: "请选择气瓶" });
    if (!form.sentDate) return setNotice({ kind: "error", text: "请填写送检日" });
    if (!form.expectedReturnDate) return setNotice({ kind: "error", text: "请填写预计返回日" });
    if (!form.originalValidUntil) return setNotice({ kind: "error", text: "请填写原检验有效期" });
    if (form.expectedReturnDate < form.sentDate)
      return setNotice({ kind: "error", text: "预计返回日不能早于送检日" });
    if (openCylinderIds.has(form.cylinderId))
      return setNotice({
        kind: "error",
        text: `${form.cylinderId} 已有未关闭的送检单，不得重复送检；待回执关闭后方可新建`,
      });

    const order: InspectionOrder = {
      id: nextOrderId(),
      cylinderId: form.cylinderId,
      sentDate: form.sentDate,
      expectedReturnDate: form.expectedReturnDate,
      originalValidUntil: form.originalValidUntil,
      status: "送检中",
      newValidUntil: "",
      conclusion: "",
    };
    setOrders((prev) => [order, ...prev]);
    setSelectedId(form.cylinderId);
    setForm({ cylinderId: "", sentDate: today, expectedReturnDate: "", originalValidUntil: "" });
    setNotice({
      kind: "success",
      text: `已建立送检单 ${order.id}，${order.cylinderId} 移出待充填队列，送检数 +1`,
    });
  };

  const submitReceipt = (order: InspectionOrder) => {
    const draft = drafts[order.id] ?? { newValidUntil: order.newValidUntil, conclusion: order.conclusion };
    const newValidUntil = draft.newValidUntil;
    const conclusion = draft.conclusion.trim();

    if (!newValidUntil)
      return setNotice({ kind: "error", text: `${order.id}：请填写新有效期` });
    if (newValidUntil < order.expectedReturnDate)
      return setNotice({
        kind: "error",
        text: `${order.id}：新有效期 ${newValidUntil} 早于预计返回日 ${order.expectedReturnDate}，已拒绝提交`,
      });
    if (!conclusion) {
      // 结论为空：保存回执内容，但送检单仍留送检中
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, newValidUntil, conclusion: "" } : o))
      );
      return setNotice({
        kind: "info",
        text: `${order.id} 回执已保存，但检修结论为空，送检单仍留送检中`,
      });
    }

    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? { ...o, newValidUntil, conclusion, status: "已关闭", closedDate: today }
          : o
      )
    );
    setCylinders((prev) =>
      prev.map((c) => (c.id === order.cylinderId ? { ...c, validUntil: newValidUntil } : c))
    );
    setSelectedId(order.cylinderId);
    setNotice({
      kind: "success",
      text: `${order.id} 已关闭：${order.cylinderId} 检验有效期更新为 ${newValidUntil}，已回到待充填队列`,
    });
  };

  const startInspection = (c: Cylinder) => {
    setForm((f) => ({ ...f, cylinderId: c.id, originalValidUntil: c.validUntil }));
    setNotice({ kind: "info", text: `已在新建送检单中选中 ${c.id}，请完善送检日与预计返回日` });
  };

  const cylBadge = (c: Cylinder) => {
    if (openCylinderIds.has(c.id)) return <span className="badge open">送检中</span>;
    if (c.validUntil < today) return <span className="badge expired">已过期</span>;
    return <span className="badge ready">待充填</span>;
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62010 · 潜水气瓶充填 · 瓶阀检修回执</p>
        <h1>潜水气瓶充填记录</h1>
        <span>
          送检单记录送检日、预计返回日与原检验有效期；回执填写新有效期与检修结论。新有效期早于预计返回日将被拒绝提交，结论为空则送检单仍留送检中；同一气瓶存在未关闭送检单时不得重复送检，关闭后方可建立新单。
        </span>
      </section>

      {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}

      <section className="metrics">
        <article>
          <small>待充填</small>
          <strong>{queue.length}</strong>
        </article>
        <article>
          <small>送检中</small>
          <strong>{openOrders.length}</strong>
        </article>
        <article>
          <small>过期提醒</small>
          <strong>{expiredCount}</strong>
        </article>
        <article>
          <small>已关闭回执</small>
          <strong>{closedCount}</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>气瓶台账</h2>
          <div className="cyl-list">
            {cylinders.map((c) => (
              <button
                key={c.id}
                className={`cyl-item${c.id === selectedId ? " active" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <span className="cyl-top">
                  <b>{c.id}</b>
                  {cylBadge(c)}
                </span>
                <small>
                  {c.label} · 检验有效期 {c.validUntil}
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>瓶阀检修</p>
              <h2>新建送检单</h2>
            </div>
            <button className="primary" onClick={submitOrder}>
              提交送检单
            </button>
          </div>
          <div className="field-grid">
            <label>
              <span>气瓶编号</span>
              <select
                value={form.cylinderId}
                onChange={(e) => {
                  const c = cylinders.find((x) => x.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    cylinderId: e.target.value,
                    originalValidUntil: c ? c.validUntil : "",
                  }));
                }}
              >
                <option value="">请选择气瓶</option>
                {cylinders.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}（{c.label}
                    {openCylinderIds.has(c.id) ? " · 送检中" : ""}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>送检日</span>
              <input
                type="date"
                value={form.sentDate}
                onChange={(e) => setForm((f) => ({ ...f, sentDate: e.target.value }))}
              />
            </label>
            <label>
              <span>预计返回日</span>
              <input
                type="date"
                value={form.expectedReturnDate}
                onChange={(e) => setForm((f) => ({ ...f, expectedReturnDate: e.target.value }))}
              />
            </label>
            <label>
              <span>原检验有效期</span>
              <input
                type="date"
                value={form.originalValidUntil}
                onChange={(e) => setForm((f) => ({ ...f, originalValidUntil: e.target.value }))}
              />
            </label>
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>回执填写</p>
            <h2>送检中的订单（{openOrders.length}）</h2>
          </div>
        </div>
        {openOrders.length === 0 ? (
          <p className="empty">当前没有送检中的订单。</p>
        ) : (
          <div className="orders">
            {openOrders.map((o) => {
              const draft =
                drafts[o.id] ?? { newValidUntil: o.newValidUntil, conclusion: o.conclusion };
              return (
                <article className="order-card" key={o.id}>
                  <div className="order-head">
                    <b>
                      {o.id} · {o.cylinderId}
                    </b>
                    <span className="badge open">送检中</span>
                  </div>
                  <div className="order-meta">
                    <span>送检日 {o.sentDate}</span>
                    <span>预计返回日 {o.expectedReturnDate}</span>
                    <span>原检验有效期 {o.originalValidUntil}</span>
                  </div>
                  <div className="receipt-form">
                    <label>
                      <span>新有效期</span>
                      <input
                        type="date"
                        value={draft.newValidUntil}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [o.id]: { ...draft, newValidUntil: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>检修结论</span>
                      <input
                        placeholder="填写检修结论；留空则保存后仍留送检中"
                        value={draft.conclusion}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [o.id]: { ...draft, conclusion: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <button className="primary" onClick={() => submitReceipt(o)}>
                      提交回执
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>待充填队列</p>
            <h2>可安排充填的气瓶（{queue.length}）</h2>
          </div>
          <div className="chips">
            {queueFilters.map((f) => (
              <button
                key={f}
                className={queueFilter === f ? "chip-active" : ""}
                onClick={() => setQueueFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {filteredQueue.length === 0 ? (
          <p className="empty">当前筛选条件下没有待充填的气瓶。</p>
        ) : (
          <div className="records queue-rows">
            {filteredQueue.map((c, index) => {
              const expired = c.validUntil < today;
              const left = daysUntil(c.validUntil);
              return (
                <article key={c.id}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div>
                    <h3>
                      {c.id}{" "}
                      <span className={`badge ${expired ? "expired" : "ready"}`}>
                        {expired ? "已过期" : "待充填"}
                      </span>
                    </h3>
                    <p>
                      {c.label} · 检验有效期 {c.validUntil} ·{" "}
                      {expired ? `已过期 ${-left} 天` : `剩余 ${left} 天`}
                    </p>
                  </div>
                  <button onClick={() => startInspection(c)}>送检</button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>单瓶历史</p>
            <h2>
              {selectedId} 的送检记录（{history.length}）
            </h2>
          </div>
        </div>
        {selectedCylinder && (
          <p className="sub">
            {selectedCylinder.label} · 当前检验有效期 {selectedCylinder.validUntil}
          </p>
        )}
        {history.length === 0 ? (
          <p className="empty">该气瓶暂无送检记录。</p>
        ) : (
          <div className="records">
            {history.map((o, index) => (
              <article key={o.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div>
                  <h3>
                    {o.id}{" "}
                    <span className={`badge ${o.status === "送检中" ? "open" : "closed"}`}>
                      {o.status}
                    </span>
                  </h3>
                  <p>
                    送检日 {o.sentDate} · 预计返回 {o.expectedReturnDate} · 原有效期{" "}
                    {o.originalValidUntil}
                  </p>
                  {o.status === "已关闭" && (
                    <p>
                      回执：新有效期 {o.newValidUntil} · 结论：{o.conclusion} · 关闭于{" "}
                      {o.closedDate}
                    </p>
                  )}
                  {o.status === "送检中" && o.newValidUntil && (
                    <p>回执暂存：新有效期 {o.newValidUntil}（结论未填写，仍留送检中）</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
