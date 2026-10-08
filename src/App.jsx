import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileSpreadsheet,
  Info,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import {
  aggregate,
  contractStatus,
  groupUnits,
  normalize,
  STATUS_LABELS,
} from "../shared/domain.js";
import { demoSnapshot } from "../shared/demo.js";
import GoiasMap, { municipalityKey, municipalityNames } from "./GoiasMap.jsx";
import {
  compactMoney,
  dateLabel,
  recordDateLabel,
  downloadCSV,
  money,
  timestampLabel,
} from "./format.js";

const sheetURL =
  "https://docs.google.com/spreadsheets/d/1emv6gWelcVeKFFvZQlHIC5V2d2PT2p5t/edit";
const PAGE_SIZE = 8;
const METRICS = [
  {
    field: "monthly",
    label: "Valor mensal",
    caption: "Soma dos valores mensais",
    icon: CircleDollarSign,
  },
  {
    field: "committed",
    label: "Valor empenhado",
    caption: "Informado na planilha",
    icon: Wallet,
  },
  {
    field: "remaining",
    label: "A empenhar",
    caption: "Saldo informado na planilha",
    icon: ArrowDownLeft,
  },
  {
    field: "deduction",
    label: "Glosas",
    caption: "Valor das glosas informadas",
    icon: FileSpreadsheet,
  },
];

function MetricCard({ metric, totals, index, hasData }) {
  const Icon = metric.icon;
  return (
    <article className={`metric-card metric-${index}`}>
      <div className="metric-top">
        <span>{metric.label}</span>
        <span className="metric-icon">
          <Icon size={18} strokeWidth={1.7} />
        </span>
      </div>
      <strong className="metric-value">
        {hasData ? money(totals[metric.field]) : "—"}
      </strong>
      <div className="metric-bottom">
        {totals.missing[metric.field] > 0 ? (
          <>
            <Info size={12} />
            <span>
              {totals.missing[metric.field]}{" "}
              {totals.missing[metric.field] === 1
                ? "registro sem valor"
                : "registros sem valor"}{" "}
              · total parcial
            </span>
          </>
        ) : (
          <>
            <span className="tiny-dot" />
            {metric.caption}
          </>
        )}
      </div>
    </article>
  );
}

