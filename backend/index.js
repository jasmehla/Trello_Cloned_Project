const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 5000;
/** Comma-separated list, e.g. https://myapp.onrender.com,http://localhost:5173 */
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${String(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(
  cors({
    origin: FRONTEND_ORIGINS,
    credentials: true,
  })
);
app.use(express.json());
app.use("/uploads", express.static(uploadDir));

/** Root URL — all JSON APIs live under /api (avoid mistaking 404 here for “server down”). */
app.get("/", (_req, res) => {
  res.json({
    name: "Trello_Clone API",
    running: true,
    try: ["/api/health", "/api/boards"],
    docs: "Start with GET /api/health — expect {\"ok\":true}",
  });
});

async function logActivity(client, { cardId, memberId, action, detail }) {
  if (!cardId) return;
  try {
    await client.activity.create({
      data: {
        cardId,
        memberId: memberId ?? null,
        action,
        detail: detail ? String(detail).slice(0, 500) : null,
      },
    });
  } catch (err) {
    console.warn("activity log:", err.message);
  }
}

const cardDetailInclude = {
  labels: { include: { label: true } },
  members: { include: { member: true } },
  checklists: { include: { items: { orderBy: { position: "asc" } } } },
  attachments: { orderBy: { id: "asc" } },
  comments: { orderBy: { createdAt: "asc" }, include: { member: true } },
  activities: { orderBy: { createdAt: "desc" }, take: 80, include: { member: true } },
  list: { select: { id: true, title: true, boardId: true } },
};

const boardInclude = {
  labels: { orderBy: { id: "asc" } },
  lists: {
    orderBy: { position: "asc" },
    include: {
      cards: {
        where: { archived: false },
        orderBy: { position: "asc" },
        include: {
          labels: { include: { label: true } },
          members: { include: { member: true } },
          checklists: {
            include: {
              items: { orderBy: { position: "asc" } },
            },
          },
          _count: { select: { attachments: true } },
        },
      },
    },
  },
};

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/members", async (req, res) => {
  const members = await prisma.member.findMany({ orderBy: { id: "asc" } });
  res.json(members);
});

app.get("/api/boards", async (req, res) => {
  const boards = await prisma.board.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      background: true,
      backgroundImage: true,
      createdAt: true,
      _count: { select: { lists: true } },
    },
  });
  res.json(boards);
});

app.post("/api/boards", async (req, res) => {
  const title = (req.body.title || "").trim() || "Untitled board";
  const background =
    typeof req.body.background === "string" && req.body.background.trim()
      ? req.body.background.trim().slice(0, 32)
      : "#0079bf";
  const backgroundImage =
    typeof req.body.backgroundImage === "string" && req.body.backgroundImage.trim()
      ? req.body.backgroundImage.trim().slice(0, 2048)
      : null;
  const board = await prisma.board.create({
    data: {
      title,
      background,
      backgroundImage,
      labels: {
        create: [
          { name: "Green", color: "#61bd4f" },
          { name: "Yellow", color: "#f2d600" },
          { name: "Blue", color: "#0079bf" },
          { name: "Red", color: "#eb5a46" },
        ],
      },
    },
  });
  res.json(board);
});

app.get("/api/boards/:id", async (req, res) => {
  const id = Number(req.params.id);
  const board = await prisma.board.findUnique({
    where: { id },
    include: boardInclude,
  });
  if (!board) return res.status(404).json({ error: "Board not found" });
  res.json(board);
});

app.patch("/api/boards/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { title, background } = req.body;
  const data = {};
  if (typeof title === "string") data.title = title.trim() || undefined;
  if (typeof background === "string") data.background = background;
  if (Object.prototype.hasOwnProperty.call(req.body, "backgroundImage")) {
    if (req.body.backgroundImage === null || req.body.backgroundImage === "") {
      data.backgroundImage = null;
    } else if (typeof req.body.backgroundImage === "string") {
      data.backgroundImage = req.body.backgroundImage.trim().slice(0, 2048) || null;
    }
  }
  try {
    const board = await prisma.board.update({ where: { id }, data });
    res.json(board);
  } catch {
    res.status(404).json({ error: "Board not found" });
  }
});

