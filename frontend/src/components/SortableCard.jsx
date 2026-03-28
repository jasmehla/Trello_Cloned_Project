import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import CardPreview from "./CardPreview.jsx";

export default function SortableCard({ card, onOpen, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card-${card.id}`,
    data: { type: "card", card },
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...(disabled ? {} : listeners)}>
      <div style={{ cursor: disabled ? "default" : "grab" }}>
        <CardPreview card={card} onOpen={onOpen} />
      </div>
    </div>
  );
}
