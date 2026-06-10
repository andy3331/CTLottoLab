import { useEffect, useState } from "react";
import { DISCLAIMER_TEXT, PICKER_MODES, type PickerMode } from "@shared/game";
import type {
  DrawRecord,
  FrequencyRow,
  GeneratedTicket,
  ImportSummary,
  PickerBacktestRun,
  PickerRequest,
  SummaryResponse,
} from "@shared/types";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "./lib/api";

type Page = "dashboard" | "insights" | "numbers" | "history" | "picker" | "import";
const DASHBOARD_FAVORITES_KEY = "ct-lotto-lab.dashboard-favorites";
const DEFAULT_DASHBOARD_FAVORITES: PickerMode[] = ["low_split", "smart", "balanced", "hot"];

const initialPicker: PickerRequest = {
  mode: "smart",
  ticketCount: 5,
  excludePreviousWinningCombinations: true,
  balanceOddEven: true,
  balanceLowHigh: true,
  avoidFourOrMoreConsecutive: true,
  preferHistoricalNormalSumRange: true,
};

const MODE_DETAILS: Record<PickerMode, { label: string; description: string }> = {
  random: {
    label: "Random",
    description: "Generates a fully random valid CT Lotto! ticket with no historical weighting.",
  },
  hot: {
    label: "Hot",
    description: "Leans toward numbers that have appeared more often in the imported historical draw data.",
  },
  cold: {
    label: "Cold",
    description: "Leans toward numbers that have appeared less often in the imported historical draw data.",
  },
  low_split: {
    label: "Low-Split Random",
    description: "Generates random valid numbers while avoiding common human-picked patterns like birthdays, sequences, lucky numbers, and neat visual patterns. This does not improve your odds of being drawn, but it may reduce the chance of splitting a jackpot if you win.",
  },
  balanced: {
    label: "Balanced",
    description: "Builds each ticket from 2 historically hot numbers, 2 neutral numbers, and 2 cold numbers.",
  },
  weighted: {
    label: "Weighted",
    description: "Uses historical frequency as a probability weight, so commonly drawn numbers are picked more often but not exclusively.",
  },
  smart: {
    label: "Smart",
    description: "Combines weighted historical scoring with optional balance rules like odd/even, low/high, sum range, and no long consecutive runs.",
  },
};

const MODE_COLORS: Record<PickerMode, string> = {
  random: "#9bb2c9",
  hot: "#e19a4b",
  cold: "#5bc0be",
  low_split: "#f4d58d",
  balanced: "#9fd356",
  weighted: "#d17dd7",
  smart: "#ff7f6a",
};