app.delete("/api/boards/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.board.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Board not found" });
  }
});

app.patch("/api/boards/:boardId/lists/reorder", async (req, res) => {
  const boardId = Number(req.params.boardId);
  const { listIds } = req.body;
  if (!Array.isArray(listIds)) {
    return res.status(400).json({ error: "listIds array required" });
  }
  await prisma.$transaction(
    listIds.map((lid, index) =>
      prisma.list.updateMany({
        where: { id: Number(lid), boardId },
        data: { position: index + 1 },
      })
    )
  );
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: boardInclude,
  });
  res.json(board);
});

app.post("/api/boards/:boardId/lists", async (req, res) => {
  const boardId = Number(req.params.boardId);
  const title = (req.body.title || "").trim() || "New list";
  const last = await prisma.list.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
  });
  const position = last ? last.position + 1 : 1;
  const list = await prisma.list.create({
    data: { title, boardId, position },
  });
  res.json(list);
});

app.patch("/api/lists/:id", async (req, res) => {
  const id = Number(req.params.id);
  const title = (req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "title required" });
  try {
    const list = await prisma.list.update({ where: { id }, data: { title } });
    res.json(list);
  } catch {
    res.status(404).json({ error: "List not found" });
  }
});

app.delete("/api/lists/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.list.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "List not found" });
  }
});

app.post("/api/lists/:listId/cards", async (req, res) => {
  const listId = Number(req.params.listId);
  const title = (req.body.title || "").trim() || "Untitled card";
  const last = await prisma.card.findFirst({
    where: { listId, archived: false },
    orderBy: { position: "desc" },
  });
  const position = last ? last.position + 1 : 1;
  const card = await prisma.card.create({
    data: { title, listId, position },
    include: cardDetailInclude,
  });
  await logActivity(prisma, {
    cardId: card.id,
    memberId: null,
    action: "card.created",
    detail: title,
  });
  res.json(card);
});

app.get("/api/cards/:id", async (req, res) => {
  const id = Number(req.params.id);
  const card = await prisma.card.findUnique({
    where: { id },
    include: cardDetailInclude,
  });
  if (!card) return res.status(404).json({ error: "Card not found" });
  res.json(card);
});

app.patch("/api/cards/:id", async (req, res) => {
  const id = Number(req.params.id);
  const prev = await prisma.card.findUnique({ where: { id }, select: { title: true } });
  const { title, description, archived, dueDate, listId, coverImageUrl } = req.body;
  const data = {};
  if (typeof title === "string") data.title = title;
  if (description !== undefined) data.description = description;
  if (typeof archived === "boolean") data.archived = archived;
  if (dueDate === null) data.dueDate = null;
  else if (typeof dueDate === "string") data.dueDate = new Date(dueDate);
  if (listId !== undefined) data.listId = Number(listId);
  if (Object.prototype.hasOwnProperty.call(req.body, "coverImageUrl")) {
    if (req.body.coverImageUrl === null || req.body.coverImageUrl === "") {
      data.coverImageUrl = null;
    } else if (typeof req.body.coverImageUrl === "string") {
      data.coverImageUrl = req.body.coverImageUrl.trim().slice(0, 2048) || null;
    }
  }
  try {
    const card = await prisma.card.update({
      where: { id },
      data,
      include: cardDetailInclude,
    });
    if (typeof title === "string" && prev && title !== prev.title) {
      await logActivity(prisma, {
        cardId: id,
        memberId: null,
        action: "card.title_updated",
        detail: title,
      });
    }
    res.json(card);
  } catch {
    res.status(404).json({ error: "Card not found" });
  }
});

app.delete("/api/cards/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.card.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Card not found" });
  }
});

