import { DiagnosticCentre, DiagnosticTest, Prisma } from "@prisma/client";
import { AppError } from "../lib/errors";
import { parseMoney, toMoney } from "../lib/money";
import { prisma } from "../lib/prisma";

function serializeTest(test: DiagnosticTest) {
  return {
    id: test.id,
    name: test.name,
    description: test.description,
    price: toMoney(test.price),
    centreId: test.centreId,
    createdAt: test.createdAt.toISOString(),
  };
}

function serializeCentre(centre: DiagnosticCentre, testCount?: number) {
  return {
    id: centre.id,
    name: centre.name,
    location: centre.location,
    ...(testCount === undefined ? {} : { testCount }),
    createdAt: centre.createdAt.toISOString(),
  };
}

export async function listCentres(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [centres, total] = await prisma.$transaction([
    prisma.diagnosticCentre.findMany({
      orderBy: { name: "asc" },
      skip,
      take: limit,
      include: { _count: { select: { tests: true } } },
    }),
    prisma.diagnosticCentre.count(),
  ]);

  return {
    data: centres.map((centre) => serializeCentre(centre, centre._count.tests)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getCentre(centreId: string) {
  const centre = await prisma.diagnosticCentre.findUnique({
    where: { id: centreId },
    include: { tests: { orderBy: { name: "asc" } } },
  });
  if (!centre) {
    throw new AppError(404, "CENTRE_NOT_FOUND", "Diagnostic centre not found");
  }
  return {
    ...serializeCentre(centre, centre.tests.length),
    tests: centre.tests.map(serializeTest),
  };
}

export async function createCentre(input: { name: string; location: string }) {
  const centre = await prisma.diagnosticCentre.create({ data: input });
  return serializeCentre(centre, 0);
}

export async function listTests(centreId: string, page: number, limit: number) {
  const centre = await prisma.diagnosticCentre.findUnique({ where: { id: centreId }, select: { id: true } });
  if (!centre) {
    throw new AppError(404, "CENTRE_NOT_FOUND", "Diagnostic centre not found");
  }
  const skip = (page - 1) * limit;
  const where = { centreId };
  const [tests, total] = await prisma.$transaction([
    prisma.diagnosticTest.findMany({ where, orderBy: { name: "asc" }, skip, take: limit }),
    prisma.diagnosticTest.count({ where }),
  ]);
  return {
    data: tests.map(serializeTest),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function createTest(
  centreId: string,
  input: { name: string; description?: string; price: string },
) {
  const centre = await prisma.diagnosticCentre.findUnique({ where: { id: centreId }, select: { id: true } });
  if (!centre) {
    throw new AppError(404, "CENTRE_NOT_FOUND", "Diagnostic centre not found");
  }
  try {
    const test = await prisma.diagnosticTest.create({
      data: {
        centreId,
        name: input.name,
        description: input.description,
        price: parseMoney(input.price),
      },
    });
    return serializeTest(test);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "TEST_EXISTS", "This centre already offers a test with that name");
    }
    throw error;
  }
}
