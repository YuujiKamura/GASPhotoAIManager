#!/bin/bash
# Merge all source files into a single file for AI Studio import
# Original files remain untouched

OUTPUT="merged_codebase.txt"
echo "# GASPhotoAIManager - Merged Codebase for AI Analysis" > $OUTPUT
echo "# Generated: $(date)" >> $OUTPUT
echo "# This file is for AI Studio import. Original files are preserved." >> $OUTPUT
echo "" >> $OUTPUT

# Define file order (config files first, then dependencies)
FILES=(
  "package.json"
  "index.html"
  "types.ts"
  "utils/constructionMaster.ts"
  "utils/translations.ts"
  "utils/imageUtils.ts"
  "utils/storage.ts"
  "utils/fileSystemCache.ts"
  "utils/layoutConfig.ts"
  "utils/excelGenerator.ts"
  "utils/xmlGenerator.ts"
  "utils/zipGenerator.ts"
  "services/geminiService.ts"
  "services/spatialPairingService.ts"
  "services/optimizedSpatialPairingService.ts"
  "services/smartFlowService.ts"
  "components/ConsolePanel.tsx"
  "components/LimitModal.tsx"
  "components/PhotoAlbumView.tsx"
  "components/SimplePairingMode.tsx"
  "components/UploadView.tsx"
  "components/RefineModal.tsx"
  "components/PreviewView.tsx"
  "App.tsx"
  "index.tsx"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "//===============================================================================" >> $OUTPUT
    echo "// FILE: $file" >> $OUTPUT
    echo "//===============================================================================" >> $OUTPUT
    cat "$file" >> $OUTPUT
    echo "" >> $OUTPUT
    echo "" >> $OUTPUT
  fi
done

echo "Merged $(echo ${#FILES[@]}) files into $OUTPUT"
wc -l $OUTPUT
