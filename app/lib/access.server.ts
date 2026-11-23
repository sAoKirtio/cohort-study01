import { data } from "react-router";
import { eq, and, exists, inArray, or, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "~/db/schema";
import { db } from "~/db";
import { UserRole, users, courses, enrollments, purchases } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { resolveCountry } from "~/lib/country.server";
import { checkPppAccess } from "~/lib/ppp";

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

type Db = BetterSQLite3Database<typeof schema>;

function courseAccessQuery(database: Db, userId: number) {
  const enrollment = database
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courses.id))
    );
  const purchase = database
    .select({ country: purchases.country })
    .from(purchases)
    .where(
      and(eq(purchases.userId, userId), eq(purchases.courseId, courses.id))
    )
    .limit(1);
  return database
    .select({
      id: courses.id,
      instructorId: courses.instructorId,
      price: courses.price,
      pppEnabled: courses.pppEnabled,
      enrolled: exists(enrollment).mapWith(Boolean),
      purchaseCountry: sql<string | null>`${purchase}`,
    })
    .from(courses);
}

// ─── Access Resolution ───
// One place that answers "who is this, and what may they do with this course?".
//
// getAccess never throws — the lesson page needs to render a paywall preview for
// signed-out and unenrolled visitors rather than erroring. The require* wrappers
// are built on it for the routes that should just reject.
//
// Uses positional parameters (project convention).

export type Access = {
  userId: number | null;
  user: ReturnType<typeof getUserById>;
  isAdmin: boolean;
  /** The instructor who owns this specific course. */
  isOwningInstructor: boolean;
  /** Owning instructor or admin — the people who speak for the course. */
  isStaff: boolean;
  enrolled: boolean;
  pppBlocked: boolean;
  pppBlockedCountry: string | null;
  pppPurchaseCountry: string | null;
  /**
   * May they read the course's content (lesson bodies, comments)?
   * Staff always can. Students need an enrollment that isn't PPP-blocked.
   */
  canViewContent: boolean;
};

const SIGNED_OUT: Access = {
  userId: null,
  user: undefined,
  isAdmin: false,
  isOwningInstructor: false,
  isStaff: false,
  enrolled: false,
  pppBlocked: false,
  pppBlockedCountry: null,
  pppPurchaseCountry: null,
  canViewContent: false,
};

export async function getAccess(
  request: Request,
  courseId: number
): Promise<Access> {
  const userId = await getCurrentUserId(request);
  if (!userId) return SIGNED_OUT;

  const user = getUserById(userId);
  if (!user) return SIGNED_OUT;

  const course = courseAccessQuery(db, userId)
    .where(eq(courses.id, courseId))
    .get();
  return resolveCourseAccess(user, course, await resolveCountry(request));
}

type CourseAccessRow = ReturnType<ReturnType<typeof courseAccessQuery>["get"]>;

function resolveCourseAccess(
  user: typeof users.$inferSelect,
  course: CourseAccessRow,
  currentCountry: string | null
): Access {
  const userId = user.id;
  const isAdmin = user.role === UserRole.Admin;
  const isOwningInstructor = course?.instructorId === userId;
  const isStaff = isAdmin || isOwningInstructor;
  const enrolled = course?.enrolled ?? false;
  const ppp = checkPppAccess(
    course?.price ?? 0,
    !!course?.pppEnabled && enrolled && !isStaff,
    course?.purchaseCountry ?? null,
    currentCountry
  );

  return {
    userId,
    user,
    isAdmin,
    isOwningInstructor,
    isStaff,
    enrolled,
    pppBlocked: ppp.blocked,
    pppBlockedCountry: ppp.blockedCountry,
    pppPurchaseCountry: ppp.purchaseCountry,
    canViewContent: isStaff || (enrolled && !ppp.blocked),
  };
}

export function getAccessibleCourseIds(
  database: Db,
  userId: number,
  country: string | null
) {
  const user = database.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return [];
  const enrolledCourses = database
    .select({ id: enrollments.courseId })
    .from(enrollments)
    .where(eq(enrollments.userId, userId));
  const candidates = courseAccessQuery(database, userId)
    .where(
      user.role === UserRole.Admin
        ? undefined
        : or(
            eq(courses.instructorId, userId),
            inArray(courses.id, enrolledCourses)
          )
    )
    .all();
  return candidates
    .filter(
      (course) => resolveCourseAccess(user, course, country).canViewContent
    )
    .map((course) => course.id);
}

/**
 * Throws 401 unless someone is signed in. Returns their user id.
 */
export async function requireUserId(request: Request): Promise<number> {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }
  return userId;
}

/**
 * Throws 401 when signed out, 403 when the user can't see the course's content.
 * Use in actions — loader guards don't protect actions.
 */
export async function requireContentAccess(
  request: Request,
  courseId: number
): Promise<Access> {
  const access = await getAccess(request, courseId);

  if (!access.userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  if (!access.canViewContent) {
    throw data("You must be enrolled in this course.", { status: 403 });
  }

  return access;
}

/**
 * Throws unless the user is the course's own instructor, or an admin.
 */
export async function requireStaff(
  request: Request,
  courseId: number
): Promise<Access> {
  const access = await getAccess(request, courseId);

  if (!access.userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  if (!access.isStaff) {
    throw data("Only this course's instructor can do that.", { status: 403 });
  }

  return access;
}

/**
 * Throws unless the user is an instructor or an admin, without tying them to a
 * particular course — for pages that span all of someone's courses.
 */
export async function requireInstructorOrAdmin(request: Request) {
  const userId = await requireUserId(request);
  const user = getUserById(userId);

  if (
    !user ||
    (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)
  ) {
    throw data("Only instructors can access this page.", { status: 403 });
  }

  return { userId, user, isAdmin: user.role === UserRole.Admin };
}
