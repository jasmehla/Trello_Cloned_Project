import { useEffect, useState } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import SortableCard from "./SortableCard.jsx";
import CardPreview from "./CardPreview.jsx";
import { api } from "../api.js";

export default function ListColumn({
  list,
  cardIds,
  cardsMap,
  onBoardRefresh,
  onOpenCard,
  cardDragDisabled,
  filterCard,
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingList, setEditingList] = useState(false);
  const [listTitle, setListTitle] = useState(list.title);

  useEffect(() => {
    setListTitle(list.title);
  }, [list.title]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `lc-${list.id}`,
    data: { type: "list", listId: list.id },
  });

  const { setNodeRef: setTailRef } = useDroppable({
    id: `lc-${list.id}-tail`,
    data: { type: "tail", listId: list.id },
  });

  const { setNodeRef: setEmptyRef, isOver: emptyOver } = useDroppable({
    id: `lc-${list.id}-empty`,
    data: { type: "empty", listId: list.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const visibleIds = cardIds.filter((id) => {
    const c = cardsMap[id];
    return c && filterCard(c);
  });

  const sortableItems = cardIds.map((id) => `card-${id}`);

  async function addCard(e) {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t) return;
    await api.post(`/lists/${list.id}/cards`, { title: t });
    setNewTitle("");
    setAdding(false);
    onBoardRefresh();
  }

  async function saveListTitle() {
    const t = listTitle.trim();
    if (!t || t === list.title) {
      setListTitle(list.title);
      setEditingList(false);
      return;
    }
    await api.patch(`/lists/${list.id}`, { title: t });
    setEditingList(false);
    onBoardRefresh();
  }

  async function deleteList() {
    if (!confirm("Delete this list and its cards?")) return;
    await api.delete(`/lists/${list.id}`);
    onBoardRefresh();
  }

  return (
    <div
      ref={setNodeRef}
      className="list-column"
      style={{
        ...style,
        flexShrink: 0,
        alignSelf: "flex-start",
        background: "#ebecf0",
        borderRadius: 12,
        maxHeight: "calc(100vh - 120px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 12px 6px",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div {...attributes} {...listeners} style={{ cursor: "grab", flex: 1, minWidth: 0 }}>
          {editingList ? (
            <input
              className="trello-input"
              autoFocus
              value={listTitle}
              onChange={(e) => setListTitle(e.target.value)}
              onBlur={saveListTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveListTitle();
                if (e.key === "Escape") {
                  setListTitle(list.title);
                  setEditingList(false);
                }
              }}
              style={{ fontWeight: 700 }}
            />
          ) : (
            <h3
              style={{ margin: 0, fontSize: 15, fontWeight: 700, padding: "4px 6px", borderRadius: 4 }}
              onClick={() => {
                setListTitle(list.title);
                setEditingList(true);
              }}
            >
              {list.title}
            </h3>
          )}
        </div>
        <button
          type="button"
          className="trello-btn-subtle"
          style={{ padding: "4px 10px", flexShrink: 0 }}
          onClick={deleteList}
          aria-label="Delete list"
        >
          …
        </button>
      </div>

      <div
        className="trello-scrollbar"
        style={{
          padding: "0 8px",
          overflowY: "auto",
          flex: 1,
          minHeight: 40,
        }}
      >
        {cardDragDisabled ? (
          visibleIds.map((id) => (
            <div key={id}>
              <CardPreview card={cardsMap[id]} onOpen={onOpenCard} />
            </div>
          ))
        ) : (
          <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
            {cardIds.map((id) => {
              const c = cardsMap[id];
              if (!c) return null;
              return <SortableCard key={id} card={c} onOpen={onOpenCard} disabled={false} />;
            })}
          </SortableContext>
        )}

        {cardIds.length === 0 && (
          <div
            ref={setEmptyRef}
            style={{
              minHeight: 48,
              borderRadius: 8,
              border: emptyOver ? "2px dashed #0079bf" : "2px dashed #c1c7d0",
              marginBottom: 8,
            }}
          />
        )}

        <div ref={setTailRef} style={{ minHeight: 12 }} />
      </div>

      <div style={{ padding: "4px 8px 10px" }}>
        {adding ? (
          <form onSubmit={addCard}>
            <textarea
              className="trello-input"
              autoFocus
              rows={3}
              placeholder="Enter a title for this card…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ resize: "vertical", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="trello-btn-primary">
                Add card
              </button>
              <button
                type="button"
                className="trello-btn-subtle"
                onClick={() => {
                  setAdding(false);
                  setNewTitle("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="trello-btn-subtle"
            style={{ width: "100%", textAlign: "left", padding: "10px 12px" }}
            onClick={() => setAdding(true)}
          >
            + Add a card
          </button>
        )}
      </div>
    </div>
  );
}
