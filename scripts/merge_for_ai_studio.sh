#!/bin/bash
# コードベースを単一のテキストファイルにマージ（AI Studio用）

REPO_ROOT="$(git rev-parse --show-toplevel)"
OUTPUT="$REPO_ROOT/merged_codebase.txt"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 出力ファイルを初期化
{
  echo "================================================================================"
  echo "GASPhotoAIManager - Merged Codebase Snapshot"
  echo "================================================================================"
  echo "このファイルはpre-commitフックで自動生成されます。"
  echo "コードベース全体のスナップショットとして、AI Studio等で使用できます。"
  echo ""
  echo "生成日時: $TIMESTAMP"
  echo "================================================================================"
  echo ""
} > "$OUTPUT"

cd "$REPO_ROOT"

# ファイル一覧を追加
echo "=== ファイル一覧 ===" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# マージ対象ファイルを収集（node_modules, dist, .git, logsを除外）
FILES=$(find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -path "*/node_modules/*" \
  ! -path "*/dist/*" \
  ! -path "*/.git/*" \
  ! -path "*/logs/*" \
  | sort)

# ファイル一覧を出力
for file in $FILES; do
  echo "${file#./}" >> "$OUTPUT"
done

echo "" >> "$OUTPUT"
echo "================================================================================" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# 各ファイルの内容をマージ
for file in $FILES; do
  filepath="${file#./}"
  echo "=== FILE: $filepath ===" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  cat "$file" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  echo "=== END: $filepath ===" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
done

# 重要な設定ファイルも追加
for config in package.json tsconfig.json vite.config.ts CLAUDE.md; do
  if [ -f "$REPO_ROOT/$config" ]; then
    echo "=== FILE: $config ===" >> "$OUTPUT"
    echo "" >> "$OUTPUT"
    cat "$REPO_ROOT/$config" >> "$OUTPUT"
    echo "" >> "$OUTPUT"
    echo "=== END: $config ===" >> "$OUTPUT"
    echo "" >> "$OUTPUT"
  fi
done

# 結果表示
LINES=$(wc -l < "$OUTPUT")
SIZE=$(wc -c < "$OUTPUT")
echo "Merged codebase: $LINES lines, $SIZE bytes"
