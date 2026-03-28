import { fileUrl } from "../api.js";

function formatDue(dueDate) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CardPreview({ card, onOpen }) {
  const due = formatDue(card.dueDate);
  const overdue =
    card.dueDate && new Date(card.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
  const attachCount = card._count?.attachments ?? (card.attachments?.length ?? 0);
  const cover = card.coverImageUrl;

  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className="card-preview-btn"
    >
      {cover && (
        <div
          className="card-preview-cover"
          style={{ backgroundImage: `url(${fileUrl(cover)})` }}
          role="img"
          aria-label=""
        />
      )}
      <div className="card-preview-body">
        {(card.labels || []).length > 0 && (
          <div className="card-preview-labels">
            {(card.labels || []).map((cl) => (
              <span
                key={cl.label?.id ?? cl.labelId}
                title={cl.label?.name}
                className="card-preview-label-chip"
                style={{ background: cl.label?.color ?? "#ccc" }}
              />
            ))}
          </div>
        )}
        <div className="card-preview-title">{card.title}</div>
        <div className="card-preview-meta">
          {due && (
            <span
              className={
                overdue ? "card-preview-due card-preview-due--overdue" : "card-preview-due"
              }
            >
              {due}
            </span>
          )}
          {attachCount > 0 && (
            <span className="card-preview-attach" title="Attachments">
              {attachCount} file{attachCount === 1 ? "" : "s"}
            </span>
          )}
          <div className="card-preview-members">
            {(card.members || []).map((cm) => {
              const m = cm.member;
              if (!m) return null;
              return (
                <span key={m.id} title={m.name} className="card-preview-avatar" style={{ background: m.avatarColor }}>
                  {m.initials}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </button>
  );
}
