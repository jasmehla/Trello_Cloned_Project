const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const trelloLabelColors = [
  { name: "Green", color: "#61bd4f" },
  { name: "Yellow", color: "#f2d600" },
  { name: "Orange", color: "#ff9f1a" },
  { name: "Red", color: "#eb5a46" },
  { name: "Purple", color: "#c377e0" },
  { name: "Blue", color: "#0079bf" },
];

async function main() {
  await prisma.activity.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.cardLabel.deleteMany();
  await prisma.cardMember.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.checklist.deleteMany();
  await prisma.card.deleteMany();
  await prisma.label.deleteMany();
  await prisma.list.deleteMany();
  await prisma.board.deleteMany();
  await prisma.member.deleteMany();

  const members = await prisma.$transaction([
    prisma.member.create({
      data: {
        name: "Alex Kim",
        email: "alex@example.com",
        initials: "AK",
        avatarColor: "#5f6c7b",
      },
    }),
    prisma.member.create({
      data: {
        name: "Jordan Lee",
        email: "jordan@example.com",
        initials: "JL",
        avatarColor: "#8742f5",
      },
    }),
    prisma.member.create({
      data: {
        name: "Sam Rivera",
        email: "sam@example.com",
        initials: "SR",
        avatarColor: "#e97f33",
      },
    }),
  ]);

  const board = await prisma.board.create({
    data: {
      title: "Team workspace",
      background: "#0079bf",
      backgroundImage: null,
      labels: {
        create: trelloLabelColors,
      },
    },
    include: { labels: true },
  });

  const labelByName = Object.fromEntries(board.labels.map((l) => [l.name, l]));

  const todoList = await prisma.list.create({
    data: {
      title: "To Do",
      position: 1,
      boardId: board.id,
    },
  });
  const doingList = await prisma.list.create({
    data: {
      title: "Doing",
      position: 2,
      boardId: board.id,
    },
  });
  const doneList = await prisma.list.create({
    data: {
      title: "Done",
      position: 3,
      boardId: board.id,
    },
  });

  const card1 = await prisma.card.create({
    data: {
      title: "Draft announcement blog post",
      description: "Include timeline and signup CTA.",
      position: 1,
      listId: todoList.id,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      coverImageUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=600&q=80",
      labels: {
        create: [{ labelId: labelByName.Blue.id }, { labelId: labelByName.Yellow.id }],
      },
      members: {
        create: [{ memberId: members[0].id }],
      },
    },
  });

  await prisma.activity.create({
    data: {
      cardId: card1.id,
      memberId: members[0].id,
      action: "card.created",
      detail: card1.title,
    },
  });

  await prisma.comment.create({
    data: {
      cardId: card1.id,
      memberId: members[1].id,
      body: "Can we add a section on rollout risks?",
    },
  });

  await prisma.activity.create({
    data: {
      cardId: card1.id,
      memberId: members[1].id,
      action: "comment.added",
      detail: "Can we add a section on rollout risks?",
    },
  });

  await prisma.card.create({
    data: {
      title: "Review design mocks",
      position: 2,
      listId: todoList.id,
      labels: {
        create: [{ labelId: labelByName.Purple.id }],
      },
      members: {
        create: [{ memberId: members[1].id }, { memberId: members[2].id }],
      },
    },
  });

  const checklist = await prisma.checklist.create({
    data: {
      title: "Launch checklist",
      cardId: card1.id,
    },
  });

  await prisma.checklistItem.createMany({
    data: [
      { title: "Finalize copy", position: 1, checklistId: checklist.id },
      { title: "Send to legal", position: 2, checklistId: checklist.id, done: true },
      { title: "Schedule social posts", position: 3, checklistId: checklist.id },
    ],
  });

  await prisma.card.create({
    data: {
      title: "QA smoke tests",
      description: "Run regression on staging.",
      position: 1,
      listId: doingList.id,
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      labels: {
        create: [{ labelId: labelByName.Red.id }],
      },
      members: {
        create: [{ memberId: members[2].id }],
      },
    },
  });

  await prisma.card.create({
    data: {
      title: "Kickoff meeting notes",
      position: 1,
      listId: doneList.id,
      archived: false,
      labels: {
        create: [{ labelId: labelByName.Green.id }],
      },
    },
  });

  await prisma.board.create({
    data: {
      title: "Personal tasks",
      background: "#6c547b",
      lists: {
        create: [
          {
            title: "Ideas",
            position: 1,
            cards: {
              create: [{ title: "Read about Kanban", position: 1 }],
            },
          },
        ],
      },
    },
  });

  console.log("Seed complete. Sample board id:", board.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
