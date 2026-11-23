import { Link } from "react-router";
import type { Route } from "./+types/saved";
import { db } from "~/db";
import { resolveCountry } from "~/lib/country.server";
import { getSavedLessons } from "~/lib/saved-lessons.server";
import { requireUserId } from "~/lib/access.server";
import { Card, CardContent } from "~/components/ui/card";
import { Bookmark, NotebookPen } from "lucide-react";
import { formatRelativeTime } from "~/lib/utils";

export function meta() {
  return [
    { title: "Saved — Cadence" },
    { name: "description", content: "Your bookmarks and notes" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);

  return getSavedLessons(db, userId, await resolveCountry(request));
}

export default function Saved({ loaderData }: Route.ComponentProps) {
  const { savedBookmarks, savedNotes } = loaderData;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Saved</h1>
        <p className="text-sm text-muted-foreground">
          The lessons you flagged, and what you wrote about them.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Bookmark className="size-4 text-muted-foreground" />
            Bookmarks
          </h2>

          {savedBookmarks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No bookmarks yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {savedBookmarks.map((bookmark) => (
                <Card key={bookmark.lessonId}>
                  <CardContent className="py-3">
                    <SavedLessonLink lesson={bookmark} />
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {bookmark.courseTitle} · {bookmark.moduleTitle}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <NotebookPen className="size-4 text-muted-foreground" />
            Notes
          </h2>

          {savedNotes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No notes yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {savedNotes.map((note) => (
                <Card key={note.lessonId}>
                  <CardContent className="space-y-1 py-3">
                    <SavedLessonLink lesson={note} />
                    <p className="text-xs text-muted-foreground">
                      {note.courseTitle}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <p
                      suppressHydrationWarning
                      className="text-xs text-muted-foreground"
                    >
                      Edited {formatRelativeTime(note.updatedAt)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SavedLessonLink({
  lesson,
}: {
  lesson: { lessonId: number; lessonTitle: string; courseSlug: string };
}) {
  return (
    <Link
      to={`/courses/${lesson.courseSlug}/lessons/${lesson.lessonId}`}
      className="text-sm font-medium hover:underline"
    >
      {lesson.lessonTitle}
    </Link>
  );
}
