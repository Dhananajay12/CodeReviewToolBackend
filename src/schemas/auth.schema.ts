import { z } from "zod";

// Registration: enforce a valid email and a minimum password strength.
export const registerSchema = z.object({
	email: z.email(),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

// Login: validate shape only. We never reveal strength rules here, and an
// empty password is simply rejected as invalid input.
export const loginSchema = z.object({
	email: z.email(),
	password: z.string().min(1),
});

// Profile update: only the display name is editable for now.
export const updateProfileSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(100),
});

// Change password: must supply the current one and a new one (min 8).
export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
