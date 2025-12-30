import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'src', 'generated', 'codebase-stats.json');

const DEFAULT_STATS = {
  generatedAt: new Date().toISOString(),
  totalFiles: 0,
  totalLines: 0,
  largeFiles: [],
  components: { count: 0, files: [] },
  services: { count: 0, files: [] },
  hooks: { count: 0, files: [] },
  utils: { count: 0, files: [] },
  health: [],
  tasks: [],
  moduleDependencies: [],
  componentAnalysis: [],
  suggestions: [],
  architectureIssues: [],
  featureFlow: null,
  backendGroups: [],
  similarModules: []
};

function ensureGeneratedFile() {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  try {
    if (fs.existsSync(OUTPUT)) {
      const current = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
      const merged = { ...DEFAULT_STATS, ...current, generatedAt: new Date().toISOString() };
      fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2));
      console.log(`Updated existing stats at ${OUTPUT}`);
      return;
    }
  } catch {
    // fall through to write default
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(DEFAULT_STATS, null, 2));
  console.log(`Created default stats at ${OUTPUT}`);
}

ensureGeneratedFile();
