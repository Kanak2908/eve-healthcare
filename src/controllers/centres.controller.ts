import { Request, Response } from "express";
import * as centresService from "../services/centres.service";

type PaginationQuery = {
  page: number;
  limit: number;
};

export async function listCentres(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as PaginationQuery;
  const result = await centresService.listCentres(query.page, query.limit);
  res.json(result);
}

export async function createCentre(req: Request, res: Response): Promise<void> {
  const centre = await centresService.createCentre(req.body);
  res.status(201).json(centre);
}

export async function getCentre(req: Request, res: Response): Promise<void> {
  const centre = await centresService.getCentre(req.params.centreId);
  res.json(centre);
}

export async function listTests(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as PaginationQuery;
  const result = await centresService.listTests(req.params.centreId, query.page, query.limit);
  res.json(result);
}

export async function createTest(req: Request, res: Response): Promise<void> {
  const test = await centresService.createTest(req.params.centreId, req.body);
  res.status(201).json(test);
}
