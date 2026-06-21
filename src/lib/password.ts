import argon2 from "argon2";

// argon2id is the recommended variant (default in this library) and is
// resistant to both GPU and side-channel attacks.
export const hashPassword = (plain: string): Promise<string> => {
	return argon2.hash(plain);
};

/**
 * Verify a plaintext password against a stored hash.
 * Returns false on mismatch OR malformed hash — never throws — so callers can
 * treat every failure identically without leaking which check failed.
 */
export const verifyPassword = async (
	hash: string,
	plain: string,
): Promise<boolean> => {
	try {
		return await argon2.verify(hash, plain);
	} catch {
		return false;
	}
};
