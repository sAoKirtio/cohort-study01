import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  getSavedLesson,
  getSavedLessons,
  saveNote,
  toggleBookmark,
} from "./saved-lessons.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let first: { userId: number; lessonId: number };
let second: typeof first;

function enroll(userId: number) {
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, position: 1, title: "Basics" })
    .returning()
    .get();
  function lesson(position: number, title: string) {
    const row = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, position, title })
      .returning()
      .get();
    return { userId: base.user.id, lessonId: row.id };
  }
  first = lesson(1, "First lesson");
  second = lesson(2, "Second lesson");
  enroll(base.user.id);
});

afterEach(() => vi.useRealTimers());

it("toggles a flag on and off and never lists a lesson twice", () => {
  expect(getSavedLesson(db, first)).toEqual({ bookmarked: false, note: null });
  expect(toggleBookmark(db, first)).toBe(true);
  toggleBookmark(db, first, true);
  expect(getSavedLessons(db, first.userId, null).savedBookmarks).toHaveLength(
    1
  );
  expect(toggleBookmark(db, first)).toBe(false);
  expect(getSavedLessons(db, first.userId, null).savedBookmarks).toEqual([]);
});

it("accepts exactly 2,000 characters after trimming and preserves the text after a refused edit", () => {
  const body = "# Heading\n*literal text*".padEnd(2000, "a");
  expect(saveNote(db, first, "  " + body + "\n").ok).toBe(true);
  expect(saveNote(db, first, body + "!")).toMatchObject({
    ok: false,
    error: expect.stringContaining("2,000"),
  });
  expect(getSavedLesson(db, first).note?.body).toBe(body);
  expect(getSavedLesson(db, second).note).toBeNull();
});

it("counts characters outside the basic Unicode range once", () => {
  expect(saveNote(db, first, "🎵".repeat(2000)).ok).toBe(true);
  expect(saveNote(db, first, "🎵".repeat(2001)).ok).toBe(false);
});

it("advances the edit time for two saves in the same millisecond", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  saveNote(db, first, "First draft");
  saveNote(db, first, "Second draft");
  expect(getSavedLesson(db, first).note).toEqual({
    body: "Second draft",
    updatedAt: "2026-01-01T00:00:00.001Z",
  });
});

it("orders flags by creation and private notes by last edit, with links to the right course", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  toggleBookmark(db, first);
  saveNote(db, first, "First draft");
  vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
  toggleBookmark(db, second);
  saveNote(db, second, "Second note");
  vi.setSystemTime(new Date("2026-01-03T00:00:00Z"));
  saveNote(db, first, "Revised");
  const other = db
    .insert(schema.users)
    .values({
      name: "Other student",
      email: "other@test.dev",
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
  enroll(other.id);
  const otherLesson = { ...first, userId: other.id };
  toggleBookmark(db, otherLesson);
  saveNote(db, otherLesson, "Someone else's note");

  const saved = getSavedLessons(db, first.userId, null);
  const course = {
    courseTitle: base.course.title,
    courseSlug: base.course.slug,
  };
  expect(saved.savedBookmarks).toMatchObject([
    { ...course, lessonId: second.lessonId, lessonTitle: "Second lesson" },
    { ...course, lessonId: first.lessonId, lessonTitle: "First lesson" },
  ]);
  expect(saved.savedNotes).toMatchObject([
    {
      ...course,
      lessonId: first.lessonId,
      body: "Revised",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
    {
      ...course,
      lessonId: second.lessonId,
      body: "Second note",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  ]);
  expect(getSavedLessons(db, other.id, null).savedNotes).toMatchObject([
    { body: "Someone else's note" },
  ]);
});

it("hides saved lessons on refund and restores both lists when the student re-enrolls", async () => {
  const admin = db
    .insert(schema.users)
    .values({
      name: "Admin",
      email: "admin@test.dev",
      role: schema.UserRole.Admin,
    })
    .returning()
    .get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: first.userId,
      courseId: base.course.id,
      amountPaid: 7900,
    })
    .returning()
    .get();
  toggleBookmark(db, first);
  saveNote(db, first, "Keep my note");
  const before = getSavedLessons(db, first.userId, null);
  const now = new Date();
  const notifications = fakeNotifications();
  const refund = await raiseRefundRequest(
    db,
    purchase.id,
    first.userId,
    "Course wasn't for me",
    now,
    notifications
  );
  if (!refund.ok) throw new Error(refund.error);
  expect(
    (
      await approveRefundRequest(
        db,
        refund.refundRequestId,
        admin.id,
        null,
        now,
        notifications
      )
    ).ok
  ).toBe(true);
  expect(getSavedLessons(db, first.userId, null)).toEqual({
    savedBookmarks: [],
    savedNotes: [],
  });
  enroll(first.userId);
  expect(getSavedLessons(db, first.userId, null)).toEqual(before);
});

it("respects the course's country restriction when listing saved lessons", () => {
  db.update(schema.courses)
    .set({ price: 1000, pppEnabled: true })
    .where(eq(schema.courses.id, base.course.id))
    .run();
  db.insert(schema.purchases)
    .values({
      userId: first.userId,
      courseId: base.course.id,
      amountPaid: 500,
      country: "IN",
    })
    .run();
  saveNote(db, first, "My note");
  toggleBookmark(db, first);
  expect(getSavedLessons(db, first.userId, "US")).toEqual({
    savedBookmarks: [],
    savedNotes: [],
  });
  expect(getSavedLessons(db, first.userId, "IN").savedNotes).toMatchObject([
    { body: "My note" },
  ]);
});