const PICKER_RULE_DETAILS: Array<{
  key: keyof Pick<
    PickerRequest,
    | "excludePreviousWinningCombinations"
    | "balanceOddEven"
    | "balanceLowHigh"
    | "avoidFourOrMoreConsecutive"
    | "preferHistoricalNormalSumRange"
  >;
  label: string;
  description: string;
}> = [
  {
    key: "excludePreviousWinningCombinations",
    label: "Exclude previous winning combinations",
    description: "Skips any generated ticket that exactly matches a historical winning 6-number draw already in your database.",
  },
  {
    key: "balanceOddEven",
    label: "Balance odd/even",
    description: "Prefers tickets with a more even mix of odd and even numbers instead of clustering too heavily to one side.",
  },
  {
    key: "balanceLowHigh",
    label: "Balance low/high",
    description: "Prefers a mix of lower numbers and higher numbers rather than concentrating too much in one half of the range.",
  },
  {
    key: "avoidFourOrMoreConsecutive",
    label: "Avoid 4 or more consecutive numbers",
    description: "Rejects tickets that contain long consecutive runs like 10-11-12-13.",
  },
  {
    key: "preferHistoricalNormalSumRange",
    label: "Prefer historical-normal sum range",
    description: "Prefers tickets whose six-number total falls near the common historical sum range seen in imported draws.",
  },
];

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [frequency, setFrequency] = useState<FrequencyRow[]>([]);
  const [draws, setDraws] = useState<DrawRecord[]>([]);
  const [tickets, setTickets] = useState<GeneratedTicket[]>([]);
  const [picker, setPicker] = useState<PickerRequest>(initialPicker);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [numberFilter, setNumberFilter] = useState("");
  const [status, setStatus] = useState<string>("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [dashboardFavoriteModes, setDashboardFavoriteModes] = useState<PickerMode[]>(DEFAULT_DASHBOARD_FAVORITES);

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(DASHBOARD_FAVORITES_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as string[];
      const valid = PICKER_MODES.filter((mode) => parsed.includes(mode));
      if (valid.length > 0) {
        setDashboardFavoriteModes(valid);
      }
    } catch {
      // Ignore malformed local preferences and keep defaults.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_FAVORITES_KEY, JSON.stringify(dashboardFavoriteModes));
  }, [dashboardFavoriteModes]);

  async function refreshAll() {
    try {
      const [nextSummary, nextFrequency, nextDraws] = await Promise.all([
        api.getSummary(),
        api.getFrequency(),
        api.getDraws(),
      ]);
      setSummary(nextSummary);
      setFrequency(nextFrequency);
      setDraws(nextDraws);
      setStatus("");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function handleImport(file: File | null) {
    if (!file) return;
    try {
      const result = await api.importFile(file);
      setImportSummary(result);
      await refreshAll();
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function handleGenerate() {
    try {
      const result = await api.generateTickets(picker);
      setTickets(result);
      setStatus("");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function handleSyncNow() {
    try {
      setSyncBusy(true);
      const result = await api.syncNow();
      setImportSummary(result);
      await refreshAll();
      setStatus(`CT Lottery sync complete: ${result.rowsInserted} new draw(s) added.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleHistorySearch() {
    try {
      const result = await api.getDraws({
        date: dateFilter || undefined,
        number: numberFilter ? Number(numberFilter) : undefined,
      });
      setDraws(result);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">
            <img src="/app-icon.svg" alt="CT Lotto Lab icon" />
          </div>
          <p className="eyebrow">CT Lotto Lab</p>
          <h1>CT Lotto! analysis without prediction claims.</h1>
          <p className="lede">
            Import official result files, review historical patterns, and generate rules-valid number sets framed as entertainment-only recommendations.
          </p>
        </div>
        <nav className="nav">
          {[
            ["dashboard", "Dashboard"],
            ["insights", "Insights"],
            ["numbers", "Number Table"],
            ["history", "Draw History"],
            ["picker", "Picker"],
            ["import", "Import"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={page === value ? "nav-btn active" : "nav-btn"}
              onClick={() => setPage(value as Page)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="disclaimer-panel">
          <strong>Disclaimer</strong>
          <p>{DISCLAIMER_TEXT}</p>
        </div>
      </aside>

      <main className="content">
        {status ? <div className="alert">{status}</div> : null}
        {page === "dashboard" && summary ? (
          <section className="page">
            <header className="page-header">
              <h2>Dashboard</h2>
              <button className="ghost-btn" onClick={() => void refreshAll()}>
                Refresh
              </button>
            </header>
            <div className="stats-grid">
              <StatCard label="Next draw" value={formatDisplayDate(summary.lottoGameInfo?.nextDrawDate)} />
              <StatCard label="Estimated jackpot" value={summary.lottoGameInfo?.estimatedJackpot ?? "N/A"} />
              <StatCard label="Est. cash value" value={summary.lottoGameInfo?.estimatedCashValue ?? "N/A"} />
              <StatCard label="Jackpot winner?" value={formatWinnerStatus(summary)} />
            </div>
            <div className="grid-two">
              <Panel title="Latest Draw">
                <div className="ticket-top">
                  <strong>{formatDisplayDate(summary.lottoGameInfo?.latestDrawDate)}</strong>
                  <span className="score">{formatLatestDrawWinnerLabel(summary)}</span>
                </div>
                <div className="ball-row">
                  {summary.lottoGameInfo?.latestDrawNumbers.length ? (
                    summary.lottoGameInfo.latestDrawNumbers.map((number) => (
                      <span className="ball" key={`latest-${number}`}>
                        {number}
                      </span>
                    ))
                  ) : (
                    <p className="hint">Latest draw numbers have not been refreshed from CT Lottery yet.</p>
                  )}
                </div>
                <p className="sync-line">
                  Winning tickets sold: {summary.lottoGameInfo?.winningTicketsSold?.toLocaleString() ?? "N/A"}
                </p>
                <p className="sync-line">
                  Jackpot-winning tickets: {summary.lottoGameInfo?.jackpotWinnerCount ?? "N/A"}
                </p>
              </Panel>
              <Panel title="Quick Picks for Next Draw">
                <div className="page-header">
                  <span className="hint">Choose which strategy cards live on the dashboard.</span>
                  <div className="action-row">
                    <button className="ghost-btn" onClick={() => void refreshAll()}>
                      Refresh Picks
                    </button>
                    <button className="ghost-btn" onClick={() => setDashboardFavoriteModes(DEFAULT_DASHBOARD_FAVORITES)}>
                      Reset Favorites
                    </button>
                  </div>
                </div>
                <div className="favorite-mode-list">
                  {PICKER_MODES.map((mode) => {
                    const selected = dashboardFavoriteModes.includes(mode);
                    return (
                      <div
                        key={`favorite-${mode}`}
                        className={selected ? "favorite-chip active" : "favorite-chip"}
                      >
                        <button
                          className="favorite-chip-toggle"
                          onClick={() => setDashboardFavoriteModes((current) => toggleDashboardFavorite(current, mode))}
                        >
                          {MODE_DETAILS[mode].label}
                        </button>
                        {selected ? (
                          <div className="favorite-chip-actions">
                            <button
                              className="favorite-chip-move"
                              onClick={() => setDashboardFavoriteModes((current) => moveDashboardFavorite(current, mode, -1))}
                              disabled={dashboardFavoriteModes.indexOf(mode) === 0}
                              aria-label={`Move ${MODE_DETAILS[mode].label} earlier`}
                            >
                              ←
                            </button>
                            <button
                              className="favorite-chip-move"
                              onClick={() => setDashboardFavoriteModes((current) => moveDashboardFavorite(current, mode, 1))}
                              disabled={dashboardFavoriteModes.indexOf(mode) === dashboardFavoriteModes.length - 1}
                              aria-label={`Move ${MODE_DETAILS[mode].label} later`}
                            >
                              →
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="ticket-list">
                  {getDashboardSuggestionsForDisplay(summary, dashboardFavoriteModes).map((suggestion) => (
                    <article className="ticket-card" key={suggestion.mode}>
                      <div className="ticket-top">
                        <strong>{MODE_DETAILS[suggestion.mode].label}</strong>
                        <span className="score">{suggestion.ticket.score}/100</span>
                      </div>
                      <div className="ball-row">
                        {suggestion.ticket.numbers.map((number) => (
                          <span className="ball" key={`${suggestion.mode}-${number}`}>
                            {number}
                          </span>
                        ))}
                      </div>
                      <p className="sync-line">Human-likeness: {suggestion.ticket.humanLikenessScore}</p>
                      <p>{suggestion.ticket.explanation}</p>
                    </article>
                  ))}
                </div>
              </Panel>
            </div>
            {getRecentBacktestHighlight(summary) ? (
              <Panel title="Recent Backtest Highlight">
                <p>{getRecentBacktestHighlight(summary)}</p>
              </Panel>
            ) : null}
            <Panel title="Daily CT Lottery Sync">
              <div className="sync-row">
                <div>
                  <div className="sync-badges">
                    <span className="pill enabled">Auto-sync enabled</span>
                    <span className={`pill ${(summary.syncStatus?.lastStatus ?? "idle").toLowerCase()}`}>
                      {(summary.syncStatus?.lastStatus ?? "idle").toUpperCase()}
                    </span>
                  </div>
                  <p className="sync-line">
                    Last successful draw imported: {formatDisplayDate(summary.syncStatus?.lastImportedDrawDate)}
                  </p>
                  <p className="sync-line">
                    Last attempt: {formatSyncDate(summary.syncStatus?.lastAttemptAt)}
                  </p>
                  <p className="sync-line">
                    Jackpot last refreshed: {formatSyncDate(summary.lottoGameInfo?.lastRefreshedAt)}
                  </p>
                </div>
                <button className="primary-btn" onClick={() => void handleSyncNow()} disabled={syncBusy}>
                  {syncBusy ? "Syncing..." : "Sync Now"}
                </button>
              </div>
            </Panel>
          </section>
        ) : null}

        {page === "insights" && summary ? (
          <section className="page">
            <header className="page-header">
              <h2>Insights</h2>
              <span className="hint">Frequency trends, backtests, and historical context.</span>
            </header>
            <div className="stats-grid">
              <StatCard label="Total drawings" value={summary.totalDrawings} />
              <StatCard label="Earliest draw" value={formatDisplayDate(summary.earliestDrawDate)} />
              <StatCard label="Latest draw in database" value={formatDisplayDate(summary.latestDrawDate)} />
              <StatCard label="Last import" value={formatSyncDate(summary.lastImportedDraw)} />
              <StatCard
                label="Most frequent number"
                value={summary.mostFrequentNumber ? `#${summary.mostFrequentNumber.number}` : "N/A"}
              />
              <StatCard
                label="Least frequent number"
                value={summary.leastFrequentNumber ? `#${summary.leastFrequentNumber.number}` : "N/A"}
              />
            </div>
            <div className="grid-two">
              <Panel title="Top 10 hot numbers">
                <NumberList rows={summary.topHotNumbers} />
              </Panel>
              <Panel title="Top 10 cold numbers">
                <NumberList rows={summary.topColdNumbers} />
              </Panel>
            </div>
            <Panel title="Repeated Winning Combinations">
              {summary.repeatedCombinations.length ? (
                <div className="repeat-list">
                  {summary.repeatedCombinations.map((combo) => (
                    <article className="repeat-card" key={combo.numbers.join("-")}>
                      <div className="ticket-top">
                        <div className="ball-row">
                          {combo.numbers.map((number) => (
                            <span className="ball" key={`${combo.numbers.join("-")}-${number}`}>
                              {number}
                            </span>
                          ))}
                        </div>
                        <span className="score">{combo.timesDrawn}x</span>
                      </div>
                      <p className="sync-line">
                        Draw dates: {combo.drawDates.join(", ")}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="hint">
                  No exact 6-number winning combination has repeated in the currently imported CT Lotto! history.
                </p>
              )}
            </Panel>
            <Panel title="Mode Backtest">
              <div className="backtest-highlights">
                <HighlightCard
                  label="Lowest crowd-like mode this month"
                  value={getLowestCrowdModeThisMonth(summary).value}
                  tone={getLowestCrowdModeThisMonth(summary).tone}
                />
                <HighlightCard
                  label="Low-Split lead streak"
                  value={getLowSplitLeadStreak(summary).value}
                  tone={getLowSplitLeadStreak(summary).tone}
                />
              </div>
              <div className="backtest-grid">
                {summary.pickerBacktest.modeSummaries.map((modeSummary) => (
                  <article className="backtest-card" key={modeSummary.mode}>
                    <div className="ticket-top">
                      <strong>{MODE_DETAILS[modeSummary.mode].label}</strong>
                      <span className="score">{modeSummary.averageMatchedNumbers.toFixed(2)} avg</span>
                    </div>
                    <p className="sync-line">Runs stored: {modeSummary.totalRuns}</p>
                    <p className="sync-line">Runs evaluated: {modeSummary.evaluatedRuns}</p>
                    <p className="sync-line">Avg human-likeness: {modeSummary.averageHumanLikenessScore.toFixed(2)}</p>
                    <p className="sync-line">Best match count: {modeSummary.bestMatchCount}/6</p>
                    <p className="sync-line">Exact matches: {modeSummary.exactMatchCount}</p>
                    <p className="sync-line">Last generated: {modeSummary.lastGeneratedForDate ?? "N/A"}</p>
                    <p className="sync-line">Last evaluated draw: {modeSummary.lastTargetDrawDate ?? "Pending"}</p>
                  </article>
                ))}
              </div>
              <div className="strategy-note">
                <strong>Human-likeness tracking</strong>
                <p>
                  Lower scores mean a ticket looked less like a typical human-picked combination based on this app&apos;s built-in pattern heuristics.
                  This is separate from match performance and does not affect draw odds.
                </p>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={buildHumanLikenessChart(summary)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="generatedForDate" stroke="#f2ebd8" />
                    <YAxis stroke="#f2ebd8" allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    {PICKER_MODES.map((mode) => (
                      <Line
                        key={mode}
                        type="monotone"
                        dataKey={mode}
                        name={MODE_DETAILS[mode].label}
                        stroke={MODE_COLORS[mode]}
                        strokeWidth={mode === "low_split" ? 3 : 2}
                        dot={{ r: mode === "low_split" ? 4 : 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="page-header">
                <h3>Recent Stored Mode Picks</h3>
                <span className="hint">Daily cycle last ran: {summary.pickerBacktest.lastDailyCycleDate ?? "N/A"}</span>
              </div>
              <div className="repeat-list">
                {summary.pickerBacktest.recentRuns.length ? (
                  summary.pickerBacktest.recentRuns.map((run) => (
                    <BacktestRunCard key={`${run.mode}-${run.generatedForDate}`} run={run} />
                  ))
                ) : (
                  <p className="hint">No daily picker backtest runs have been stored yet.</p>
                )}
              </div>
            </Panel>
            <Panel title="Frequency for numbers 1-44">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={summary.frequencyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="number" stroke="#f2ebd8" />
                    <YAxis stroke="#f2ebd8" />
                    <Tooltip />
                    <Bar dataKey="timesDrawn" fill="#e19a4b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </section>
        ) : null}

        {page === "numbers" ? (
          <section className="page">
            <header className="page-header">
              <h2>Number Table</h2>
            </header>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Times Drawn</th>
                    <th>Draw %</th>
                    <th>Expected Count</th>
                    <th>Difference</th>
                    <th>Last Seen</th>
                    <th>Draws Since</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {frequency.map((row) => (
                    <tr key={row.number}>
                      <td>{row.number}</td>
                      <td>{row.timesDrawn}</td>
                      <td>{(row.drawPercentage * 100).toFixed(1)}%</td>
                      <td>{row.expectedCount.toFixed(2)}</td>
                      <td>{row.differenceFromExpected.toFixed(2)}</td>
                      <td>{row.lastSeenDate ?? "N/A"}</td>
                      <td>{row.drawsSinceLastSeen ?? "N/A"}</td>
                      <td>
                        <span className={`pill ${row.trendLabel.toLowerCase()}`}>{row.trendLabel}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {page === "history" ? (
          <section className="page">
            <header className="page-header">
              <h2>Draw History</h2>
            </header>
            <div className="filters">
              <input value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} placeholder="Filter by date (YYYY-MM or YYYY-MM-DD)" />
              <input value={numberFilter} onChange={(event) => setNumberFilter(event.target.value)} placeholder="Filter by number 1-44" />
              <button className="primary-btn" onClick={() => void handleHistorySearch()}>
                Apply Filters
              </button>
              <button className="ghost-btn" onClick={() => void refreshAll()}>
                Reset
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Draw Date</th>
                    <th>Winning Numbers</th>
                    <th>Source File</th>
                  </tr>
                </thead>
                <tbody>
                  {draws.map((draw) => (
                    <tr key={draw.id}>
                      <td>{draw.drawDate}</td>
                      <td>
                        <div className="history-numbers">
                          <div className="ball-row">
                            {draw.numbers.map((number) => (
                              <span className="ball" key={`${draw.id}-${number}`}>
                                {number}
                              </span>
                            ))}
                          </div>
                          <div className="combo-text">{draw.numbers.join(" - ")}</div>
                        </div>
                      </td>
                      <td>{draw.sourceFileName ?? "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {page === "picker" ? (
          <section className="page">
            <header className="page-header">
              <h2>Number Picker</h2>
            </header>
            <div className="picker-layout">
              <Panel title="Controls">
                <div className="form-grid">
                  <label>
                    Mode
                    <select
                      value={picker.mode}
                      onChange={(event) =>
                        setPicker((current) => ({ ...current, mode: event.target.value as PickerMode }))
                      }
                    >
                      {PICKER_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {MODE_DETAILS[mode].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tickets
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={picker.ticketCount}
                      onChange={(event) =>
                        setPicker((current) => ({ ...current, ticketCount: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <div className="mode-help">
                  <strong>{MODE_DETAILS[picker.mode].label} mode</strong>
                  <p>{MODE_DETAILS[picker.mode].description}</p>
                </div>
                {picker.mode === "low_split" ? (
                  <div className="strategy-note">
                    <strong>Why this strategy?</strong>
                    <p>
                      Many players choose birthdays, anniversaries, lucky numbers, or obvious patterns.
                      This strategy avoids those common choices. It does not make the numbers more likely
                      to be drawn, but it tries to make your ticket less likely to match other players&apos;
                      tickets.
                    </p>
                    <p className="hint">
                      Lottery drawings are random. Every valid combination has the same chance of being drawn.
                    </p>
                  </div>
                ) : null}
                <div className="mode-grid">
                  {PICKER_MODES.map((mode) => (
                    <article
                      key={mode}
                      className={picker.mode === mode ? "mode-card active" : "mode-card"}
                    >
                      <strong>{MODE_DETAILS[mode].label}</strong>
                      <p>{MODE_DETAILS[mode].description}</p>
                    </article>
                  ))}
                </div>
                <div className="checkboxes">
                  {PICKER_RULE_DETAILS.map((rule) => (
                    <div className="rule-card" key={rule.key}>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={picker[rule.key]}
                          onChange={(event) =>
                            setPicker((current) => ({
                              ...current,
                              [rule.key]: event.target.checked,
                            }))
                          }
                        />
                        {rule.label}
                      </label>
                      <p>{rule.description}</p>
                    </div>
                  ))}
                </div>
                <p className="hint">{DISCLAIMER_TEXT}</p>
                <button className="primary-btn" onClick={() => void handleGenerate()}>
                  Generate Tickets
                </button>
              </Panel>
              <Panel title="Generated Tickets">
                <div className="ticket-list">
                  {tickets.map((ticket, index) => (
                    <article className="ticket-card" key={`${ticket.numbers.join("-")}-${index}`}>
                      <div className="ticket-top">
                        <div className="ball-row">
                          {ticket.numbers.map((number) => (
                            <span className="ball" key={`${index}-${number}`}>
                              {number}
                            </span>
                          ))}
                        </div>
                        <span className="score">{ticket.score}/100</span>
                      </div>
                      <p>{ticket.explanation}</p>
                      <p className="sync-line">Human-likeness score: {ticket.humanLikenessScore}</p>
                      <p className="sync-line">
                        Pattern notes: {ticket.humanLikenessReasons.length ? ticket.humanLikenessReasons.join(", ") : "No major human-pattern flags"}
                      </p>
                    </article>
                  ))}
                </div>
              </Panel>
            </div>
          </section>
        ) : null}

        {page === "import" ? (
          <section className="page">
            <header className="page-header">
              <h2>Import Results</h2>
            </header>
            <Panel title="Upload CT Lotto! history">
              <label className="upload">
                <input type="file" accept=".html,.txt,text/html,text/plain" onChange={(event) => void handleImport(event.target.files?.[0] ?? null)} />
                <span>Select an HTML or TXT file</span>
              </label>
              {importSummary ? (
                <div className="import-summary">
                  <StatCard label="Rows found" value={importSummary.rowsFound} />
                  <StatCard label="Rows inserted" value={importSummary.rowsInserted} />
                  <StatCard label="Duplicates skipped" value={importSummary.rowsSkippedDuplicateDate} />
                  <StatCard label="Rows failed" value={importSummary.rowsFailed} />
                </div>
              ) : null}
              {importSummary?.failedRows.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Date</th>
                        <th>Numbers</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importSummary.failedRows.map((row) => (
                        <tr key={`${row.rowIndex}-${row.reason}`}>
                          <td>{row.rowIndex}</td>
                          <td>{row.drawDate ?? "N/A"}</td>
                          <td>{row.rawNumbers ?? "N/A"}</td>
                          <td>{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Panel>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function StatCard(props: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function HighlightCard(props: {
  label: string;
  value: string | number;
  tone: "success" | "warning" | "neutral";
}) {
  return (
    <div className={`stat-card highlight-card ${props.tone}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

function NumberList(props: { rows: FrequencyRow[] }) {
  return (
    <div className="number-list">
      {props.rows.map((row) => (
        <div className="number-row" key={row.number}>
          <span>#{row.number}</span>
          <strong>{row.timesDrawn}</strong>
        </div>
      ))}
    </div>
  );
}

function BacktestRunCard(props: { run: PickerBacktestRun }) {
  const modeLabel = MODE_DETAILS[props.run.mode].label;
  return (
    <article className="repeat-card">
      <div className="ticket-top">
        <strong>
          {modeLabel} for {props.run.generatedForDate}
        </strong>
        <span className="score">
          {props.run.matchCount === null ? "Pending" : `${props.run.matchCount}/6`}
        </span>
      </div>
      <div className="ball-row">
        {props.run.ticketNumbers.map((number) => (
          <span className="ball" key={`${props.run.mode}-${props.run.generatedForDate}-${number}`}>
            {number}
          </span>
        ))}
      </div>
      <p className="sync-line">Ticket score: {props.run.ticketScore}/100</p>
      <p className="sync-line">Human-likeness score: {props.run.humanLikenessScore}</p>
      <p className="sync-line">
        Pattern notes: {props.run.humanLikenessReasons.length ? props.run.humanLikenessReasons.join(", ") : "No major human-pattern flags"}
      </p>
      <p className="sync-line">Target draw: {props.run.targetDrawDate ?? "Awaiting next official draw"}</p>
      <p className="sync-line">Matched numbers: {props.run.matchedNumbers.length ? props.run.matchedNumbers.join(", ") : "None yet"}</p>
      <p className="sync-line">Status: {props.run.status}</p>
    </article>
  );
}

function formatSyncDate(value: string | null | undefined) {
  if (!value) return "N/A";
  return new Date(value).toLocaleString();
}

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return "N/A";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildHumanLikenessChart(summary: SummaryResponse) {
  return summary.pickerBacktest.humanLikenessTrend.map((point) => ({
    generatedForDate: point.generatedForDate,
    ...point.modeScores,
  }));
}

function getLowestCrowdModeThisMonth(summary: SummaryResponse) {
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthlyRuns = summary.pickerBacktest.recentRuns.filter((run) => run.generatedForDate.startsWith(monthPrefix));

  if (monthlyRuns.length === 0) {
    return {
      value: "N/A",
      tone: "neutral" as const,
    };
  }

  const scores = new Map<PickerMode, { total: number; count: number }>();
  monthlyRuns.forEach((run) => {
    const current = scores.get(run.mode) ?? { total: 0, count: 0 };
    current.total += run.humanLikenessScore;
    current.count += 1;
    scores.set(run.mode, current);
  });

  const best = [...scores.entries()]
    .map(([mode, value]) => ({
      mode,
      average: value.total / value.count,
    }))
    .sort((a, b) => a.average - b.average)[0];

  if (!best) {
    return {
      value: "N/A",
      tone: "neutral" as const,
    };
  }

  return {
    value: `${MODE_DETAILS[best.mode].label} (${best.average.toFixed(2)})`,
    tone: best.mode === "low_split" ? ("success" as const) : ("warning" as const),
  };
}

function getLowSplitLeadStreak(summary: SummaryResponse) {
  let streak = 0;
  const orderedPoints = [...summary.pickerBacktest.humanLikenessTrend].sort((a, b) =>
    b.generatedForDate.localeCompare(a.generatedForDate),
  );

  for (const point of orderedPoints) {
    const entries = Object.entries(point.modeScores) as Array<[PickerMode, number]>;
    if (entries.length === 0) {
      break;
    }

    const bestScore = Math.min(...entries.map(([, score]) => score));
    if (point.modeScores.low_split === bestScore) {
      streak += 1;
      continue;
    }

    break;
  }

  return {
    value: `${streak} day${streak === 1 ? "" : "s"}`,
    tone:
      streak >= 3 ? ("success" as const) : streak > 0 ? ("neutral" as const) : ("warning" as const),
  };
}

function formatWinnerStatus(summary: SummaryResponse) {
  const count = summary.lottoGameInfo?.jackpotWinnerCount;
  if (count == null) {
    return "Unknown";
  }
  return count > 0 ? `Yes (${count})` : "No";
}

function formatLatestDrawWinnerLabel(summary: SummaryResponse) {
  const count = summary.lottoGameInfo?.jackpotWinnerCount;
  if (count == null) {
    return "Jackpot winner unknown";
  }
  if (count === 0) {
    return "No jackpot winner";
  }
  return count === 1 ? "1 jackpot winner" : `${count} jackpot winners`;
}

function getRecentBacktestHighlight(summary: SummaryResponse) {
  const latestDrawDate = summary.lottoGameInfo?.latestDrawDate;
  if (!latestDrawDate) {
    return null;
  }

  const matchingRuns = summary.pickerBacktest.recentRuns.filter(
    (run) => run.targetDrawDate === latestDrawDate && run.matchCount !== null,
  );
  if (!matchingRuns.length) {
    return null;
  }

  const bestRun = [...matchingRuns].sort((a, b) => (b.matchCount ?? 0) - (a.matchCount ?? 0))[0];
  if (!bestRun || (bestRun.matchCount ?? 0) < 4) {
    return null;
  }

  return `${MODE_DETAILS[bestRun.mode].label} matched ${bestRun.matchCount}/6 on the latest draw (${formatDisplayDate(latestDrawDate)}).`;
}

function getDashboardSuggestionsForDisplay(summary: SummaryResponse, favoriteModes: PickerMode[]) {
  const filtered = summary.dashboardSuggestions.filter((suggestion) => favoriteModes.includes(suggestion.mode));
  return filtered.length > 0 ? filtered : summary.dashboardSuggestions;
}

function toggleDashboardFavorite(current: PickerMode[], mode: PickerMode) {
  if (current.includes(mode)) {
    const next = current.filter((entry) => entry !== mode);
    return next.length > 0 ? next : current;
  }

  return [...current, mode];
}

function moveDashboardFavorite(current: PickerMode[], mode: PickerMode, direction: -1 | 1) {
  const index = current.indexOf(mode);
  if (index === -1) {
    return current;
  }

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= current.length) {
    return current;
  }

  const next = [...current];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}
