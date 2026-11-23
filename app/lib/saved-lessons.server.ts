import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "~/db/schema";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";
import { getAccessibleCourseIds } from "~/lib/access.server";
import { noteBodySchema } from "~/lib/notes";

type Db = BetterSQLite3Database<typeof schema>;
type StudentLesson = { userId: number; lessonId: number };

function bookmarkFilter({ userId, lessonId }: StudentLesson) {
  return and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId));
}

export function getSavedLesson(db: Db, studentLesson: StudentLesson) {
  const { userId, lessonId } = studentLesson;
  const bookmarked = !!db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(bookmarkFilter(studentLesson))
    .get();
  const note = db
    .select({ body: notes.body, updatedAt: notes.updatedAt })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
  return { bookmarked, note: note ?? null };
}

export function toggleBookmark(
  db: Db,
  studentLesson: StudentLesson,
  desired?: boolean
) {
  return db.transaction(
    (tx) => {
      const filter = bookmarkFilter(studentLesson);
      const bookmarked =
        desired ??
        !tx.select({ id: bookmarks.id }).from(bookmarks).where(filter).get();
      if (bookmarked) {
        tx.insert(bookmarks).values(studentLesson).onConflictDoNothing().run();
      } else {
        tx.delete(bookmarks).where(filter).run();
      }
      return bookmarked;
    },
    { behavior: "immediate" }
  );
}

export function saveNote(db: Db, studentLesson: StudentLesson, body: string) {
  const parsed = noteBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message } as const;
  }
  const now = new Date().toISOString();
  db.insert(notes)
    .values({
      ...studentLesson,
      body: parsed.data,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: {
        body: parsed.data,
        // Two saves can arrive in the same millisecond.
        updatedAt: sql`max(${now}, strftime('%Y-%m-%dT%H:%M:%fZ', ${notes.updatedAt}, '+0.001 seconds'))`,
      },
    })
    .run();
  return { ok: true } as const;
}

export function getSavedLessons(
  db: Db,
  userId: number,
  country: string | null
) {
  const courseIds = getAccessibleCourseIds(db, userId, country);
  const lessonFields = {
    lessonId: lessons.id,
    lessonTitle: lessons.title,
    courseTitle: courses.title,
    courseSlug: courses.slug,
  };
  const visibleCourse = inArray(courses.id, courseIds);
  const savedBookmarks = db
    .select({ ...lessonFields, moduleTitle: modules.title })
    .from(bookmarks)
    .innerJoin(lessons, eq(bookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(eq(bookmarks.userId, userId), visibleCourse))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .all();
  const savedNotes = db
    .select({ ...lessonFields, body: notes.body, updatedAt: notes.updatedAt })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(eq(notes.userId, userId), visibleCourse))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
  return { savedBookmarks, savedNotes };
}