function UnitDetails({ unit, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const handle = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const buttons = dialogRef.current?.querySelectorAll(
          'button, a, input, select, [tabindex="0"]',
        );
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previousFocus?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        ref={dialogRef}
        className="unit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close"
          aria-label="Fechar detalhes"
          onClick={onClose}
          autoFocus
        >
          <X size={20} />
        </button>
        <span className="eyebrow">DETALHAMENTO DA UNIDADE</span>
        <h2 id="detail-title">{unit.unit}</h2>
        <p className="muted">
          <MapPin size={14} />
          {unit.municipality || "Município não informado"}
        </p>
        {unit.rows[0].process && (
          <p className="detail-process">Processo {unit.rows[0].process}</p>
        )}
        <div className="detail-metrics">
          {METRICS.map((metric) => (
            <div key={metric.field}>
              <span>{metric.label}</span>
              <strong>{money(unit[metric.field])}</strong>
            </div>
          ))}
        </div>
        <h3>Vigências e registros</h3>
        <p className="detail-note">
          {unit.rows.length}{" "}
          {unit.rows.length === 1
            ? "registro na planilha"
            : "registros na planilha"}
          . Os valores acima somam os registros desta unidade.
        </p>
        <div className="detail-records">
          {unit.rows.map((row, index) => (
            <article key={row.id}>
              <div>
                <strong>
                  {row.installments
                    ? `Parcelas: ${row.installments}`
                    : `Registro ${index + 1}`}
                </strong>
                <span className={`status-badge ${contractStatus(row)}`}>
                  {STATUS_LABELS[contractStatus(row)]}
                </span>
              </div>
              <p>
                {recordDateLabel(row, "start")} <ArrowRight size={13} />{" "}
                {recordDateLabel(row, "end")}
              </p>
              <p>
                <span>A empenhar</span>
                <strong>{money(row.remaining)}</strong>
                {row.remaining === 0 && (
                  <span className="fully-committed">
                    <Check size={12} />
                    100% empenhado
                  </span>
                )}
              </p>
              <div className="record-financials">
                {["monthly", "committed", "deduction"].map((field) => (
                  <div key={field}>
                    <span>
                      {METRICS.find((metric) => metric.field === field).label}
                      {row.sharedFields?.includes(field) && " · compartilhada"}
                    </span>
                    <strong>{money(row[field])}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [unit, setUnit] = useState("");
  const [status, setStatus] = useState("");
  const [installments, setInstallments] = useState("");
  const [sort, setSort] = useState("monthly");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [view, setView] = useState("overview");
  const [showNotes, setShowNotes] = useState(false);
  const demo = data?.source.kind === "demo";

  async function load(signal) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard", { signal });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.detail || result.error || "Falha ao consultar o servidor.",
        );
      setData(result);
    } catch (failure) {
      if (failure.name !== "AbortError")
        setError(failure.message || "Não foi possível conectar ao servidor.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !demo) load();
    };
    const interval = setInterval(refresh, 15 * 60 * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [demo]);
  useEffect(() => {
    setPage(1);
  }, [search, municipality, unit, status, sort, installments]);

  const records = data?.records ?? [];
  const installmentOptions = [
    ...new Map(
      records
        .filter((r) => r.installments)
        .map((r) => [normalize(r.installments), r.installments]),
    ).values(),
  ];
  const cities = [
    ...new Set(records.map((r) => r.municipality).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const units = [
    ...new Set(
      records
        .filter(
          (r) =>
            !municipality ||
            municipalityKey(r.municipality) === municipalityKey(municipality),
        )
        .map((r) => r.unit),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (!municipality ||
            municipalityKey(r.municipality) ===
              municipalityKey(municipality)) &&
          (!unit || r.unit === unit) &&
          (!status || contractStatus(r) === status) &&
          (!installments ||
            normalize(r.installments) === normalize(installments)) &&
          (!search ||
            normalize(`${r.unit} ${r.municipality}`).includes(
              normalize(search),
            )),
      ),
    [records, municipality, unit, status, search, installments],
  );
  const totals = aggregate(filtered);
  const globalTotals = aggregate(records);
  const groups = groupUnits(filtered).sort((a, b) =>
    sort === "name"
      ? a.unit.localeCompare(b.unit, "pt-BR")
      : (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity),
  );
  const topUnits = groups
    .filter((r) => r.monthly != null)
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, 5);
  const maxMonthly = Math.max(...topUnits.map((r) => r.monthly), 1);
  const maxPage = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const currentPage = Math.min(page, maxPage);
  const visibleRows = groups.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const unmapped = [
    ...new Set(
      filtered
        .filter((r) => !municipalityNames.has(municipalityKey(r.municipality)))
        .map((r) => r.municipality || "Não informado"),
    ),
  ];
  const expiredSoon = filtered.filter(
    (r) => contractStatus(r) === "expiring",
  ).length;
  const filtersActive = Boolean(
    search || municipality || unit || status || installments,
  );
  const selectCity = (value) => {
    setMunicipality(
      cities.find((city) => municipalityKey(city) === municipalityKey(value)) ||
        value,
    );
    setUnit("");
  };
  const clearFilters = () => {
    setSearch("");
    setMunicipality("");
    setUnit("");
    setStatus("");
    setInstallments("");
  };
  const chooseView = (value) => {
    setView(value);
    if (value === "units")
      setTimeout(
        () =>
          document
            .getElementById("units")
            ?.scrollIntoView({ behavior: "smooth" }),
        20,
      );
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            chooseView("overview");
          }}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            Goiás<span className="brand-subtitle">PAINEL DE UNIDADES</span>
          </span>
        </a>
        <span className="nav-label">ACOMPANHAMENTO</span>
        <nav aria-label="Navegação principal">
          <button
            className={view === "overview" ? "nav-item active" : "nav-item"}
            onClick={() => chooseView("overview")}
          >
            <LayoutDashboard size={18} />
            Visão geral
            <span className="nav-active-dot" />
          </button>
          <button
            className={view === "units" ? "nav-item active" : "nav-item"}
            onClick={() => chooseView("units")}
          >
            <Building2 size={18} />
            Unidades
            {data && <span className="nav-count">{globalTotals.units}</span>}
          </button>
          <button
            className={view === "map" ? "nav-item active" : "nav-item"}
            onClick={() => chooseView("map")}
          >
            <MapPin size={18} />
            Mapa de Goiás
          </button>
        </nav>
        <div className="sidebar-source">
          <div className="source-icon">
            <FileSpreadsheet size={21} />
          </div>
          <strong>Uma fonte. Uma visão.</strong>
          <p>Seus indicadores conectados à planilha de unidades.</p>
          <a
            href={
              data?.source.sheetId
                ? `https://docs.google.com/spreadsheets/d/${data.source.sheetId}/edit`
                : sheetURL
            }
            target="_blank"
            rel="noreferrer"
          >
            Abrir planilha <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">GO</span>
          <div>
            <strong>Gestão de unidades</strong>
            <span>Estado de Goiás</span>
          </div>
        </div>
      </aside>
      <div className="main-wrapper">
        <header className="topbar">
          <div className="breadcrumb">
            Acompanhamento <ChevronRight size={13} />
            <strong>
              {view === "map"
                ? "Mapa de Goiás"
                : view === "units"
                  ? "Unidades"
                  : "Visão geral"}
            </strong>
          </div>
          <div className={`sync-pill ${demo ? "demo-pill" : ""}`}>
            <span className="sync-dot" />
            {demo
              ? "Demonstração"
              : data?.stale
                ? "Leitura anterior"
                : data
                  ? "Planilha conectada"
                  : "Aguardando conexão"}
          </div>
        </header>
        <main>
          <section className="page-heading">
            <div>
              <span className="eyebrow">GESTÃO À VISTA</span>
              <h1>
                {view === "map"
                  ? "As unidades no território."
                  : "Uma visão clara das unidades."}
              </h1>
              <p>
                Valores, empenhos e vigências. Todo o panorama de Goiás em um só
                lugar.
              </p>
            </div>
            <button
              className="button refresh-button"
              disabled={loading}
              onClick={() => load()}
            >
              <RefreshCw size={15} className={loading ? "spin" : ""} />
              {loading ? "Carregando" : "Consultar planilha"}
            </button>
          </section>
          {(demo || error || data?.stale) && (
            <div
              className={`notice ${demo ? "demo-notice" : ""}`}
              role={error ? "alert" : "status"}
            >
              <Info size={18} />
              <div>
                <strong>
                  {demo
                    ? "Dados de demonstração — não representam a planilha."
                    : data?.stale
                      ? "Exibindo a última leitura válida."
                      : "A planilha ainda não está conectada."}
                </strong>
                <p>
                  {error ||
                    data?.syncError ||
                    (demo
                      ? "Explore o painel. Consulte a planilha para carregar os valores reais."
                      : "")}
                </p>
              </div>
              {!data && (
                <button
                  className="button small"
                  onClick={() => {
                    setData(demoSnapshot());
                    setError("");
                  }}
                >
                  Explorar demonstração <ArrowRight size={13} />
                </button>
              )}
            </div>
          )}
          <div className="context-line">
            <span>
              <CalendarDays size={14} />
              {filtersActive ? "Visão filtrada" : "Visão global"}
              <span className="context-separator">/</span> {totals.units}{" "}
              unidades · {totals.municipalities} municípios
            </span>
            <span>
              <Clock3 size={13} />
              {demo
                ? "Dados ilustrativos"
                : `Última leitura: ${timestampLabel(data?.updatedAt)}`}
            </span>
          </div>
          <section
            className={`filter-bar ${installmentOptions.length ? "has-installments" : ""}`}
            aria-label="Filtros do painel"
          >
            <div className="filter-icon">
              <SlidersHorizontal size={17} />
            </div>
            <label className="select-field">
              <span>Município</span>
              <select
                aria-label="Município"
                value={municipality}
                onChange={(event) => selectCity(event.target.value)}
              >
                <option value="">Todos os municípios</option>
                {cities.map((city) => (
                  <option key={city}>{city}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-field">
              <span>Unidade</span>
              <select
                aria-label="Unidade"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              >
                <option value="">Todas as unidades</option>
                {units.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-field">
              <span>Vigência</span>
              <select
                aria-label="Vigência"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Todas as vigências</option>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            {installmentOptions.length > 0 && (
              <label className="select-field">
                <span>Parcelas</span>
                <select
                  aria-label="Parcelas"
                  value={installments}
                  onChange={(event) => setInstallments(event.target.value)}
                >
                  <option value="">Todas as parcelas</option>
                  {installmentOptions.map((label) => (
                    <option key={label}>{label}</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
            )}
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Buscar unidade ou município"
                placeholder="Buscar unidade ou município"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {filtersActive && (
              <button
                className="clear-button"
                onClick={clearFilters}
                title="Limpar filtros"
                aria-label="Limpar filtros"
              >
                <X size={16} />
              </button>
            )}
          </section>
          <section
            className="metrics-grid"
            aria-label="Indicadores financeiros"
          >
            {METRICS.map((metric, index) => (
              <MetricCard
                key={metric.field}
                metric={metric}
                totals={totals}
                index={index}
                hasData={Boolean(data)}
              />
            ))}
          </section>
          {!data && (
            <div className="empty-loading">
              {loading ? (
                <>
                  <LoaderCircle className="spin" size={24} />
                  <span>Consultando a planilha…</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={28} />
                  <span>
                    Conecte a planilha para visualizar os indicadores reais.
                  </span>
                </>
              )}
            </div>
          )}
          {data && (
            <>
              <section
                className={`middle-grid ${view === "map" ? "map-focused" : ""}`}
              >
                <article className="panel map-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Presença em Goiás{" "}
                        <span className="count-badge">
                          {totals.municipalities}
                        </span>
                      </h2>
                      <p>Selecione um município para explorar suas unidades.</p>
                    </div>
                    <span className="panel-icon">
                      <MapPin size={17} />
                    </span>
                  </div>
                  <GoiasMap
                    records={filtered}
                    selected={municipality}
                    onSelect={selectCity}
                  />
                  {unmapped.length > 0 && (
                    <p className="map-warning">
                      <Info size={13} />
                      Sem localização no mapa: {unmapped.join(", ")}. Os valores
                      continuam nos totais.
                    </p>
                  )}
                  <div className="panel-footer">
                    <span>Posições aproximadas por município</span>
                    <span>Fonte cartográfica: IBGE / Geodata BR</span>
                  </div>
                </article>
                <div className="side-panels">
                  <article className="panel ranking-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Valores por unidade</h2>
                        <p>Maiores valores mensais na seleção</p>
                      </div>
                      <span className="panel-icon">
                        <ArrowUpRight size={17} />
                      </span>
                    </div>
                    <div className="ranking-list">
                      {topUnits.length ? (
                        topUnits.map((row, index) => (
                          <button
                            key={`${row.unit}:${row.municipality}`}
                            className="ranking-row"
                            onClick={() => setDetail(row)}
                          >
                            <span className="ranking-number">0{index + 1}</span>
                            <span className="ranking-content">
                              <span className="ranking-title">
                                <strong>{row.unit}</strong>
                                <span>{compactMoney(row.monthly)}</span>
                              </span>
                              <span className="ranking-track">
                                <i
                                  style={{
                                    width: `${Math.max(0, (row.monthly / maxMonthly) * 100)}%`,
                                  }}
                                />
                              </span>
                              <span className="ranking-city">
                                {row.municipality || "Município não informado"}
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="no-results">
                          Nenhum valor mensal informado nesta seleção.
                        </p>
                      )}
                    </div>
                    <div className="ranking-footer">
                      Valores informados na planilha <span>BRL / mês</span>
                    </div>
                  </article>
                  <article className="period-card">
                    <div className="period-heading">
                      <span>
                        <CalendarDays size={18} />
                        Panorama das vigências
                      </span>
                      <span className="period-icon">
                        <ArrowUpRight size={17} />
                      </span>
                    </div>
                    <div className="period-dates">
                      <div>
                        <span>Primeiro início</span>
                        <strong>
                          {dateLabel(totals.start, totals.startPrecision)}
                        </strong>
                      </div>
                      <ArrowRight size={18} />
                      <div>
                        <span>Último término</span>
                        <strong>
                          {dateLabel(totals.end, totals.endPrecision)}
                        </strong>
                      </div>
                    </div>
                    <div className="period-note">
                      <span className="period-note-dot" />
                      {expiredSoon
                        ? `${expiredSoon} ${expiredSoon === 1 ? "registro vence" : "registros vencem"} em até 60 dias`
                        : "Consulte a vigência individual na tabela"}
                      <Info size={14} />
                    </div>
                  </article>
                </div>
              </section>
              <section className="panel units-panel" id="units">
                <div className="panel-heading table-heading">
                  <div>
                    <h2>
                      Unidades{" "}
                      <span className="count-badge">{groups.length}</span>
                    </h2>
                    <p>
                      O detalhe de cada unidade, do valor mensal à vigência.
                    </p>
                  </div>
                  <div className="table-actions">
                    <label className="sort-select">
                      <select
                        aria-label="Ordenar unidades"
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                      >
                        <option value="monthly">Maior valor mensal</option>
                        <option value="remaining">
                          Maior saldo a empenhar
                        </option>
                        <option value="name">Nome da unidade</option>
                      </select>
                      <ChevronDown size={14} />
                    </label>
                    <button
                      className="button small"
                      disabled={!filtered.length}
                      onClick={() => downloadCSV(filtered)}
                    >
                      <ArrowDownToLine size={14} />
                      Exportar CSV
                    </button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>UNIDADE / MUNICÍPIO</th>
                        <th>
                          VALOR MENSAL <ArrowDown size={10} />
                        </th>
                        <th>EMPENHADO</th>
                        <th>A EMPENHAR</th>
                        <th>GLOSA</th>
                        <th>VIGÊNCIA</th>
                        <th>
                          <span className="sr-only">Detalhes</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={`${row.unit}:${row.municipality}`}>
                          <td>
                            <button
                              className="unit-name-button"
                              onClick={() => setDetail(row)}
                            >
                              <span className="table-unit-icon">
                                <Building2 size={16} />
                              </span>
                              <span>
                                <strong>{row.unit}</strong>
                                <span>
                                  <MapPin size={10} />
                                  {row.municipality || "Não informado"}
                                  {row.rows.length > 1 &&
                                    ` · ${row.rows.length} registros`}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td className="money-cell">{money(row.monthly)}</td>
                          <td>{money(row.committed)}</td>
                          <td>
                            <span
                              className={
                                row.remaining === 0 && !row.missing.remaining
                                  ? "zero-remaining"
                                  : "remaining-value"
                              }
                            >
                              {money(row.remaining)}
                            </span>
                            {row.remaining === 0 && !row.missing.remaining && (
                              <span className="fully-committed">
                                <Check size={11} />
                                100% empenhado
                              </span>
                            )}
                          </td>
                          <td>{money(row.deduction)}</td>
                          <td>
                            <div className="table-dates">
                              {dateLabel(row.start, row.startPrecision)}
                              <span>
                                até {dateLabel(row.end, row.endPrecision)}
                              </span>
                            </div>
                            <span
                              className={`status-badge ${row.rows.length === 1 ? contractStatus(row.rows[0]) : "unknown"}`}
                            >
                              {row.rows.length === 1
                                ? STATUS_LABELS[contractStatus(row.rows[0])]
                                : "Múltiplas vigências"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="detail-button"
                              aria-label={`Detalhes de ${row.unit}`}
                              onClick={() => setDetail(row)}
                            >
                              <ChevronRight size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!groups.length && (
                    <div className="no-results">
                      <Search size={22} />
                      <strong>Nenhuma unidade encontrada</strong>
                      <span>Ajuste os filtros para ampliar a seleção.</span>
                      <button className="button small" onClick={clearFilters}>
                        Limpar filtros
                      </button>
                    </div>
                  )}
                </div>
                <div className="table-footer">
                  <span>
                    {groups.length
                      ? `Exibindo ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, groups.length)} de ${groups.length} unidades`
                      : "0 unidades"}
                    <span className="footer-dot">·</span>
                    {filtered.length} registros
                  </span>
                  <div className="pagination">
                    <button
                      aria-label="Página anterior"
                      disabled={currentPage === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span>
                      {currentPage} / {maxPage}
                    </span>
                    <button
                      aria-label="Próxima página"
                      disabled={currentPage === maxPage}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </section>
              <div className="methodology">
                <button
                  onClick={() => setShowNotes((value) => !value)}
                  aria-expanded={showNotes}
                >
                  <Info size={14} />
                  Como ler os indicadores <ChevronDown size={13} />
                </button>
                <span>Atualização diária às 06h · Brasília</span>
              </div>
              {showNotes && (
                <section className="notes-panel">
                  <p>
                    <strong>A empenhar:</strong> valor da coluna “A Empenhar”. O
                    símbolo “-” indica saldo zero e 100% empenhado. Nenhum saldo
                    é recalculado.
                  </p>
                  <p>
                    <strong>Totais:</strong> soma dos registros da aba
                    selecionada. Valores ausentes são indicados; não são
                    tratados como zero. Linhas de total e subtotal são
                    excluídas.
                  </p>
                  <p>
                    <strong>Vigência:</strong> primeiro início e último término
                    da seleção. Unidades com vários registros podem ter
                    vigências distintas; consulte os detalhes.
                  </p>
                  <p>
                    <strong>Valor mensal:</strong> soma das linhas selecionadas,
                    que podem representar parcelas e vigências diferentes. Use
                    os filtros de parcelas e vigência para delimitar a seleção.
                    Datas por mês são exibidas sem inventar dias de início ou
                    término.
                  </p>
                  <p>
                    <strong>Atualização:</strong> o servidor consulta o arquivo
                    diariamente e preserva a última leitura válida se a conexão
                    falhar. A última leitura é exibida no topo.
                  </p>
                  {data.warnings?.length > 0 && (
                    <>
                      <h3>Observações da leitura</h3>
                      <ul>
                        {data.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )}
              {data.warnings?.length > 0 && !showNotes && (
                <p className="data-warning">
                  <Info size={14} />
                  {data.warnings.length} observações na leitura da planilha.{" "}
                  <button onClick={() => setShowNotes(true)}>
                    Ver detalhes
                  </button>
                </p>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              Goiás <span> / </span> Painel de unidades
            </span>
            <span>Clareza para acompanhar. Informação para decidir.</span>
          </footer>
        </main>
      </div>
      {detail && <UnitDetails unit={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
