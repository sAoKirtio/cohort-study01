import { RouterContextProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import {
  action,
  loader as lessonPage,
} from "~/routes/courses.$slug.lessons.$lessonId";
import { loader as roster } from "~/routes/instructor.$courseId.students";
import { loader as saved } from "~/routes/saved";
import { createTestDb, seedBaseData } from "./setup";

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
vi.mock("~/db", () => ({
  get db() {
    return db;
  },
}));

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, position: 1, title: "Basics" })
    .returning()
    .get();
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, position: 1, title: "Getting started" })
    .returning()
    .get().id;
});

function enroll(userId: number, courseId = base.course.id) {
  db.insert(schema.enrollments).values({ userId, courseId }).run();
}

async function routeArgs<P extends Record<string, string>>(
  userId: number | null,
  params: P,
  fields?: Record<string, string>
) {
  const url = new URL("https://cadence.test/");
  const cookie =
    userId === null ? "" : await setCurrentUserId(new Request(url), userId);
  const request = new Request(url, {
    headers: { cookie },
    method: fields ? "POST" : "GET",
    body: fields ? new URLSearchParams(fields) : undefined,
  });
  return {
    request,
    url,
    params,
    pattern: "/",
    context: new RouterContextProvider(),
  };
}

async function submit(
  fields: Record<string, string>,
  slug = base.course.slug,
  id = lessonId
) {
  return action(
    await routeArgs(base.user.id, { slug, lessonId: String(id) }, fields)
  );
}

const saveForms: Record<string, string>[] = [
  { intent: "toggle-bookmark" },
  { intent: "save-note", body: "A note" },
];

it.each(saveForms)(
  "requires enrollment in the course containing the lesson for $intent",
  async (fields) => {
    await expect(submit(fields)).rejects.toMatchObject({
      init: { status: 403 },
    });
    enroll(base.user.id);
    const { id: _id, ...otherCourse } = base.course;
    const other = db
      .insert(schema.courses)
      .values({ ...otherCourse, slug: "other" })
      .returning()
      .get();
    enroll(base.user.id, other.id);
    await expect(submit(fields, "other")).rejects.toMatchObject({
      init: { status: 404 },
    });
    await expect(submit(fields, base.course.slug, -1)).rejects.toMatchObject({
      init: { status: 404 },
    });
    expect(db.select().from(schema.notes).all()).toEqual([]);
    expect(db.select().from(schema.bookmarks).all()).toEqual([]);
  }
);

it("keeps notes private in Saved and in the instructor's student roster", async () => {
  enroll(base.user.id);
  await submit({ intent: "save-note", body: "  My private note  " });
  const own = await saved(await routeArgs(base.user.id, {}));
  expect(own.savedNotes).toMatchObject([{ lessonId, body: "My private note" }]);
  const page = await lessonPage(
    await routeArgs(base.user.id, {
      slug: base.course.slug,
      lessonId: String(lessonId),
    })
  );
  expect(page.note).toMatchObject({
    body: "My private note",
    updatedAt: expect.any(String),
  });
  const instructorPage = await lessonPage(
    await routeArgs(base.instructor.id, {
      slug: base.course.slug,
      lessonId: String(lessonId),
    })
  );
  expect(instructorPage.note).toBeNull();
  const instructorSaved = await saved(await routeArgs(base.instructor.id, {}));
  expect(instructorSaved.savedNotes).toEqual([]);
  const { students } = await roster(
    await routeArgs(base.instructor.id, { courseId: String(base.course.id) })
  );
  expect(students).toHaveLength(1);
  expect(students[0]).not.toHaveProperty("notes");
  const admin = db
    .insert(schema.users)
    .values({
      name: "Admin",
      email: "admin@test.dev",
      role: schema.UserRole.Admin,
    })
    .returning()
    .get();
  const adminRoster = await roster(
    await routeArgs(admin.id, { courseId: String(base.course.id) })
  );
  expect(adminRoster.students[0]).not.toHaveProperty("notes");
  expect((await saved(await routeArgs(admin.id, {}))).savedNotes).toEqual([]);
});

it("updates a note, rejects an oversized edit and keeps the last edit when the text is cleared", async () => {
  enroll(base.user.id);
  await submit({ intent: "save-note", body: "Original" });
  await submit({ intent: "save-note", body: "Edited" });
  await expect(
    submit({ intent: "save-note", body: "a".repeat(2001) })
  ).rejects.toMatchObject({ init: { status: 400 } });
  expect(db.select().from(schema.notes).all()).toMatchObject([
    { body: "Edited" },
  ]);
  await submit({ intent: "save-note", body: "  " });
  expect(
    (await saved(await routeArgs(base.user.id, {}))).savedNotes
  ).toMatchObject([{ lessonId, body: "" }]);
});

it("keeps a bookmark on retry and removes it when requested", async () => {
  enroll(base.user.id);
  const bookmark = { intent: "toggle-bookmark", bookmarked: "true" };
  await submit(bookmark);
  await submit(bookmark);
  expect(
    (await saved(await routeArgs(base.user.id, {}))).savedBookmarks
  ).toMatchObject([{ lessonId }]);
  expect(
    (await saved(await routeArgs(base.instructor.id, {}))).savedBookmarks
  ).toEqual([]);
  await submit({ ...bookmark, bookmarked: "false" });
  expect(db.select().from(schema.bookmarks).all()).toEqual([]);
});

it("removes dependent bookmarks and notes when a lesson is deleted", async () => {
  enroll(base.user.id);
  await submit({ intent: "toggle-bookmark" });
  await submit({ intent: "save-note", body: "My notes" });
  db.delete(schema.lessons).where(eq(schema.lessons.id, lessonId)).run();
  expect(db.select().from(schema.notes).all()).toEqual([]);
  expect(db.select().from(schema.bookmarks).all()).toEqual([]);
});

it("only returns lesson content and saved work while the student has access", async () => {
  const params = { slug: base.course.slug, lessonId: String(lessonId) };
  db.update(schema.lessons)
    .set({
      content: "Private course text",
      videoUrl: "https://video.test/paid",
    })
    .where(eq(schema.lessons.id, lessonId))
    .run();
  enroll(base.user.id);
  await submit({ intent: "toggle-bookmark" });
  await submit({ intent: "save-note", body: "Private student text" });
  const own = await lessonPage(await routeArgs(base.user.id, params));
  expect(own).toMatchObject({
    bookmarked: true,
    note: { body: "Private student text" },
    lesson: { content: "Private course text" },
  });
  db.delete(schema.enrollments)
    .where(eq(schema.enrollments.userId, base.user.id))
    .run();
  for (const viewer of [base.user.id, null]) {
    const preview = await lessonPage(await routeArgs(viewer, params));
    expect(preview).toMatchObject({
      canViewContent: false,
      bookmarked: false,
      note: null,
      contentHtml: null,
      lesson: { content: null, videoUrl: null },
    });
  }
});
