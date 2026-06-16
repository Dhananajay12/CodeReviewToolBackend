import { Request, Response } from "express";
import prisma from "../config/db";
import { customResponse } from "../helpers/Response";

export const getUsers = async (req: Request, res: Response) => {
  const user = await prisma.user.findMany();

  if (user.length === 0) {
    return customResponse("No user Found", false, 400, user);
  }
  return customResponse("Users found", true, 200, user);
};
