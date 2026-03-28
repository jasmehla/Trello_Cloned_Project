import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, boardBackgroundStyle } from "../api.js";

/** Trello-style board background colors */
const BOARD_COLORS = [
  "#0079bf",
  "#d29034",
  "#519839",
  "#b04632",
  "#89609e",
  "#cd5a91",
  "#4bbf6b",
  "#00aecc",
  "#838c91",
];

export default function Home() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const { data } = await api.get("/boards");
      if (!Array.isArray(data)) {
        setBoards([]);
        setError(
          "API returned an unexpected response. Check VITE_API_URL: use http://localhost:5000 (no /api at the end), or unset it in dev to use the Vite proxy."
        );
        return;
      }
      setBoards(data);
    } catch (e) {
      setBoards([]);
      const msg =
        e?.response?.status === 404
          ? "Boards endpoint not found. Is the backend running on port 5000? Try: npm run dev in the backend folder, then restart the frontend dev server."
          : "Could not load boards. Start the API (backend npm run dev) and refresh. If you use .env, set VITE_API_URL=http://localhost:5000 (not …/api).";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createBoard(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    try {
      const { data } = await api.post("/boards", { title: t, background: "#0079bf" });
      setTitle("");
      setBoards((prev) => [
        ...prev,
        {
          ...data,
          background: data.background ?? "#0079bf",
          _count: { lists: 0 },
        },
      ]);
    } catch {
      setError("Create board failed.");
    }
  }

  async function setBoardColor(boardId, hex) {
    try {
      const { data } = await api.patch(`/boards/${boardId}`, {
        background: hex,
        backgroundImage: null,
      });
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId
            ? { ...b, background: data.background ?? hex, backgroundImage: data.backgroundImage ?? null }
            : b
        )
      );
    } catch {
      setError("Could not update board color.");
    }
  }

  async function deleteBoard(boardId, boardTitle) {
    if (!confirm(`Delete board “${boardTitle}”? This cannot be undone.`)) return;
    try {
      await api.delete(`/boards/${boardId}`);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } catch {
      setError("Could not delete board.");
    }
  }

  return (
    <div className="app-shell" style={{
  background: "#0079bf",
  minHeight: "100vh"
}}>
      <header style={{
  background: "#ffffff",
  padding: "12px 20px",
  borderBottom: "1px solid #e6e6e6"
}}>
  <Link to="/" style={{
    color: "#026aa7",
    fontSize: "20px",
    fontWeight: "bold",
    textDecoration: "none"
  }}>
    Trello_Clone
  </Link>
</header>
      <main className="home-main" style={{
  padding: "20px"
}}>
        <h1 className="home-title">Your boards</h1>

        <form className="home-form" onSubmit={createBoard}>
          <input
            className="trello-input"
            placeholder="New board title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" className="trello-btn-primary">
            Create board
          </button>
        </form>

        {error && (
          <p className="home-error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : boards.length === 0 && !error ? (
          <div className="home-empty muted">
            <p style={{ margin: "0 0 8px" }}>No boards yet.</p>
            <p style={{ margin: 0 }}>
              Create one with the form above, or in the backend run{" "}
              <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>
                npm run db:seed
              </code>{" "}
              and refresh.
            </p>
          </div>
        ) : (
          <div className="board-grid">
            {boards.map((b) => (
              <div
                key={b.id}
                className="board-tile-shell"
                style={{ background: "#ffffff" }}
              >
                <Link to={`/board/${b.id}`} className="board-tile-link">
                  <span style={{
  color: "#000",
  fontWeight: "600"
}}>
  {b.title}
</span>
                </Link>
                <div>
                  
                  <button
                    type="button"
                    className="board-tile-delete"
                    onClick={(e) => {
                      e.preventDefault();
                      deleteBoard(b.id, b.title);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
