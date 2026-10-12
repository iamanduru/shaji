import { z } from 'zod';

export const registerSchema = z.object({
    email: z.string().min(1, "Email is required").max(320, "Email must exceed 320 characters."),
    password: z.string().min(1, "Password is required").max(1024, "Password is too long")
})
.strict()

export type RegisterInput = z.infer<typeof registerSchema>;