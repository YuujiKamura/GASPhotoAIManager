
import { getWorkHierarchy } from '../utils/workHierarchy';

async function main() {
  console.log("Loading 'unit-price' hierarchy...");
  const hierarchy = await getWorkHierarchy('unit-price');

  console.log("\n--- Current Hierarchy Structure (unit-price) ---");
  console.log(JSON.stringify(hierarchy, null, 2));

  console.log("\n--- Check for '未舗装部舗装工' ---");
  let found = false;
  for (const workType in hierarchy) {
    if (workType.includes('未舗装部舗装工')) {
        console.log(`Found as Work Type: ${workType}`);
        found = true;
    }
    for (const variety in hierarchy[workType]) {
        if (variety.includes('未舗装部舗装工')) {
            console.log(`Found as Variety under ${workType}: ${variety}`);
            found = true;
        }
    }
  }

  if (!found) {
      console.log("❌ '未舗装部舗装工' was NOT found in the current hierarchy.");
  }
}

main().catch(console.error);




