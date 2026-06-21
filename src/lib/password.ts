import argon2 from "argon2";

export const hashPassword = (plain: string): Promise<string> => {
	return argon2.hash(plain);
};

// Returns false on mismatch OR malformed hash — never throws.
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
