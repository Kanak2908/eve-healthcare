import { Router } from "express";
import { z } from "zod";
import * as centresController from "../controllers/centres.controller";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const createCentreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(200),
});

const createTestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(500).optional(),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Price must be a positive decimal with up to 2 places")
    .refine((value) => Number(value) > 0, "Price must be greater than 0"),
});

const centreParams = z.object({
  centreId: z.string().min(1),
});

export const centresRouter = Router();

centresRouter.get("/", validate({ query: paginationSchema }), asyncHandler(centresController.listCentres));
centresRouter.post("/", requireAuth, validate({ body: createCentreSchema }), asyncHandler(centresController.createCentre));
centresRouter.get("/:centreId", validate({ params: centreParams }), asyncHandler(centresController.getCentre));
centresRouter.get(
  "/:centreId/tests",
  validate({ params: centreParams, query: paginationSchema }),
  asyncHandler(centresController.listTests),
);
centresRouter.post(
  "/:centreId/tests",
  requireAuth,
  validate({ params: centreParams, body: createTestSchema }),
  asyncHandler(centresController.createTest),
);
