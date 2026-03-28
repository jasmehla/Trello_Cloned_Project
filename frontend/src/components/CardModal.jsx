import { useEffect, useState } from "react";
import { api, fileUrl } from "../api.js";

function formatActivity(a) {
  const who = a.member?.name || "Someone";
  const map = {
    "card.created": "created this card",
    "card.title_updated": "updated the title",
    "comment.added": "added a comment",
    "attachment.added": "attached a file",
    "label.added": "added a label",
    "label.removed": "removed a label",
    "member.added": "joined this card",
    "member.removed": "left this card",
  };
  const verb = map[a.action] || a.action;
  return `${who} ${verb}${a.detail ? `: ${a.detail}` : ""}`;
}

export default function CardModal({ cardId, labels, members, onClose, onSaved }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [coverDraft, setCoverDraft] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentAsMemberId, setCommentAsMemberId] = useState(1);

  async function refreshCard() {
    const { data } = await api.get(`/cards/${cardId}`);
    setCard(data);
    setTitle(data.title);
    setDescription(data.description || "");
    setDue(data.dueDate ? data.dueDate.slice(0, 10) : "");
    setCoverDraft(data.coverImageUrl || "");
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/cards/${cardId}`);
        if (cancelled) return;
        setCard(data);
        setTitle(data.title);
        setDescription(data.description || "");
        setDue(data.dueDate ? data.dueDate.slice(0, 10) : "");
        setCoverDraft(data.coverImageUrl || "");
      } catch {
        if (!cancelled) setCard(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  useEffect(() => {
    if (members?.[0]?.id) {
      setCommentAsMemberId((prev) => prev || members[0].id);
    }
  }, [members]);

  async function saveMeta() {
    await api.patch(`/cards/${cardId}`, {
      title: title.trim() || card.title,
      description: description || null,
      dueDate: due ? new Date(due).toISOString() : null,
    });
    onSaved();
  }

  async function saveCover() {
    const url = coverDraft.trim();
    await api.patch(`/cards/${cardId}`, {
      coverImageUrl: url || null,
    });
    await refreshCard();
    onSaved();
  }

  async function toggleLabel(labelId) {
    const has = (card.labels || []).some((cl) => cl.labelId === labelId || cl.label?.id === labelId);
    if (has) {
      const { data } = await api.delete(`/cards/${cardId}/labels/${labelId}`);
      setCard(data);
    } else {
      const { data } = await api.post(`/cards/${cardId}/labels`, { labelId });
      setCard(data);
    }
    onSaved();
  }

  async function toggleMember(memberId) {
    const has = (card.members || []).some((cm) => cm.memberId === memberId || cm.member?.id === memberId);
    if (has) {
      const { data } = await api.delete(`/cards/${cardId}/members/${memberId}`);
      setCard(data);
    } else {
      const { data } = await api.post(`/cards/${cardId}/members`, { memberId });
      setCard(data);
    }
    onSaved();
  }

  async function addChecklist() {
    const name = prompt("Checklist title", "Checklist");
    if (!name) return;
    await api.post(`/cards/${cardId}/checklists`, { title: name });
    await refreshCard();
    onSaved();
  }

  async function addChecklistItem(checklistId) {
    const t = prompt("Item title");
    if (!t) return;
    await api.post(`/checklists/${checklistId}/items`, { title: t });
    await refreshCard();
    onSaved();
  }

  async function toggleItem(item) {
    await api.patch(`/checklist-items/${item.id}`, { done: !item.done });
    await refreshCard();
    onSaved();
  }

  async function archiveCard() {
    await api.patch(`/cards/${cardId}`, { archived: true });
    onSaved();
    onClose();
  }

  async function deleteCard() {
    if (!confirm("Delete this card permanently?")) return;
    await api.delete(`/cards/${cardId}`);
    onSaved();
    onClose();
  }

  async function uploadAttachment(ev) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    const { data } = await api.post(`/cards/${cardId}/attachments`, fd);
    setCard(data);
    onSaved();
  }

  async function removeAttachment(attId) {
    const { data } = await api.delete(`/attachments/${attId}`);
    setCard(data);
    onSaved();
  }

  function useAttachmentAsCover(att) {
    setCoverDraft(att.url);
    api.patch(`/cards/${cardId}`, { coverImageUrl: att.url }).then(() => {
      refreshCard();
      onSaved();
    });
  }

  async function submitComment(e) {
    e.preventDefault();
    const body = commentBody.trim();
    if (!body) return;
    const { data } = await api.post(`/cards/${cardId}/comments`, {
      body,
      memberId: commentAsMemberId,
    });
    setCard(data);
    setCommentBody("");
    onSaved();
  }

  async function deleteComment(commentId) {
    if (!confirm("Delete this comment?")) return;
    const { data } = await api.delete(`/comments/${commentId}`);
    setCard(data);
    onSaved();
  }

  if (loading || !card) {
    return (
      <div style={overlayStyle} onMouseDown={onClose}>
        <div style={modalStyle} onMouseDown={(ev) => ev.stopPropagation()}>
          <p style={{ margin: 0 }}>Loading…</p>
        </div>
      </div>
    );
  }

  const assigned = new Set((card.members || []).map((m) => m.memberId ?? m.member?.id));
  const cardLabelIds = new Set((card.labels || []).map((l) => l.labelId ?? l.label?.id));
  const coverSrc = card.coverImageUrl ? fileUrl(card.coverImageUrl) : null;

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div className="card-modal-inner" style={wideModalStyle} onMouseDown={(ev) => ev.stopPropagation()}>
        <button type="button" aria-label="Close" onClick={onClose} className="card-modal-close">
          ×
        </button>

        {coverSrc && (
          <div className="card-modal-hero" style={{ backgroundImage: `url(${coverSrc})` }} role="img" aria-hidden />
        )}

        <div className="card-modal-grid">
          <div className="card-modal-main">
            <input
              className="trello-input card-modal-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveMeta}
            />

            <h3 className="card-modal-h3">Cover image</h3>
            <input
              className="trello-input"
              placeholder="Image URL (or set from an attachment below)"
              value={coverDraft}
              onChange={(e) => setCoverDraft(e.target.value)}
              onBlur={saveCover}
            />
            <button
              type="button"
              className="trello-btn-subtle"
              onClick={async () => {
                await api.patch(`/cards/${cardId}`, { coverImageUrl: null });
                setCoverDraft("");
                await refreshCard();
                onSaved();
              }}
            >
              Remove cover
            </button>

            <h3 className="card-modal-h3">Attachments</h3>
            <input type="file" className="card-modal-file" onChange={uploadAttachment} />
            <ul className="card-attach-list">
              {(card.attachments || []).map((a) => (
                <li key={a.id} className="card-attach-item">
                  <a href={fileUrl(a.url)} target="_blank" rel="noreferrer">
                    {a.fileName}
                  </a>
                  <button type="button" className="trello-btn-subtle" onClick={() => useAttachmentAsCover(a)}>
                    Use as cover
                  </button>
                  <button type="button" className="trello-btn-subtle" onClick={() => removeAttachment(a.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>

            <h3 className="card-modal-h3">Description</h3>
            <textarea
              className="trello-input"
              rows={5}
              placeholder="Add a more detailed description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveMeta}
              style={{ resize: "vertical" }}
            />

            <h3 className="card-modal-h3">Due date</h3>
            <input
              type="date"
              className="trello-input"
              style={{ maxWidth: 220 }}
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onBlur={saveMeta}
            />

            <h3 className="card-modal-h3">Comments</h3>
            <form onSubmit={submitComment} className="comment-form">
              <select
                className="trello-input"
                value={commentAsMemberId}
                onChange={(e) => setCommentAsMemberId(Number(e.target.value))}
                aria-label="Comment as"
              >
                {(members || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <textarea
                className="trello-input"
                rows={3}
                placeholder="Write a comment…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <button type="submit" className="trello-btn-primary">
                Save comment
              </button>
            </form>
            <ul className="comment-list">
              {(card.comments || []).map((c) => (
                <li key={c.id} className="comment-item">
                  <div className="comment-head">
                    <strong>{c.member?.name}</strong>
                    <span className="comment-date">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                    <button type="button" className="comment-delete" onClick={() => deleteComment(c.id)}>
                      Delete
                    </button>
                  </div>
                  <div className="comment-body">{c.body}</div>
                </li>
              ))}
            </ul>

            <h3 className="card-modal-h3">Activity</h3>
            <ul className="activity-list">
              {(card.activities || []).map((a) => (
                <li key={a.id} className="activity-item">
                  <span className="activity-text">{formatActivity(a)}</span>
                  <span className="activity-date">{new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>

            <h3 className="card-modal-h3">Checklists</h3>
            {(card.checklists || []).map((cl) => (
              <div key={cl.id} className="checklist-block">
                <div className="checklist-title">{cl.title}</div>
                {(cl.items || []).map((it) => (
                  <label key={it.id} className="checklist-row">
                    <input type="checkbox" checked={it.done} onChange={() => toggleItem(it)} />
                    <span className={it.done ? "check-done" : ""}>{it.title}</span>
                  </label>
                ))}
                <button type="button" className="trello-btn-subtle" onClick={() => addChecklistItem(cl.id)}>
                  Add an item
                </button>
              </div>
            ))}
            <button type="button" className="trello-btn-subtle" onClick={addChecklist}>
              + Add checklist
            </button>
          </div>

          <aside className="card-modal-aside">
            <div className="aside-heading">Add to card</div>
            <button type="button" className="trello-btn-subtle aside-full" onClick={addChecklist}>
              Checklist
            </button>

            <div className="aside-heading">Labels</div>
            <div className="aside-stack">
              {(labels || []).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLabel(l.id)}
                  className="label-pill"
                  style={{
                    background: l.color,
                    opacity: cardLabelIds.has(l.id) ? 1 : 0.45,
                  }}
                >
                  {l.name}
                </button>
              ))}
            </div>

            <div className="aside-heading">Members</div>
            <div className="aside-stack">
              {(members || []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMember(m.id)}
                  className={`trello-btn-subtle aside-member ${assigned.has(m.id) ? "is-on" : ""}`}
                >
                  <span className="member-avatar" style={{ background: m.avatarColor }}>
                    {m.initials}
                  </span>
                  {m.name}
                </button>
              ))}
            </div>

            <div className="aside-actions">
              <button type="button" className="trello-btn-subtle aside-full" onClick={archiveCard}>
                Archive card
              </button>
              <button type="button" className="btn-danger aside-full" onClick={deleteCard}>
                Delete card
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.55)",
  zIndex: 200,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "48px 16px",
  overflowY: "auto",
};

const modalStyle = {
  position: "relative",
  background: "#f4f5f7",
  borderRadius: 12,
  padding: 20,
  maxWidth: 560,
  width: "100%",
  boxShadow: "0 12px 40px rgba(0,0,0,.25)",
};

const wideModalStyle = {
  ...modalStyle,
  maxWidth: 900,
};
