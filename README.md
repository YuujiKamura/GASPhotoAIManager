# Photo Archive AI

A minimalist, high-context photo archiving tool.
Uses Google Gemini 2.5 Flash to automatically classify photos, extract blackboard text (Construction Mode), and generate organized photo albums (Excel/PDF).

## Features

*   **Dual Modes**:
    *   **Construction Mode**: Specialized for Japanese construction site photography. Extracts Work Type, Station, and Remarks from electronic or physical blackboards.
    *   **General Archive Mode**: Organizes general photos by inferred category, location, and descriptive captions.
*   **AI Analysis**: Uses Gemini 2.5 Flash for high-speed, multimodal understanding.
*   **Privacy First**: Images are processed in memory and local storage.
*   **Exports**: Generates formatted Excel sheets (Construction Photo Ledger style) and PDF albums.

## Version History

*   **v1.0.0**: Initial Commit.
*   **v1.2.0**: Enhanced UI for uploading.
*   **v1.3.0**: Added Art Modes (Experimental).
*   **v1.5.0**: **Standard UI Revert**. Removed experimental "Hokusai/Hiroshige" art modes and "Bukkomu" aesthetics in favor of a clean, professional interface.

## Technical Stack
*   React + TypeScript
*   Gemini 2.5 Flash (The Brain)
*   Lucide React (The Icons)
*   ExcelJS / HTML2PDF (The Output)
