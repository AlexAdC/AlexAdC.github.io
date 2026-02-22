import { useState, useEffect, useCallback } from "react";

// ── Storage helpers ──────────────────────────────────────────────────────────
const KEYS = { players: "padel:players", matches: "padel:matches" };

async function load(key) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function save(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch {}
}

// ── Stroke options ───────────────────────────────────────────────────────────
const STROKES = {
  Forehand: ["Serve", "Forehand", "FH Return", "FH Lob", "FH Volley"],
  Backhand: ["Backhand", "BH Return", "BH Lob", "BH Volley"],
  Overhead: ["Smash", "Bandeja", "Víbora", "Rulo"],
};
const ALL_STROKES = Object.entries(STROKES).flatMap(([g, s]) => s.map(n => ({ group: g, name: n })));
const RESULTS = ["Winner", "Unforced Error", "Forced Error"];
const RESULT_COLORS = { Winner: "#22c55e", "Unforced Error": "#ef4444", "Forced Error": "#f97316" };
const RESULT_SHORT = { Winner: "W", "Unforced Error": "UE", "Forced Error": "FE" };

// ── Utilities ────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtDate = d => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function calcStats(points, playerId) {
  const mine = points.filter(p => p.playerId === playerId);
  const totals = { Winner: 0, "Unforced Error": 0, "Forced Error": 0 };
  const strokes = {};
  mine.forEach(p => {
    totals[p.result] = (totals[p.result] || 0) + 1;
    if (!strokes[p.result]) strokes[p.result] = {};
    strokes[p.result][p.stroke] = (strokes[p.result][p.stroke] || 0) + 1;
  });
  const topStroke = res => {
    const s = strokes[res];
    if (!s || !Object.keys(s).length) return "—";
    return Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
  };
  return { totals, topStroke };
}

