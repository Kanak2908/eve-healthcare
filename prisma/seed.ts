import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const koramangala = await prisma.diagnosticCentre.upsert({
    where: { id: "seed_centre_koramangala" },
    update: { name: "EVE Diagnostics Koramangala", location: "Koramangala, Bengaluru" },
    create: {
      id: "seed_centre_koramangala",
      name: "EVE Diagnostics Koramangala",
      location: "Koramangala, Bengaluru",
    },
  });

  const bandra = await prisma.diagnosticCentre.upsert({
    where: { id: "seed_centre_bandra" },
    update: { name: "EVE Diagnostics Bandra", location: "Bandra West, Mumbai" },
    create: {
      id: "seed_centre_bandra",
      name: "EVE Diagnostics Bandra",
      location: "Bandra West, Mumbai",
    },
  });

  const tests: Array<{ id: string; centreId: string; name: string; description: string; price: string }> = [
    {
      id: "seed_test_cbc",
      centreId: koramangala.id,
      name: "Complete Blood Count",
      description: "Haemoglobin, WBC, platelet count",
      price: "499.00",
    },
    {
      id: "seed_test_lipid",
      centreId: koramangala.id,
      name: "Lipid Profile",
      description: "Cholesterol and triglycerides",
      price: "899.00",
    },
    {
      id: "seed_test_thyroid",
      centreId: bandra.id,
      name: "Thyroid Panel",
      description: "TSH, T3, and T4",
      price: "750.00",
    },
    {
      id: "seed_test_hba1c",
      centreId: bandra.id,
      name: "HbA1c",
      description: "Average blood glucose over 3 months",
      price: "650.00",
    },
  ];

  for (const test of tests) {
    await prisma.diagnosticTest.upsert({
      where: { id: test.id },
      update: {
        name: test.name,
        description: test.description,
        price: new Prisma.Decimal(test.price),
      },
      create: {
        id: test.id,
        centreId: test.centreId,
        name: test.name,
        description: test.description,
        price: new Prisma.Decimal(test.price),
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
