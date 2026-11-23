import { z } from "zod";

const maxNoteLength = 2000;
const noteLengthMessage = "A note must be 2,000 characters or fewer.";
export const noteBodySchema = z
  .string()
  .trim()
  .refine(
    (body) => Array.from(body).length <= maxNoteLength,
    noteLengthMessage
  );
