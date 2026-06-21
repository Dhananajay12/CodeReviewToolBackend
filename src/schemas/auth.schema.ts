import { z } from "zod";

export const registerSchema = z.object({
	email: z.email(),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
	email: z.email(),
	password: z.string().min(1),
});

export const updateProfileSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(100),
});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
