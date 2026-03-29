import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { api, boardBackgroundStyle } from "../api.js";
import BoardHeader from "../components/BoardHeader.jsx";
import ListColumn from "../components/ListColumn.jsx";
import CardModal from "../components/CardModal.jsx";
import CardPreview from "../components/CardPreview.jsx";

function deriveFromBoard(board) {
  if (!board?.lists) {
    return { listOrder: [], cardsByList: {}, cardsMap: {} };
  }
  const listOrder = board.lists.map((l) => l.id);
  const cardsByList = {};
  const cardsMap = {};
  for (const list of board.lists) {
    cardsByList[list.id] = (list.cards || []).map((c) => {
      cardsMap[c.id] = c;
      return c.id;
    });
  }
  return { listOrder, cardsByList, cardsMap };
}

function parseCardDragId(id) {
  const s = String(id);
  if (!s.startsWith("card-")) return null;
  return Number(s.slice(5));
}

function parseListContainerId(id) {
  const s = String(id);
  const m = s.match(/^lc-(\d+)$/);
  if (m) return Number(m[1]);
  return null;
}

function parseListDropId(id) {
  const s = String(id);
  let m = s.match(/^lc-(\d+)-tail$/);
  if (m) return Number(m[1]);
  m = s.match(/^lc-(\d+)-empty$/);
  if (m) return Number(m[1]);
  m = s.match(/^lc-(\d+)$/);
  if (m) return Number(m[1]);
  return null;
}

function findListOfCard(cardsByList, cardId) {
  for (const lid of Object.keys(cardsByList)) {
    if (cardsByList[lid].includes(cardId)) return Number(lid);
  }
  return null;
}

function matchFilters(card, f) {
  if (f.search && !card.title.toLowerCase().includes(f.search.toLowerCase())) return false;
  if (f.selectedLabelIds.length) {
    const ids = new Set((card.labels || []).map((x) => x.labelId ?? x.label?.id));
    if (!f.selectedLabelIds.some((id) => ids.has(id))) return false;
  }
  if (f.selectedMemberIds.length) {
    const ids = new Set((card.members || []).map((x) => x.memberId ?? x.member?.id));
    if (!f.selectedMemberIds.some((id) => ids.has(id))) return false;
  }
  if (f.dueFilter !== "all") {
    const d = card.dueDate ? new Date(card.dueDate) : null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const endWeek = new Date(start);
    endWeek.setDate(endWeek.getDate() + 7);
    if (f.dueFilter === "none") return !d;
    if (!d) return false;
    if (f.dueFilter === "overdue") return d < start;
    if (f.dueFilter === "today") return d.toDateString() === start.toDateString();
    if (f.dueFilter === "week") return d >= start && d <= endWeek;
  }
  return true;
}

