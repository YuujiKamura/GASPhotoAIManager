/**
 * Google Apps Script to modify the "Table of Contents" and "Number" sheets.
 * 
 * Instructions:
 * 1. Open your Google Spreadsheet.
 * 2. Go to "Extensions" > "Apps Script".
 * 3. Paste this code into the editor.
 * 4. Run the `main` function.
 * 5. Grant necessary permissions.
 */

// CONFIGURATION
const CONFIG = {
      sheetNames: {
            toc: "目次", // Table of Contents sheet name
            // Number sheets are assumed to be named "1", "2", etc. or we can iterate all others.
      },
      columns: {
            id: 1, // Column A (1-based index) for ID
            image: 2, // Column B (1-based index) for Image
            url: 3, // Column C (1-based index) where we will put the extracted URL
      },
      startRow: 2 // Assuming header is in row 1
};

function main() {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const tocSheet = ss.getSheetByName(CONFIG.sheetNames.toc);

      if (!tocSheet) {
            Logger.log(`Sheet "${CONFIG.sheetNames.toc}" not found.`);
            return;
      }

      processTOC(tocSheet);
      processNumberSheets(ss, tocSheet);
}

function processTOC(sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow < CONFIG.startRow) return;

      const numRows = lastRow - CONFIG.startRow + 1;

      // Get data range for ID and Image columns
      const idRange = sheet.getRange(CONFIG.startRow, CONFIG.columns.id, numRows, 1);
      const imageRange = sheet.getRange(CONFIG.startRow, CONFIG.columns.image, numRows, 1);
      const urlRange = sheet.getRange(CONFIG.startRow, CONFIG.columns.url, numRows, 1);

      const idValues = idRange.getValues();
      const imageFormulas = imageRange.getFormulas();

      const newIdValues = [];
      const newUrlValues = [];
      const newImageFormulas = [];

      for (let i = 0; i < numRows; i++) {
            const id = idValues[i][0];
            const formula = imageFormulas[i][0];

            // Extract URL from =IMAGE("url")
            // Regex looks for: =IMAGE("url") or =IMAGE("url", ...)
            const match = formula.match(/=IMAGE\s*\(\s*"([^"]+)"/i);

            if (match && match[1]) {
                  const url = match[1];

                  // 1. Store URL in the new URL column
                  newUrlValues.push([url]);

                  // 2. Create Hyperlink for ID: =HYPERLINK("url", "id")
                  // We use setFormula for ID to make it a link
                  newIdValues.push([`=HYPERLINK("${url}", "${id}")`]);

                  // 3. Update Image formula to reference the URL column (e.g., C2)
                  // Row index is i + CONFIG.startRow
                  const urlCellRef = sheet.getRange(i + CONFIG.startRow, CONFIG.columns.url).getA1Notation();
                  newImageFormulas.push([`=IMAGE(${urlCellRef})`]);

            } else {
                  // Keep original if no match found
                  newUrlValues.push([""]); // Or keep existing?
                  newIdValues.push([id]); // Keep as value, not formula if it wasn't a link
                  newImageFormulas.push([formula]);
            }
      }

      // Update the sheet
      // Note: For IDs, some might be formulas (hyperlinks) and some values. 
      // It's safer to set formulas for all, but if ID was just text, setFormula with text fails? 
      // Actually, we can use setValues for URLs, and setFormulas for IDs and Images.

      urlRange.setValues(newUrlValues);

      // For IDs, we need to handle mixed content (formulas vs values). 
      // But setFormulas can take values if they don't start with =? No, setFormulas expects strings starting with =.
      // Let's iterate and set individually or group? 
      // Optimization: Create a 2D array of formulas/values.

      // Actually, for the ID column, if we want it to be a link, it MUST be a formula =HYPERLINK...
      // If we didn't find a URL, we just put the ID value back.
      // But setFormulas might error on plain strings.
      // Let's use setValues for the plain strings and setFormula for the links?
      // Better: Convert everything to a formula? =HYPERLINK("", "id") is ugly.
      // Let's just set the range.

      // Optimization: We can't easily mix setValues and setFormulas in one batch call if the API doesn't support it.
      // However, we can construct a range of formulas where plain values are just escaped strings? No.

      // Let's just loop and set. It's slower but safer for mixed types. 
      // OR, since we are processing the whole column, we can assume we want to convert ALL to links if possible.
      // If no URL, we leave it alone.

      // Let's try to batch as much as possible.
      // We will write the URL column first.

      // For IDs and Images, let's just write row by row for safety in this script, 
      // or use setFormulas with nulls for values? (Not supported).

      // Revised approach for batching:
      // We will use setValues for everything, but for formulas we pass the formula string?
      // Google Apps Script `setValues` treats strings starting with `=` as formulas!
      // So we can just build a big 2D array for ID and Image columns.

      const finalIdValues = newIdValues.map((val, index) => {
            // val[0] is either `=HYPERLINK(...)` or `id`
            return val;
      });

      const finalImageValues = newImageFormulas.map(val => val);

      idRange.setValues(finalIdValues);
      imageRange.setValues(finalImageValues);
}

