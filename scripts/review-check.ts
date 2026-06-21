import "dotenv/config";
import {
	buildDiff,
	isSecretFile,
	isSkippableFile,
} from "../src/services/review.service";
import { parseModelReview } from "../src/schemas/review.schema";
import { reviewDiffWithGemini } from "../src/lib/gemini";

async function main() {
	console.log("=== 1. File filtering ===");
	console.log("  .env is secret      :", isSecretFile(".env.local"));
	console.log("  app.pem is secret   :", isSecretFile("keys/app.pem"));
	console.log("  lockfile skipped    :", isSkippableFile("package-lock.json"));
	console.log("  dist/ skipped       :", isSkippableFile("dist/index.js"));
	console.log("  src/api.ts kept     :", !isSkippableFile("src/api.ts") && !isSecretFile("src/api.ts"));

	const built = buildDiff([
		{ filename: ".env", patch: "SECRET=abc", status: "modified", additions: 1, deletions: 0 },
		{ filename: "package-lock.json", patch: "huge", status: "modified", additions: 9, deletions: 0 },
		{ filename: "logo.png", status: "added", additions: 0, deletions: 0 }, // no patch (binary)
		{ filename: "src/api.ts", patch: "+const q = 'SELECT '+id", status: "modified", additions: 1, deletions: 0 },
	]);
	console.log("  buildDiff included  :", built.includedCount, "(expect 1: only src/api.ts)");
	console.log("  buildDiff secretSkip:", built.skippedSecret, "(expect 1)");
	console.log("  .env NOT in diff    :", !built.diff.includes("SECRET"));

	console.log("\n=== 2. Malformed / untrusted model output ===");
	console.log("  valid JSON ok       :", parseModelReview('{"summary":"ok","issues":[]}').ok, "(true)");
	console.log("  fenced JSON ok      :", parseModelReview('```json\n{"summary":"ok","issues":[]}\n```').ok, "(true)");
	console.log("  garbage ok          :", parseModelReview("totally not json").ok, "(false)");
	console.log("  bad schema ok       :", parseModelReview('{"summary":1,"issues":"nope"}').ok, "(false)");
	console.log("  bad enum ok         :", parseModelReview('{"summary":"x","issues":[{"file":"a","line":1,"severity":"BOGUS","category":"security","message":"m","suggestedFix":null}]}').ok, "(false)");

	console.log("\n=== 3. Real Gemini structured-output call ===");
	const prompt = `Pull request title: Add data fetch + user lookup
Review the following unified diffs:

=== FILE: src/api.js (modified, +7 -0) ===
@@ -1,2 +1,9 @@
+function fetchData() {
+  let data = fetch('/api/data').then(r => r.json());
+  return data;
+}
+app.get('/user/:id', (req, res) => {
+  const query = "SELECT * FROM users WHERE id = " + req.params.id;
+  db.query(query, (e, rows) => res.send(rows));
+});
`;
	const raw = await reviewDiffWithGemini(prompt);
	const parsed = parseModelReview(raw);
	if (!parsed.ok) {
		console.log("  PARSE FAILED:", parsed.error);
		console.log("  raw head:", raw.slice(0, 200));
		return;
	}
	console.log("  summary:", parsed.data.summary.slice(0, 160));
	console.log("  issues found:", parsed.data.issues.length);
	for (const i of parsed.data.issues) {
		console.log(`   - [${i.severity}/${i.category}] ${i.file}:${i.line} — ${i.message.slice(0, 90)}`);
	}
}

main().catch((e) => {
	console.error("ERROR:", e instanceof Error ? e.message : e);
	process.exit(1);
});