export default function BoardPage() {
  const { boardId } = useParams();
  const id = Number(boardId);

  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDrag, setActiveDrag] = useState(null);
  const [modalCardId, setModalCardId] = useState(null);

  const [search, setSearch] = useState("");
  const [dueFilter, setDueFilter] = useState("all");
  const [selectedLabelIds, setSelectedLabelIds] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const { listOrder, cardsByList, cardsMap } = useMemo(() => deriveFromBoard(board), [board]);

  const filterCtx = useMemo(
    () => ({ search, selectedLabelIds, selectedMemberIds, dueFilter }),
    [search, selectedLabelIds, selectedMemberIds, dueFilter]
  );

  const filtersActive =
    search.trim() !== "" ||
    selectedLabelIds.length > 0 ||
    selectedMemberIds.length > 0 ||
    dueFilter !== "all";

  const filterCard = useCallback((card) => matchFilters(card, filterCtx), [filterCtx]);

  async function loadBoard() {
    const { data } = await api.get(`/boards/${id}`);
    setBoard(data);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [bRes, mRes] = await Promise.all([
  api.get(`/boards/${id}`),
  api.get("/members"),
]);
        if (cancelled) return;
        setBoard(bRes.data);
        setMembers(mRes.data);
      } catch {
        if (!cancelled) setBoard(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  async function onUpdateBoard(patch) {
    const { data } = await api.patch(`/boards/${id}`, patch);
    setBoard((prev) => (prev ? { ...prev, ...data } : prev));
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    const aid = String(active.id);
    const oid = String(over.id);

    const activeList = parseListContainerId(aid);
    const overListCol = parseListContainerId(oid);
    if (activeList !== null && overListCol !== null) {
      const oldIndex = listOrder.indexOf(activeList);
      const newIndex = listOrder.indexOf(overListCol);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const nextOrder = arrayMove(listOrder, oldIndex, newIndex);
      try {
        const { data } = await api.patch(`/boards/${id}/lists/reorder`, { listIds: nextOrder });
        setBoard(data);
      } catch {
        await loadBoard();
      }
      return;
    }

    const cardId = parseCardDragId(aid);
    if (cardId === null) return;

    const sourceListId = findListOfCard(cardsByList, cardId);
    if (sourceListId === null) return;

    const overCardId = parseCardDragId(oid);
    const dropListId = parseListDropId(oid);

    let targetListId;
    let updated;

    if (overCardId !== null) {
      targetListId = findListOfCard(cardsByList, overCardId);
      if (targetListId === null) return;

      if (sourceListId === targetListId) {
        const oldIndex = cardsByList[sourceListId].indexOf(cardId);
        const newIndex = cardsByList[sourceListId].indexOf(overCardId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
        updated = {
          ...cardsByList,
          [sourceListId]: arrayMove(cardsByList[sourceListId], oldIndex, newIndex),
        };
      } else {
        const next = {};
        for (const lid of listOrder) next[lid] = [...cardsByList[lid]];
        next[sourceListId] = next[sourceListId].filter((c) => c !== cardId);
        const tArr = next[targetListId];
        const idx = tArr.indexOf(overCardId);
        next[targetListId] = [...tArr.slice(0, idx), cardId, ...tArr.slice(idx)];
        updated = next;
      }
    } else if (dropListId !== null) {
      targetListId = dropListId;
      if (sourceListId === targetListId) {
        const arr = [...cardsByList[sourceListId]];
        const oldIndex = arr.indexOf(cardId);
        arr.splice(oldIndex, 1);
        arr.push(cardId);
        updated = { ...cardsByList, [sourceListId]: arr };
      } else {
        const next = {};
        for (const lid of listOrder) next[lid] = [...cardsByList[lid]];
        next[sourceListId] = next[sourceListId].filter((c) => c !== cardId);
        const tArr = next[targetListId];
        next[targetListId] = [...tArr, cardId];
        updated = next;
      }
    } else {
      return;
    }

    try {
      const { data } = await api.post(`/boards/${id}/cards/layout`, {
        lists: listOrder.map((lid) => ({
          listId: lid,
          cardIds: updated[lid],
        })),
      });
      setBoard(data);
    } catch {
      await loadBoard();
    }
  }

  function onDragStart(event) {
    const sid = String(event.active.id);
    if (sid.startsWith("card-")) {
      const cid = Number(sid.slice(5));
      const c = cardsMap[cid];
      if (c) setActiveDrag({ type: "card", card: c });
    }
  }

  async function addList(title) {
    const t = (title || "").trim() || "New list";
    await api.post(`/boards/${id}/lists`, { title: t });
    await loadBoard();
  }

  if (loading) {
    return (
      <div
        className="board-page-loading"
        style={{ minHeight: "100vh", ...boardBackgroundStyle("#0079bf"), color: "#fff", padding: 24 }}
      >
        Loading board…
      </div>
    );
  }

  if (!board) {
    return (
      <div style={{ padding: 24 }}>
        Board not found. <a href="/">Home</a>
      </div>
    );
  }

  return (
    <div
      className="board-page"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        ...boardBackgroundStyle(board),
      }}
    >
      <BoardHeader
        board={board}
        onUpdateBoard={onUpdateBoard}
        search={search}
        onSearchChange={setSearch}
        dueFilter={dueFilter}
        onDueFilterChange={setDueFilter}
        selectedLabelIds={selectedLabelIds}
        onToggleLabel={(lid) =>
          setSelectedLabelIds((prev) =>
            prev.includes(lid) ? prev.filter((x) => x !== lid) : [...prev, lid]
          )
        }
        selectedMemberIds={selectedMemberIds}
        onToggleMember={(mid) =>
          setSelectedMemberIds((prev) =>
            prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]
          )
        }
        labels={board.labels}
        members={members}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="trello-scrollbar"
          style={{
            flex: 1,
            overflowX: "auto",
            padding: "12px 16px 32px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <SortableContext items={listOrder.map((lid) => `lc-${lid}`)} strategy={horizontalListSortingStrategy}>
              {listOrder.map((lid) => {
                const listMeta = board.lists.find((l) => l.id === lid);
                if (!listMeta) return null;
                return (
                  <ListColumn
                    key={lid}
                    list={listMeta}
                    cardIds={cardsByList[lid] || []}
                    cardsMap={cardsMap}
                    onBoardRefresh={loadBoard}
                    onOpenCard={(c) => setModalCardId(c.id)}
                    cardDragDisabled={filtersActive}
                    filterCard={filterCard}
                  />
                );
              })}
            </SortableContext>
            <AddList onAdd={addList} />
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag?.type === "card" ? (
            <div className="card-drag-overlay">
              <CardPreview card={activeDrag.card} onOpen={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {modalCardId && (
        <CardModal
          cardId={modalCardId}
          labels={board.labels}
          members={members}
          onClose={() => setModalCardId(null)}
          onSaved={loadBoard}
        />
      )}
    </div>
  );
}

function AddList({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        className="add-list-btn"
        onClick={() => setOpen(true)}
        style={{
          flexShrink: 0,
          padding: "12px 14px",
          border: "none",
          borderRadius: 12,
          background: "rgba(255,255,255,.2)",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
          alignSelf: "flex-start",
        }}
      >
        + Add another list
      </button>
    );
  }

  return (
    <form
      className="add-list-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(title);
        setTitle("");
        setOpen(false);
      }}
      style={{
        flexShrink: 0,
        background: "#ebecf0",
        borderRadius: 12,
        padding: 10,
        alignSelf: "flex-start",
      }}
    >
      <input
        className="trello-input"
        autoFocus
        placeholder="List title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="trello-btn-primary">
          Add list
        </button>
        <button
          type="button"
          className="trello-btn-subtle"
          onClick={() => {
            setOpen(false);
            setTitle("");
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