function processNumberSheets(ss, tocSheet) {
      const sheets = ss.getSheets();
      const tocName = tocSheet.getName();

      sheets.forEach(sheet => {
            const name = sheet.getName();
            if (name === tocName) return;

            // Check if it's a "Number" sheet (assuming numeric name or specific format)
            // User said "Number sheet" (番号シート). Let's assume any sheet that isn't TOC is a target,
            // or we can check if it has an IMAGE formula.

            const range = sheet.getDataRange();
            const formulas = range.getFormulas();

            let hasChanges = false;

            // We need to map the new formulas
            const newFormulas = formulas.map(row => {
                  return row.map(cellFormula => {
                        if (!cellFormula) return "";

                        // Check for =IMAGE(...)
                        // We want to replace it with a VLOOKUP to the TOC sheet.
                        // Problem: We need to know WHICH ID this image corresponds to.
                        // Usually, the ID is in a cell nearby.
                        // If we can't find the ID, we can't do the VLOOKUP.

                        // Strategy: Look for =IMAGE("url") and see if that URL exists in our new TOC URL column.
                        // If it does, we can reference it.
                        // But the user wants "referencing the link in the TOC".

                        // If the current cell is =IMAGE("http://..."), we can find this URL in TOC!
                        // TOC Column C has the URLs.
                        // We can use INDEX/MATCH or VLOOKUP.
                        // =IMAGE(INDEX('目次'!C:C, MATCH("http://...", '目次'!C:C, 0)))
                        // This is circular if we hardcode the URL in the MATCH.

                        // The user wants to "reference the link".
                        // Ideally: =IMAGE(VLOOKUP(A1, '目次'!A:C, 3, FALSE)) where A1 is the ID on this sheet.
                        // We need to find the ID cell on this sheet.

                        // Heuristic: If there is an IMAGE formula, look at neighbors for an ID?
                        // Or, since we have the URL in the formula currently, we can find the ID from the TOC!
                        // 1. Extract URL from current formula.
                        // 2. Find that URL in the TOC's new URL column (Column C).
                        // 3. Get the corresponding ID from TOC (Column A).
                        // 4. Construct the new formula: =IMAGE(VLOOKUP("ID", '目次'!A:C, 3, FALSE))
                        //    Wait, if we hardcode the ID, it's robust.
                        //    Even better: =IMAGE(VLOOKUP("ID_VALUE", '目次'!A:C, 3, FALSE))

                        const match = cellFormula.match(/=IMAGE\s*\(\s*"([^"]+)"/i);
                        if (match && match[1]) {
                              const url = match[1];

                              // Find this URL in TOC
                              // We need to read TOC data once to be efficient
                              const tocUrls = tocSheet.getRange(CONFIG.startRow, CONFIG.columns.url, tocSheet.getLastRow(), 1).getValues().flat();
                              const tocIds = tocSheet.getRange(CONFIG.startRow, CONFIG.columns.id, tocSheet.getLastRow(), 1).getValues().flat();

                              const index = tocUrls.indexOf(url);
                              if (index !== -1) {
                                    const id = tocIds[index]; // This might be the raw ID or the hyperlink formula.
                                    // We want the raw ID. If we just changed it to a formula, we need to be careful.
                                    // In `processTOC`, we read values BEFORE changing them. 
                                    // But here we are running after `processTOC`.
                                    // `getValues()` on a cell with `=HYPERLINK("url", "id")` returns "id" (the display value)!
                                    // So `id` variable here should be the clean ID string.

                                    // Construct new formula
                                    // We assume the ID is unique.
                                    // Formula: =IMAGE(VLOOKUP("ID_VALUE", '目次'!$A:$C, 3, FALSE))
                                    // Note: We need to escape double quotes in ID if any.

                                    hasChanges = true;
                                    return `=IMAGE(VLOOKUP("${id}", '${tocName}'!$A:$C, 3, FALSE))`;
                              }
                        }

                        return cellFormula;
                  });
            });

            if (hasChanges) {
                  // We can't set the whole range formulas if there are mixed empty strings/values?
                  // `setFormulas` expects a string for every cell. If it's empty string, it clears?
                  // If the original was a value (not formula), `getFormulas` returns empty string.
                  // We shouldn't overwrite values with empty formulas.

                  // We need to combine `getValues` and `getFormulas`.
                  // If formula is present, use new formula. If not, keep value.
                  // But `range.setValues` handles formulas if they start with =.

                  const values = range.getValues();
                  const finalValues = values.map((row, rIndex) => {
                        return row.map((val, cIndex) => {
                              const newFormula = newFormulas[rIndex][cIndex];
                              if (newFormula && newFormula !== "") {
                                    return newFormula;
                              }
                              return val;
                        });
                  });

                  range.setValues(finalValues);
            }
      });
}
