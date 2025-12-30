import{a0 as T,ap as E,a9 as k,aq as w}from"./index-6H_tQmO5.js";import{ag as $,az as v,ay as D,aA as K,aC as z,aH as C,aI as P,aB as G,ar as J,av as _,ai as F,aF as R,aG as j,at as b,J as q,aD as H,aw as U,au as V,K as W,aE as Y,as as Q,M as X,a6 as Z,aj as aa,ah as ea,ax as sa}from"./index-6H_tQmO5.js";import{G as x}from"./gemini-BrvM629u.js";import"./vendor-DnQy9Gg6.js";import"./fontkit-B1URexEO.js";import"./ui-ChM_gsIn.js";const B=async(e,o,y,i,n)=>{var m;const p=new x({apiKey:y}),d=T(),g=E(e.base64),c={inlineData:{mimeType:e.mimeType,data:g}},t=[];if(o.length===0)t.push({role:"user",parts:[c,{text:`この工事写真を解析してください。
ファイル名: ${e.fileName}
${e.analysis?`現在の解析結果:
工種: ${e.analysis.workType}
種別: ${e.analysis.variety||""}
細別: ${e.analysis.detail||""}
測点: ${e.analysis.station}
備考: ${e.analysis.remarks}`:""}

【指示】
1. 黒板に書いてある文字を全て読み取ること（省略禁止）
2. 工種・種別・細別を階層マスタから正確に選択
3. 測点、備考、寸法も完全に転記
4. 解析結果をJSON形式で出力`}]});else{t.push({role:"user",parts:[c,{text:`ファイル名: ${e.fileName}
写真を解析してください。`}]});for(const s of o){const l=s.role==="ai"?"model":"user";t.push({role:l,parts:[{text:s.content}]})}}try{const s=k("construction")+`

## 対話モード追加ルール
- 敬語は使わず、フランクに話す（「～だね」「～しよう」）
- 写真を解析したら所見を述べ、結果確認を促す
- **全ての項目を省略せず完全に記入すること**
- 要約・省略は禁止。黒板に書いてある文字は全て転記する
- 工種・種別・細別は階層マスタから正確に選択する
- **解析の透明性ルール（対話型の核心）**:
  - 「黒板から読み取った内容」と「写真から解釈した内容」を分けて述べる
  - 両者に食い違いがある場合は明示し、どちらを採用したか理由を述べる
  - AIの視覚解釈が間違っている可能性があることを認識し、ユーザーの修正を受け入れる
  - 具体例: 乳剤散布時にベニヤ板を立てている写真
    - 黒板:「乳剤散布状況」→ 散布カテゴリを選ぶべき
    - 写真: 板を使っている → AIは「端部塗布」と誤解しがち
    - 実際: 板は飛散防止用の養生板であり、散布範囲を制御しているだけ
    - このような解釈の違いがあり得ることを認識し、ユーザーに確認を促す

## 出力形式（JSON必須）
{
  "response": "ユーザーへの返答（所見を含む）",
  "analysis": {
    "fileName": "ファイル名",
    "workType": "工種（階層マスタから選択）",
    "variety": "種別（階層マスタから選択）",
    "detail": "細別（階層マスタから選択）",
    "station": "測点（黒板から読み取り。例: NO.5+10.00）",
    "remarks": "摘要/備考カテゴリ（黒板から完全転記）",
    "measurements": "寸法・規格（黒板から完全転記）",
    "description": "写真の説明（何が写っているか詳細に）",
    "hasBoard": true/false,
    "detectedText": "黒板から読み取った全テキスト（省略禁止）",
    "reasoning": "この判定を行った理由"
  }
}`,l=await p.models.generateContentStream({model:d,contents:t,config:{systemInstruction:s,responseMimeType:"application/json",temperature:.3}});let r="";for await(const A of l){if(n!=null&&n())throw new Error("処理が中断されました");const f=A.text;r+=f,i==null||i(r)}let a;try{a=JSON.parse(r)}catch{return{response:r,analysis:null}}const u=a.analysis?{fileName:a.analysis.fileName||e.fileName,workType:a.analysis.workType||"",variety:a.analysis.variety||"",detail:a.analysis.detail||"",station:a.analysis.station||"",remarks:a.analysis.remarks||"",remarksCategory:a.analysis.remarks||"",description:a.analysis.description||"",measurements:a.analysis.measurements||"",hasBoard:!!a.analysis.hasBoard,detectedText:a.analysis.detectedText||"",reasoning:a.analysis.reasoning||"",changeLog:[]}:null;return{response:a.response||"",analysis:u}}catch(s){throw(m=s.message)!=null&&m.includes("中断")?s:new Error(`対話型解析エラー: ${w(s.message||"",y)}`)}};export{$ as AVAILABLE_MODELS,v as FALLBACK_MODEL,D as PRIMARY_MODEL,K as SELECTOR_MODEL,z as analyzePhotoBatch,B as analyzePhotoInteractive,C as applyNormalizationCorrections,P as assignSceneIds,G as checkAbort,J as getApiKey,_ as getAutoApiSettings,F as getBestAvailableModel,R as getFilteredHierarchy,j as getNormalizationProposals,T as getSelectedModel,k as getSystemInstruction,b as hasApiKey,q as hasEncryptedApiKey,H as identifyTargetPhotos,U as isAutoApiEnabled,V as isTrustedSession,W as loadApiKeyEncrypted,w as sanitizeErrorMessage,Y as selectWorkTypes,Q as setApiKey,X as setApiKeyEncrypted,Z as setSelectedModel,aa as setTrustedSession,ea as validateAllModels,sa as validateApiKey};
