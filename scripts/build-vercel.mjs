// Build pour Vercel (sortie « prebuilt »), fonction serveur placée à Paris.
//
// Mesuré le 11/09/2026 : les fonctions tournaient à Washington (iad1) alors que
// la base Supabase est à Paris (eu-west-3) — 918 ms médian par appel depuis
// Abidjan. Le preset Nitro ne sait pas fixer la région : on l'écrit dans la
// configuration de la fonction après le build. vite.config.ts n'est pas touché,
// le déploiement Lovable reste inchangé.
//
//   npm run build:vercel            → région cdg1
//   VERCEL_REGION=fra1 npm run build:vercel
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const region = process.env.VERCEL_REGION ?? "cdg1";

const build = spawnSync("npx", ["vite", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NITRO_PRESET: "vercel" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const file = ".vercel/output/functions/__server.func/.vc-config.json";
const config = JSON.parse(fs.readFileSync(file, "utf8"));
config.regions = [region];
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log("Fonction serveur : région " + region);
