import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

export default function BoardHeader({
  board,
  onUpdateBoard,
  search,
  onSearchChange,
  dueFilter,
  onDueFilterChange,
  selectedLabelIds,
  onToggleLabel,
  selectedMemberIds,
  onToggleMember,
  labels,
  members,
}) {
  console.log("LABELS:", labels);
console.log("MEMBERS:", members);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(board?.title || "");

  useEffect(() => {
    setTitleDraft(board.title);
  }, [board.title]);

  async function saveTitle() {
    const t = titleDraft.trim();
    if (!t || t === board.title) {
      setTitleDraft(board.title);
      setEditingTitle(false);
      return;
    }
    await onUpdateBoard({ title: t });
    setEditingTitle(false);
  }

  return (
    <header className="board-header board-header-tools">
      <Link to="/" className="trello-btn-ghost" style={{ fontSize: 15 }}>
        ← Boards
      </Link>

      {editingTitle ? (
        <input
          className="trello-input board-title-input"
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTitle();
            if (e.key === "Escape") {
              setTitleDraft(board.title);
              setEditingTitle(false);
            }
          }}
        />
      ) : (
        <h1
          className="board-title-click"
          onClick={() => {
            setTitleDraft(board.title);
            setEditingTitle(true);
          }}
        >
          {board.title}
        </h1>
      )}

      <div className="board-header-spacer" />

      <div className="board-header-filters">
        <input
          className="trello-input board-filter-input"
          placeholder="Search cards"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        <select
          className="trello-input board-filter-select"
          value={dueFilter}
          onChange={(e) => onDueFilterChange(e.target.value)}
        >
          <option value="all">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due this week</option>
          <option value="none">No due date</option>
        </select>
      </div>

      <details className="board-header-dropdown">
        <summary>Labels</summary>
        <div className="board-dropdown-panel">
          {(labels || []).map((l) => (
            <label key={l.id} className="board-dropdown-row">
              <input
                type="checkbox"
                checked={selectedLabelIds.includes(l.id)}
                onChange={() => onToggleLabel(l.id)}
              />
              <span className="label-swatch" style={{ background: l.color }} />
              <span className="board-dropdown-label">{l.name}</span>
            </label>
          ))}
        </div>
      </details>

      <details className="board-header-dropdown">
        <summary>Members</summary>
        <div className="board-dropdown-panel">
          {(members || []).map((m) => (
            <label key={m.id} className="board-dropdown-row">
              <input
                type="checkbox"
                checked={selectedMemberIds.includes(m.id)}
                onChange={() => onToggleMember(m.id)}
              />
              <span
                className="member-chip"
                style={{ background: m.avatarColor, color: "#fff" }}
              >
                {m.initials}
              </span>
              <span className="board-dropdown-label">{m.name}</span>
            </label>
          ))}
        </div>
      </details>
    </header>
  );
}