app.post("/api/boards/:boardId/cards/layout", async (req, res) => {
  const boardId = Number(req.params.boardId);
  const { lists: layout } = req.body;
  if (!Array.isArray(layout)) {
    return res.status(400).json({ error: "lists array required" });
  }

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true },
  });
  if (!board) return res.status(404).json({ error: "Board not found" });

  await prisma.$transaction(async (tx) => {
    for (const col of layout) {
      const listId = Number(col.listId);
      const list = await tx.list.findFirst({ where: { id: listId, boardId } });
      if (!list) continue;
      const cardIds = col.cardIds || [];
      let pos = 0;
      for (const rawId of cardIds) {
        pos += 1;
        const cardId = Number(rawId);
        await tx.card.updateMany({
          where: { id: cardId, archived: false },
          data: { listId, position: pos },
        });
      }
    }
  });

  const fresh = await prisma.board.findUnique({
    where: { id: boardId },
    include: boardInclude,
  });
  res.json(fresh);
});

app.post("/api/cards/:cardId/attachments", upload.single("file"), async (req, res) => {
  const cardId = Number(req.params.cardId);
  if (!req.file) return res.status(400).json({ error: "file required" });
  const url = `/uploads/${req.file.filename}`;
  const att = await prisma.attachment.create({
    data: {
      cardId,
      fileName: req.file.originalname || req.file.filename,
      url,
      mimeType: req.file.mimetype || null,
    },
  });
  await logActivity(prisma, {
    cardId,
    memberId: null,
    action: "attachment.added",
    detail: att.fileName,
  });
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: cardDetailInclude,
  });
  res.json(card);
});

app.delete("/api/attachments/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const att = await prisma.attachment.delete({ where: { id } });
    const relPath = att.url.startsWith("/") ? att.url.slice(1) : att.url;
    const fp = path.join(__dirname, relPath);
    try {
      await fsp.unlink(fp);
    } catch {}
    const coverRow = await prisma.card.findUnique({
      where: { id: att.cardId },
      select: { coverImageUrl: true },
    });
    if (coverRow?.coverImageUrl === att.url) {
      await prisma.card.update({ where: { id: att.cardId }, data: { coverImageUrl: null } });
    }
    const fresh = await prisma.card.findUnique({
      where: { id: att.cardId },
      include: cardDetailInclude,
    });
    res.json(fresh);
  } catch {
    res.status(404).json({ error: "Attachment not found" });
  }
});

app.post("/api/cards/:cardId/comments", async (req, res) => {
  const cardId = Number(req.params.cardId);
  const body = (req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "body required" });
  const memberId = Number(req.body.memberId) || 1;
  await prisma.comment.create({
    data: { cardId, memberId, body },
  });
  await logActivity(prisma, {
    cardId,
    memberId,
    action: "comment.added",
    detail: body.slice(0, 200),
  });
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: cardDetailInclude,
  });
  res.json(card);
});

app.delete("/api/comments/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const c = await prisma.comment.delete({ where: { id } });
    const card = await prisma.card.findUnique({
      where: { id: c.cardId },
      include: cardDetailInclude,
    });
    res.json(card);
  } catch {
    res.status(404).json({ error: "Comment not found" });
  }
});

app.get("/api/boards/:boardId/labels", async (req, res) => {
  const boardId = Number(req.params.boardId);
  const labels = await prisma.label.findMany({
    where: { boardId },
    orderBy: { id: "asc" },
  });
  res.json(labels);
});

app.post("/api/boards/:boardId/labels", async (req, res) => {
  const boardId = Number(req.params.boardId);
  const name = (req.body.name || "").trim() || "Label";
  const color = (req.body.color || "#0079bf").trim();
  const label = await prisma.label.create({
    data: { boardId, name, color },
  });
  res.json(label);
});

app.delete("/api/labels/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.label.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Label not found" });
  }
});