// ── Confirm modal ────────────────────────────────────────────────────────────
function Confirm({ msg, onYes, onNo }) {
  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, maxWidth: 340 }}>
        <p style={{ color: "#e2e8f0", marginBottom: 20, textAlign: "center" }}>{msg}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...styles.btn, ...styles.btnDanger, flex: 1 }} onClick={onYes}>Delete</button>
          <button style={{ ...styles.btn, ...styles.btnGhost, flex: 1 }} onClick={onNo}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("players");
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // sub-views
  const [viewPlayer, setViewPlayer] = useState(null); // player id
  const [viewMatch, setViewMatch] = useState(null);   // match id
  const [creatingMatch, setCreatingMatch] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await load(KEYS.players);
      const m = await load(KEYS.matches);
      if (p) setPlayers(p);
      if (m) setMatches(m);
      setLoading(false);
    })();
  }, []);

  const savePlayers = useCallback(async p => { setPlayers(p); await save(KEYS.players, p); }, []);
  const saveMatches = useCallback(async m => { setMatches(m); await save(KEYS.matches, m); }, []);

  if (loading) return <div style={styles.loading}>Loading…</div>;

  // ── Routing ───
  if (viewPlayer) {
    const p = players.find(x => x.id === viewPlayer);
    if (!p) { setViewPlayer(null); return null; }
    return <PlayerProfile player={p} matches={matches} players={players} onBack={() => setViewPlayer(null)} />;
  }
  if (viewMatch) {
    const m = matches.find(x => x.id === viewMatch);
    if (!m) { setViewMatch(null); return null; }
    return (
      <MatchView
        match={m}
        players={players}
        onUpdate={updated => saveMatches(matches.map(x => x.id === updated.id ? updated : x))}
        onBack={() => setViewMatch(null)}
      />
    );
  }
  if (creatingMatch) {
    return (
      <NewMatch
        players={players}
        onSave={m => { saveMatches([m, ...matches]); setCreatingMatch(false); setViewMatch(m.id); }}
        onCancel={() => setCreatingMatch(false)}
      />
    );
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <span style={styles.logo}>🎾 Padel Tracker</span>
        <nav style={styles.nav}>
          {["players", "matches", "export"].map(t => (
            <button key={t} style={{ ...styles.navBtn, ...(tab === t ? styles.navBtnActive : {}) }}
              onClick={() => setTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </nav>
      </header>
      <main style={styles.main}>
        {tab === "players" && <PlayersTab players={players} onSave={savePlayers} onView={setViewPlayer} />}
        {tab === "matches" && <MatchesTab matches={matches} players={players} onSave={saveMatches} onView={setViewMatch} onCreate={() => setCreatingMatch(true)} />}
        {tab === "export" && <ExportTab players={players} matches={matches} />}
      </main>
    </div>
  );
}

// ── Players Tab ──────────────────────────────────────────────────────────────
function PlayersTab({ players, onSave, onView }) {
  const [name, setName] = useState("");
  const [delId, setDelId] = useState(null);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    onSave([...players, { id: uid(), name: n, createdAt: Date.now() }]);
    setName("");
  };

  const del = id => {
    onSave(players.filter(p => p.id !== id));
    setDelId(null);
  };

  return (
    <div>
      {delId && <Confirm msg={`Delete "${players.find(p=>p.id===delId)?.name}"? This cannot be undone.`} onYes={() => del(delId)} onNo={() => setDelId(null)} />}
      <h2 style={styles.sectionTitle}>Players</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input style={styles.input} placeholder="Player name" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()} />
        <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={add}>Add</button>
      </div>
      {players.length === 0 && <p style={styles.empty}>No players yet. Add one above.</p>}
      <div style={styles.list}>
        {players.map(p => (
          <div key={p.id} style={styles.listItem}>
            <span style={{ cursor: "pointer", color: "#a78bfa", fontWeight: 600 }} onClick={() => onView(p.id)}>{p.name}</span>
            <button style={{ ...styles.btn, ...styles.btnDanger, padding: "4px 12px", fontSize: 13 }} onClick={() => setDelId(p.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Player Profile ───────────────────────────────────────────────────────────
function PlayerProfile({ player, matches, players, onBack }) {
  const playerMatches = matches
    .filter(m => m.teams.flat().includes(player.id))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const allPoints = playerMatches.flatMap(m => m.points || []);
  const { totals, topStroke } = calcStats(allPoints, player.id);
  const n = playerMatches.length || 1;

  const avg = v => (v / n).toFixed(1);

  const playerName = id => players.find(p => p.id === id)?.name || "?";

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={onBack}>← Back</button>
        <span style={styles.logo}>{player.name}</span>
      </header>
      <main style={styles.main}>
        <h2 style={styles.sectionTitle}>Aggregate Stats ({playerMatches.length} matches)</h2>
        <div style={styles.statsGrid}>
          {RESULTS.map(r => (
            <div key={r} style={{ ...styles.statCard, borderTop: `3px solid ${RESULT_COLORS[r]}` }}>
              <div style={{ color: RESULT_COLORS[r], fontWeight: 700, marginBottom: 6 }}>{r}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>{avg(totals[r] || 0)}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>avg / match</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>Top stroke</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{topStroke(r)}</div>
            </div>
          ))}
        </div>

        <h3 style={{ ...styles.sectionTitle, marginTop: 32 }}>Match History</h3>
        {playerMatches.length === 0 && <p style={styles.empty}>No matches yet.</p>}
        {playerMatches.map(m => {
          const pts = (m.points || []).filter(p => p.playerId === player.id);
          const w = pts.filter(p => p.result === "Winner").length;
          const ue = pts.filter(p => p.result === "Unforced Error").length;
          const fe = pts.filter(p => p.result === "Forced Error").length;
          const t0 = m.teams[0].map(playerName).join(" & ");
          const t1 = m.teams[1].map(playerName).join(" & ");
          return (
            <div key={m.id} style={styles.matchCard}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "#a78bfa", fontWeight: 700 }}>{fmtDate(m.date)}</span>
                <span style={{ color: "#64748b", fontSize: 13 }}>{m.location}</span>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>{t0} <span style={{ color: "#475569" }}>vs</span> {t1}</div>
              {m.sets && m.sets.length > 0 && (
                <div style={{ marginBottom: 8, fontSize: 13, color: "#cbd5e1" }}>
                  Score: {m.sets.map((s, i) => `${s[0]}-${s[1]}`).join(", ")}
                </div>
              )}
              <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                <span style={{ color: RESULT_COLORS.Winner }}>W: {w}</span>
                <span style={{ color: RESULT_COLORS["Unforced Error"] }}>UE: {ue}</span>
                <span style={{ color: RESULT_COLORS["Forced Error"] }}>FE: {fe}</span>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}

// ── Matches Tab ──────────────────────────────────────────────────────────────
function MatchesTab({ matches, players, onSave, onView, onCreate }) {
  const [delId, setDelId] = useState(null);
  const sorted = [...matches].sort((a, b) => new Date(b.date) - new Date(a.date));
  const playerName = id => players.find(p => p.id === id)?.name || "?";

  const del = id => { onSave(matches.filter(m => m.id !== id)); setDelId(null); };

  return (
    <div>
      {delId && <Confirm msg="Delete this match? This cannot be undone." onYes={() => del(delId)} onNo={() => setDelId(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>Matches</h2>
        <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={onCreate}>+ New Match</button>
      </div>
      {sorted.length === 0 && <p style={styles.empty}>No matches yet. Create one!</p>}
      {sorted.map(m => {
        const t0 = m.teams[0].map(playerName).join(" & ");
        const t1 = m.teams[1].map(playerName).join(" & ");
        const pts = m.points?.length || 0;
        return (
          <div key={m.id} style={styles.matchCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ cursor: "pointer" }} onClick={() => onView(m.id)}>
                <div style={{ color: "#a78bfa", fontWeight: 700, marginBottom: 4 }}>{fmtDate(m.date)}</div>
                <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 4 }}>{m.location}</div>
                <div style={{ color: "#e2e8f0", fontSize: 14, marginBottom: 4 }}>{t0} <span style={{ color: "#475569" }}>vs</span> {t1}</div>
                {m.sets?.length > 0 && <div style={{ fontSize: 13, color: "#cbd5e1" }}>Score: {m.sets.map(s => `${s[0]}-${s[1]}`).join(", ")}</div>}
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{pts} points recorded {m.finished ? "✅" : "⏳"}</div>
              </div>
              <button style={{ ...styles.btn, ...styles.btnDanger, padding: "4px 12px", fontSize: 13 }} onClick={() => setDelId(m.id)}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── New Match ────────────────────────────────────────────────────────────────
function NewMatch({ players, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [location, setLocation] = useState("");
  const [selected, setSelected] = useState([]);
  const [teams, setTeams] = useState([[], []]);
  const [error, setError] = useState("");

  const togglePlayer = id => {
    if (selected.includes(id)) {
      setSelected(selected.filter(x => x !== id));
      setTeams(teams.map(t => t.filter(x => x !== id)));
    } else if (selected.length < 4) {
      setSelected([...selected, id]);
    }
  };

  const assignTeam = (id, teamIdx) => {
    const other = 1 - teamIdx;
    if (teams[teamIdx].includes(id)) {
      setTeams(teams.map((t, i) => i === teamIdx ? t.filter(x => x !== id) : t));
    } else if (teams[teamIdx].length < 2) {
      setTeams(teams.map((t, i) => {
        if (i === other) return t.filter(x => x !== id);
        return [...t.filter(x => x !== id), id];
      }));
    }
  };

  const create = () => {
    if (!date) return setError("Please set a date.");
    if (!location.trim()) return setError("Please enter a location.");
    if (selected.length !== 4) return setError("Select exactly 4 players.");
    if (teams[0].length !== 2 || teams[1].length !== 2) return setError("Assign 2 players to each team.");
    onSave({ id: uid(), date, location: location.trim(), teams, points: [], sets: [], finished: false, createdAt: Date.now() });
  };

  const pName = id => players.find(p => p.id === id)?.name || "?";
  const teamColor = (id) => teams[0].includes(id) ? "#3b82f6" : teams[1].includes(id) ? "#f59e0b" : null;

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={onCancel}>← Cancel</button>
        <span style={styles.logo}>New Match</span>
      </header>
      <main style={styles.main}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Date</label>
          <input type="date" style={styles.input} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Location / Club</label>
          <input style={styles.input} placeholder="e.g. Club Pádel Madrid" value={location} onChange={e => setLocation(e.target.value)} />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Select 4 Players</label>
          {players.length < 4 && <p style={{ color: "#f97316", fontSize: 13, marginBottom: 8 }}>You need at least 4 players. Add more in the Players tab.</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {players.map(p => {
              const sel = selected.includes(p.id);
              const tc = sel ? teamColor(p.id) : null;
              return (
                <button key={p.id} style={{ ...styles.btn, background: tc || (sel ? "#334155" : "#1e293b"), border: `2px solid ${tc || (sel ? "#a78bfa" : "#334155")}`, color: "#e2e8f0" }}
                  onClick={() => togglePlayer(p.id)}>{p.name}</button>
              );
            })}
          </div>
        </div>

        {selected.length === 4 && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Assign Teams</label>
            <div style={{ display: "flex", gap: 16 }}>
              {[0, 1].map(ti => (
                <div key={ti} style={{ flex: 1, background: "#1e293b", borderRadius: 10, padding: 12, border: `2px solid ${ti === 0 ? "#3b82f6" : "#f59e0b"}` }}>
                  <div style={{ fontWeight: 700, color: ti === 0 ? "#3b82f6" : "#f59e0b", marginBottom: 8 }}>Team {ti + 1}</div>
                  <div style={{ minHeight: 40, marginBottom: 8 }}>
                    {teams[ti].map(id => <div key={id} style={{ color: "#e2e8f0", fontSize: 14, marginBottom: 4 }}>• {pName(id)}</div>)}
                  </div>
                  {selected.map(id => (
                    <button key={id} style={{ ...styles.btn, ...styles.btnGhost, width: "100%", marginBottom: 4, fontSize: 13, opacity: teams[ti].includes(id) ? 0.5 : 1 }}
                      onClick={() => assignTeam(id, ti)} disabled={teams[ti].length >= 2 && !teams[ti].includes(id)}>
                      {teams[ti].includes(id) ? "✓ " : "+ "}{pName(id)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p style={{ color: "#ef4444", marginBottom: 12 }}>{error}</p>}
        <button style={{ ...styles.btn, ...styles.btnPrimary, width: "100%", padding: "14px" }} onClick={create}>Create Match & Start</button>
      </main>
    </div>
  );
}

// ── Match View ───────────────────────────────────────────────────────────────
function MatchView({ match, players, onUpdate, onBack }) {
  const [endingMatch, setEndingMatch] = useState(false);
  const [draft, setDraft] = useState({ playerId: null, result: null, stroke: null });
  const [editIdx, setEditIdx] = useState(null);
  const pName = id => players.find(p => p.id === id)?.name || "?";

  const allSelected = draft.playerId && draft.result && draft.stroke;

  const submitPoint = () => {
    if (!allSelected) return;
    let newPoints;
    if (editIdx !== null) {
      newPoints = match.points.map((p, i) => i === editIdx ? { ...draft } : p);
      setEditIdx(null);
    } else {
      newPoints = [...(match.points || []), { ...draft }];
    }
    onUpdate({ ...match, points: newPoints });
    setDraft({ playerId: null, result: null, stroke: null });
  };

  const editLast = () => {
    const last = match.points.length - 1;
    if (last < 0) return;
    setDraft({ ...match.points[last] });
    setEditIdx(last);
  };

  const teamOf = id => match.teams[0].includes(id) ? 0 : 1;

  if (endingMatch) {
    return <EndMatch match={match} players={players} onSave={onUpdate} onCancel={() => setEndingMatch(false)} onBack={onBack} />;
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={onBack}>← Back</button>
        <span style={styles.logo}>{fmtDate(match.date)} — {match.location}</span>
        {!match.finished && <button style={{ ...styles.btn, background: "#16a34a", color: "#fff" }} onClick={() => setEndingMatch(true)}>End Match</button>}
      </header>
      <main style={{ ...styles.main, maxWidth: 600 }}>
        {/* Teams */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {match.teams.map((team, ti) => (
            <div key={ti} style={{ flex: 1, background: "#1e293b", borderRadius: 8, padding: "8px 12px", border: `1.5px solid ${ti === 0 ? "#3b82f6" : "#f59e0b"}` }}>
              <div style={{ fontWeight: 700, color: ti === 0 ? "#3b82f6" : "#f59e0b", fontSize: 12, marginBottom: 4 }}>TEAM {ti + 1}</div>
              {team.map(id => <div key={id} style={{ fontSize: 14, color: "#e2e8f0" }}>{pName(id)}</div>)}
            </div>
          ))}
        </div>

        {match.sets?.length > 0 && (
          <div style={{ marginBottom: 16, padding: "8px 12px", background: "#1e293b", borderRadius: 8, fontSize: 14, color: "#cbd5e1" }}>
            Score: {match.sets.map(s => `${s[0]}-${s[1]}`).join("  |  ")}
            {match.finished && <span style={{ color: "#22c55e", marginLeft: 8 }}>✅ Finished</span>}
          </div>
        )}

        {!match.finished && (
          <>
            <h3 style={{ ...styles.sectionTitle, fontSize: 15 }}>{editIdx !== null ? `Editing Point #${editIdx + 1}` : `Point #${(match.points?.length || 0) + 1}`}</h3>

            {/* Player */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Player</label>
              <div style={{ display: "flex", gap: 10 }}>
                {match.teams.map((team, ti) => (
                  <div key={ti} style={{ flex: 1, background: "#0f172a", borderRadius: 8, padding: "8px 10px", border: `1.5px solid ${ti === 0 ? "#3b82f6" : "#f59e0b"}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: ti === 0 ? "#3b82f6" : "#f59e0b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Team {ti + 1}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {team.map(id => {
                        const sel = draft.playerId === id;
                        return (
                          <button key={id} style={{ ...styles.btn, background: sel ? (ti === 0 ? "#1d4ed8" : "#b45309") : "#1e293b", border: `2px solid ${sel ? (ti === 0 ? "#3b82f6" : "#f59e0b") : "#334155"}`, color: "#e2e8f0", width: "100%", textAlign: "center" }}
                            onClick={() => setDraft(d => ({ ...d, playerId: id }))}>
                            {pName(id)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Result */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Result</label>
              <div style={{ display: "flex", gap: 8 }}>
                {RESULTS.map(r => (
                  <button key={r} style={{ ...styles.btn, flex: 1, background: draft.result === r ? RESULT_COLORS[r] + "33" : "#1e293b", border: `2px solid ${draft.result === r ? RESULT_COLORS[r] : "#334155"}`, color: draft.result === r ? RESULT_COLORS[r] : "#94a3b8", fontSize: 13 }}
                    onClick={() => setDraft(d => ({ ...d, result: r }))}>{r}</button>
                ))}
              </div>
            </div>

            {/* Strokes */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Stroke</label>
              {Object.entries(STROKES).map(([grp, strks]) => (
                <div key={grp} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>{grp}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {strks.map(s => (
                      <button key={s} style={{ ...styles.btn, background: draft.stroke === s ? "#4f46e5" : "#1e293b", border: `2px solid ${draft.stroke === s ? "#818cf8" : "#334155"}`, color: draft.stroke === s ? "#e0e7ff" : "#94a3b8", fontSize: 13, padding: "6px 12px" }}
                        onClick={() => setDraft(d => ({ ...d, stroke: s }))}>{s}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...styles.btn, ...styles.btnPrimary, flex: 1, padding: 14, opacity: allSelected ? 1 : 0.5 }}
                onClick={submitPoint} disabled={!allSelected}>
                {editIdx !== null ? "✓ Update Point" : "→ Next Point"}
              </button>
              {match.points?.length > 0 && editIdx === null && (
                <button style={{ ...styles.btn, ...styles.btnGhost, padding: "14px 16px", fontSize: 13 }} onClick={editLast}>← Edit Last</button>
              )}
              {editIdx !== null && (
                <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={() => { setEditIdx(null); setDraft({ playerId: null, result: null, stroke: null }); }}>Cancel Edit</button>
              )}
            </div>
          </>
        )}

        {/* Point log */}
        {match.points?.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <h3 style={{ ...styles.sectionTitle, fontSize: 15 }}>Points Log ({match.points.length})</h3>
            <div style={{ maxHeight: 260, overflowY: "auto", borderRadius: 8, background: "#0f172a", padding: 8 }}>
              {[...match.points].reverse().map((pt, ri) => {
                const i = match.points.length - 1 - ri;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderBottom: "1px solid #1e293b", fontSize: 13 }}>
                    <span style={{ color: "#475569", minWidth: 22 }}>#{i + 1}</span>
                    <span style={{ color: "#a78bfa", minWidth: 80 }}>{pName(pt.playerId)}</span>
                    <span style={{ color: RESULT_COLORS[pt.result], minWidth: 26, fontWeight: 700 }}>{RESULT_SHORT[pt.result]}</span>
                    <span style={{ color: "#64748b" }}>{pt.stroke}</span>
                    {!match.finished && i === match.points.length - 1 && (
                      <button style={{ ...styles.btn, ...styles.btnGhost, fontSize: 11, padding: "2px 8px", marginLeft: "auto" }}
                        onClick={() => { setDraft({ ...pt }); setEditIdx(i); }}>Edit</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── End Match ────────────────────────────────────────────────────────────────
function EndMatch({ match, players, onSave, onCancel, onBack }) {
  const [sets, setSets] = useState([["", ""]]);
  const [error, setError] = useState("");

  const updateSet = (si, ti, val) => {
    const v = parseInt(val);
    if (val !== "" && (isNaN(v) || v < 0 || v > 7)) return;
    setSets(sets.map((s, i) => i === si ? s.map((x, j) => j === ti ? val : x) : s));
  };

  const addSet = () => { if (sets.length < 3) setSets([...sets, ["", ""]]); };
  const removeSet = i => setSets(sets.filter((_, j) => j !== i));

  const pName = id => players.find(p => p.id === id)?.name || "?";
  const t0 = match.teams[0].map(pName).join(" & ");
  const t1 = match.teams[1].map(pName).join(" & ");

  const finish = () => {
    for (const s of sets) {
      if (s[0] === "" || s[1] === "") return setError("Fill in all set scores.");
    }
    onSave({ ...match, sets: sets.map(s => [parseInt(s[0]), parseInt(s[1])]), finished: true });
    onBack();
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={onCancel}>← Cancel</button>
        <span style={styles.logo}>End Match</span>
      </header>
      <main style={styles.main}>
        <h2 style={styles.sectionTitle}>Enter Set Scores</h2>
        <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 16, color: "#94a3b8", fontSize: 13 }}>
          <span style={{ color: "#3b82f6", fontWeight: 600 }}>{t0}</span>
          <span>vs</span>
          <span style={{ color: "#f59e0b", fontWeight: 600 }}>{t1}</span>
        </div>

        {sets.map((s, si) => (
          <div key={si} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ color: "#64748b", width: 50 }}>Set {si + 1}</span>
            <input type="number" min="0" max="7" style={{ ...styles.input, width: 60, textAlign: "center" }} value={s[0]} onChange={e => updateSet(si, 0, e.target.value)} placeholder="0" />
            <span style={{ color: "#475569" }}>—</span>
            <input type="number" min="0" max="7" style={{ ...styles.input, width: 60, textAlign: "center" }} value={s[1]} onChange={e => updateSet(si, 1, e.target.value)} placeholder="0" />
            {sets.length > 1 && <button style={{ ...styles.btn, ...styles.btnDanger, padding: "4px 10px" }} onClick={() => removeSet(si)}>×</button>}
          </div>
        ))}

        {sets.length < 3 && (
          <button style={{ ...styles.btn, ...styles.btnGhost, marginBottom: 16 }} onClick={addSet}>+ Add Set</button>
        )}

        {error && <p style={{ color: "#ef4444", marginBottom: 10 }}>{error}</p>}
        <button style={{ ...styles.btn, ...styles.btnPrimary, width: "100%", padding: 14 }} onClick={finish}>✅ Finish Match</button>
      </main>
    </div>
  );
}

// ── Export Tab ───────────────────────────────────────────────────────────────
function ExportTab({ players, matches }) {
  const [msg, setMsg] = useState("");

  const pName = id => players.find(p => p.id === id)?.name || id;

  const downloadCSV = (filename, rows) => {
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", filename);
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
    setMsg(`✅ ${filename} downloaded!`);
    setTimeout(() => setMsg(""), 3000);
  };

  const exportPlayerStats = () => {
    const header = ["Player", "Matches", "Avg Winners", "Avg UE", "Avg FE", "Top W Stroke", "Top UE Stroke", "Top FE Stroke"];
    const rows = players.map(p => {
      const pm = matches.filter(m => m.teams.flat().includes(p.id));
      const pts = pm.flatMap(m => m.points || []);
      const { totals, topStroke } = calcStats(pts, p.id);
      const n = pm.length || 1;
      return [p.name, pm.length, (totals.Winner / n).toFixed(2), ((totals["Unforced Error"] || 0) / n).toFixed(2), ((totals["Forced Error"] || 0) / n).toFixed(2), topStroke("Winner"), topStroke("Unforced Error"), topStroke("Forced Error")];
    });
    downloadCSV("padel_player_stats.csv", [header, ...rows]);
  };

  const exportMatchStats = () => {
    const header = ["Date", "Location", "Team 1", "Team 2", "Score", "Total Points", "W", "UE", "FE"];
    const rows = [...matches].sort((a, b) => new Date(b.date) - new Date(a.date)).map(m => {
      const t0 = m.teams[0].map(pName).join(" & ");
      const t1 = m.teams[1].map(pName).join(" & ");
      const score = m.sets?.map(s => `${s[0]}-${s[1]}`).join(", ") || "—";
      const pts = m.points || [];
      return [m.date, m.location, t0, t1, score, pts.length, pts.filter(p => p.result === "Winner").length, pts.filter(p => p.result === "Unforced Error").length, pts.filter(p => p.result === "Forced Error").length];
    });
    downloadCSV("padel_match_stats.csv", [header, ...rows]);
  };

  const exportPointByPoint = () => {
    const header = ["Match Date", "Location", "Team 1", "Team 2", "Point #", "Player", "Result", "Stroke Group", "Stroke"];
    const rows = [];
    [...matches].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(m => {
      const t0 = m.teams[0].map(pName).join(" & ");
      const t1 = m.teams[1].map(pName).join(" & ");
      (m.points || []).forEach((pt, i) => {
        const grp = ALL_STROKES.find(s => s.name === pt.stroke)?.group || "—";
        rows.push([m.date, m.location, t0, t1, i + 1, pName(pt.playerId), pt.result, grp, pt.stroke]);
      });
    });
    downloadCSV("padel_points_detail.csv", [header, ...rows]);
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>Export Data</h2>
      {msg && <div style={{ background: "#14532d", color: "#86efac", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>{msg}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {[
          { label: "📊 Player Statistics (CSV)", desc: "Averages and top strokes per player", fn: exportPlayerStats },
          { label: "🏆 Match Summary (CSV)", desc: "All matches with scores and totals", fn: exportMatchStats },
          { label: "📋 Point-by-Point Detail (CSV)", desc: "Every recorded point across all matches", fn: exportPointByPoint },
        ].map(({ label, desc, fn }) => (
          <div key={label} style={{ ...styles.matchCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 3 }}>{label}</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>{desc}</div>
            </div>
            <button style={{ ...styles.btn, ...styles.btnPrimary, whiteSpace: "nowrap" }} onClick={fn}>Download</button>
          </div>
        ))}
      </div>
      <p style={{ color: "#475569", fontSize: 13, marginTop: 24 }}>Google Sheets integration coming soon.</p>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  app: { minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif" },
  loading: { minHeight: "100vh", background: "#0f172a", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 },
  header: { background: "#1e293b", padding: "12px 20px", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #334155", flexWrap: "wrap" },
  logo: { fontWeight: 800, fontSize: 18, color: "#a78bfa", marginRight: "auto" },
  nav: { display: "flex", gap: 4 },
  navBtn: { background: "transparent", border: "none", color: "#64748b", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, transition: "all 0.15s" },
  navBtnActive: { background: "#334155", color: "#a78bfa" },
  main: { maxWidth: 700, margin: "0 auto", padding: "28px 20px" },
  sectionTitle: { fontWeight: 800, fontSize: 20, color: "#f1f5f9", marginBottom: 16 },
  input: { background: "#1e293b", border: "1.5px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box" },
  btn: { background: "#334155", border: "none", borderRadius: 8, padding: "9px 16px", color: "#e2e8f0", cursor: "pointer", fontWeight: 600, fontSize: 14, transition: "all 0.15s" },
  btnPrimary: { background: "#6d28d9", color: "#fff" },
  btnDanger: { background: "#7f1d1d", color: "#fca5a5", border: "1px solid #ef4444" },
  btnGhost: { background: "transparent", border: "1.5px solid #334155", color: "#94a3b8" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  listItem: { background: "#1e293b", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  matchCard: { background: "#1e293b", borderRadius: 10, padding: "14px 16px", marginBottom: 10, border: "1px solid #334155" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 },
  statCard: { background: "#1e293b", borderRadius: 10, padding: "14px 16px" },
  formGroup: { marginBottom: 20 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 },
  modal: { background: "#1e293b", borderRadius: 14, padding: 28, border: "1px solid #334155", width: "90%" },
  empty: { color: "#475569", fontStyle: "italic" },
};
