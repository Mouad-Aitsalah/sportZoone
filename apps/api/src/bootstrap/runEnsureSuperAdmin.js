require("dotenv").config();

const { ensureSuperAdmin } = require("./ensureSuperAdmin");

async function main() {
  const result = await ensureSuperAdmin();

  console.log(
    JSON.stringify(
      {
        action: result.action,
        organisation: {
          id: result.organisation.id,
          name: result.organisation.name,
        },
        superAdmin: {
          id: result.superAdmin.id,
          email: result.superAdmin.email,
          role: result.superAdmin.role,
          organisationId: result.superAdmin.organisationId,
          estActif: result.superAdmin.estActif,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Failed to ensure Super Admin:", error);
    process.exit(1);
  });