app.post("/api/cards/:cardId/labels", async (req, res) => {
  const cardId = Number(req.params.cardId);
  const labelId = Number(req.body.labelId);
  await prisma.cardLabel.upsert({
    where: { cardId_labelId: { cardId, labelId } },
    create: { cardId, labelId },
    update: {},
  });
  await logActivity(prisma, { cardId, memberId: null, action: "label.added", detail: String(labelId) });
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: cardDetailInclude,
  });
  res.json(card);
});

app.delete("/api/cards/:cardId/labels/:labelId", async (req, res) => {
  const cardId = Number(req.params.cardId);
  const labelId = Number(req.params.labelId);
  await prisma.cardLabel.deleteMany({ where: { cardId, labelId } });
  await logActivity(prisma, { cardId, memberId: null, action: "label.removed", detail: String(labelId) });
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: cardDetailInclude,
  });
  res.json(card);
});

app.post("/api/cards/:cardId/members", async (req, res) => {
  const cardId = Number(req.params.cardId);
  const memberId = Number(req.body.memberId);
  await prisma.cardMember.upsert({
    where: { cardId_memberId: { cardId, memberId } },
    create: { cardId, memberId },
    update: {},
  });
  await logActivity(prisma, { cardId, memberId, action: "member.added", detail: String(memberId) });
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: cardDetailInclude,
  });
  res.json(card);
});

app.delete("/api/cards/:cardId/members/:memberId", async (req, res) => {
  const cardId = Number(req.params.cardId);
  const memberId = Number(req.params.memberId);
  await prisma.cardMember.deleteMany({ where: { cardId, memberId } });
  await logActivity(prisma, { cardId, memberId, action: "member.removed", detail: String(memberId) });
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: cardDetailInclude,
  });
  res.json(card);
});

app.post("/api/cards/:cardId/checklists", async (req, res) => {
  const cardId = Number(req.params.cardId);
  const title = (req.body.title || "").trim() || "Checklist";
  const checklist = await prisma.checklist.create({
    data: { cardId, title },
    include: { items: true },
  });
  res.json(checklist);
});

app.post("/api/checklists/:checklistId/items", async (req, res) => {
  const checklistId = Number(req.params.checklistId);
  const title = (req.body.title || "").trim() || "Item";
  const last = await prisma.checklistItem.findFirst({
    where: { checklistId },
    orderBy: { position: "desc" },
  });
  const position = last ? last.position + 1 : 1;
  const item = await prisma.checklistItem.create({
    data: { checklistId, title, position },
  });
  res.json(item);
});

app.patch("/api/checklist-items/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { title, done } = req.body;
  const data = {};
  if (typeof title === "string") data.title = title;
  if (typeof done === "boolean") data.done = done;
  try {
    const item = await prisma.checklistItem.update({ where: { id }, data });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Item not found" });
  }
});

app.delete("/api/checklist-items/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.checklistItem.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Item not found" });
  }
});

app.delete("/api/checklists/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.checklist.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

app.get("/seed", async (req, res) => {
  try {
    const board = await prisma.board.create({
      data: { title: "Demo Board" },
    });

    const todo = await prisma.list.create({
      data: {
        title: "To Do",
        boardId: board.id,
        position: 1,
      },
    });

    const progress = await prisma.list.create({
      data: {
        title: "In Progress",
        boardId: board.id,
        position: 2,
      },
    });

    const done = await prisma.list.create({
      data: {
        title: "Done",
        boardId: board.id,
        position: 3,
      },
    });

    await prisma.card.create({
      data: { title: "Task 1", listId: todo.id, position: 1 },
    });

    await prisma.card.create({
      data: { title: "Task 2", listId: todo.id, position: 2 },
    });

    await prisma.card.create({
      data: { title: "Task 3", listId: progress.id, position: 1 },
    });

    await prisma.card.create({
      data: { title: "Task 4", listId: done.id, position: 1 },
    });

    res.json({ message: "Seed successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
});
