const { generateContentFun } = require("../services/ai.service")


module.exports.getCodeReview = async (req, res) => {
	const code = req.body.code;

	if (!code) {
		return res.status(400).send("Prompt is required");
	}
	const response = await generateContentFun(code);

	res.send(response);
}