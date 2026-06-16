import express from "express";
import { getCodeReview } from "../controllers/ai.controller";

const router = express.Router();

router.post("/get-review", getCodeReview);


export default router;
