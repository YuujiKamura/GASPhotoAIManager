/**
 * レイアウト設定モジュール
 *
 * このファイルは後方互換性のためのラッパーです。
 * 実際の定義は layoutConfig.generated.ts にあり、
 * shared/layout-config/layout-config.json から自動生成されます。
 *
 * 定数を変更する場合は layout-config.json を編集し、
 * `npm run generate:all` を実行してください。
 */

// すべてのエクスポートを生成ファイルから再エクスポート
export * from './layoutConfig.generated';

// 生成ファイルからのデフォルトエクスポートがあれば再エクスポート
// (現在は名前付きエクスポートのみ)
