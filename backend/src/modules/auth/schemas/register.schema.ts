import { z } from "zod";

import { normalizeEmail } from "../utils/normalize-email.js";

const normalizedEmailSchema = z
  .string()
  .min(1, "Email is required.")
  .max(320, "Email must not exceed 320 characters.")
  .transform(normalizeEmail)
  .pipe(
    z
      .string()
      .min(1, "Email is required.")
      .max(320, "Email must not exceed 320 characters.")
      .email("Email must be a valid email address.")
  );

export const registerSchema = z
  .object({
    email: normalizedEmailSchema,

    password: z
      .string()
      .min(1, "Password is required.")
      .max(1024, "Password is too long.")
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;